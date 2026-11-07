"""Comprobaciones reproducibles. None significa no verificable, nunca incumplimiento."""
import calendar
import hashlib
import http.client
import ipaddress
import json
import re
import socket
import ssl
import time
from http.cookies import SimpleCookie
from pathlib import Path
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin

from django.conf import settings
from .comparison_engine import absence_marker, normalize_text

MAX_BYTES = 8 * 1024 * 1024


def _store_response_cookies(jar, headers, response_host):
    """Conserva cookies de redirección con alcance de dominio/ruta limitado."""
    for header, raw_value in headers:
        if header.lower() != "set-cookie" or len(raw_value) > 8192:
            continue
        parsed = SimpleCookie()
        try:
            parsed.load(raw_value)
        except Exception:
            continue
        for name, morsel in parsed.items():
            domain = (morsel["domain"] or response_host).lstrip(".").lower()
            if not (response_host == domain or response_host.endswith("." + domain)):
                continue
            path = morsel["path"] or "/"
            key = (domain, path, name)
            if not morsel.value or morsel["max-age"] == "0":
                jar.pop(key, None)
            elif len(jar) < 32 and len(morsel.value) <= 4096:
                jar[key] = (morsel.value, bool(morsel["secure"]))


def _request_cookie_header(jar, host, path, secure):
    values = []
    for (domain, cookie_path, name), (value, secure_only) in jar.items():
        if (host == domain or host.endswith("." + domain)) and path.startswith(cookie_path):
            if not secure_only or secure:
                values.append(f"{name}={value}")
    return "; ".join(values)


_AIA_CACHE = {}
_AIA_MAX_DEPTH = 3


def _aia_issuer_urls(der):
    from cryptography import x509
    from cryptography.x509.oid import AuthorityInformationAccessOID, ExtensionOID
    try:
        cert = x509.load_der_x509_certificate(der)
        access = cert.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS).value
    except (ValueError, x509.ExtensionNotFound):
        return []
    return [d.access_location.value for d in access
            if d.access_method == AuthorityInformationAccessOID.CA_ISSUERS
            and str(d.access_location.value).startswith("http://")]


def _download_issuer(url):
    """Certificado emisor publicado en la AIA (DER o PKCS#7), como lo descargan los navegadores."""
    if url in _AIA_CACHE:
        return _AIA_CACHE[url]
    from cryptography import x509
    from cryptography.hazmat.primitives.serialization import Encoding, pkcs7
    response = fetch_public(url)
    certs = []
    if response.get("status") == 200 and response.get("body"):
        body = response["body"]
        for loader in (lambda b: [x509.load_der_x509_certificate(b)], pkcs7.load_der_pkcs7_certificates,
                       lambda b: [x509.load_pem_x509_certificate(b)]):
            try:
                certs = [c.public_bytes(Encoding.DER) for c in loader(body)]
                break
            except ValueError:
                continue
    _AIA_CACHE[url] = certs
    return certs


def _intermediates_from_aia(leaf_der):
    """Sigue la AIA del certificado del servidor cuando este no envía la cadena completa."""
    chain, pending = [], [leaf_der]
    for _ in range(_AIA_MAX_DEPTH):
        if not pending:
            break
        current = pending.pop()
        for url in _aia_issuer_urls(current)[:2]:
            issuers = [der for der in _download_issuer(url) if der not in chain]
            chain += issuers
            pending += issuers[:1]
    return chain


def _tls_socket(address, port, hostname):
    """Socket TLS validado; completa con AIA una cadena intermedia ausente.

    Los intermedios descargados sólo ayudan a construir la cadena: se desactiva
    la verificación parcial para que la confianza termine siempre en una raíz
    del almacén del sistema, nunca en el intermedio obtenido de la red.
    """
    sock = socket.create_connection((address, port), timeout=6)
    try:
        return ssl.create_default_context().wrap_socket(sock, server_hostname=hostname)
    except ssl.SSLCertVerificationError as exc:
        sock.close()
        if "local issuer" not in str(exc):
            raise
        error = exc
    probe_context = ssl.create_default_context()
    probe_context.check_hostname = False
    probe_context.verify_mode = ssl.CERT_NONE
    with probe_context.wrap_socket(socket.create_connection((address, port), timeout=6),
                                   server_hostname=hostname) as probe:
        leaf = probe.getpeercert(binary_form=True)
    intermediates = _intermediates_from_aia(leaf) if leaf else []
    if not intermediates:
        raise error
    context = ssl.create_default_context()
    context.verify_flags &= ~getattr(ssl, "VERIFY_X509_PARTIAL_CHAIN", 0)
    context.load_verify_locations(cadata=b"".join(intermediates))
    sock = socket.create_connection((address, port), timeout=6)
    try:
        return context.wrap_socket(sock, server_hostname=hostname)
    except Exception:
        sock.close()
        raise


def _host_header(parsed):
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    default_port = 443 if parsed.scheme == "https" else 80
    return host if not parsed.port or parsed.port == default_port else f"{host}:{parsed.port}"


def fetch_public(url):
    """GET sin credenciales; IP pública fijada, TLS validado y redirecciones limitadas."""
    cookie_jar = {}
    max_bytes = getattr(settings, "LOTAIP_MAX_DOWNLOAD_BYTES", MAX_BYTES)
    for attempt in range(6):
        conn = None
        try:
            parsed = urlsplit(url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("URL pública HTTP(S) inválida")
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            if port not in (80, 443):
                raise ValueError("Puerto no permitido")
            addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
                raise ValueError("El destino no es una dirección pública")
            # La conexión usa exactamente la IP comprobada, sin una segunda resolución DNS.
            if parsed.scheme == "https":
                sock = _tls_socket(addresses[0][4][0], port, parsed.hostname)
            else:
                sock = socket.create_connection((addresses[0][4][0], port), timeout=6)
            conn = http.client.HTTPConnection(parsed.hostname, port, timeout=6)
            conn.sock = sock
            target = parsed.path or "/"
            if parsed.query:
                target += "?" + parsed.query
            # HTTPConnection añadiría «:443» al Host en HTTPS; algunos servidores
            # redirigen entonces a la misma URL sin puerto y se forma un bucle.
            headers = {
                "Host": _host_header(parsed),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8",
                "Accept-Language": "es-EC,es;q=0.9,en;q=0.8",
                "Accept-Encoding": "identity",
            }
            cookie_header = _request_cookie_header(cookie_jar, parsed.hostname.lower(), parsed.path or "/", parsed.scheme == "https")
            if cookie_header:
                headers["Cookie"] = cookie_header
            conn.request("GET", target, headers=headers)
            response = conn.getresponse()
            _store_response_cookies(cookie_jar, response.getheaders(), parsed.hostname.lower())
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location:
                    raise ValueError("Redirección sin destino")
                url = urljoin(url, location)
                continue
            if response.status in {429, 500, 502, 503, 504} and attempt < 2:
                retry_after = response.getheader("Retry-After", "")
                try:
                    delay = min(10.0, max(0.0, float(retry_after)))
                except (TypeError, ValueError):
                    delay = float(2 ** attempt)
                response.read(64 * 1024)
                time.sleep(delay)
                continue
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise ValueError(f"Recurso superior al límite de {max_bytes // (1024 * 1024)} MB")
            return {"url": url, "status": response.status, "body": body,
                    "content_type": response.getheader("Content-Type", ""), "error": None}
        except (OSError, ValueError, http.client.HTTPException) as exc:
            return {"url": url, "status": None, "body": b"", "error": str(exc)}
        finally:
            if conn:
                conn.close()
    return {"url": url, "status": None, "body": b"", "error": "Demasiadas redirecciones o reintentos"}


def parse_date(value):
    value = str(value or "").strip()
    for fmt in ("%d/%m/%Y", "%Y/%m/%d", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo:
            from zoneinfo import ZoneInfo
            parsed = parsed.astimezone(ZoneInfo("America/Guayaquil"))
        return parsed.date()
    except ValueError:
        return None


def money(value):
    value = str(value).strip().replace("$", "").replace("USD", "").replace(" ", "")
    if not re.fullmatch(r"-?\d+(?:[.,]\d+)*", value):
        return None
    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        value = value.replace(",", ".")
    try:
        result = Decimal(value)
        # Tres decimales/separador de miles ambiguo: no adivinar la convención.
        return result if result.as_tuple().exponent >= -2 else None
    except InvalidOperation:
        return None


def check_sums(number, rows):
    expected = {
        3: ["decimo tercera remuneracion", "decima cuarta remuneracion", "horas suplementarias y extraordinarias", "encargos y subrogaciones", "total ingresos adicionales"],
        6: ["devengado", "saldo por devengar", "codificado"],
    }.get(number)
    if not expected or len(rows) < 2:
        return "NO", "No hay filas o no se reconoce el formato para comprobar sumas."
    headers = [normalize_text(c) for c in rows[0]]
    if any(headers.count(c) != 1 for c in expected):
        return "NO", "No se identificaron de forma unívoca las columnas requeridas: " + ", ".join(expected)
    indices = [headers.index(c) for c in expected]
    failed, unknown, checked = [], [], 0
    for line, row in enumerate(rows[1:], 2):
        if not any(c.strip() for c in row):
            continue
        # Un componente vacío o NO APLICA no suma (vale 0); el vacío ya se
        # califica en la condición de información completa (Tabla 1).
        cells = [row[i].strip() if i < len(row) else "" for i in indices]
        values = [Decimal("0") if not cell or absence_marker(cell) else money(cell) for cell in cells]
        if any(v is None for v in values):
            unknown.append(line)
            continue
        checked += 1
        if abs(sum(values[:-1]) - values[-1]) > Decimal("0.01"):
            failed.append(line)
    observation = f"Sumas verificadas en {checked} filas (tolerancia 0,01). Inconsistencias: {failed[:12]}; importes no interpretables: {unknown[:12]}."
    return ("NO" if failed or unknown or not checked else "SI"), observation


def check_validity(rows, evaluated_on, sample_seed=None):
    if len(rows) < 2 or not evaluated_on:
        return "NO", "Faltan datos o período de referencia para comprobar la vigencia."
    headers = [normalize_text(c) for c in rows[0]]
    start_names = {"fecha de suscripcion", "fecha de la clasificacion de la informacion reservada", "fecha de inicio"}
    end_names = {"fecha de fin", "fecha de vencimiento", "fecha de finalizacion"}
    duration_names = {"duracion", "plazo de duracion", "periodo de vigencia de la clasificacion de la reserva"}
    start_indices = [i for i, h in enumerate(headers) if h in start_names]
    end_indices = [i for i, h in enumerate(headers) if h in end_names]
    duration_indices = [i for i, h in enumerate(headers) if h in duration_names]
    if len(start_indices) != 1 or (len(end_indices) != 1 and len(duration_indices) != 1):
        return "NO", "No se identificaron fechas de inicio y fin, o inicio y duración con unidades explícitas."
    # Plazo indefinido: el instrumento sigue vigente desde su inicio.
    open_ended = {"indefinido", "indefinida", "plazo indefinido", "sin plazo", "sin fecha de fin"}
    failed, unknown, checked = [], [], 0
    # Sin fecha de inicio (NO APLICA) no hay instrumento cuya vigencia
    # comprobar, aunque la fila conserve un enlace a un documento de respaldo.
    candidates = [(line, row) for line, row in enumerate(rows[1:], 2)
                  if not (start_indices[0] < len(row) and absence_marker(row[start_indices[0]]))]
    if not candidates:
        return "SIN EVALUACIÓN", "No hay registros con fecha de inicio: el formato declara NO APLICA y no existe información sujeta a vigencia."
    if len(candidates) > 3:
        import random
        candidates = sorted(random.Random(str(sample_seed or "lotaip")).sample(candidates, 3))
    sampled = [line for line, _ in candidates]
    for line, row in candidates:
        try:
            start = parse_date(row[start_indices[0]])
            end = parse_date(row[end_indices[0]]) if len(end_indices) == 1 else None
            limit = normalize_text(row[end_indices[0]] if len(end_indices) == 1 else row[duration_indices[0]])
            if start and not end and limit in open_ended:
                checked += 1
                if evaluated_on < start:
                    failed.append(line)
                continue
            if not end and start and len(duration_indices) == 1:
                duration = normalize_text(row[duration_indices[0]])
                match = re.fullmatch(r"(\d+) (dias?|mes(?:es)?|anos?)", duration)
                if match:
                    amount, unit = int(match[1]), match[2]
                    if unit.startswith("dia"):
                        end = start + timedelta(days=amount)
                    else:
                        months = amount * 12 if unit.startswith("ano") else amount
                        year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
                        end = date(year, month + 1, min(start.day, calendar.monthrange(year, month + 1)[1]))
            if not start or not end or end < start:
                unknown.append(line)
            else:
                checked += 1
                if not start <= evaluated_on <= end:
                    failed.append(line)
        except (IndexError, ValueError, OverflowError):
            unknown.append(line)
    return ("NO" if failed or unknown or not checked else "SI"), f"Vigencia al {evaluated_on}: filas seleccionadas {sampled}; {checked} comprobadas; fuera de vigencia: {failed[:12]}; fechas/duración no interpretables: {unknown[:12]}."


class _VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def readable_text(response):
    body = response.get("body", b"")
    if body.startswith(b"%PDF"):
        try:
            import fitz
            with fitz.open(stream=body, filetype="pdf") as doc:
                if doc.is_encrypted:
                    return ""
                return " ".join(doc[i].get_text() for i in range(min(len(doc), 30)))
        except Exception:
            return ""
    if "html" in response.get("content_type", ""):
        parser = _VisibleText()
        parser.feed(body.decode("utf-8", errors="replace"))
        return " ".join(parser.parts)
    return ""


def check_links(rows, fetch):
    targets = {}
    if rows:
        headers = [normalize_text(c) for c in rows[0]]
        identifiers = [i for i, h in enumerate(headers) if any(k in h for k in ("resolucion", "nombre", "objeto", "descripcion", "denominacion", "convenio")) and "enlace" not in h]
        for row in rows[1:]:
            anchors = [normalize_text(row[i]) for i in identifiers if i < len(row) and len(normalize_text(row[i])) >= 8 and not row[i].startswith("http")]
            for cell in row:
                for url in re.findall(r'https?://[^\s<>"\|]+', cell):
                    targets.setdefault(url.rstrip(";,"), []).append(anchors)
    if not targets:
        return "NO", "No hay enlaces verificables ni una excepción documentada en el conjunto de datos y diccionario."
    failures, unknown, passed = [], [], 0
    for url, anchor_sets in list(targets.items())[:20]:
        response = fetch(url)
        if response.get("status") in (400, 401, 404, 410):
            failures.append(f"{url}: HTTP {response['status']}")
            continue
        if response.get("status") == 403:
            unknown.append(f"{url}: HTTP 403; no se puede distinguir restricción pública de protección antibot/autenticación")
            continue
        if response.get("status") != 200 or response.get("error"):
            unknown.append(f"{url}: {response.get('error') or 'HTTP ' + str(response.get('status'))}")
            continue
        text = normalize_text(readable_text(response))
        if text and anchor_sets and all(anchors and any(anchor in text for anchor in anchors) for anchors in anchor_sets):
            passed += 1
        elif text and not any(anchor_sets):
            unknown.append(f"{url}: acceso y legibilidad confirmados; no hay identificadores suficientes para decidir correspondencia")
        else:
            failures.append(f"{url}: acceso HTTP 200, pero no se acreditó texto legible y correspondiente a los identificadores reportados")
    if len(targets) > 20:
        unknown.append(f"{len(targets) - 20} enlaces exceden el límite de esta ejecución")
    note = f"{passed}/{len(targets)} enlaces con acceso, texto legible y coincidencia de identificadores. " + "; ".join((failures + unknown)[:8])
    return ("NO" if failures else None if unknown else "SI"), note


def publication_record(evidence, fetch):
    url = getattr(getattr(evidence, "university", None), "transparency_url", "") or ""
    match = re.search(r"/entidades/(\d+)", url)
    if not match or not getattr(evidence, "period", None):
        return None, "No se pudo identificar la entidad/período en la API del PNT."
    api = _pnt_public_api_url(evidence.month, evidence.period.year, match[1])
    response = fetch(api)
    if response.get("status") != 200:
        return None, "API del PNT no accesible: " + str(response.get("error") or response.get("status"))
    try:
        items = json.loads(response["body"])
        wanted = evidence.indicator.code.removeprefix("LOTAIP-")
        item = next(i for i in items if _numeral_value(i.get("numeral", {}).get("name", "")) == wanted
                    and str(i.get("month")) == str(evidence.month)
                    and str(i.get("year")) == str(evidence.period.year) and i.get("published") is True)
    except (ValueError, TypeError, KeyError, AttributeError, StopIteration):
        return None, "La respuesta pública no contiene un registro identificable para el numeral."
    # Nunca sustituir publicación por creación, actualización o fecha de descarga.
    for key in ("published_at", "publication_date", "fecha_publicacion"):
        published = parse_date(item.get(key))
        if published:
            return published, f"API PNT, campo {key}: {item[key]}. Fuente: {api}"
    return None, "El registro de la API pública no expone una fecha explícita de publicación. No se usa created_at, updated_at ni Last-Modified como sustituto."


def check_publication(evidence, siblings, fetch):
    """Prueba publicación mediante el registro oficial de la API y su inventario de archivos."""
    url = getattr(getattr(evidence, "university", None), "transparency_url", "") or ""
    match = re.search(r"/entidades/(\d+)", url)
    if not match or not getattr(evidence, "period", None):
        return None, "No se pudo identificar la entidad o el período en el PNT."
    api = _pnt_public_api_url(evidence.month, evidence.period.year, match[1])
    response = fetch(api)
    if response.get("status") != 200:
        return None, "API PNT no accesible: " + str(response.get("error") or response.get("status"))
    try:
        items = json.loads(response["body"])
        wanted = evidence.indicator.code.removeprefix("LOTAIP-")
        item = next((i for i in items if _numeral_value(i.get("numeral", {}).get("name", "")) == wanted
                    and str(i.get("month")) == str(evidence.month)
                    and str(i.get("year")) == str(evidence.period.year)), None)
        if item is None or item.get("published") is not True:
            return False, "La API PNT no registra el numeral como publicado para este período."
        api_urls = {urljoin("https://transparencia.dpe.gob.ec", f.get("url_download", "")) for f in item.get("files", [])}
        local_urls = {s.source_url for s in siblings if getattr(s, "source_url", None)}
        local_files = all(getattr(s, "file_path", None) and (Path(settings.MEDIA_ROOT) / s.file_path).is_file() for s in siblings)
        if not local_files or not local_urls or not local_urls.issubset(api_urls):
            return None, f"Inventario PNT/local no coincide: {len(item.get('files', []))} archivos publicados, {len(local_urls)} URLs locales registradas."
        return True, f"API PNT: numeral publicado, fecha {item.get('published_at', 'no disponible')}; {len(item['files'])} archivos inventariados; las URLs locales constan en el registro oficial."
    except (ValueError, TypeError, KeyError, AttributeError, StopIteration):
        return None, "La API pública no devolvió un registro identificable del numeral."


def _numeral_value(name):
    match = re.search(r"numeral\s+([\d.-]+)", str(name), re.I)
    return match.group(1).replace("-", ".").strip(".") if match else ""


def _pnt_public_api_url(month, year, establishment_id):
    # Django REST Framework entrega su interfaz HTML cuando el cliente acepta
    # HTML. El parámetro format evita intentar interpretar esa página como JSON.
    return ("https://transparencia.dpe.gob.ec/backend/v1/transparency/"
            "transparency/active/public"
            f"?month={month}&year={year}&establishment_id={establishment_id}&format=json")


def check_deadline(evidence, fetch):
    published, note = publication_record(evidence, fetch)
    if not published:
        return None, note
    year, month = evidence.period.year, evidence.month
    first_next = date(year + (month == 12), month % 12 + 1, 1)
    if published < first_next:
        return 1, note + " Registro anterior al cierre del período: dentro del plazo."
    deadline = first_next.replace(day=15)
    holidays = _ecuador_non_working_days(first_next.year)
    configured = getattr(settings, "LOTAIP_NON_WORKING_DAYS", {}).get(str(first_next.year), [])
    holidays.update(date.fromisoformat(day) for day in configured)
    while deadline.weekday() >= 5 or deadline in holidays:
        deadline += timedelta(days=1)
    return int(published <= deadline), note + f" Límite con calendario laborable: {deadline}."


def _easter_sunday(year):
    """Algoritmo gregoriano de Meeus/Jones/Butcher."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return date(year, month, day)


def _ecuador_non_working_days(year):
    easter = _easter_sunday(year)
    # Feriados nacionales móviles relevantes para el cómputo del siguiente día laborable.
    days = {easter - timedelta(days=48), easter - timedelta(days=47), easter - timedelta(days=2)}
    fixed = [date(year, 1, 1), date(year, 5, 1), date(year, 5, 24), date(year, 8, 10),
             date(year, 10, 9), date(year, 11, 2), date(year, 11, 3), date(year, 12, 25)]
    for holiday in fixed:
        # Traslado nacional conforme al día de la semana: martes -> lunes;
        # miércoles/jueves -> viernes; sábado -> viernes; domingo -> lunes.
        delta = {1: -1, 2: 2, 3: 1, 5: -1, 6: 1}.get(holiday.weekday(), 0)
        days.add(holiday + timedelta(days=delta))
    return days


def check_sources(siblings, fetch):
    results = []
    notes = []
    for sibling in siblings:
        url = getattr(sibling, "source_url", None)
        path = getattr(sibling, "file_path", None)
        if not url or not path:
            results.append(None)
            notes.append("Falta URL de origen o archivo local.")
            continue
        local = Path(settings.MEDIA_ROOT) / path
        response = fetch(url)
        if response.get("status") != 200 or response.get("error") or not local.is_file():
            results.append(None)
            notes.append(f"{url}: {response.get('error') or 'HTTP ' + str(response.get('status'))}; archivo local presente={local.is_file()}.")
        else:
            matches = hashlib.sha256(local.read_bytes()).digest() == hashlib.sha256(response["body"]).digest()
            results.append(matches)
            if not matches:
                notes.append(f"{url}: el contenido publicado difiere del archivo local.")
    return bool(results) and all(value is True for value in results), " ".join(notes)
