"""Matriz de enlaces por documento, excepción justificada y análisis por registro."""
import re
import time
import hashlib
import json
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from django.conf import settings
from core.services.comparison_engine import (
    absence_marker,
    field_allows_email,
    normalize_email,
    normalize_text,
)
from .document_text import extract_document
from .freellm import analyze_correspondence, analyze_correspondence_batch


_SEMANTIC_ANALYSIS_CACHE = OrderedDict()
_SEMANTIC_ANALYSIS_LOCK = threading.Lock()


def _semantic_cache_get(key):
    with _SEMANTIC_ANALYSIS_LOCK:
        value = _SEMANTIC_ANALYSIS_CACHE.get(key)
        if value is not None:
            _SEMANTIC_ANALYSIS_CACHE.move_to_end(key)
        return value


def _semantic_cache_set(key, value):
    if value.get('error') or value.get('corresponde') is None:
        return
    limit = max(0, getattr(settings, 'FREELLMAPI_ANALYSIS_CACHE_SIZE', 4096))
    if not limit:
        return
    with _SEMANTIC_ANALYSIS_LOCK:
        _SEMANTIC_ANALYSIS_CACHE[key] = value
        _SEMANTIC_ANALYSIS_CACHE.move_to_end(key)
        while len(_SEMANTIC_ANALYSIS_CACHE) > limit:
            _SEMANTIC_ANALYSIS_CACHE.popitem(last=False)


class _RepositoryPageParser(HTMLParser):
    """Extrae metadatos visibles y bibliográficos sin ejecutar la página."""
    def __init__(self):
        super().__init__()
        self.title = []
        self.headings = []
        self.visible = []
        self.metadata = {}
        self.canonical = ''
        self.links = []
        self._capture = None
        self._skip_depth = 0

    def handle_starttag(self, tag, attrs):
        values = {str(key).lower(): value for key, value in attrs if value is not None}
        if tag in {'script', 'style', 'noscript', 'svg'}:
            self._skip_depth += 1
            return
        if tag == 'title':
            self._capture = ('title', [])
        elif tag in {'h1', 'h2', 'h3'}:
            self._capture = ('heading', [])
        elif tag == 'meta' and values.get('content'):
            key = values.get('name') or values.get('property') or values.get('itemprop')
            if key:
                key = field_key(key)[:120]
                content = re.sub(r'\s+', ' ', values['content']).strip()[:2000]
                if key and content:
                    current = self.metadata.get(key)
                    if current is None:
                        self.metadata[key] = content
                    elif isinstance(current, list) and content not in current and len(current) < 20:
                        current.append(content)
                    elif current != content:
                        self.metadata[key] = [current, content]
        elif tag == 'link' and 'canonical' in values.get('rel', '').lower() and values.get('href'):
            self.canonical = values['href'].strip()
        if tag in {'a', 'link'} and values.get('href'):
            self.links.append({
                'href': values['href'].strip(),
                'rel': values.get('rel', ''),
                'type': values.get('type', ''),
            })

    def handle_endtag(self, tag):
        if tag in {'script', 'style', 'noscript', 'svg'} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._capture and ((tag == 'title' and self._capture[0] == 'title')
                              or (tag in {'h1', 'h2', 'h3'} and self._capture[0] == 'heading')):
            kind, values = self._capture
            text = re.sub(r'\s+', ' ', ' '.join(values)).strip()
            if text:
                (self.title if kind == 'title' else self.headings).append(text[:1000])
            self._capture = None

    def handle_data(self, data):
        if self._skip_depth:
            return
        text = re.sub(r'\s+', ' ', data).strip()
        if not text:
            return
        self.visible.append(text)
        if self._capture:
            self._capture[1].append(text)


def is_bot_challenge(response):
    """Página de verificación anti-bots (p. ej. Cloudflare «Just a moment...»).

    No es el verificable ni prueba su ausencia: el servidor no entregó el
    recurso a un cliente automatizado. Se deja pendiente y nunca se intenta
    superar el desafío.
    """
    if response.get('status') not in {403, 429, 503}:
        return False
    head = (response.get('body') or b'')[:20000].lower()
    return any(token in head for token in (
        b'<title>just a moment', b'cf-chl', b'challenge-platform', b'cf_chl_opt',
        b'attention required! | cloudflare', b'ddos-guard'))


def is_direct_pdf_response(response):
    """La respuesta real manda; la extensión de la URL es sólo decorativa."""
    body = response.get('body', b'')
    content_type = response.get('content_type', '').lower()
    head = body[:4096].lstrip().lower()
    if b'%pdf-' in head:
        return True
    if head.startswith(b'<!doctype html') or head.startswith(b'<html') or b'<html' in head:
        return False
    return 'application/pdf' in content_type


def is_html_response(response):
    body = response.get('body', b'').lstrip()[:1024].lower()
    content_type = response.get('content_type', '').lower()
    if b'%pdf-' in body:
        return False
    return ('html' in content_type or body.startswith(b'<!doctype html')
            or body.startswith(b'<html') or b'<html' in body)


def extract_repository_page_json(response):
    """Convierte una ficha HTML en evidencia JSON acotada para la IA."""
    parser = _RepositoryPageParser()
    parser.feed(response.get('body', b'').decode('utf-8', errors='replace'))
    url = response.get('url', '')
    canonical = urljoin(url, parser.canonical) if parser.canonical else url
    metadata = parser.metadata

    def values_for(*needles):
        found = []
        for key, value in metadata.items():
            if any(needle in key for needle in needles):
                items = value if isinstance(value, list) else [value]
                found.extend(item for item in items if item not in found)
        return found[:20]

    return {
        'tipo_fuente': 'pagina_repositorio',
        'estado_http': response.get('status'),
        'acceso_directo': response.get('status') == 200,
        'url': url,
        'url_canonica': canonical,
        'titulo': (values_for('citation title', 'dc title', 'dcterms title', 'og title')
                   or parser.title or parser.headings[:1]),
        'autores': values_for('citation author', 'dc creator', 'dcterms creator', 'author'),
        'fechas': values_for('citation date', 'dc date', 'dcterms date', 'date', 'issued'),
        'descripcion': values_for('description', 'abstract', 'resumen'),
        'palabras_clave': values_for('keyword', 'subject'),
        'encabezados': parser.headings[:20],
        'metadatos': dict(list(metadata.items())[:80]),
        'texto_visible': ' '.join(parser.visible)[:12000],
    }


def repository_document_urls(response, limit=3):
    """Encuentra descargas documentales anunciadas por fichas DSpace/EPrints.

    Sólo sigue candidatos HTTP(S) del mismo host que la ficha. Esto cubre los
    metadatos ``citation_pdf_url`` y las rutas DSpace ``bitstream``/``content``
    sin convertir cada enlace HTML de una página en una descarga automática.
    """
    if not is_html_response(response):
        return []
    parser = _RepositoryPageParser()
    try:
        parser.feed(response.get('body', b'').decode('utf-8', errors='replace'))
        base = response.get('url', '')
        base_host = (urlsplit(base).hostname or '').lower()
    except (ValueError, TypeError):
        return []

    candidates = []

    def add(raw_url, priority):
        try:
            absolute = urljoin(base, str(raw_url or '').strip())
            parsed = urlsplit(absolute)
        except ValueError:
            return
        if (parsed.scheme not in {'http', 'https'} or not parsed.hostname
                or parsed.hostname.lower() != base_host):
            return
        normalized = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ''))
        if normalized and all(url != normalized for _, url in candidates):
            candidates.append((priority, normalized))

    for key, value in parser.metadata.items():
        items = value if isinstance(value, list) else [value]
        key_text = field_key(key)
        for item in items:
            item_text = str(item or '')
            if ('citation pdf url' in key_text or 'document url' in key_text
                    or ('identifier' in key_text and re.search(r'(?i)(\.pdf(?:$|[?#])|/bitstream/|/bitstreams/.*/content)', item_text))):
                add(item_text, 0)

    for link in parser.links:
        href = link['href']
        marker = ' '.join((href, link['rel'], link['type'])).lower()
        if ('application/pdf' in marker or re.search(
                r'(?i)(\.pdf(?:$|[?#])|/bitstream/|/bitstreams/[^/]+/content(?:$|[?#])|[?&](?:download|sequence)=)',
                href,
        )):
            priority = 1 if ('bitstream' in marker or 'application/pdf' in marker) else 2
            add(href, priority)
    return [url for _, url in sorted(candidates, key=lambda item: item[0])[:max(0, limit)]]


def _sharepoint_download_url(url):
    """Construye el intento de descarga pública sin eliminar el token compartido."""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    host = (parsed.hostname or '').lower()
    if not (host.endswith('.sharepoint.com') or host in {'1drv.ms', 'onedrive.live.com'}):
        return None
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query['download'] = '1'
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ''))


def _microsoft_authentication_response(response):
    try:
        parsed = urlsplit(response.get('url', ''))
    except ValueError:
        return False
    host, path = (parsed.hostname or '').lower(), parsed.path.lower()
    return (host == 'login.microsoftonline.com'
            or 'authenticate.aspx' in path
            or ('/_forms/default.aspx' in path and 'returnurl=' in parsed.query.lower()))


def _sercop_process_detail_url(url):
    """Obtiene el panel público que SERCOP carga por AJAX en la pestaña Descripción."""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    host = (parsed.hostname or '').lower()
    if host not in {'compraspublicas.gob.ec', 'www.compraspublicas.gob.ec'}:
        return None
    if not parsed.path.lower().endswith('/informacionprocesocontratacion2.cpe'):
        return None
    token = dict(parse_qsl(parsed.query, keep_blank_values=True)).get('idSoliCompra')
    if not token:
        return None
    path = '/ProcesoContratacion/compras/ProcesoContratacion/tab.php'
    return urlunsplit((parsed.scheme, parsed.netloc, path, urlencode({'tab': '1', 'id': token}), ''))


def field_key(value):
    return re.sub(r'[^a-z0-9]+', ' ', normalize_text(str(value))).strip()


_RECORD_FIELD_PRIORITY = (
    ('codigo', 100), ('identificador', 98), ('numero', 95),
    ('objetivo', 94), ('indicador', 93), ('meta', 92),
    ('objeto', 90), ('descripcion', 88), ('nombre', 86), ('titulo', 85),
    ('tipo', 80), ('mecanismo', 78), ('proceso', 76), ('contrato', 75),
    ('motivo', 72), ('unidad', 70), ('fecha', 65), ('periodo', 60),
)


def compact_record_context(record, link_field, max_fields=6, max_chars=900):
    """Conserva sólo datos temáticos útiles; excluye enlaces y texto accesorio."""
    candidates = []
    target_key = field_key(link_field)
    for position, (key, value) in enumerate((record or {}).items()):
        label = field_key(key)
        compact_value = re.sub(r'\s+', ' ', str(value or '')).strip()
        if (not compact_value or label == target_key or 'enlace' in label or 'link' in label
                or 'url' in label or compact_value.lower().startswith(('http://', 'https://'))):
            continue
        priority = max((score for token, score in _RECORD_FIELD_PRIORITY if token in label), default=10)
        candidates.append((-priority, position, str(key)[:120], compact_value))
    candidates.sort()
    selected = {}
    used = 0
    for _, _, key, value in candidates:
        if len(selected) >= max_fields or used >= max_chars:
            break
        remaining = max_chars - used - len(key)
        if remaining <= 0:
            break
        compact_value = value[:min(220, remaining)]
        selected[key] = compact_value
        used += len(key) + len(compact_value)
    return selected


def justified_exception(dictionary, field, aliases=()):
    """Exigir una causa, no aceptar una mera repetición de NO APLICA."""
    labels = {field_key(v) for v in (field, *aliases)}
    for row in dictionary:
        if not row:
            continue
        label = field_key(row[0])
        description = field_key(' '.join(row[1:]))
        explicit_note = any(word in label for word in ('nota', 'aclaracion', 'observacion', 'justificacion'))
        # Nota general: la fila «Descripción» del diccionario explica la
        # ausencia de todo el formato («No aplica debido a que...»).
        general_note = label == 'descripcion' and any(
            marker in description for marker in ('no aplica', 'informacion no disponible'))
        if label not in labels and not explicit_note and not general_note:
            continue
        # La columna del campo no cuenta como justificación.
        reason = description.replace('no aplica', '').replace('informacion no disponible', '').strip()
        if len(reason) >= 15 and len(reason.split()) >= 4:
            return True
    return False


def is_url(value):
    try:
        parsed = urlsplit(value)
        return parsed.scheme.lower() in {'http', 'https'} and bool(parsed.hostname) and not parsed.username and not parsed.password and not re.search(r'\s', value)
    except ValueError:
        return False


def _record_value(record, *needles):
    for label, value in (record or {}).items():
        key = field_key(label)
        if all(needle in key for needle in needles):
            return re.sub(r'\s+', ' ', str(value or '')).strip()
    return ''


def verify_official_portal_link(url, record, response, fetch):
    """Comprueba portales oficiales dinámicos que un GET sin JS no puede leer."""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return None
    host, path = (parsed.hostname or '').lower(), parsed.path.lower()
    if response.get('status') != 200 or response.get('error'):
        return None

    if (host == 'informe.cpccs.gob.ec'
            and path.endswith('/reportesconsejo/pages/reportviewer.aspx')):
        query = {field_key(key): value for key, value in parse_qsl(parsed.query, keep_blank_values=True)}
        certificate = _record_value(record, 'numero', 'certificado')
        period = _record_value(record, 'periodo')
        mechanism = field_key(_record_value(record, 'nombre', 'mecanismo'))
        code, year = str(query.get('codigo', '')).strip(), str(query.get('anio', '')).strip()
        if not (certificate and period and 'rendicion' in mechanism and 'cuentas' in mechanism):
            return None
        matches = code == certificate and year == period
        return {
            'corresponde': matches,
            'source': 'cpccs_report_viewer',
            'reason': (f'Portal oficial CPCCS: el informe solicitado identifica el certificado {code} '
                       f'y el período {year}, coincidentes con el registro.' if matches else
                       f'Portal oficial CPCCS: la URL identifica certificado {code or "ausente"} y período '
                       f'{year or "ausente"}, distintos del registro ({certificate}, {period}).'),
            'evidence': {'certificate': code, 'year': year},
        }

    match = re.fullmatch(r'/entidades/(\d+)/?', path)
    mechanism = field_key(_record_value(record, 'nombre', 'mecanismo'))
    period = _record_value(record, 'periodo')
    if (host == 'transparencia.dpe.gob.ec' and match
            and 'informe anual' in mechanism and 'acceso' in mechanism
            and 'informacion publica' in mechanism and period.isdigit()):
        establishment_id = match.group(1)
        api_url = urlunsplit((parsed.scheme, parsed.netloc,
            '/backend/v1/transparency/anual-report/establishment',
            urlencode({'establishment_id': establishment_id, 'format': 'json'}), ''))
        api_response = fetch(api_url)
        try:
            payload = json.loads(api_response.get('body', b'').decode('utf-8'))
        except (ValueError, UnicodeError, AttributeError):
            return None
        reports = payload.get('list', []) if isinstance(payload, dict) else []
        report = next((entry for entry in reports if isinstance(entry, dict)
                       and str(entry.get('establishment')) == establishment_id
                       and str(entry.get('year')) == period
                       and entry.get('file') and not entry.get('deleted')), None)
        if not report:
            return {
                'corresponde': False, 'source': 'dpe_annual_report_api',
                'reason': f'La API oficial de la DPE no registra un informe anual {period} para la entidad {establishment_id}.',
                'evidence': {'establishment_id': establishment_id, 'year': period, 'api_url': api_url},
            }
        file_url = urljoin(url, report['file'])
        return {
            'corresponde': True, 'source': 'dpe_annual_report_api',
            'reason': (f'API oficial DPE: la entidad {establishment_id} registra el informe anual {period}, '
                       f'publicado el {str(report.get("created_at") or "").split("T")[0] or "día no disponible"}.'),
            'evidence': {'establishment_id': establishment_id, 'year': period,
                         'published_at': report.get('created_at'), 'file_url': file_url,
                         'api_url': api_url},
        }
    return None


def collect_fields(files, schema):
    targets = []
    aliases = schema.get('aliases', {})

    def match_field(label, expected):
        """Admite variantes largas del encabezado sin confundir enlaces distintos."""
        label_key = field_key(label)
        declared = [(field, candidate) for field in expected
                    for candidate in (field, *aliases.get(field, []))]
        direct = {field_key(candidate): field for field, candidate in declared}.get(label_key)
        if direct or not label_key:
            return direct
        label_terms = set(label_key.split())
        matches = []
        for field, candidate in declared:
            candidate_key = field_key(candidate)
            candidate_terms = set(candidate_key.split())
            overlap = label_terms & candidate_terms
            smaller = min(len(label_terms), len(candidate_terms))
            # Los encabezados oficiales extensos suelen variar sólo en el
            # complemento final. Se requieren seis términos coincidentes y
            # una cobertura alta para no mezclar los cuatro enlaces del 14.
            if smaller >= 6 and len(overlap) >= 6 and len(overlap) / smaller >= .82:
                matches.append((len(overlap) / len(label_terms | candidate_terms), field))
        matches.sort(reverse=True)
        if matches and (len(matches) == 1 or matches[0][0] > matches[1][0]):
            return matches[0][1]
        return None

    for kind, key in [('Conjunto de datos', 'url_fields'), ('Metadatos', 'metadata_url_fields')]:
        rows = files.get(kind, {}).get('rows', [])
        expected = schema[key]
        if not expected:
            continue
        labels = rows[0] if kind == 'Conjunto de datos' and rows else [r[0] if r else '' for r in rows]
        matched = set()
        for i, label in enumerate(labels):
            field = match_field(label, expected)
            if not field:
                continue
            matched.add(field)
            if kind == 'Conjunto de datos':
                for line, row in enumerate(rows[1:], 2):
                    targets.append({'document': kind, 'field': field, 'label': label, 'row': line,
                                    'column': i+1, 'value': row[i].strip() if i < len(row) else '',
                                    'record': dict(zip(rows[0], row))})
                if len(rows) < 2:
                    targets.append({'document': kind, 'field': field, 'row': 2, 'column': i+1, 'value': '', 'record': {}})
            else:
                row = rows[i]
                targets.append({'document': kind, 'field': field, 'label': label, 'row': i+1, 'column': 2,
                                'value': row[1].strip() if len(row)>1 else '', 'record': {row[0]: row[1] if len(row)>1 else ''}})
        for field in expected:
            if field not in matched:
                targets.append({'document': kind, 'field': field, 'row': None, 'column': None,
                                'value': '', 'record': {}, 'missing_field': True})
    return targets


SAMPLE_ROWS = 3
# Filas adicionales que pueden sustituir a una fila de la muestra cuyo enlace no
# pudo verificarse automáticamente (acceso indeterminado o IA no concluyente).
SAMPLE_REPLACEMENTS = 6
WAYBACK_CDX_URL = 'https://web.archive.org/cdx/search/cdx'
# Estados HTTP que no prueban ausencia ni presencia del verificable.
INDETERMINATE_HTTP = {403, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
AI_SERVICE_ERRORS = {'CONNECTION_ERROR', 'TOKEN_BUDGET_EXCEEDED'}
DEADLINE_ERROR_PREFIX = 'Tiempo de comprobación agotado'


def aggregate_link_statuses(statuses):
    """Tabla 6: SÍ sólo si todos los verificables revisados cumplen.

    Una comprobación técnica no concluida deja el criterio pendiente (None);
    nunca equivale a incumplimiento. Las excepciones documentadas y los enlaces
    no verificables automáticamente (SIN EVALUACIÓN) no cuentan; si sólo hay
    excepciones, el criterio no se evalúa.
    """
    statuses = list(statuses)
    if 'NO' in statuses:
        return 'NO'
    if 'PENDIENTE' in statuses:
        return None
    if 'SI' in statuses:
        return 'SI'
    return 'SIN EVALUACIÓN'


def _eligible_rows(targets):
    return sorted({t['row'] for t in targets
                   if t['document'] == 'Conjunto de datos' and not t.get('missing_field')
                   and not absence_marker(t['value'])})


def sample_targets(targets, seed, size=SAMPLE_ROWS):
    """Nota 3 del instructivo: con más de tres filas se validan tres al azar.

    Se sortean filas del conjunto de datos que tengan al menos un valor distinto
    de NO APLICA/INFORMACIÓN NO DISPONIBLE. La semilla fija la muestra para que
    una reevaluación del mismo formato compruebe las mismas filas. Metadatos y
    campos ausentes se conservan porque son pocos y no dependen de filas.
    """
    import random
    rows = _eligible_rows(targets)
    if len(rows) <= size:
        return targets, rows
    chosen = sorted(random.Random(str(seed or 'lotaip')).sample(rows, size))
    kept = [t for t in targets if t['document'] != 'Conjunto de datos' or t.get('missing_field')
            or t['row'] in chosen]
    return kept, chosen


def replacement_rows(targets, seed, chosen):
    """Orden reproducible de filas de reemplazo, distinto de la muestra original."""
    import random
    remaining = [row for row in _eligible_rows(targets) if row not in set(chosen)]
    return random.Random(f'{seed or "lotaip"}:reemplazo').sample(remaining, len(remaining))


def _is_indeterminate_access(response):
    """Respuesta que no permite decidir si el verificable es de libre acceso."""
    if is_bot_challenge(response):
        return True
    if response.get('error'):
        return not str(response['error']).startswith(DEADLINE_ERROR_PREFIX)
    return response.get('status') in INDETERMINATE_HTTP or response.get('status') is None


def _wayback_copy(url, fetch, retry_delay=0):
    """Última copia HTTP 200 del verificable en Wayback Machine.

    Devuelve (respuesta, metadatos), (None, None) si el archivo respondió sin
    copia, o (None, 'unavailable') si el propio archivo no pudo consultarse.
    """
    query = urlencode({'url': url, 'output': 'json', 'limit': '-1',
                       'filter': 'statuscode:200', 'fl': 'timestamp,original'})
    for attempt in range(3):
        index = fetch(f'{WAYBACK_CDX_URL}?{query}&_intento={attempt}' if attempt else f'{WAYBACK_CDX_URL}?{query}')
        if index.get('status') == 200 and not index.get('error'):
            break
        # El índice limita ráfagas (429) y a veces tarda; se espera antes de repetir.
        if retry_delay and attempt < 2:
            time.sleep(retry_delay * (attempt + 1))
    else:
        return None, 'unavailable'
    try:
        rows = json.loads(index.get('body', b'').decode('utf-8') or '[]')
        timestamp, original = rows[-1][:2] if len(rows) > 1 else ('', '')
    except (ValueError, TypeError, IndexError, AttributeError):
        return None, None
    if not re.fullmatch(r'\d{14}', str(timestamp)):
        return None, None
    archive_url = f'https://web.archive.org/web/{timestamp}id_/{original}'
    response = fetch(archive_url)
    if response.get('status') != 200 or response.get('error') or is_bot_challenge(response):
        return None, None
    captured = f'{timestamp[:4]}-{timestamp[4:6]}-{timestamp[6:8]}'
    return {**response, 'url': response.get('url', archive_url)}, {
        'archive_url': archive_url, 'captured_at': captured, 'original_url': original}


def _deterministic_correspondence(text, record):
    """Respaldo sin IA: un identificador único del registro aparece literalmente en el documento.

    Sólo puede confirmar correspondencia; la ausencia de coincidencia nunca se
    convierte en incumplimiento porque el documento puede citarlo de otra forma.
    """
    haystack = re.sub(r'[^a-z0-9]+', ' ', normalize_text(text or ''))
    for label, value in (record or {}).items():
        candidate = re.sub(r'[^a-z0-9]+', ' ', normalize_text(str(value or ''))).strip()
        compact = candidate.replace(' ', '')
        # Códigos, números de resolución o de proceso: letras y dígitos, o
        # números largos. Los valores genéricos («2024», «Sí») no identifican.
        identifier = (len(compact) >= 6 and re.search(r'\d', compact)
                      and (re.search(r'[a-z]', compact) or len(compact) >= 8))
        if identifier and f' {candidate} ' in f' {haystack} ':
            return {'corresponde': True, 'decision_basis': 'deterministic_identifier_match',
                    'observacion': f'Coincidencia literal del identificador «{value}» ({label}) en el documento; '
                                   'decisión determinista sin IA.', 'usage': {}}
    return None


def _unverifiable(item):
    """PENDIENTE que no depende de un reintento técnico, sino del sitio o del contenido."""
    return item['status'] == 'PENDIENTE' and not item.get('retryable')


def check_package_links(files, schema, context, fetch, analyze=None, previous=(),
                        progress_callback=None, ai_budget=None, sample_seed=None):
    if not schema:
        return None, 'PENDIENTE: no se identificó el esquema del formato.', []
    default_analyzer = analyze is None
    use_shared_cache = default_analyzer
    analyze = analyze or analyze_correspondence
    dictionary = files.get('Diccionario', {}).get('rows', [])
    all_targets = collect_fields(files, schema)
    dataset_rows = len({t['row'] for t in all_targets if t['document'] == 'Conjunto de datos'
                        and not t.get('missing_field')})
    seed = sample_seed or json.dumps(context, sort_keys=True)
    targets, sampled_rows = sample_targets(all_targets, seed)
    def report(phase, detail, stage_pct):
        if progress_callback:
            progress_callback({'phase': phase, 'detail': detail, 'stage_pct': stage_pct})

    report('Verificando enlaces', f'Se encontraron {len(targets)} campos o registros para comprobar.', 48)
    extracted_cache, analysis_cache = {}, {}
    stats = {'batch_requests': 0, 'unique_jobs': {}}
    completed = {r.get('record_hash'): r for r in previous if r.get('status') in {'SI', 'NO'} and r.get('record_hash')}
    deadline = time.monotonic() + settings.LOTAIP_PACKAGE_TIMEOUT
    retry_delay = max(0.0, float(getattr(settings, 'LOTAIP_LINK_RETRY_DELAY_SECONDS', 3)))

    def retrieve(value):
        """Descarga con reintento espaciado y, si el acceso sigue indeterminado, copia archivada."""
        response = fetch(value)
        sharepoint_blocked = False
        direct_download = _sharepoint_download_url(value)
        response_is_html = 'html' in response.get('content_type', '').lower()
        if direct_download and direct_download != value and (
                response.get('status') == 403
                or response.get('status') == 200 and response_is_html):
            sharepoint_retry = fetch(direct_download)
            retry_type = sharepoint_retry.get('content_type', '').lower()
            retry_is_document = (sharepoint_retry.get('status') == 200
                and (b'%PDF-' in sharepoint_retry.get('body', b'')[:1024] or 'html' not in retry_type))
            if retry_is_document:
                response = sharepoint_retry
            elif sharepoint_retry.get('status') == 403 or _microsoft_authentication_response(sharepoint_retry):
                response, sharepoint_blocked = sharepoint_retry, True
        archived = None
        archive_unavailable = False
        if not sharepoint_blocked and _is_indeterminate_access(response):
            # Un desafío anti-bots no cambia al repetir la petición; los cortes,
            # 429 y 5xx suelen ser transitorios y merecen un segundo intento.
            if not is_bot_challenge(response) and time.monotonic() < deadline:
                if retry_delay:
                    time.sleep(retry_delay)
                response = fetch(value)
            if _is_indeterminate_access(response) and time.monotonic() < deadline:
                copy, archived = _wayback_copy(value, fetch, retry_delay)
                if copy is not None:
                    response = copy
                else:
                    archive_unavailable = archived == 'unavailable'
                    archived = None
        return response, sharepoint_blocked, archived, archive_unavailable

    def evaluate(subset, first_order):
        """Comprueba acceso, extrae texto y decide correspondencia de un grupo de campos."""
        results, analysis_jobs = [], []
        for order, target in enumerate(subset, first_order):
            item = {k: v for k, v in target.items() if k != 'record'}
            # El registro queda a la vista para auditar la decisión automática.
            if target.get('record'):
                item['record'] = compact_record_context(target['record'], target['field'])
            item['_order'] = order
            signature = hashlib.sha256(json.dumps({'context': context, 'target': target, 'dictionary': dictionary}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            item['record_hash'] = signature
            value = target['value']
            marker = absence_marker(value)
            if signature in completed and not marker:
                cached_item = dict(completed[signature])
                cached_item['_order'] = order
                results.append(cached_item)
                continue
            def finish(status, reason, retryable=False):
                item.update(status=status, reason=reason)
                if retryable:
                    item['retryable'] = True
                results.append(item)
            if target.get('missing_field'):
                finish('NO', 'Falta el campo de enlace requerido en este documento.')
            elif marker == 'no aplica':
                # Criterio del proyecto: NO APLICA declara que no hay verificable
                # que enlazar, así que se omite sin exigir la nota del diccionario.
                finish('SIN EVALUACIÓN', 'NO APLICA: no se evalúa el enlace (Tabla 6, nota 1).')
                item['exception'] = True
            elif marker:
                # Tabla 6, nota 1: INFORMACIÓN NO DISPONIBLE con nota aclaratoria
                # en el diccionario no se evalúa; sin esa nota el enlace falta.
                if justified_exception(dictionary, target['field'], [target.get('label', ''), *schema.get('aliases', {}).get(target['field'], [])]):
                    finish('SIN EVALUACIÓN', f'{marker.upper()} con nota aclaratoria en el diccionario: no se evalúa (Tabla 6, nota 1).')
                    item['exception'] = True
                else:
                    finish('NO', f'{marker.upper()} sin nota aclaratoria en el diccionario.')
            elif field_allows_email(schema, target['field']) and normalize_email(value):
                item['email'] = normalize_email(value)
                finish('SI', 'Correo electrónico válido admitido por el campo mixto; cumple sin descarga, OCR ni IA.')
            elif not is_url(value):
                if field_allows_email(schema, target['field']):
                    finish('NO', 'El campo exige una URL HTTP(S), un correo electrónico válido o NO APLICA.')
                else:
                    finish('NO', 'El campo exige URL HTTP(S) o NO APLICA; un nombre de archivo, correo, ND o campo vacío no es un enlace.')
            elif time.monotonic() >= deadline:
                finish('PENDIENTE', 'Tiempo de ejecución agotado; pendiente de reintento.', retryable=True)
            else:
                report('Descargando verificables',
                       f'Comprobando acceso y contenido del enlace {order + 1} de {len(targets)}.',
                       50 + int(18 * min(1, (order + 1) / max(1, len(targets)))))
                if value not in extracted_cache:
                    fetched = {'page_json': None, 'sercop_detail_url': None, 'repository_page_url': None,
                               'repository_document_url': None, 'archived': None,
                               'archive_unavailable': False, 'sharepoint_blocked': False}
                    try:
                        response, fetched['sharepoint_blocked'], fetched['archived'], fetched['archive_unavailable'] = retrieve(value)
                        detail_url = _sercop_process_detail_url(response.get('url', value))
                        if (response.get('status') == 200 and detail_url
                                and 'html' in response.get('content_type', '').lower()):
                            detail_response = fetch(detail_url)
                            if (detail_response.get('status') == 200
                                    and 'html' in detail_response.get('content_type', '').lower()
                                    and not detail_response.get('error')):
                                # El panel AJAX es el contenido sustantivo que el
                                # navegador inserta en la ficha mostrada al usuario.
                                original_url = response.get('url', value)
                                response = {**detail_response, 'url': original_url}
                                fetched['sercop_detail_url'] = detail_url
                        if is_bot_challenge(response):
                            extracted = {}
                        elif (response.get('status') in {200, 403} and not response.get('error')
                                and is_html_response(response)
                                and not is_direct_pdf_response(response)):
                            page_json = fetched['page_json'] = extract_repository_page_json(response)
                            fetched['repository_page_url'] = response.get('url', value)
                            for document_url in repository_document_urls(response):
                                document_response = fetch(document_url)
                                if (document_response.get('status') == 200
                                        and not document_response.get('error')
                                        and is_direct_pdf_response(document_response)):
                                    response = document_response
                                    fetched['repository_document_url'] = response.get('url', document_url)
                                    break
                            if fetched['repository_document_url']:
                                extracted = extract_document(response, deadline=deadline, sample_large=True)
                            else:
                                serialized = json.dumps(page_json, ensure_ascii=False, sort_keys=True)
                                extracted = {
                                    'text': serialized,
                                    'method': 'html-metadata-json',
                                    'pages': 1,
                                    'error': None,
                                    'sha256': hashlib.sha256(serialized.encode('utf-8')).hexdigest(),
                                    'ocr_pages': [],
                                    'sampled_pages': [],
                                }
                        else:
                            extracted = extract_document(response, deadline=deadline, sample_large=True) if response.get('status') == 200 and not response.get('error') and not fetched['sharepoint_blocked'] else {}
                    except Exception as exc:
                        response, extracted = {'status': None, 'error': type(exc).__name__}, {}
                    extracted_cache[value] = (response, extracted, fetched)
                response, extracted, fetched = extracted_cache[value]
                page_json = fetched['page_json']
                item.update(url=value, final_url=response.get('url', value), http_status=response.get('status'),
                            sha256=extracted.get('sha256'), extraction_method=extracted.get('method'), pages=extracted.get('pages'),
                            ocr_pages=extracted.get('ocr_pages', []), sampled_pages=extracted.get('sampled_pages', []),
                            skipped_ocr_pages=extracted.get('skipped_ocr_pages', []))
                for key in ('page_metadata', 'repository_page_url', 'repository_document_url', 'sercop_detail_url'):
                    found = fetched['page_json'] if key == 'page_metadata' else fetched[key]
                    if found:
                        item[key] = found
                if fetched['archived']:
                    item['archived_copy'] = fetched['archived']
                deadline_error = str(response.get('error') or '').startswith(DEADLINE_ERROR_PREFIX)
                if is_bot_challenge(response):
                    item['bot_challenge'] = True
                    archive_note = ('Wayback Machine no respondió; se reintentará en la próxima evaluación'
                                    if fetched['archive_unavailable'] else
                                    'Wayback Machine no conserva una copia del documento')
                    finish('PENDIENTE', f"El servidor respondió HTTP {response.get('status')} con una página de verificación "
                           f'anti-bots (p. ej. Cloudflare) y {archive_note}. No acredita incumplimiento.',
                           retryable=fetched['archive_unavailable'])
                elif response.get('status') in {400, 401, 404, 410}:
                    finish('NO', f"Verificable inaccesible: HTTP {response['status']}.")
                elif (fetched['sharepoint_blocked'] or response.get('status') == 403 and _sharepoint_download_url(value)) and not page_json:
                    # Un vínculo «Cualquier persona con el vínculo» responde 200 a un
                    # visitante anónimo. Si exige iniciar sesión o niega el acceso,
                    # el verificable no es de libre acceso (Tabla 6).
                    finish('NO', 'SharePoint/OneDrive exige iniciar sesión o niega el acceso anónimo al archivo '
                           f"(HTTP {response.get('status')}): el verificable no es de libre acceso (Tabla 6). "
                           'Debe publicarse con un enlace «Cualquier persona con el vínculo».')
                elif (response.get('status') != 200 and not (response.get('status') == 403 and page_json)) or response.get('error'):
                    finish('PENDIENTE', f"Acceso no comprobado tras reintento y consulta a Wayback Machine: HTTP {response.get('status')}; "
                           f"{response.get('error') or 'sin copia archivada'}.",
                           retryable=deadline_error or fetched['archive_unavailable'])
                elif extracted.get('error'):
                    finish('PENDIENTE', extracted['error'], retryable=True)
                elif not extracted.get('text', '').strip():
                    finish('PENDIENTE', 'No se pudo recuperar texto para comprobar el documento. Requiere reintento; no demuestra que el PDF sea ilegible.', retryable=True)
                elif time.monotonic() >= deadline:
                    finish('PENDIENTE', 'Extracción completada; análisis pendiente por límite de tiempo.', retryable=True)
                else:
                    official = verify_official_portal_link(
                        value, target.get('record', {}), response, fetch,
                    )
                    if official is not None:
                        item['official_verification'] = official
                        item['analysis'] = {
                            'corresponde': official['corresponde'],
                            'observacion': official['reason'],
                            'decision_basis': official['source'],
                            'usage': {},
                        }
                        evidence = official.get('evidence', {})
                        if evidence.get('file_url'):
                            item['official_file_url'] = evidence['file_url']
                        if evidence.get('api_url'):
                            item['official_api_url'] = evidence['api_url']
                        finish('SI' if official['corresponde'] else 'NO', official['reason'])
                    else:
                        record_context = compact_record_context(target.get('record', {}), target['field'])
                        analysis_context = {**context, 'documento': target['document'], 'campo': target['field'],
                                            'fuente': ('documento_repositorio' if fetched['repository_document_url'] else
                                                       'metadatos_json_pagina' if page_json else 'documento_directo'),
                                            'paginas': extracted.get('pages'),
                                            'registro': record_context}
                        analysis_key = hashlib.sha256(json.dumps({
                            'policy': 'semantic-content-v8-official-portals',
                            'model': getattr(settings, 'FREELLMAPI_MODEL', 'auto'),
                            'sha256': extracted.get('sha256'),
                            'context': analysis_context,
                        }, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                        analysis_jobs.append({
                            'key': analysis_key, 'item': item, 'text': extracted['text'],
                            'context': analysis_context, 'record': target.get('record', {}),
                            'document_key': extracted.get('sha256') or hashlib.sha256(extracted['text'].encode()).hexdigest(),
                        })
        results += analyze_jobs(analysis_jobs)
        return results

    def analyze_jobs(analysis_jobs):
        # Las descargas y el OCR se completan primero. Las decisiones semánticas
        # independientes se ejecutan en paralelo y las copias idénticas comparten
        # una sola respuesta, incluso entre paquetes evaluados en el mismo proceso.
        unique_jobs = {}
        for job in analysis_jobs:
            cached_analysis = analysis_cache.get(job['key'])
            if cached_analysis is None and use_shared_cache:
                cached_analysis = _semantic_cache_get(job['key'])
            if cached_analysis is not None:
                analysis_cache[job['key']] = cached_analysis
            else:
                unique_jobs.setdefault(job['key'], job)
        stats['unique_jobs'].update(unique_jobs)

        if unique_jobs:
            report('Analizando correspondencia con IA',
                   f'Comparando {len(unique_jobs)} registro(s) con el contenido recuperado.', 70)

        def run_analysis(job):
            try:
                if default_analyzer:
                    return analyze(job['text'], job['context'], progress_callback=progress_callback)
                return analyze(job['text'], job['context'])
            except Exception as exc:
                return {'corresponde': None, 'error': f'Análisis pendiente ({type(exc).__name__}).'}

        if default_analyzer and unique_jobs:
            groups = {}
            for key, job in unique_jobs.items():
                common_context = {name: value for name, value in job['context'].items() if name != 'registro'}
                group_key = (job['document_key'], json.dumps(common_context, sort_keys=True, ensure_ascii=False))
                groups.setdefault(group_key, []).append((key, job))
            batch_size = max(1, getattr(settings, 'FREELLMAPI_BATCH_SIZE', 12))
            batches = [group[start:start + batch_size]
                       for group in groups.values()
                       for start in range(0, len(group), batch_size)]
            completed_count = 0
            for batch_number, batch in enumerate(batches, 1):
                report('Analizando correspondencia con IA',
                       f'Lote {batch_number} de {len(batches)}: {len(batch)} registro(s) del mismo documento.',
                       70 + int(10 * completed_count / max(1, len(unique_jobs))))
                analyses = analyze_correspondence_batch(
                    batch[0][1]['text'],
                    [job['context'] for _, job in batch],
                    progress_callback=progress_callback,
                    token_budget=ai_budget,
                )
                if not all(analysis.get('error_code') == 'TOKEN_BUDGET_EXCEEDED' for analysis in analyses):
                    stats['batch_requests'] += 1
                for (key, job), analysis in zip(batch, analyses):
                    if analysis.get('error_code') == 'INVALID_RESPONSE' and len(batch) > 1:
                        # Una respuesta por lotes inválida (sin citas o cortada)
                        # se repite para ese registro solo, con todo el límite de salida.
                        analysis = run_analysis(job)
                    analysis_cache[key] = analysis
                    if use_shared_cache:
                        _semantic_cache_set(key, analysis)
                    completed_count += 1
                budget_note = ''
                if ai_budget and ai_budget.get('limit'):
                    budget_note = (f" Presupuesto usado: {ai_budget.get('used', 0)} de "
                                   f"{ai_budget['limit']} tokens.")
                report('Analizando correspondencia con IA',
                       f'{completed_count} de {len(unique_jobs)} registros completados en {batch_number} lote(s).{budget_note}',
                       70 + int(12 * completed_count / max(1, len(unique_jobs))))
        elif unique_jobs:
            workers = max(1, min(getattr(settings, 'FREELLMAPI_CONCURRENCY', 1), len(unique_jobs) or 1))
            if workers == 1:
                completed_analyses = ((key, run_analysis(job)) for key, job in unique_jobs.items())
                for completed_count, (key, analysis) in enumerate(completed_analyses, 1):
                    analysis_cache[key] = analysis
                    report('Analizando correspondencia con IA',
                           f'Análisis {completed_count} de {len(unique_jobs)} completado.',
                           70 + int(12 * completed_count / max(1, len(unique_jobs))))
            else:
                with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='lotaip-ai') as executor:
                    futures = {executor.submit(run_analysis, job): key for key, job in unique_jobs.items()}
                    for completed_count, future in enumerate(as_completed(futures), 1):
                        key, analysis = futures[future], future.result()
                        analysis_cache[key] = analysis
                        report('Analizando correspondencia con IA',
                               f'Análisis {completed_count} de {len(unique_jobs)} completado.',
                               70 + int(12 * completed_count / max(1, len(unique_jobs))))

        results, seen_keys = [], set()
        for job in analysis_jobs:
            analysis = analysis_cache[job['key']]
            item = job['item']
            if (analysis.get('error') or analysis.get('corresponde') is None) and \
                    analysis.get('error_code') not in AI_SERVICE_ERRORS:
                analysis = _deterministic_correspondence(job['text'], job['record']) or analysis
            item['analysis'] = analysis
            if job['key'] in seen_keys or job['key'] not in unique_jobs:
                item['analysis_reused'] = True
            seen_keys.add(job['key'])
            if analysis.get('error') or analysis.get('corresponde') is None:
                item.update(status='PENDIENTE', reason=analysis.get('error') or 'Correspondencia no concluyente.')
                # Una caída del servicio de IA se reintenta; una respuesta sin
                # evidencia suficiente no cambia al repetir y no bloquea el índice.
                if analysis.get('error_code') in AI_SERVICE_ERRORS or (
                        analysis.get('error') and analysis.get('error_code') != 'INVALID_RESPONSE'):
                    item['retryable'] = True
            else:
                item.update(status='SI' if analysis['corresponde'] is True else 'NO',
                            reason=analysis.get('observacion', 'Resultado de correspondencia documental.'))
            if item.get('archived_copy') and item['status'] in {'SI', 'NO'}:
                copy = item['archived_copy']
                item['reason'] += (f" Acceso comprobado con la copia de Wayback Machine del {copy['captured_at']}, "
                                   'porque el servidor no entregó el documento al verificador automático.')
            results.append(item)
        return results

    results = evaluate(targets, 0)

    # Sustitución en la muestra (nota 3): una fila cuyo enlace no puede
    # verificarse por causas del sitio o del contenido se reemplaza por la
    # siguiente fila del sorteo reproducible. Si ya hay un incumplimiento, el
    # resultado no cambia y no se descarga nada más.
    replacements = []
    if dataset_rows > SAMPLE_ROWS and not any(r['status'] == 'NO' for r in results):
        candidates = replacement_rows(all_targets, seed, sampled_rows)
        row_targets = {}
        for target in all_targets:
            if target['document'] == 'Conjunto de datos' and not target.get('missing_field'):
                row_targets.setdefault(target['row'], []).append(target)
        stuck = sorted({r['row'] for r in results if r['document'] == 'Conjunto de datos' and _unverifiable(r)})
        limit = max(0, int(getattr(settings, 'LOTAIP_SAMPLE_REPLACEMENTS', SAMPLE_REPLACEMENTS)))
        attempts = 0
        for row in stuck:
            while candidates and attempts < limit and time.monotonic() < deadline:
                candidate = candidates.pop(0)
                attempts += 1
                report('Sustituyendo fila de la muestra',
                       f'La fila {row} no pudo verificarse; se comprueba la fila {candidate} del sorteo reproducible.', 84)
                replacement = evaluate(row_targets[candidate], len(targets) + attempts * 100)
                if any(_unverifiable(r) for r in replacement):
                    continue
                results = [r for r in results if not (r['document'] == 'Conjunto de datos' and r['row'] == row)]
                results += replacement
                replacements.append({'row': row, 'replacement_row': candidate})
                break
            if any(r['status'] == 'NO' for r in results):
                break

    # Lo que sigue sin poder verificarse tras reintento, Wayback Machine,
    # respaldo determinista y sustitución no se califica: no prueba
    # incumplimiento y tampoco debe bloquear el índice esperando una revisión.
    for item in results:
        if _unverifiable(item):
            item.update(status='SIN EVALUACIÓN', unverifiable=True,
                        reason=item['reason'] + ' No verificable automáticamente; se excluye del cálculo '
                        'sin acreditar cumplimiento ni incumplimiento.')

    results.sort(key=lambda row: row.pop('_order', len(targets)))
    for item in results:
        item.pop('retryable', None)
    if not results:
        return 'NO', 'El esquema no produjo verificables comprobables; no se acredita cumplimiento.', []
    excluded = sum(r['status'] == 'SIN EVALUACIÓN' and not r.get('unverifiable') for r in results)
    unverifiable = sum(bool(r.get('unverifiable')) for r in results)
    pending = sum(r['status'] == 'PENDIENTE' for r in results)
    failures = sum(r['status'] == 'NO' for r in results)
    successes = sum(r['status'] == 'SI' for r in results)
    archived = sum(bool(r.get('archived_copy')) for r in results)
    status = aggregate_link_statuses(r['status'] for r in results)
    sample_note = (f'Muestra reproducible de {len(sampled_rows)} de {dataset_rows} filas del conjunto de datos '
                   f'(nota 3): filas {sampled_rows}. ' if dataset_rows > SAMPLE_ROWS else '')
    if replacements:
        sample_note += ('Filas sustituidas por no ser verificables automáticamente: '
                        + ', '.join(f"{r['row']}→{r['replacement_row']}" for r in replacements) + '. ')
    summary = (f'{sample_note}{len(results)} campos/registros revisados: {successes} cumplen, '
               f'{failures} no cumplen, {pending} pendientes, {excluded} sin evaluación por excepción documentada'
               + (f', {unverifiable} no verificables automáticamente' if unverifiable else '')
               + '; regla de la Tabla 6: todos deben cumplir.')
    if archived:
        summary += f' {archived} acceso(s) comprobados con copia de Wayback Machine.'
    unique_jobs = stats['unique_jobs']
    reported_tokens = sum(
        analysis_cache[key].get('usage', {}).get('total_tokens', 0)
        for key in unique_jobs
    )
    if unique_jobs:
        summary += (f" IA: {len(unique_jobs)} registros nuevos en {stats['batch_requests']} lote(s)"
                    if default_analyzer else f' IA: {len(unique_jobs)} consultas nuevas')
        summary += f', {reported_tokens} tokens reportados.' if reported_tokens else '.'
    reused_count = sum(bool(row.get('analysis_reused')) for row in results)
    if reused_count:
        summary += f' {reused_count} análisis reutilizados sin consumo adicional.'
    details = ' '.join(f"{r['document']}, {r['field']}, fila {r['row']}: {r['reason']}" for r in results
                       if r['status'] not in {'SI', 'SIN EVALUACIÓN'} or r.get('unverifiable'))
    return status, summary + ' ' + details[:4500], results
