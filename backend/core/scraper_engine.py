import json
import re
import os
import zipfile
from pathlib import Path
from urllib.parse import urlparse, unquote
from django.utils import timezone
from django.conf import settings
from .models import University, EvaluationPeriod, Indicator, Evidence, AuditLog

MONTH_NAME_TO_NUMBER = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5,
    "JUNIO": 6, "JULIO": 7, "AGOSTO": 8, "SEPTIEMBRE": 9,
    "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
}

LOTAIP_LETTER_MAP = {
    "a": "LOTAIP-A", "b": "LOTAIP-B", "c": "LOTAIP-C", "d": "LOTAIP-D",
    "e": "LOTAIP-E", "f": "LOTAIP-F", "g": "LOTAIP-G", "h": "LOTAIP-H",
    "i": "LOTAIP-I", "j": "LOTAIP-J", "k": "LOTAIP-K", "l": "LOTAIP-L",
    "m": "LOTAIP-M", "n": "LOTAIP-N", "o": "LOTAIP-O", "p": "LOTAIP-P",
    "q": "LOTAIP-Q", "r": "LOTAIP-R", "s": "LOTAIP-S", "t": "LOTAIP-T",
    "u": "LOTAIP-U", "v": "LOTAIP-V", "w": "LOTAIP-W", "x": "LOTAIP-X",
    "y": "LOTAIP-Y",
}

LITERAL_RE = re.compile(r"^Literal\s+([a-wA-W])\s*[\d\.]*\)?\s*(.+)$", re.IGNORECASE)
MONTH_RE = re.compile(r"^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)$", re.IGNORECASE)

def _log(user_id, action, table_name=None, description=None):
    try:
        AuditLog.objects.create(
            user_id=user_id, module="evidences", action=action,
            table_name=table_name, description=description, created_at=timezone.now(),
        )
    except Exception:
        pass

def run_espoch_scraper(portal_url, period_id, user_id):
    import os
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    yield json.dumps({"status": "progress", "msg": "Iniciando scraping...", "pct": 0}) + "\n"
    
    try:
        import requests as _req
        from bs4 import BeautifulSoup
        from playwright.sync_api import sync_playwright
    except ImportError:
        yield json.dumps({"status": "error", "error": "Dependencias no instaladas. pip install requests beautifulsoup4 playwright"}) + "\n"
        return

    now = timezone.now()
    try:
        espoch = University.objects.get(acronym="ESPOCH")
    except University.DoesNotExist:
        espoch = University.objects.create(
            name="Escuela Superior Politécnica de Chimborazo", acronym="ESPOCH",
            province="Chimborazo", city="Riobamba", website_url="https://www.espoch.edu.ec",
            transparency_url=portal_url, institution_type="Pública", is_active=True,
            created_at=now, updated_at=now,
        )

    try:
        period = EvaluationPeriod.objects.get(id=period_id)
    except EvaluationPeriod.DoesNotExist:
        yield json.dumps({"status": "error", "error": f"Período ID={period_id} no encontrado"}) + "\n"
        return

    all_indicators = list(Indicator.objects.filter(is_active=True).order_by("display_order", "code"))
    ind_by_code = {i.code: i for i in all_indicators}
    fallback_ind = all_indicators[0] if all_indicators else None
    if not fallback_ind:
        yield json.dumps({"status": "error", "error": "No hay indicadores en BD"}) + "\n"
        return

    try:
        response = _req.get(portal_url, timeout=25, headers={"User-Agent": "Mozilla/5.0 SisTransp-Scraper/1.0"})
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        soup = BeautifulSoup(response.content, "html.parser")
    except Exception as exc:
        yield json.dumps({"status": "error", "error": f"Error al acceder al portal: {str(exc)}"}) + "\n"
        return

    seen_urls = set(Evidence.objects.filter(university=espoch, source_url__isnull=False).values_list("source_url", flat=True))
    month_number_to_name = {v: k.capitalize() for k, v in MONTH_NAME_TO_NUMBER.items()}
    
    links_to_process = []
    current_month = None

    for link in soup.find_all("a"):
        text = link.get_text(strip=True)
        href = (link.get("href") or "").strip()

        m = MONTH_RE.match(text.strip())
        if m:
            current_month = MONTH_NAME_TO_NUMBER.get(text.strip().upper())
            continue

        lit = LITERAL_RE.match(text)
        if not lit: continue

        letter = lit.group(1).lower()
        description = lit.group(2).strip()

        if not href or href in (portal_url, "#") or href.endswith("/2026-2/"): continue
        if href in seen_urls: continue

        ind_code = LOTAIP_LETTER_MAP.get(letter)
        indicator = ind_by_code.get(ind_code, fallback_ind)

        month_label = month_number_to_name.get(current_month, "")
        title = f"[{month_label}] Literal {letter.upper()} — {description}" if month_label else f"Literal {letter.upper()} — {description}"
        title = title[:200]

        links_to_process.append({
            "href": href, "title": title, "letter": letter, 
            "current_month": current_month, "indicator": indicator
        })

    stats = {"created": 0, "skipped": 0, "errors": 0}
    items_created = []
    total_links = len(links_to_process)

    if total_links == 0:
        yield json.dumps({"status": "done", "stats": stats, "items": [], "message": "Scraping completado. 0 nuevas evidencias.", "university_id": espoch.id, "period": period.period_name}) + "\n"
        return

    yield json.dumps({"status": "progress", "msg": f"Se encontraron {total_links} nuevos enlaces. Iniciando descarga...", "pct": 5}) + "\n"

    ext_map = {
        ".pdf": "PDF", ".xlsx": "XLSX", ".xls": "XLSX",
        ".docx": "DOCX", ".doc": "DOCX", ".csv": "CSV",
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        
        for idx, item in enumerate(links_to_process):
            pct = int(((idx + 1) / total_links) * 90) + 5
            yield json.dumps({"status": "progress", "msg": f"Descargando {idx+1}/{total_links}: {item['title']}", "pct": pct}) + "\n"
            
            href = item["href"]
            indicator = item["indicator"]
            current_month = item["current_month"]
            title = item["title"]
            letter = item["letter"]
            month_str = f"{current_month:02d}" if current_month else "00"
            rel_dir = f"evidences/{espoch.id}/{period.year}/{month_str}/{indicator.code}"
            abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
            abs_dir.mkdir(parents=True, exist_ok=True)
            
            if "sharepoint.com" in href or "1drv.ms" in href:
                # Descargar carpeta ZIP desde OneDrive
                try:
                    page = context.new_page()
                    page.goto(href)
                    page.wait_for_timeout(3000)
                    with page.expect_download(timeout=30000) as download_info:
                        page.locator("button:has-text('Descargar'), button[data-automationid='DownloadCommand']").first.click()
                    
                    download = download_info.value
                    zip_path = abs_dir / download.suggested_filename
                    download.save_as(str(zip_path))
                    page.close()
                    
                    # Extraer ZIP
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        for file_info in zip_ref.infolist():
                            # Omitir carpetas o archivos ocultos de mac
                            if file_info.is_dir() or file_info.filename.startswith('__MACOSX'): continue
                            
                            zip_ref.extract(file_info, abs_dir)
                            extracted_path = abs_dir / file_info.filename
                            
                            orig_name = Path(file_info.filename).name
                            ext = Path(orig_name).suffix.lower()
                            file_type = ext_map.get(ext, "PDF")
                            
                            safe_name = re.sub(r"[^a-zA-Z0-9._\-]", "_", orig_name)
                            final_path = abs_dir / safe_name
                            
                            # Renombrar para quitar rutas y caracteres invalidos
                            if extracted_path != final_path:
                                if final_path.exists(): final_path.unlink()
                                extracted_path.rename(final_path)
                            
                            file_size = final_path.stat().st_size
                            file_path_rel = f"{rel_dir}/{safe_name}"
                            
                            ev = Evidence.objects.create(
                                university=espoch, period=period, indicator=indicator,
                                title=f"{title} - {orig_name}", uploaded_at=now, updated_at=now,
                                validation_status="pendiente", file_type=file_type,
                                file_path=file_path_rel, file_size=file_size,
                                source_url=href, month=current_month,
                            )
                            stats["created"] += 1
                            items_created.append({"id": ev.id, "title": ev.title[:80], "letter": letter})
                            
                    # Borrar el ZIP
                    zip_path.unlink()
                    seen_urls.add(href)
                    
                except Exception as e:
                    print(f"Error OneDrive: {e}")
                    # Guardar como URL si falla
                    Evidence.objects.create(
                        university=espoch, period=period, indicator=indicator,
                        title=title, uploaded_at=now, updated_at=now,
                        validation_status="pendiente", file_type="URL", source_url=href, month=current_month
                    )
                    stats["created"] += 1
                    seen_urls.add(href)
            else:
                # Descarga web normal
                try:
                    doc_resp = _req.get(href, stream=True, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
                    if doc_resp.status_code == 200:
                        cd = doc_resp.headers.get('content-disposition')
                        orig_name = None
                        if cd:
                            fname = re.findall("filename=(.+)", cd)
                            if len(fname) > 0: orig_name = fname[0].strip('"\'')
                        if not orig_name:
                            orig_name = unquote(os.path.basename(urlparse(href).path))
                            if not orig_name: orig_name = f"documento_literal_{letter.lower()}.pdf"
                        
                        ext = Path(orig_name).suffix.lower()
                        file_type = ext_map.get(ext, "PDF")
                        safe_name = re.sub(r"[^a-zA-Z0-9._\-]", "_", orig_name)
                        abs_path = abs_dir / safe_name
                        
                        with open(abs_path, "wb") as fout:
                            for chunk in doc_resp.iter_content(chunk_size=8192):
                                if chunk: fout.write(chunk)
                                
                        file_size = abs_path.stat().st_size
                        file_path_rel = f"{rel_dir}/{safe_name}"
                        
                        ev = Evidence.objects.create(
                            university=espoch, period=period, indicator=indicator,
                            title=title, uploaded_at=now, updated_at=now,
                            validation_status="pendiente", file_type=file_type,
                            file_path=file_path_rel, file_size=file_size,
                            source_url=href, month=current_month,
                        )
                        stats["created"] += 1
                        seen_urls.add(href)
                        items_created.append({"id": ev.id, "title": ev.title[:80], "letter": letter})
                except Exception as e:
                    # Fallback URL
                    Evidence.objects.create(
                        university=espoch, period=period, indicator=indicator,
                        title=title, uploaded_at=now, updated_at=now,
                        validation_status="pendiente", file_type="URL", source_url=href, month=current_month
                    )
                    stats["created"] += 1
                    seen_urls.add(href)

        browser.close()

    _log(user_id, "SCRAPE_ESPOCH", "evidence.evidences", f"ESPOCH portal scraping: {stats['created']} creados")
    
    yield json.dumps({
        "status": "done", "stats": stats, "items": items_created[:30],
        "message": f"Scraping completado. {stats['created']} evidencias extraídas.",
        "university_id": espoch.id, "period": period.period_name
    }) + "\n"
