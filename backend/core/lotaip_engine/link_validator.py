"""Fachada estable del verificador SSRF; produce evidencia auditable por URL."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from core.services.lotaip_automatic import fetch_public, readable_text

URL_RE = re.compile(r"https?://[^\s\"'<>;,]+", re.I)

def validate_links(rows, fetch=fetch_public, identifiers=()):
    urls = []
    for row_index, row in enumerate(rows, 1):
        for value in row:
            for url in URL_RE.findall(str(value)):
                response = fetch(url)
                text = readable_text(response)
                status = response.get("status")
                error = response.get("error")
                reachable = status is not None and 200 <= status < 400
                public = reachable and status not in {401, 403}
                readable = bool(text.strip())
                tokens = [str(x).strip().lower() for x in identifiers if len(str(x).strip()) >= 4]
                matches = any(token in text.lower() for token in tokens) if tokens else None
                state = "SI" if public and readable and matches is not False else "NO"
                if public and readable and matches is None:
                    state = "REQUIERE_REVISION"
                urls.append({"row": row_index, "original_url": url, "final_url": response.get("final_url", url),
                             "status_code": status, "reachable": reachable, "public_access": public,
                             "content_type": response.get("content_type"), "readable": readable,
                             "matches_expected_record": matches, "result": state, "error": error})
    return urls

def validate_links_batch(rows, fetch=fetch_public, workers=4):
    """Comprueba todas las URL con concurrencia limitada y evidencia individual."""
    targets = {}
    if rows:
        headers = [str(value) for value in rows[0]]
        id_columns = [i for i, value in enumerate(headers) if any(token in value.lower()
                      for token in ("codigo", "código", "resolucion", "resolución", "contrato", "nombre", "objeto", "periodo", "período"))]
        for row_number, row in enumerate(rows[1:], 2):
            identifiers = [row[i] for i in id_columns if i < len(row) and str(row[i]).strip()]
            for value in row:
                for url in URL_RE.findall(str(value)):
                    targets.setdefault(url.rstrip(","), {"rows": [], "identifiers": []})
                    targets[url.rstrip(",")]["rows"].append(row_number)
                    targets[url.rstrip(",")]["identifiers"].extend(identifiers)
    results = []
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 4))) as pool:
        pending = {pool.submit(fetch, url): (url, data) for url, data in targets.items()}
        for future in as_completed(pending):
            url, data = pending[future]
            try: response = future.result()
            except Exception as exc: response = {"status": None, "error": str(exc), "body": b""}
            status = response.get("status")
            text = readable_text(response).lower()
            tokens = [str(v).strip().lower() for v in data["identifiers"] if len(str(v).strip()) >= 4]
            matches = any(token in text for token in tokens) if tokens and text else None
            if status == 200 and text and matches: state, result = "ACCESIBLE", "SI"
            elif status == 403: state, result = "REQUIERE_REVISION", "REQUIERE_REVISION"
            elif status in {400, 401, 404, 410}: state, result = "NO_ACCESIBLE", "NO"
            elif status == 200: state, result = "REQUIERE_REVISION", "REQUIERE_REVISION"
            else: state, result = "ERROR_TECNICO", "TECHNICAL_ERROR"
            results.append({"url": url, "final_url": response.get("url", url), "rows": data["rows"],
                            "status_code": status, "content_type": response.get("content_type", ""),
                            "error": response.get("error"), "matches_expected_record": matches,
                            "state": state, "result": result})
    return sorted(results, key=lambda item: item["url"])
