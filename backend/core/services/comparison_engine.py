"""
comparison_engine.py
Motor de comparación de documentos de evidencia contra plantillas base LOTAIP.

Cada función evaluadora retorna una tupla (score, [observaciones]).
El puntaje total es sobre 100 puntos:
  - Existencia:     20 pts
  - Formato:        10 pts
  - Actualización:  20 pts
  - Estructura:     20 pts
  - Contenido:      20 pts
  - Accesibilidad:  10 pts
"""

import re
import unicodedata
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Formatos de archivo permitidos
ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".csv", ".docx"}

# Mapa de meses en español
MONTH_NAMES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
}
MONTH_NAME_TO_NUM = {v: k for k, v in MONTH_NAMES.items()}


# ──────────────────────────────────────────────────────────────────────
# UTILIDADES DE NORMALIZACIÓN
# ──────────────────────────────────────────────────────────────────────

def normalize_text(text):
    """
    Normaliza texto para comparación:
    - Minúsculas
    - Quitar tildes/acentos
    - Quitar caracteres especiales
    - Eliminar espacios dobles
    """
    if not text:
        return ""
    text = str(text).lower().strip()
    # Quitar tildes
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    # Quitar caracteres especiales (dejar letras, números, espacios)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    # Eliminar espacios múltiples
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ──────────────────────────────────────────────────────────────────────
# EVALUADOR: EXISTENCIA (20 pts)
# ──────────────────────────────────────────────────────────────────────

def evaluate_existence(processed_data):
    """
    Evalúa si el documento existe y es accesible.
    - 20 pts: archivo existe
    - 0 pts: no existe → estado NO_PRESENTADO
    """
    obs = []

    if processed_data.get("file_exists"):
        obs.append("✅ El documento existe y fue localizado correctamente.")
        return 20, obs
    else:
        obs.append("❌ El documento no fue encontrado o no tiene archivo asociado.")
        return 0, obs


# ──────────────────────────────────────────────────────────────────────
# EVALUADOR: FORMATO (10 pts)
# ──────────────────────────────────────────────────────────────────────

def evaluate_format(processed_data):
    """
    Evalúa si el formato del archivo es válido.
    Formatos permitidos: PDF, XLSX, XLS, CSV, DOCX
    """
    obs = []
    ext = processed_data.get("extension", "")

    if ext in ALLOWED_EXTENSIONS:
        obs.append(f"✅ El formato del archivo ({ext.upper().strip('.')}) es válido.")
        return 10, obs
    else:
        obs.append(f"⚠️ El formato del archivo ({ext or 'desconocido'}) no es un formato permitido. Se esperan: PDF, XLSX, XLS, CSV, DOCX.")
        return 0, obs


# ──────────────────────────────────────────────────────────────────────
# EVALUADOR: PERÍODO / ACTUALIZACIÓN (20 pts)
# ──────────────────────────────────────────────────────────────────────

def evaluate_period(evidence, processed_data, expected_month=None, expected_year=None):
    """
    Evalúa si el documento corresponde al período esperado (mes y año).
    Busca el período en:
    1. Nombre del archivo
    2. Texto extraído
    3. Metadatos del modelo (evidence.month)
    """
    obs = []
    score = 0

    # Determinar mes y año esperados
    if expected_month is None and evidence.month:
        expected_month = evidence.month
    if expected_year is None and evidence.period:
        expected_year = evidence.period.year

    if not expected_month or not expected_year:
        obs.append("⚠️ No se pudo determinar el período esperado para evaluar.")
        return 0, obs

    month_name = MONTH_NAMES.get(expected_month, "")

    # Fuentes donde buscar el período
    file_name = processed_data.get("metadata", {}).get("file_name", "")
    extracted_text = (processed_data.get("extracted_text") or "")[:5000]  # Solo primeros 5K

    search_text = normalize_text(f"{file_name} {extracted_text}")

    # Buscar mes
    month_found = False
    year_found = False

    # Verificar mes en el texto
    month_normalized = normalize_text(month_name)
    if month_normalized and month_normalized in search_text:
        month_found = True

    # Verificar año en el texto
    year_str = str(expected_year)
    if year_str in search_text:
        year_found = True

    # También verificar el campo month del modelo
    if evidence.month == expected_month:
        month_found = True

    # Calcular score
    if month_found and year_found:
        score = 20
        obs.append(f"✅ El período coincide correctamente: {month_name} {expected_year}.")
    elif month_found or year_found:
        score = 10
        found_parts = []
        missing_parts = []
        if month_found:
            found_parts.append(f"mes ({month_name})")
        else:
            missing_parts.append(f"mes ({month_name})")
        if year_found:
            found_parts.append(f"año ({expected_year})")
        else:
            missing_parts.append(f"año ({expected_year})")
        obs.append(f"⚠️ Coincidencia parcial del período. Encontrado: {', '.join(found_parts)}. No encontrado: {', '.join(missing_parts)}.")
    else:
        score = 0
        obs.append(f"❌ No se detectó el período esperado ({month_name} {expected_year}) en el nombre del archivo ni en su contenido.")

    return score, obs


# ──────────────────────────────────────────────────────────────────────
# EVALUADOR: ESTRUCTURA (20 pts)
# ──────────────────────────────────────────────────────────────────────

def evaluate_structure(processed_data, template):
    """
    Compara las columnas/secciones del documento con las esperadas en la plantilla base.
    Usa fuzzy matching para detectar columnas similares.
    """
    obs = []

    if not template:
        obs.append("⚠️ No se encontró plantilla base para este indicador. La evaluación de estructura se omite.")
        return 10, obs  # Puntaje parcial por defecto sin plantilla

    expected_columns = template.expected_columns or []

    if not expected_columns:
        obs.append("⚠️ La plantilla base no tiene columnas esperadas configuradas. Se omite la evaluación de estructura.")
        return 10, obs

    doc_columns = processed_data.get("columns", [])

    if not doc_columns:
        obs.append("❌ No se pudieron extraer columnas o secciones del documento.")
        return 0, obs

    # Normalizar todas las columnas
    normalized_expected = [(c, normalize_text(c)) for c in expected_columns]
    normalized_doc = [(c, normalize_text(c)) for c in doc_columns]

    # Fuzzy matching
    try:
        from rapidfuzz import fuzz
    except ImportError:
        logger.warning("rapidfuzz no disponible, usando comparación exacta")
        fuzz = None

    matched = []
    missing = []
    threshold = 70  # Umbral de similitud mínima

    for expected_orig, expected_norm in normalized_expected:
        if not expected_norm:
            continue

        best_score = 0
        best_match = None

        for doc_orig, doc_norm in normalized_doc:
            if not doc_norm:
                continue

            if fuzz:
                score = fuzz.ratio(expected_norm, doc_norm)
            else:
                score = 100 if expected_norm == doc_norm else 0

            if score > best_score:
                best_score = score
                best_match = doc_orig

        if best_score >= threshold:
            matched.append((expected_orig, best_match, best_score))
        else:
            missing.append(expected_orig)

    # Calcular puntaje proporcional
    total_expected = len([c for _, c in normalized_expected if c])
    if total_expected == 0:
        return 10, obs

    match_ratio = len(matched) / total_expected
    score = round(20 * match_ratio, 2)

    if match_ratio >= 0.9:
        obs.append(f"✅ La estructura del documento coincide con la plantilla base ({len(matched)}/{total_expected} columnas encontradas).")
    elif match_ratio >= 0.5:
        obs.append(f"⚠️ La estructura coincide parcialmente ({len(matched)}/{total_expected} columnas: {int(match_ratio*100)}%).")
    else:
        obs.append(f"❌ La estructura del documento difiere significativamente de la plantilla ({len(matched)}/{total_expected} columnas: {int(match_ratio*100)}%).")

    if missing:
        missing_display = missing[:10]  # Mostrar máximo 10
        obs.append(f"📋 Columnas faltantes: {', '.join(missing_display)}.")
        if len(missing) > 10:
            obs.append(f"   ... y {len(missing) - 10} columnas más.")

    return score, obs


# ──────────────────────────────────────────────────────────────────────
# EVALUADOR: CONTENIDO MÍNIMO (20 pts)
# ──────────────────────────────────────────────────────────────────────

def evaluate_content(processed_data, template):
    """
    Evalúa el contenido mínimo obligatorio del documento:
    - Verificar palabras clave obligatorias
    - Verificar que no esté vacío
    - Verificar que tenga filas/datos útiles
    - Detectar si tiene solo encabezado sin datos
    """
    obs = []
    score = 0
    sub_scores = []

    extracted_text = processed_data.get("extracted_text", "")
    row_count = processed_data.get("row_count", 0)
    columns = processed_data.get("columns", [])

    # 1. Verificar que no esté vacío (6 pts)
    if extracted_text and len(extracted_text.strip()) > 50:
        sub_scores.append(6)
        obs.append("✅ El documento contiene texto extraíble.")
    elif extracted_text and len(extracted_text.strip()) > 0:
        sub_scores.append(3)
        obs.append("⚠️ El documento tiene muy poco contenido de texto.")
    else:
        sub_scores.append(0)
        obs.append("❌ El documento no tiene texto extraíble o está vacío.")

    # 2. Verificar datos/filas (7 pts)
    if row_count > 5:
        sub_scores.append(7)
        obs.append(f"✅ El documento contiene {row_count} filas de datos.")
    elif row_count > 0:
        sub_scores.append(4)
        obs.append(f"⚠️ El documento contiene solo {row_count} filas (posiblemente incompleto).")
    elif columns:
        # Tiene columnas pero pocas filas — posiblemente solo encabezado
        sub_scores.append(2)
        obs.append("⚠️ El documento parece tener solo encabezados sin datos.")
    else:
        sub_scores.append(0)

    # 3. Verificar palabras clave (7 pts)
    if template and template.keywords:
        keywords = template.keywords
        search_text = normalize_text(extracted_text)

        found_keywords = []
        missing_keywords = []

        for kw in keywords:
            kw_norm = normalize_text(kw)
            if kw_norm and kw_norm in search_text:
                found_keywords.append(kw)
            else:
                missing_keywords.append(kw)

        if len(keywords) > 0:
            kw_ratio = len(found_keywords) / len(keywords)
            kw_score = round(7 * kw_ratio)
            sub_scores.append(kw_score)

            if kw_ratio >= 0.8:
                obs.append(f"✅ Se encontraron {len(found_keywords)}/{len(keywords)} palabras clave obligatorias.")
            elif kw_ratio >= 0.4:
                obs.append(f"⚠️ Se encontraron parcialmente las palabras clave ({len(found_keywords)}/{len(keywords)}).")
            else:
                obs.append(f"❌ Faltan palabras clave importantes ({len(missing_keywords)}/{len(keywords)}).")

            if missing_keywords:
                missing_display = missing_keywords[:5]
                obs.append(f"📋 Palabras clave faltantes: {', '.join(missing_display)}.")
        else:
            sub_scores.append(7)  # Sin keywords definidas = puntaje completo
    else:
        sub_scores.append(7)  # Sin plantilla/keywords = puntaje completo

    score = min(20, sum(sub_scores))
    return score, obs


# ──────────────────────────────────────────────────────────────────────
# EVALUADOR: ACCESIBILIDAD (10 pts)
# ──────────────────────────────────────────────────────────────────────

def evaluate_accessibility(processed_data):
    """
    Evalúa la accesibilidad del archivo:
    - No corrupto (4 pts)
    - Sin contraseña (3 pts)
    - Texto extraíble (3 pts)
    """
    obs = []
    score = 0

    # No corrupto
    if not processed_data.get("is_corrupted"):
        score += 4
        obs.append("✅ El archivo no está corrupto.")
    else:
        obs.append("❌ El archivo parece estar corrupto o dañado.")

    # Sin contraseña
    if not processed_data.get("is_protected"):
        score += 3
        obs.append("✅ El archivo no tiene protección con contraseña.")
    else:
        obs.append("❌ El archivo está protegido con contraseña y no es accesible públicamente.")

    # Texto extraíble
    if processed_data.get("extracted_text", "").strip():
        score += 3
        obs.append("✅ El contenido del archivo es legible y extraíble.")
    else:
        obs.append("⚠️ No se pudo extraer texto del archivo. Puede ser una imagen escaneada.")

    return score, obs
