"""
international_evaluator.py
Segunda capa de evaluacion para estandares internacionales.

LOTAIP valida cumplimiento nacional. Esta capa evalua apertura, calidad
tecnica, gobernanza y ODS 16 sin repetir la mera existencia del literal.
"""

from pathlib import Path

from .comparison_engine import MONTH_NAMES, evaluate_period, normalize_text
from .document_processor import detect_lotaip_document_type
from ..models import Evidence


PROCESSABLE_EXTENSIONS = {".csv", ".xlsx", ".xls", ".ods"}
TEXT_EXTENSIONS = PROCESSABLE_EXTENSIONS | {".pdf", ".docx", ".txt"}


def evaluate_international_standards(evidence, processed_data=None, template=None, lotaip_result=None):
    processed_data = processed_data or _processed_data_from_evidence(evidence)
    lotaip_result = lotaip_result or {}

    ogp = _evaluate_ogp(evidence, processed_data, template)
    ocde = _evaluate_ocde(evidence, processed_data, template, lotaip_result)
    ods = _evaluate_ods(evidence, processed_data)

    total_score = round(ogp["puntaje"] + ocde["puntaje"] + ods["puntaje"], 2)
    max_score = ogp["puntaje_maximo"] + ocde["puntaje_maximo"] + ods["puntaje_maximo"]
    percent = round((total_score / max_score) * 100, 2) if max_score else 0

    national_score = float(lotaip_result.get("puntaje_total", 0) or 0)
    integrated_percent = round(((national_score + total_score) / (100 + max_score)) * 100, 2)

    return {
        "ogp": ogp,
        "ocde": ocde,
        "ods": ods,
        "puntaje_total": total_score,
        "puntaje_maximo": max_score,
        "indice_internacional": percent,
        "indice_nacional": round(national_score, 2),
        "indice_nacional_internacional": integrated_percent,
    }


def summarize_indices(results):
    total = len(results)
    if not total:
        return {
            "indice_nacional": 0,
            "indice_internacional": 0,
            "indice_nacional_internacional": 0,
            "puntaje_internacional_promedio": 0,
            "puntaje_internacional_maximo": 45,
        }

    national = sum(float(r.get("puntaje_total", 0) or 0) for r in results) / total
    international_raw = sum(
        float((r.get("evaluacion_internacional") or {}).get("puntaje_total", 0) or 0)
        for r in results
    ) / total
    international_max = 45

    return {
        "indice_nacional": round(national, 2),
        "indice_internacional": round((international_raw / international_max) * 100, 2),
        "indice_nacional_internacional": round(((national + international_raw) / (100 + international_max)) * 100, 2),
        "puntaje_internacional_promedio": round(international_raw, 2),
        "puntaje_internacional_maximo": international_max,
    }


def _evaluate_ogp(evidence, processed_data, template):
    criteria = [
        _criterion("Acceso abierto", 3, *_open_access_score(evidence, processed_data)),
        _criterion("Informacion oportuna", 3, *_timeliness_score(evidence, processed_data, 3)),
        _criterion("Informacion comprensible", 3, *_comprehensible_score(evidence, processed_data, template)),
        _criterion("Rendicion de cuentas", 3, *_accountability_score(evidence, processed_data, 3)),
        _criterion("Reutilizacion ciudadana", 3, *_reuse_score(processed_data, 3)),
    ]
    return _standard("OGP", 15, criteria)


def _evaluate_ocde(evidence, processed_data, template, lotaip_result):
    criteria = [
        _criterion("Calidad de datos", 4, *_data_quality_score(processed_data)),
        _criterion("Metadatos", 4, *_document_family_score(evidence, processed_data, "Metadatos", 4)),
        _criterion("Diccionario de datos", 4, *_document_family_score(evidence, processed_data, "Diccionario", 4)),
        _criterion("Interoperabilidad", 4, *_interoperability_score(processed_data, lotaip_result)),
        _criterion("Comparabilidad", 4, *_comparability_score(evidence, processed_data)),
    ]
    return _standard("OCDE", 20, criteria)


def _evaluate_ods(evidence, processed_data):
    criteria = [
        _criterion("Acceso publico a la informacion", 3, *_public_access_score(processed_data)),
        _criterion("Institucion transparente", 3, *_transparent_institution_score(evidence, processed_data)),
        _criterion("Rendicion de cuentas", 2, *_accountability_score(evidence, processed_data, 2)),
        _criterion("Informacion verificable", 2, *_verifiable_score(evidence, processed_data)),
    ]
    return _standard("ODS 16", 10, criteria)


def _processed_data_from_evidence(evidence):
    metadata_json = evidence.metadata_json or {}
    metadata = metadata_json.get("metadata") or {}
    extension = metadata_json.get("extension") or _extension_from_evidence(evidence)

    return {
        "file_exists": bool(evidence.file_path or evidence.source_url),
        "extension": extension,
        "metadata": metadata,
        "is_corrupted": bool(metadata_json.get("is_corrupted", False)),
        "is_protected": bool(metadata_json.get("is_protected", False)),
        "extracted_text": evidence.extracted_text or "",
        "columns": metadata_json.get("columns") or [],
        "sheet_names": metadata_json.get("sheet_names") or [],
        "row_count": metadata_json.get("row_count") or 0,
        "document_type": metadata_json.get("document_type") or detect_lotaip_document_type(
            f"{evidence.title} {evidence.file_path or ''}"
        ),
    }


def _extension_from_evidence(evidence):
    if evidence.file_path:
        return Path(evidence.file_path).suffix.lower()
    file_type = (evidence.file_type or "").lower().strip(".")
    return f".{file_type}" if file_type else ""


def _open_access_score(evidence, processed_data):
    url_text = normalize_text(evidence.source_url or "")
    blocked_terms = ["login", "signin", "password", "clave", "autenticacion", "auth"]
    accessible = processed_data.get("file_exists") and not processed_data.get("is_protected") and not processed_data.get("is_corrupted")
    no_login_hint = not any(term in url_text for term in blocked_terms)

    if accessible and no_login_hint:
        return 3, "Documento accesible, sin contrasena detectada y sin senales de login."
    if accessible:
        return 1.5, "Documento accesible, pero el enlace contiene senales de autenticacion."
    return 0, "No se comprobo acceso abierto al documento."


def _timeliness_score(evidence, processed_data, max_score):
    score, obs = evaluate_period(evidence, processed_data)
    if score >= 20:
        return max_score, "Mes y ano corresponden al periodo evaluado."
    if score >= 10:
        return max_score / 2, "Coincidencia parcial del periodo evaluado."
    return 0, "No se detecto correspondencia con el periodo evaluado."


def _comprehensible_score(evidence, processed_data, template):
    text = _search_text(evidence, processed_data)
    expected_terms = [evidence.indicator.code if evidence.indicator else "", evidence.indicator.name if evidence.indicator else ""]
    if template and template.keywords:
        expected_terms.extend(template.keywords[:8])

    meaningful_terms = [normalize_text(t) for t in expected_terms if len(normalize_text(t)) >= 4]
    found = [term for term in meaningful_terms if term in text]

    if found:
        return 3, "Titulo, literal o contenido permiten entender el documento."
    if evidence.title or processed_data.get("document_type"):
        return 1.5, "El documento tiene identificacion basica, pero faltan palabras clave claras."
    return 0, "No se detecto informacion suficiente para comprender el documento."


def _accountability_score(evidence, processed_data, max_score):
    text = _search_text(evidence, processed_data)
    terms = [
        "responsable", "unidad", "direccion", "fuente", "elaborado", "aprobado",
        "autoridad", "institucion", "institucional", "correo", "contacto",
    ]
    if any(term in text for term in terms):
        return max_score, "Se detecto responsable, unidad, fuente o senal institucional."
    if evidence.source_url:
        return max_score / 2, "Existe fuente/enlace de origen, pero no responsable explicito."
    return 0, "No se detecto responsable, unidad ni fuente institucional."


def _reuse_score(processed_data, max_score):
    ext = processed_data.get("extension")
    has_text = bool((processed_data.get("extracted_text") or "").strip())
    if ext in PROCESSABLE_EXTENSIONS:
        return max_score, "Formato procesable para reutilizacion ciudadana."
    if has_text:
        return max_score / 2, "Texto extraible disponible, aunque el formato no es tabular abierto."
    return 0, "No se detecto formato reutilizable ni texto extraible."


def _data_quality_score(processed_data):
    checks = [
        bool(processed_data.get("row_count", 0) > 0),
        bool((processed_data.get("extracted_text") or "").strip()),
        not processed_data.get("is_corrupted"),
    ]
    passed = sum(1 for item in checks if item)
    if passed == 3:
        return 4, "Archivo con filas, texto extraible y sin corrupcion."
    if passed >= 2:
        return 2, "Calidad tecnica parcial: faltan filas, texto o integridad completa."
    return 0, "No se comprobo calidad minima de datos."


def _document_family_score(evidence, processed_data, document_type, max_score):
    current_type = processed_data.get("document_type")
    sheet_names = [normalize_text(s) for s in processed_data.get("sheet_names") or []]
    wanted = normalize_text(document_type)

    if normalize_text(current_type) == wanted or wanted in sheet_names:
        return max_score, f"El documento contiene seccion u hoja de {document_type.lower()}."

    siblings = Evidence.objects.filter(
        university_id=evidence.university_id,
        period_id=evidence.period_id,
        indicator_id=evidence.indicator_id,
        month=evidence.month,
        validation_status__in=["aprobado", "pendiente"],
    ).only("title", "file_path")

    for sibling in siblings:
        sibling_type = detect_lotaip_document_type(f"{sibling.title} {sibling.file_path or ''}")
        if normalize_text(sibling_type) == wanted:
            return max_score, f"Existe archivo complementario de {document_type.lower()}."

    return 0, f"No se detecto {document_type.lower()}."


def _interoperability_score(processed_data, lotaip_result):
    ext = processed_data.get("extension")
    structure_score = float(lotaip_result.get("puntaje_estructura", 0) or 0)
    processable = ext in PROCESSABLE_EXTENSIONS

    if processable and structure_score >= 16:
        return 4, "Formato procesable y estructura alineada con la plantilla."
    if processable or structure_score >= 10:
        return 2, "Interoperabilidad parcial: formato o estructura cumplen parcialmente."
    return 0, "No se detecto formato procesable ni estructura interoperable."


def _comparability_score(evidence, processed_data):
    text = _search_text(evidence, processed_data)
    expected_month = MONTH_NAMES.get(evidence.month, "") if evidence.month else ""
    components = [
        normalize_text(evidence.university.acronym if evidence.university else "") in text
        or normalize_text(evidence.university.name if evidence.university else "") in text,
        normalize_text(evidence.indicator.code if evidence.indicator else "") in text
        or normalize_text(evidence.indicator.name if evidence.indicator else "") in text,
        bool(expected_month and normalize_text(expected_month) in text) or bool(evidence.month),
        bool(evidence.period and str(evidence.period.year) in text),
    ]
    found = sum(1 for item in components if item)
    if found >= 4:
        return 4, "Universidad, literal, mes y ano/periodo estan claros."
    if found >= 2:
        return 2, "Comparabilidad parcial: faltan algunos datos de contexto."
    return 0, "No hay contexto suficiente para comparar entre instituciones o periodos."


def _public_access_score(processed_data):
    readable = bool((processed_data.get("extracted_text") or "").strip())
    if processed_data.get("file_exists") and not processed_data.get("is_protected") and readable:
        return 3, "Documento accesible, sin contrasena y legible."
    if processed_data.get("file_exists") and not processed_data.get("is_protected"):
        return 1.5, "Documento accesible, pero la legibilidad es parcial."
    return 0, "No se comprobo acceso publico legible."


def _transparent_institution_score(evidence, processed_data):
    text = _search_text(evidence, processed_data)
    terms = ["lotaip", "transparencia", "informacion publica", "rendicion", "universidad", "institucion"]
    university_terms = [
        normalize_text(evidence.university.acronym if evidence.university else ""),
        normalize_text(evidence.university.name if evidence.university else ""),
    ]
    if any(term in text for term in terms) or any(term and term in text for term in university_terms):
        return 3, "El contenido corresponde a informacion publica institucional."
    return 0, "No se detecto relacion clara con informacion publica institucional."


def _verifiable_score(evidence, processed_data):
    has_data = processed_data.get("row_count", 0) > 0 or bool(processed_data.get("columns"))
    has_metadata = bool(evidence.metadata_json)
    has_link = bool(evidence.source_url)
    if has_data or has_metadata or has_link:
        return 2, "Informacion verificable mediante datos, metadatos o enlace."
    return 0, "No se detectaron datos, metadatos ni enlace verificable."


def _search_text(evidence, processed_data):
    pieces = [
        evidence.title,
        evidence.source_url,
        evidence.indicator.code if evidence.indicator else "",
        evidence.indicator.name if evidence.indicator else "",
        evidence.university.acronym if evidence.university else "",
        evidence.university.name if evidence.university else "",
        processed_data.get("metadata", {}).get("file_name"),
        processed_data.get("document_type"),
        " ".join(processed_data.get("columns") or []),
        " ".join(processed_data.get("sheet_names") or []),
        (processed_data.get("extracted_text") or "")[:10000],
    ]
    return normalize_text(" ".join(str(piece or "") for piece in pieces))


def _criterion(name, max_score, score, observation):
    return {
        "criterio": name,
        "puntaje": round(float(score), 2),
        "puntaje_maximo": max_score,
        "observacion": observation,
    }


def _standard(name, max_score, criteria):
    score = round(sum(item["puntaje"] for item in criteria), 2)
    return {
        "nombre": name,
        "puntaje": score,
        "puntaje_maximo": max_score,
        "porcentaje": round((score / max_score) * 100, 2) if max_score else 0,
        "criterios": criteria,
    }
