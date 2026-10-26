"""Evaluación técnica de la dimensión D8: accesibilidad, interoperabilidad y datos abiertos.

Estos criterios piden una propiedad del portal o de los datos, no un documento que
la mencione, así que se miden directamente en lugar de buscarse en la web:

* CI-42 (IND-55): reglas WCAG 2.2 A/AA comprobables automáticamente con axe-core
  sobre una muestra de páginas de transparencia del portal.
* CI-45 (IND-57): interoperabilidad de los paquetes LOTAIP ya descargados. Solo se
  mide lo que la LOTAIP no califica (consistencia, diccionario fiel a las columnas,
  formatos estándar, licencia abierta); publicar en CSV con metadatos y diccionario
  ya puntúa en el componente nacional.
* CI-46 (IND-58): catálogo de datos abiertos propio de la universidad, más allá de
  los numerales LOTAIP, con conjuntos de alto valor universitario.

Ninguna medición usa el modelo de IA ni consume créditos de búsqueda.
"""
import csv
import html
import io
import json
import re
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit

from django.conf import settings

from ..models import Evidence
from .lotaip_automatic import fetch_public

TECHNICAL_FAMILIES = {'CI-42', 'CI-45', 'CI-46'}
# Se calculan con los paquetes LOTAIP descargados: se vuelven a medir tras cada evaluación LOTAIP.
LOTAIP_DERIVED_FAMILIES = {'CI-45'}

AXE_PATH = Path(__file__).resolve().parent.parent / 'vendor' / 'axe-core' / 'axe.min.js'
AXE_VERSION = '4.10.3'
WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
# Páginas de desafío antibots: no son el portal y nunca se califican.
CHALLENGE_TITLES = ('un momento', 'just a moment', 'attention required', 'verificando', 'checking your browser')
CHALLENGE_MARKERS = ('challenge-platform', 'cf-chl-', '__cf_chl', 'cf_chl_opt')

CKAN_SEARCH_URL = 'https://www.datosabiertos.gob.ec/api/3/action/package_search'
DATA_EXTENSIONS = ('.csv', '.json', '.xlsx', '.xls', '.ods', '.xml', '.geojson')
LOTAIP_LINK_PATTERN = re.compile(r'lotaip|transparencia|dpe\.gob\.ec|numeral|literal', re.IGNORECASE)
# Conjuntos de alto valor propios del ámbito universitario que la LOTAIP no exige.
UNIVERSITY_TOPIC_PATTERN = re.compile(
    r'matricul|graduad|titulad|admisi|aspirante|estudiant|docente|profesor|investigaci|publicaci|'
    r'beca|desercion|abandono|retencion|oferta academica|carrera',
)
OPEN_DATA_PATH_HINTS = ('datos abiertos', 'open data', 'opendata', 'catalogo de datos', 'datos', 'estadisticas')


def _normalize(value):
    value = unicodedata.normalize('NFKD', str(value or '').casefold())
    value = ''.join(char for char in value if not unicodedata.combining(char))
    return ' '.join(re.findall(r'[a-z0-9]+', value))


def _outcome(status, score, justification, metadata, source_url='', source_title='', location='', excerpt=''):
    return {
        'status': status, 'score': score, 'justification': justification, 'metadata': metadata,
        'source_url': source_url, 'source_title': source_title,
        'source_location': location, 'evidence_excerpt': excerpt,
    }


# ---------------------------------------------------------------------------
# CI-42 · Accesibilidad WCAG 2.2 A/AA
# ---------------------------------------------------------------------------

def _accessibility_pages(university, site_rows):
    """Muestra fija: portada y secciones de transparencia del portal oficial."""
    home = university.website_url or ''
    pages = [home] if home else []
    wanted = (('lotaip',), ('transparencia',), ('rendicion de cuentas',))
    for words in wanted:
        matches = []
        for row in site_rows:
            url = str(row.get('url') or '')
            segments = [_normalize(part) for part in urlsplit(url).path.split('/') if part]
            if segments and any(segment.startswith(words[0]) for segment in segments):
                matches.append((len(urlsplit(url).path), url))
        if matches:
            pages.append(min(matches)[1])
    seen, unique = set(), []
    for url in pages:
        key = url.rstrip('/').lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(url)
    return unique[:int(getattr(settings, 'INTERNATIONAL_ACCESSIBILITY_PAGES', 4))]


def _is_challenge(status, title, content):
    title = (title or '').strip().lower()
    if any(marker in title for marker in CHALLENGE_TITLES):
        return True
    return status in {403, 429, 503} and any(marker in (content or '') for marker in CHALLENGE_MARKERS)


def _run_axe(page):
    page.evaluate(AXE_PATH.read_text(encoding='utf-8'))
    return page.evaluate(
        """async (tags) => {
            const r = await axe.run(document, {runOnly: {type: 'tag', values: tags},
                                               resultTypes: ['violations', 'passes']});
            return {
                violations: r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help,
                    tags: v.tags.filter(t => t.startsWith('wcag')), nodes: v.nodes.length})),
                passes: r.passes.map(p => p.id),
            };
        }""",
        WCAG_TAGS,
    )


def _measure_accessibility(urls, archive_lookup, snapshot_date, archive_only=False):
    """Ejecuta axe en cada página.

    Usa la copia archivada cuando el año ya cerró (``archive_only``) o cuando el portal
    responde con un desafío antibots, que nunca se califica.
    """
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    measured, skipped = [], []
    timeout = int(getattr(settings, 'INTERNATIONAL_ACCESSIBILITY_TIMEOUT_MS', 60000))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            context = browser.new_context(locale='es-EC', viewport={'width': 1366, 'height': 900})
            for url in urls:
                page = context.new_page()
                source, captured = url, None
                try:
                    status = 0
                    if not archive_only:
                        response = page.goto(url, wait_until='load', timeout=timeout)
                        status = response.status if response else 0
                    if archive_only or status != 200 or _is_challenge(status, page.title(), page.content()):
                        snapshot = archive_lookup(url, snapshot_date)
                        if not snapshot:
                            skipped.append({'url': url, 'reason': f'HTTP {status} o desafío antibots sin copia archivada'})
                            continue
                        captured, archived_url = snapshot
                        # if_ sirve la copia con sus estilos reescritos al archivo y sin la barra del archivo.
                        source = archived_url.replace('id_/', 'if_/', 1)
                        response = page.goto(source, wait_until='load', timeout=timeout)
                        status = response.status if response else 0
                        if status != 200 or _is_challenge(status, page.title(), page.content()):
                            skipped.append({'url': url, 'reason': f'copia archivada no legible (HTTP {status})'})
                            continue
                    result = _run_axe(page)
                    measured.append({
                        'url': url, 'measured_url': source,
                        'archived_at': captured.isoformat() if captured else '',
                        'violations': result['violations'], 'passes': result['passes'],
                    })
                except PlaywrightError as exc:
                    skipped.append({'url': url, 'reason': type(exc).__name__})
                finally:
                    page.close()
        finally:
            browser.close()
    return measured, skipped


def _accessibility_outcome(measured, skipped):
    failed = {}
    passed = set()
    for page in measured:
        passed.update(page['passes'])
        for violation in page['violations']:
            current = failed.setdefault(violation['id'], {**violation, 'pages': 0})
            current['pages'] += 1
    passed -= set(failed)
    metadata = {
        'evaluation_mode': 'tecnico', 'method': f'axe-core {AXE_VERSION} · {", ".join(WCAG_TAGS)}',
        'pages': [{key: page[key] for key in ('url', 'measured_url', 'archived_at')} for page in measured],
        'skipped_pages': skipped,
        'rules_passed': sorted(passed),
        'rules_failed': sorted(failed.values(), key=lambda row: (row['impact'] != 'critical', row['id'])),
    }
    if not measured:
        return _outcome(
            'ERROR_TECNICO', None,
            'No fue posible medir la accesibilidad: ninguna página de la muestra pudo cargarse '
            '(bloqueo antibots sin copia archivada o error de carga). Reintente la evaluación.',
            metadata,
        )
    total = len(passed) + len(failed)
    rate = len(passed) / total if total else 0
    critical = [row for row in failed.values() if row['impact'] == 'critical']
    metadata.update({'pass_rate': round(rate, 4), 'critical_rules': len(critical)})
    if rate >= .95 and not critical:
        status, score = 'CUMPLE', 1
    elif rate >= .70:
        status, score = 'PARCIAL', .5
    else:
        status, score = 'NO_CUMPLE', 0
    worst = ', '.join(f"{row['help']} ({row['impact']})" for row in metadata['rules_failed'][:4])
    archived = [page for page in measured if page['archived_at']]
    excerpt = (
        f'{len(passed)} de {total} reglas WCAG 2.2 A/AA comprobables se cumplen ({rate:.0%}) '
        f'en {len(measured)} página(s).' + (f' Incumplidas: {worst}.' if failed else '')
    )
    justification = (
        f'Medición automática con axe-core {AXE_VERSION}. {excerpt} '
        'Las pruebas automáticas cubren solo una parte de WCAG; el resto requiere revisión humana.'
        + (f' {len(archived)} página(s) se midieron sobre su copia del Internet Archive porque el portal '
           'respondió con un desafío antibots.' if archived else '')
    )
    first = measured[0]
    location = f'axe-core {AXE_VERSION}' + (f' · copia archivada {first["archived_at"]}' if first['archived_at'] else '')
    return _outcome(status, score, justification, metadata, first['url'], 'Medición de accesibilidad', location, excerpt)


def evaluate_accessibility(university, site_rows, archive_lookup, snapshot_date, archive_only=False):
    urls = _accessibility_pages(university, site_rows)
    if not urls:
        return _outcome('ERROR_TECNICO', None, 'La universidad no tiene un portal registrado para medir.',
                        {'evaluation_mode': 'tecnico'})
    measured, skipped = _measure_accessibility(urls, archive_lookup, snapshot_date, archive_only)
    return _accessibility_outcome(measured, skipped)


# ---------------------------------------------------------------------------
# CI-45 · Interoperabilidad de los conjuntos LOTAIP
# ---------------------------------------------------------------------------

NON_ISO_DATE = re.compile(r'^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$')
NON_STANDARD_NUMBER = re.compile(r'^(\$|usd)\s*\d|^\d{1,3}(\.\d{3})+(,\d+)?$', re.IGNORECASE)
OPEN_LICENSE = re.compile(r'cc[- ]?by|creative commons|odc|cc0|dominio publico|licencia abierta', re.IGNORECASE)


def _file_role(evidence):
    name = _normalize(f'{Path(evidence.file_path or "").name} {evidence.title}')
    if 'diccionario' in name:
        return 'dictionary'
    if 'metadato' in name:
        return 'metadata'
    if 'conjunto' in name or 'datos' in name:
        return 'dataset'
    return ''


def _read_rows(evidence):
    path = Path(settings.MEDIA_ROOT) / (evidence.file_path or '')
    if not evidence.file_path or not path.is_file():
        return None, None
    raw = path.read_bytes()
    try:
        text, utf8 = raw.decode('utf-8-sig'), True
    except UnicodeDecodeError:
        text, utf8 = raw.decode('cp1252', errors='replace'), False
    # El separador se decide con la cabecera: las descripciones suelen tener comas.
    first_line = text.lstrip().split('\n', 1)[0]
    delimiter = ';' if first_line.count(';') > first_line.count(',') else ','
    rows = [row for row in csv.reader(io.StringIO(text), delimiter=delimiter) if any(cell.strip() for cell in row)]
    return rows, utf8


def _lotaip_packages(university, period_id):
    packages = {}
    queryset = Evidence.objects.filter(
        university=university, period_id=period_id, indicator__code__startswith='LOTAIP-',
    ).select_related('indicator')
    for evidence in queryset:
        role = _file_role(evidence)
        if role:
            key = (evidence.indicator.code, evidence.month or 0)
            packages.setdefault(key, {})[role] = evidence
    return packages


def _package_checks(package):
    """Comprobaciones que la LOTAIP no califica; None cuando no aplican."""
    dataset_rows, dataset_utf8 = _read_rows(package['dataset']) if 'dataset' in package else (None, None)
    if not dataset_rows:
        return None, []
    header = [_normalize(cell) for cell in dataset_rows[0] if cell.strip()]
    checks = {'utf8': bool(dataset_utf8)}
    if 'dictionary' in package:
        dictionary_rows, _ = _read_rows(package['dictionary'])
        fields = {_normalize(row[0]) for row in dictionary_rows or [] if row and row[0].strip()}
        matched = sum(field in fields for field in header)
        checks['dictionary_matches_columns'] = bool(header) and matched / len(header) >= .9
    cells = [cell.strip() for row in dataset_rows[1:] for cell in row if cell.strip()]
    checks['standard_formats'] = not any(NON_ISO_DATE.match(cell) or NON_STANDARD_NUMBER.match(cell) for cell in cells)
    if 'metadata' in package:
        metadata_rows, _ = _read_rows(package['metadata'])
        license_value = next((
            row[1] for row in metadata_rows or [] if len(row) > 1 and 'licencia' in _normalize(row[0])
        ), '')
        checks['open_license'] = bool(OPEN_LICENSE.search(license_value))
    return checks, header


def evaluate_interoperability(university, period_id):
    packages = _lotaip_packages(university, period_id)
    results = {}
    headers_by_numeral = {}
    for (numeral, month), package in sorted(packages.items()):
        checks, header = _package_checks(package)
        if checks is None:
            continue
        results[(numeral, month)] = checks
        headers_by_numeral.setdefault(numeral, set()).add(tuple(header))
    metadata = {'evaluation_mode': 'tecnico', 'method': 'Análisis de los paquetes LOTAIP descargados'}
    if not results:
        return _outcome(
            'SIN_EVIDENCIA', None,
            'No hay conjuntos de datos LOTAIP descargados para el año; no se puede medir su interoperabilidad.',
            metadata,
        )
    stable = {numeral: len(headers) == 1 for numeral, headers in headers_by_numeral.items()}
    names = {
        'utf8': 'codificación UTF-8', 'dictionary_matches_columns': 'diccionario fiel a las columnas',
        'standard_formats': 'fechas ISO y números sin formato local', 'open_license': 'licencia abierta',
    }
    failures = {}
    passing = 0
    for (numeral, month), checks in results.items():
        failed = [name for name, ok in checks.items() if not ok]
        if not stable.get(numeral, True):
            failed.append('columnas estables entre meses')
        for name in failed:
            failures.setdefault(names.get(name, name), []).append(f'{numeral} ({month:02d})')
        passing += not failed
    rate = passing / len(results)
    months = sorted({month for _, month in results})
    metadata.update({
        'packages': len(results), 'packages_passing': passing, 'pass_rate': round(rate, 4),
        'months': months, 'failures': {name: rows[:20] for name, rows in failures.items()},
        'checks': {f'{numeral} ({month:02d})': checks for (numeral, month), checks in results.items()},
    })
    if rate >= .9:
        status, score = 'CUMPLE', 1
    elif rate >= .5:
        status, score = 'PARCIAL', .5
    else:
        status, score = 'NO_CUMPLE', 0
    summary = '; '.join(f'{name}: {len(rows)} paquete(s)' for name, rows in failures.items()) or 'sin fallas'
    excerpt = f'{passing} de {len(results)} paquetes LOTAIP cumplen todas las condiciones de interoperabilidad. Fallas: {summary}.'
    justification = (
        f'{excerpt} Se miden solo condiciones que complementan la LOTAIP (identificadores y columnas '
        'consistentes, diccionario que coincide con los datos, formatos estándar y licencia abierta); '
        'publicar en CSV con metadatos y diccionario ya se califica en el componente nacional.'
        + ('' if len(months) > 1 else ' La estabilidad entre meses no se pudo comprobar porque solo hay un mes descargado.')
    )
    first = next(iter(packages.values()))
    source = (first.get('dataset') or next(iter(first.values()))).source_url or ''
    return _outcome(status, score, justification, metadata, source, 'Paquetes LOTAIP del período',
                    'Análisis de conjuntos, diccionarios y metadatos LOTAIP', excerpt)


# ---------------------------------------------------------------------------
# CI-46 · Catálogo de datos abiertos
# ---------------------------------------------------------------------------

def _university_organization(row, university):
    organization = row.get('organization') or {}
    if isinstance(organization, str):
        label = organization
    else:
        label = f"{organization.get('name', '')} {organization.get('title', '')}"
    label = _normalize(label)
    name = _normalize(university.name)
    acronym = _normalize(university.acronym)
    return bool(name and name in label or acronym and re.search(rf'\b{re.escape(acronym)}\b', label))


def _national_portal_datasets(university):
    """Conjuntos publicados por la propia universidad en datosabiertos.gob.ec (no los de SENESCYT)."""
    response = fetch_public(f'{CKAN_SEARCH_URL}?q={quote(chr(34) + university.name + chr(34))}&rows=50')
    if response.get('status') != 200 or response.get('error'):
        return None
    try:
        rows = json.loads(response['body'].decode('utf-8')).get('result', {}).get('results', [])
    except (ValueError, AttributeError):
        return None
    return [
        {'title': row.get('title', ''), 'url': f"https://www.datosabiertos.gob.ec/dataset/{row.get('name', '')}"}
        for row in rows if _university_organization(row, university)
    ]


def _data_links(url, body):
    links = []
    for href, text in re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', body, re.IGNORECASE | re.DOTALL):
        absolute = urljoin(url, html.unescape(href))
        path = urlsplit(absolute).path.lower()
        if path.endswith(DATA_EXTENSIONS) or '/api/' in path:
            if not LOTAIP_LINK_PATTERN.search(absolute):
                links.append({'url': absolute, 'text': _normalize(re.sub(r'<[^>]+>', ' ', text))})
    return links


def _open_data_candidates(university, site_rows):
    host = (urlsplit(university.website_url or '').hostname or '').lower().removeprefix('www.')
    candidates = []
    for row in site_rows:
        url = str(row.get('url') or '')
        segments = [_normalize(part) for part in urlsplit(url).path.split('/') if part]
        if segments and any(segment.startswith(hint) for hint in OPEN_DATA_PATH_HINTS for segment in segments[-1:]):
            candidates.append(url)
    if host:
        candidates += [f'https://{prefix}.{host}/' for prefix in ('datos', 'datosabiertos', 'opendata')]
    return list(dict.fromkeys(candidates))[:int(getattr(settings, 'INTERNATIONAL_OPEN_DATA_CANDIDATES', 8))]


def _read_page(url, archive_lookup, snapshot_date, archive_only):
    """HTML de la página o de su copia archivada (años cerrados o portal bloqueado)."""
    if not archive_only:
        response = fetch_public(url)
        if response.get('status') == 200 and not response.get('error'):
            return url, response.get('body', b'').decode('utf-8', errors='replace')
    if not _same_portal(url):
        return None, ''
    snapshot = archive_lookup(url, snapshot_date)
    if not snapshot:
        return None, ''
    response = fetch_public(snapshot[1])
    if response.get('status') != 200 or response.get('error'):
        return None, ''
    return url, response.get('body', b'').decode('utf-8', errors='replace')


def _same_portal(url):
    return not urlsplit(url).hostname.startswith(('datos.', 'datosabiertos.', 'opendata.'))


def evaluate_open_data(university, site_rows, archive_lookup, snapshot_date, archive_only=False):
    pages = []
    for url in _open_data_candidates(university, site_rows):
        url, body = _read_page(url, archive_lookup, snapshot_date, archive_only)
        if not url:
            continue
        links = _data_links(url, body)
        ckan = '/api/3/action' in body or 'ckan' in body.lower()
        if links or ckan:
            pages.append({'url': url, 'links': links[:50], 'ckan': ckan})
    national = _national_portal_datasets(university)
    datasets = [link for page in pages for link in page['links']] + (national or [])
    topical = [
        row for row in datasets
        if UNIVERSITY_TOPIC_PATTERN.search(_normalize(f"{row.get('text', '')} {row.get('title', '')} {row['url']}"))
    ]
    catalog = bool(national) or any(page['ckan'] or len(page['links']) >= 3 for page in pages)
    metadata = {
        'evaluation_mode': 'tecnico',
        'method': 'Catálogo propio (portal y subdominios), API CKAN y datosabiertos.gob.ec',
        'candidate_pages': [page['url'] for page in pages], 'national_portal_datasets': national or [],
        'national_portal_reachable': national is not None,
        'data_links': len(datasets), 'university_topic_datasets': [row['url'] for row in topical[:20]],
    }
    note = 'Los numerales LOTAIP no cuentan aquí porque ya se califican en el componente nacional.'
    if catalog and topical:
        status, score = 'CUMPLE', 1
        text = f'Catálogo de datos con {len(topical)} conjunto(s) de alto valor universitario en formato reutilizable.'
    elif catalog or topical:
        status, score = 'PARCIAL', .5
        text = ('Hay un catálogo de datos, pero sin conjuntos propios del ámbito universitario.' if catalog else
                f'Hay {len(topical)} conjunto(s) universitario(s) reutilizable(s), pero no un catálogo organizado.')
    else:
        return _outcome(
            'SIN_EVIDENCIA', None,
            'No se encontró un catálogo de datos abiertos propio de la universidad ni conjuntos reutilizables '
            '(CSV, JSON, XLSX o API) más allá de la LOTAIP, ni publicaciones suyas en datosabiertos.gob.ec. ' + note,
            metadata,
        )
    source = (topical or datasets)[0]['url']
    return _outcome(status, score, f'{text} {note}', metadata, source, 'Datos abiertos de la universidad',
                    'Catálogo o enlaces de datos reutilizables', text)


def evaluate_technical_indicator(
    university, period_id, indicator, period_context, site_rows, archive_lookup, archive_date=None,
):
    """Mide un criterio técnico de D8. ``archive_date`` indica un año cerrado: se usan copias archivadas."""
    family = indicator.family_code
    snapshot_date = archive_date or date.fromisoformat(period_context['cutoff_date'])
    if family == 'CI-42':
        return evaluate_accessibility(university, site_rows, archive_lookup, snapshot_date, bool(archive_date))
    if family == 'CI-45':
        return evaluate_interoperability(university, period_id)
    if family == 'CI-46':
        return evaluate_open_data(university, site_rows, archive_lookup, snapshot_date, bool(archive_date))
    raise ValueError(f'{indicator.code} no tiene evaluación técnica.')
