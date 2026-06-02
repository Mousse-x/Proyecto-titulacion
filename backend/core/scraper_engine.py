"""
Motor de scraping real para el Portal Nacional de Transparencia (DPE).

Usa la API pública del portal para obtener la lista de archivos publicados
por numeral y los descarga directamente vía HTTP.

API descubierta:
  GET /backend/v1/transparency/transparency/active/public
      ?month=<mes>&year=<año>&establishment_id=<id_entidad>

Cada item devuelve:
  - numeral.name  →  "Numeral 1.1", "Numeral 10", etc.
  - files[]       →  [{name, description, url_download}, ...]
"""
import json
import re
import os
from pathlib import Path
from urllib.parse import urlparse, unquote
import urllib.request
import ssl

from django.utils import timezone
from django.conf import settings
from .models import University, EvaluationPeriod, Indicator, Evidence, AuditLog


# ─── Constantes ──────────────────────────────────────────────────────

DPE_BASE_URL = "https://transparencia.dpe.gob.ec"
DPE_API_BASE = f"{DPE_BASE_URL}/backend/v1"

MONTH_NAMES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}

# Mapeo de "Numeral X" de la DPE → código de indicador en nuestra BD
NUMERAL_TO_INDICATOR = {
    "1.1":  "LOTAIP-1.1",
    "1.2":  "LOTAIP-1.2",
    "1.3":  "LOTAIP-1.3",
    "2":    "LOTAIP-2",
    "3":    "LOTAIP-3",
    "4":    "LOTAIP-4",
    "5":    "LOTAIP-5.22",
    "6":    "LOTAIP-6",
    "7":    "LOTAIP-7",
    "8":    "LOTAIP-8",
    "9":    "LOTAIP-9",
    "10":   "LOTAIP-10",
    "11":   "LOTAIP-11",
    "12":   "LOTAIP-12",
    "13":   "LOTAIP-13",
    "14":   "LOTAIP-14",
    "15":   "LOTAIP-15",
    "16":   "LOTAIP-16",
    "17":   "LOTAIP-17",
    "18":   "LOTAIP-18",
    "19":   "LOTAIP-19",
    "20":   "LOTAIP-20",
    "21":   "LOTAIP-21",
    "23":   "LOTAIP-23",
    "24":   "LOTAIP-24",
}

# Regex para extraer el número del numeral: "Numeral 1.1" → "1.1"
NUMERAL_RE = re.compile(r"Numeral\s+([\d.]+)", re.IGNORECASE)


# ─── Helpers ─────────────────────────────────────────────────────────

def _log(user_id, action, table_name=None, description=None):
    try:
        AuditLog.objects.create(
            user_id=user_id, module="evidences", action=action,
            table_name=table_name, description=description,
            created_at=timezone.now(),
        )
    except Exception:
        pass


def _extract_establishment_id(transparency_url):
    """Extrae el ID de entidad de la URL del portal DPE.
    
    Ej: https://transparencia.dpe.gob.ec/entidades/1365 → 1365
    """
    if not transparency_url:
        return None
    match = re.search(r"/entidades/(\d+)", transparency_url)
    return match.group(1) if match else None


def _download_file(url, dest_path):
    """Descarga un archivo desde la DPE y lo guarda en dest_path.
    
    Retorna el tamaño del archivo descargado, o None si falla.
    """
    try:
        # La URL de la API viene como /media/transparencia/...
        # La URL real de descarga es /backend/v1/transparency/media/transparencia/...
        if url.startswith("/media/"):
            full_url = f"{DPE_BASE_URL}/backend/v1/transparency{url}"
        elif url.startswith("/"):
            full_url = f"{DPE_BASE_URL}{url}"
        else:
            full_url = url
        
        # Crear contexto SSL permisivo para evitar errores de certificado
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(full_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        
        resp = urllib.request.urlopen(req, timeout=60, context=ctx)
        data = resp.read()
        
        with open(dest_path, "wb") as f:
            f.write(data)
        
        return len(data)
    except Exception as e:
        return None


def _safe_filename(name):
    """Limpia un nombre de archivo para que sea seguro en disco."""
    return re.sub(r'[<>:"/\\|?*]', '_', name).strip()


# ─── Motor principal ─────────────────────────────────────────────────

def run_dpe_scraper(university_id, year, month, user_id):
    """
    Generador que hace scraping real del portal DPE usando su API pública.
    
    Yield: líneas JSON (NDJSON) con progreso, errores y resultado final.
    
    Parámetros:
      - university_id: ID de la universidad en nuestra BD
      - year: año a scrapear (ej: 2024)
      - month: mes a scrapear (1-12)
      - user_id: ID del usuario que inició el scraping
    """
    os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
    
    month_int = int(month)
    year_int = int(year)
    month_name = MONTH_NAMES.get(month_int, str(month_int))
    
    yield json.dumps({
        "status": "progress",
        "msg": f"Iniciando scraping de {month_name} {year_int}...",
        "pct": 5
    }) + "\n"
    
    # ── Validar universidad ──
    now = timezone.now()
    try:
        university = University.objects.get(id=university_id)
    except University.DoesNotExist:
        yield json.dumps({
            "status": "error",
            "error": f"Universidad ID={university_id} no encontrada"
        }) + "\n"
        return
    
    # ── Extraer establishment_id de la URL de transparencia ──
    establishment_id = _extract_establishment_id(university.transparency_url)
    if not establishment_id:
        yield json.dumps({
            "status": "error",
            "error": f"La universidad '{university.acronym}' no tiene una URL de transparencia "
                     f"válida configurada. Se esperaba algo como: "
                     f"https://transparencia.dpe.gob.ec/entidades/XXXX"
        }) + "\n"
        return
    
    yield json.dumps({
        "status": "progress",
        "msg": f"Consultando API de DPE para {university.acronym} "
               f"(entidad {establishment_id})...",
        "pct": 10
    }) + "\n"
    
    # ── Consultar la API pública ──
    api_url = (
        f"{DPE_API_BASE}/transparency/transparency/active/public"
        f"?month={month_int}&year={year_int}&establishment_id={establishment_id}"
    )
    
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(api_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp = urllib.request.urlopen(req, timeout=30, context=ctx)
        raw = resp.read().decode("utf-8")
        api_data = json.loads(raw)
    except Exception as e:
        yield json.dumps({
            "status": "error",
            "error": f"Error al consultar la API de DPE: {e}"
        }) + "\n"
        return
    
    if not isinstance(api_data, list) or len(api_data) == 0:
        yield json.dumps({
            "status": "error",
            "error": f"No se encontraron datos publicados para {month_name} {year_int} "
                     f"en la entidad {establishment_id} ({university.acronym}). "
                     f"Es posible que la institución no haya publicado para ese período."
        }) + "\n"
        return
    
    yield json.dumps({
        "status": "progress",
        "msg": f"Se encontraron {len(api_data)} numerales publicados. "
               f"Descargando archivos reales...",
        "pct": 20
    }) + "\n"
    
    # ── Obtener o crear período ──
    period = EvaluationPeriod.objects.filter(year=year_int).first()
    if not period:
        period = EvaluationPeriod.objects.create(
            period_name=f"Evaluación {year_int}", year=year_int,
            start_date=f"{year_int}-01-01", end_date=f"{year_int}-12-31",
            status="OPEN", created_at=now
        )
    
    # ── Mapeo de indicadores ──
    all_indicators = list(
        Indicator.objects.filter(is_active=True).order_by("display_order", "code")
    )
    ind_by_code = {i.code: i for i in all_indicators}
    
    stats = {"created": 0, "skipped": 0, "errors": 0}
    items_created = []
    total_items = len(api_data)
    
    # ── Procesar cada numeral ──
    for idx, item in enumerate(api_data):
        numeral_info = item.get("numeral", {})
        numeral_name = numeral_info.get("name", "")       # "Numeral 1.1"
        numeral_desc = numeral_info.get("description", "") # "Estructura orgánica"
        files = item.get("files", [])
        
        # Extraer el número: "Numeral 1.1" → "1.1"
        num_match = NUMERAL_RE.match(numeral_name)
        numeral_number = num_match.group(1) if num_match else numeral_name
        
        # Buscar el indicador correspondiente en nuestra BD
        indicator_code = NUMERAL_TO_INDICATOR.get(numeral_number)
        indicator = ind_by_code.get(indicator_code) if indicator_code else None
        
        pct = int(20 + ((idx / total_items) * 75))
        yield json.dumps({
            "status": "progress",
            "msg": f"Descargando Numeral {numeral_number}: {numeral_desc} "
                   f"({len(files)} archivos)...",
            "pct": pct
        }) + "\n"
        
        if not indicator:
            stats["skipped"] += 1
            continue
        
        if not files:
            stats["skipped"] += 1
            continue
        
        # Crear directorio: evidences/<university_id>/<year>/<month>/<indicator_code>/
        rel_dir = (
            f"evidences/{university.id}/{year_int}/{month_int:02d}/{indicator.code}"
        )
        abs_dir = Path(settings.MEDIA_ROOT) / rel_dir
        abs_dir.mkdir(parents=True, exist_ok=True)
        
        # ── Descargar cada archivo del numeral ──
        for file_info in files:
            file_name = file_info.get("name", "archivo")
            file_desc = file_info.get("description", file_name)  # "Conjunto de datos", "Metadatos", "Diccionario"
            url_download = file_info.get("url_download", "")
            
            if not url_download:
                stats["errors"] += 1
                continue
            
            # Determinar extensión y tipo
            ext = Path(file_name).suffix.lower() or ".csv"
            ext_map = {
                ".pdf": "PDF", ".xlsx": "XLSX", ".xls": "XLSX",
                ".docx": "DOCX", ".doc": "DOCX", ".csv": "CSV",
            }
            file_type = ext_map.get(ext, "CSV")
            
            # Nombre seguro para disco
            safe_desc = _safe_filename(file_desc)
            safe_name = f"{safe_desc}_Numeral_{numeral_number}{ext}"
            dest_path = abs_dir / safe_name
            
            # ── DESCARGAR EL ARCHIVO REAL ──
            file_size = _download_file(url_download, dest_path)
            
            if file_size is None:
                stats["errors"] += 1
                continue
            
            file_path_rel = f"{rel_dir}/{safe_name}"
            
            # Crear registro de evidencia en la BD
            ev = Evidence.objects.create(
                university=university,
                period=period,
                indicator=indicator,
                title=f"[{month_name}] {file_desc} - Numeral {numeral_number} ({numeral_desc})",
                uploaded_at=now,
                updated_at=now,
                validation_status="pendiente",
                file_type=file_type,
                file_path=file_path_rel,
                file_size=file_size,
                source_url=f"{DPE_BASE_URL}{url_download}",
                month=month_int,
            )
            stats["created"] += 1
            items_created.append({
                "id": ev.id,
                "title": ev.title,
                "numeral": numeral_number,
                "file": file_desc,
                "size": file_size,
            })
    
    # ── Log y resultado final ──
    _log(
        user_id, "SCRAPE_DPE", "evidence.evidences",
        f"DPE scraping real: {stats['created']} archivos descargados para "
        f"{university.acronym} ({month_name} {year_int})"
    )
    
    yield json.dumps({
        "status": "done",
        "stats": stats,
        "items": items_created[:50],
        "message": (
            f"Scraping completado. {stats['created']} archivos reales descargados, "
            f"{stats['skipped']} omitidos, {stats['errors']} errores."
        ),
        "university_id": university.id,
        "period": period.period_name,
    }) + "\n"
