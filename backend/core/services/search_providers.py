"""Clientes directos de los buscadores usados por la evaluación internacional.

Cada proveedor cumple un papel distinto dentro de la estrategia de búsqueda:

* Firecrawl ``/map``: lista las URLs del sitio oficial (rastreo propio del portal).
* Firecrawl ``/scrape``: lee páginas que necesitan JavaScript o bloquean descargas.
* Tavily: búsqueda principal; devuelve el texto completo de cada resultado.
* SerpSearch (Google vía SerpAPI o Serper): mejor índice de PDF y operadores
  ``site:`` / ``filetype:``.
* Exa: búsqueda semántica en lenguaje natural restringida al dominio oficial.
* Linkup: último recurso para indicadores difíciles.

Las claves se leen exclusivamente de variables de entorno (``backend/.env``).
Nunca se registran ni se devuelven en los mensajes de error.
"""

import json
import logging
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings

logger = logging.getLogger(__name__)

RRF_K = 60
# Códigos con los que los proveedores suelen indicar cuota agotada o clave inválida.
_QUOTA_CODES = {401, 402, 429, 432, 433}
# 429 es un límite de velocidad: el proveedor solo se pausa unos segundos. Los
# demás códigos (clave inválida, plan agotado) lo desactivan en todo el proceso.
_RATE_LIMIT_CODES = {429}
# Proveedor -> instante (time.monotonic) hasta el que no se usa; inf = sin reactivación.
_EXHAUSTED = {}
_EXHAUSTED_LOCK = threading.Lock()


class ProviderError(RuntimeError):
    """Error controlado; el mensaje nunca incluye la clave ni la respuesta cruda."""


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

def _key(name):
    return str(getattr(settings, name, '') or '').strip()


def direct_search_enabled():
    if not getattr(settings, 'SEARCH_DIRECT_ENABLED', True):
        return False
    return bool(configured_providers())


def configured_providers():
    keys = {
        'tavily': 'TAVILY_API_KEY',
        'exa': 'EXA_API_KEY',
        'firecrawl': 'FIRECRAWL_API_KEY',
        'linkup': 'LINKUP_API_KEY',
        'serp': 'SERP_API_KEY',
    }
    if not getattr(settings, 'SEARCH_DIRECT_ENABLED', True):
        return set()
    now = time.monotonic()
    with _EXHAUSTED_LOCK:
        for name in [name for name, until in _EXHAUSTED.items() if until <= now]:
            del _EXHAUSTED[name]
        exhausted = set(_EXHAUSTED)
    return {name for name, setting in keys.items() if _key(setting) and name not in exhausted}


def provider_available(name):
    return name in configured_providers()


def reset_exhausted_providers():
    with _EXHAUSTED_LOCK:
        _EXHAUSTED.clear()


def _rate_limit_pause(retry_after=None):
    default = float(getattr(settings, 'SEARCH_PROVIDER_RATE_LIMIT_SECONDS', 60))
    try:
        seconds = float(retry_after) if retry_after not in (None, '') else default
    except (TypeError, ValueError):
        seconds = default
    return min(max(1.0, seconds), float(getattr(settings, 'SEARCH_PROVIDER_MAX_PAUSE_SECONDS', 300)))


def _mark_exhausted(name, code, retry_after=None):
    if code in _RATE_LIMIT_CODES:
        pause = _rate_limit_pause(retry_after)
        with _EXHAUSTED_LOCK:
            _EXHAUSTED[name] = max(_EXHAUSTED.get(name, 0), time.monotonic() + pause)
        logger.warning('Proveedor de búsqueda %s en pausa %.0f s por límite de velocidad (HTTP %s).', name, pause, code)
        return
    with _EXHAUSTED_LOCK:
        _EXHAUSTED[name] = float('inf')
    logger.warning('Proveedor de búsqueda %s desactivado en este proceso (HTTP %s).', name, code)


def _content_limit():
    return max(2000, int(getattr(settings, 'SEARCH_PROVIDER_CONTENT_CHARS', 60000)))


def _timeout():
    return max(5, int(getattr(settings, 'SEARCH_PROVIDER_TIMEOUT', 45)))


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

def _request_json(provider, url, *, payload=None, headers=None, method='POST'):
    if not url.startswith('https://'):
        raise ProviderError(f'{provider}: solo se permiten endpoints HTTPS.')
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    request_headers = {'Accept': 'application/json', 'User-Agent': 'SisTransp/1.0'}
    if data is not None:
        request_headers['Content-Type'] = 'application/json'
    request_headers.update(headers or {})
    request = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=_timeout()) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as exc:
        if exc.code in _QUOTA_CODES:
            retry_after = exc.headers.get('Retry-After') if exc.headers else None
            _mark_exhausted(provider, exc.code, retry_after)
        raise ProviderError(f'{provider}: HTTP {exc.code}') from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = type(getattr(exc, 'reason', exc)).__name__
        raise ProviderError(f'{provider}: error de red ({reason})') from None
    if len(raw) > 8 * 1024 * 1024:
        raise ProviderError(f'{provider}: respuesta demasiado grande')
    try:
        return json.loads(raw)
    except ValueError:
        raise ProviderError(f'{provider}: respuesta JSON inválida') from None


def _row(url, title='', snippet='', raw_content='', published_date='', engine=''):
    return {
        'url': str(url or ''),
        'title': str(title or url or '')[:500],
        'snippet': str(snippet or '')[:4000],
        'raw_content': str(raw_content or '')[:_content_limit()],
        'published_date': str(published_date or '')[:100],
        'search_engine': engine,
    }


def strip_site_operator(query):
    return ' '.join(re.sub(r'\bsite:\S+', ' ', str(query or '')).split())


# ---------------------------------------------------------------------------
# Proveedores
# ---------------------------------------------------------------------------

def tavily_search(query, max_results=8, domains=None, raw_content=True):
    payload = {
        'query': strip_site_operator(query)[:400],
        'search_depth': getattr(settings, 'TAVILY_SEARCH_DEPTH', 'advanced'),
        'max_results': max(1, min(int(max_results), 20)),
        'include_raw_content': bool(raw_content),
        'include_answer': False,
    }
    if domains:
        payload['include_domains'] = list(domains)
    envelope = _request_json(
        'tavily', 'https://api.tavily.com/search', payload=payload,
        headers={'Authorization': 'Bearer ' + _key('TAVILY_API_KEY')},
    )
    return [
        _row(item.get('url'), item.get('title'), item.get('content'),
             item.get('raw_content'), item.get('published_date'), 'tavily')
        for item in envelope.get('results') or [] if isinstance(item, dict)
    ]


def exa_search(query, max_results=8, domains=None):
    payload = {
        'query': strip_site_operator(query)[:500],
        'type': getattr(settings, 'EXA_SEARCH_TYPE', 'auto'),
        'numResults': max(1, min(int(max_results), 25)),
        'contents': {'text': {'maxCharacters': _content_limit()}},
    }
    if domains:
        payload['includeDomains'] = list(domains)
    envelope = _request_json(
        'exa', 'https://api.exa.ai/search', payload=payload,
        headers={'x-api-key': _key('EXA_API_KEY')},
    )
    rows = []
    for item in envelope.get('results') or []:
        if not isinstance(item, dict):
            continue
        text = item.get('text') or ''
        rows.append(_row(item.get('url'), item.get('title'), text[:600], text,
                         item.get('publishedDate'), 'exa'))
    return rows


def linkup_search(query, max_results=8, domains=None):
    payload = {
        'q': strip_site_operator(query)[:500],
        'depth': getattr(settings, 'LINKUP_DEPTH', 'standard'),
        'outputType': 'searchResults',
    }
    if domains:
        payload['includeDomains'] = list(domains)
    headers = {'Authorization': 'Bearer ' + _key('LINKUP_API_KEY')}
    try:
        envelope = _request_json('linkup', 'https://api.linkup.so/v1/search', payload=payload, headers=headers)
    except ProviderError as exc:
        # Algunas versiones del API no aceptan filtros de dominio.
        if not domains or 'HTTP 400' not in str(exc) and 'HTTP 422' not in str(exc):
            raise
        payload.pop('includeDomains', None)
        envelope = _request_json('linkup', 'https://api.linkup.so/v1/search', payload=payload, headers=headers)
    rows = []
    for item in (envelope.get('results') or [])[:max_results]:
        if not isinstance(item, dict) or not item.get('url'):
            continue
        content = item.get('content') or ''
        rows.append(_row(item.get('url'), item.get('name') or item.get('title'),
                         content[:600], content, '', 'linkup'))
    return rows


def serp_search(query, max_results=10):
    """Google mediante SerpAPI (serpapi.com) o Serper (serper.dev), según SERP_PROVIDER."""
    flavor = str(getattr(settings, 'SERP_PROVIDER', 'serpapi') or 'serpapi').lower()
    num = max(1, min(int(max_results), 20))
    if flavor == 'serper':
        envelope = _request_json(
            'serp', 'https://google.serper.dev/search',
            payload={'q': query[:400], 'num': num, 'gl': 'ec', 'hl': 'es'},
            headers={'X-API-KEY': _key('SERP_API_KEY')},
        )
        items = envelope.get('organic') or []
        engine = 'serper-google'
    else:
        params = urllib.parse.urlencode({
            'engine': 'google', 'q': query[:400], 'num': num, 'hl': 'es', 'gl': 'ec',
            'google_domain': 'google.com.ec', 'api_key': _key('SERP_API_KEY'),
        })
        envelope = _request_json('serp', 'https://serpapi.com/search.json?' + params, method='GET')
        items = envelope.get('organic_results') or []
        engine = 'serpapi-google'
    return [
        _row(item.get('link'), item.get('title'), item.get('snippet'), '', item.get('date'), engine)
        for item in items if isinstance(item, dict) and item.get('link')
    ]


def _firecrawl_base():
    return str(getattr(settings, 'FIRECRAWL_API_BASE', 'https://api.firecrawl.dev/v1')).rstrip('/')


def firecrawl_map(site_url, limit=3000, search=None):
    """Devuelve las URLs conocidas del sitio (sitemap + enlaces descubiertos)."""
    payload = {'url': site_url, 'limit': max(10, min(int(limit), 30000)), 'includeSubdomains': True}
    if search:
        payload['search'] = search
    envelope = _request_json(
        'firecrawl', _firecrawl_base() + '/map', payload=payload,
        headers={'Authorization': 'Bearer ' + _key('FIRECRAWL_API_KEY')},
    )
    rows = []
    for link in envelope.get('links') or []:
        if isinstance(link, str):
            rows.append(_row(link, '', '', '', '', 'firecrawl-map'))
        elif isinstance(link, dict) and link.get('url'):
            rows.append(_row(link['url'], link.get('title'), link.get('description'), '', '', 'firecrawl-map'))
    return rows


def firecrawl_scrape(url):
    """Lee una página (incluido JavaScript y PDF) y devuelve markdown y metadatos."""
    envelope = _request_json(
        'firecrawl', _firecrawl_base() + '/scrape',
        payload={'url': url, 'formats': ['markdown'], 'onlyMainContent': True, 'timeout': 30000},
        headers={'Authorization': 'Bearer ' + _key('FIRECRAWL_API_KEY')},
    )
    data = envelope.get('data') or {}
    metadata = data.get('metadata') or {}
    markdown = data.get('markdown') or ''
    if not markdown.strip():
        raise ProviderError('firecrawl: página sin contenido legible')
    return {
        'url': metadata.get('sourceURL') or url,
        'title': metadata.get('title') or '',
        'markdown': markdown[:_content_limit()],
        'published_date': metadata.get('publishedTime') or metadata.get('modifiedTime') or '',
    }


# ---------------------------------------------------------------------------
# Fusión y estrategia por niveles
# ---------------------------------------------------------------------------

def _url_key(url):
    parsed = urllib.parse.urlsplit(str(url or ''))
    host = (parsed.hostname or '').lower().removeprefix('www.')
    path = parsed.path.rstrip('/') or '/'
    return f'{host}{path}?{parsed.query}' if host else ''


def rrf_merge(result_lists, max_results=10):
    """Reciprocal Rank Fusion: premia URLs que aparecen alto en varios buscadores."""
    merged = {}
    for rows in result_lists:
        for rank, row in enumerate(rows or []):
            key = _url_key(row.get('url'))
            if not key:
                continue
            current = merged.get(key)
            if current is None:
                current = merged[key] = {**row, '_rrf': 0.0, '_engines': []}
            current['_rrf'] += 1.0 / (RRF_K + rank + 1)
            engine = row.get('search_engine')
            if engine and engine not in current['_engines']:
                current['_engines'].append(engine)
            for field in ('raw_content', 'snippet', 'title', 'published_date'):
                if len(str(row.get(field) or '')) > len(str(current.get(field) or '')):
                    current[field] = row[field]
    ordered = sorted(merged.values(), key=lambda item: item['_rrf'], reverse=True)
    output = []
    for row in ordered[:max_results]:
        engines = row.pop('_engines')
        row.pop('_rrf')
        row['search_engine'] = '+'.join(engines)
        output.append(row)
    return output


def _run_parallel(calls):
    """Ejecuta los proveedores en paralelo; un fallo individual no detiene al resto."""
    results, errors = [], []
    if not calls:
        return results, errors
    with ThreadPoolExecutor(max_workers=min(4, len(calls))) as pool:
        futures = [(name, pool.submit(func)) for name, func in calls]
        for name, future in futures:
            try:
                results.append(future.result())
            except ProviderError as exc:
                errors.append(str(exc))
            except Exception as exc:  # defensa: un proveedor nunca rompe la evaluación
                errors.append(f'{name}: {type(exc).__name__}')
    return results, errors


def tiered_search(query, max_results=8, domain=None, tier='targeted', semantic_query=None):
    """Búsqueda por niveles.

    targeted: Tavily (web general) + Google, fusionados.
    refined:  Tavily y Exa restringidos al dominio oficial + Google con site:.
    deep:     Linkup (y Exa si Linkup no está disponible).
    """
    available = configured_providers()
    domains = [domain] if domain else None
    plain = strip_site_operator(query)
    semantic = semantic_query or plain
    calls = []
    if tier == 'targeted':
        if 'tavily' in available:
            calls.append(('tavily', lambda: tavily_search(plain, max_results)))
        if 'serp' in available:
            calls.append(('serp', lambda: serp_search(plain, max_results)))
    elif tier == 'refined':
        if 'tavily' in available:
            calls.append(('tavily', lambda: tavily_search(plain, max_results, domains)))
        if 'exa' in available:
            calls.append(('exa', lambda: exa_search(semantic, max_results, domains)))
        if 'serp' in available:
            site_query = query if 'site:' in query or not domain else f'site:{domain} {plain}'
            calls.append(('serp', lambda: serp_search(site_query, max_results)))
    elif tier == 'deep':
        if 'linkup' in available:
            calls.append(('linkup', lambda: linkup_search(semantic, max_results, domains)))
        elif 'exa' in available:
            calls.append(('exa', lambda: exa_search(semantic, max_results, domains)))
    if not calls:
        # Respaldo: cualquier buscador general configurado.
        for name, func in (
            ('tavily', lambda: tavily_search(plain, max_results, domains)),
            ('serp', lambda: serp_search(query, max_results)),
            ('exa', lambda: exa_search(semantic, max_results, domains)),
            ('linkup', lambda: linkup_search(semantic, max_results, domains)),
        ):
            if name in available:
                calls.append((name, func))
                break
    results, errors = _run_parallel(calls)
    if not results and errors:
        raise ProviderError('; '.join(errors))
    if errors:
        logger.info('Búsqueda %s con fallos parciales: %s', tier, '; '.join(errors))
    return rrf_merge(results, max_results)
