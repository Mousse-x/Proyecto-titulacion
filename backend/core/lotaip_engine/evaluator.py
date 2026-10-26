"""Orquestador público del motor LOTAIP.

La salida conserva el contrato histórico ``criterios`` y añade el contrato v2
``criteria`` para que la migración de API y frontend sea gradual.
"""
from copy import deepcopy
from .rules import CONTENT_POLICY_VERSION, ENGINE_VERSION, LEGAL_SOURCE, LEGAL_URL, NUMERAL_CONFIG
from .scoring import summarize
from .schemas import resolve_format, schema_checksum
from .parsers import parse_csv, validate_dataset
from core.services.document_processor import detect_lotaip_document_type

def _number(evidence):
    from core.services.lotaip_rubric import indicator_number
    return indicator_number(getattr(getattr(evidence, "indicator", None), "code", ""))

def evaluate_format(evidence, siblings, template=None, check_online=True, fetch=None, previous=None,
                    progress_callback=None, ai_budget=None):
    # El evaluador probado se mantiene como implementación de criterios durante
    # la migración; esta es la única frontera que conoce el contrato anterior.
    from core.services.lotaip_rubric import evaluate_package
    legacy = evaluate_package(evidence, siblings, check_online=check_online, fetch=fetch, previous=previous,
                              progress_callback=progress_callback, ai_budget=ai_budget)
    number = _number(evidence)
    rule = NUMERAL_CONFIG.get(number)
    schema = resolve_format(getattr(getattr(evidence, "indicator", None), "code", None), number)
    dataset = next((item for item in siblings if (detect_lotaip_document_type(getattr(item, "file_path", "")) or
                    detect_lotaip_document_type(getattr(item, "title", ""))) == "Conjunto de datos"), None)
    schema_validation = {"valid": False, "errors": [{"code": "SCHEMA_NOT_CONFIGURED", "numeral": number}], "warnings": []}
    if schema and dataset:
        parsed = parse_csv(dataset)
        schema_validation = ({"valid": False, "errors": [{"code": "PARSER_ERROR", "numeral": number,
                              "explanation": parsed["error"]}], "warnings": parsed.get("warnings", [])}
                             if parsed.get("error") else validate_dataset(parsed["rows"], schema, number))
    elif schema and not dataset:
        schema_validation = {"valid": False, "errors": [{"code": "MISSING_DATASET", "numeral": number,
                             "explanation": "No se encontró el conjunto de datos del formato."}], "warnings": []}
    normative_structure_errors = [item for item in schema_validation["errors"] if item["code"] not in {"PARSER_ERROR", "SCHEMA_NOT_CONFIGURED", "MISSING_DATASET"}]
    previous_cta = next((c for c in (previous or {}).get('criterios', []) if c['id']=='cta'), {})
    if normative_structure_errors and previous_cta.get('calificacion') is None:
        cta = next(row for row in legacy["criterios"] if row["id"] == "cta")
        if cta.get("sugerencia") != 0: cta["sugerencia"] = .5
        if cta.get("calificacion") not in (None, 0): cta["calificacion"] = .5
        cta["observacion"] += " Errores de esquema oficial: " + ", ".join(item["code"] for item in normative_structure_errors) + "."
    if rule and rule.verifiables and schema and not (schema["url_fields"] or schema["metadata_url_fields"]):
        verifiable = next(row for row in legacy["criterios"] if row["id"] == "verificables")
        verifiable.update(calificacion=None, sugerencia=None,
            observacion="REQUIERE_REVISION: la Tabla 7 exige estado de verificables, pero la plantilla oficial del formato no contiene campos URL; no se asigna cero.")
    # Lo que no pudo comprobarse queda PENDIENTE: en las Tablas 1, 3 y 6 el
    # 0/NO afirma un incumplimiento (no publicada, fuera de plazo, enlace que
    # no cumple), no la falta de una fuente técnica. Se resuelve con reintento
    # o revisión, y el SITA se informa como provisional con su rango.
    criteria = {}
    technical_errors = []
    requires_review = []
    for row in legacy["criterios"]:
        if not row["aplica"]:
            status, score = "NOT_APPLICABLE", None
        elif row.get("calificacion") is None:
            status, score = "PENDIENTE", None
            technical_errors.append({"criterion": row["id"], "reason": row["observacion"]})
        elif row.get("calificacion") == "SIN EVALUACIÓN":
            status, score = "SIN EVALUACIÓN", None
        elif row.get("calificacion") in ("SI", "NO"):
            status, score = row["calificacion"], None
        else:
            status, score = "EVALUATED", row["calificacion"]
        criteria[row["id"]] = {"status": status, "score": score, "reason": row["observacion"],
                               "rule": row["regla"], "reference": row["referencia"], "evidence": row.get("evidencias", [])}
    result = {
        "engine_version": ENGINE_VERSION, "legal_source": LEGAL_SOURCE, "legal_url": LEGAL_URL,
        "institution_id": evidence.university_id, "period_id": evidence.period_id,
        "month": evidence.month, "numeral": number,
        "format_code": getattr(getattr(evidence, "indicator", None), "code", None),
        "numeral_name": rule.name if rule else "Formato no reconocido",
        "criteria": criteria, "technical_errors": technical_errors,
        "requires_review": requires_review, "legacy_contract": deepcopy(legacy),
        "schema": schema, "schema_validation": schema_validation,
        "schema_checksum": schema_checksum(),
    }
    # Contrato compatible para vistas existentes.
    legacy.update(version=ENGINE_VERSION, engine_version=ENGINE_VERSION,
                  content_policy_version=CONTENT_POLICY_VERSION,
                  legal_source=LEGAL_SOURCE, criteria=criteria,
                  errores_tecnicos=technical_errors, requiere_revision=requires_review)
    legacy.update(schema=schema, validacion_esquema=schema_validation, schema_checksum=schema_checksum())
    return legacy

def summarize_evaluations(evaluations):
    normalized = []
    for value in evaluations:
        if "criteria" in value:
            normalized.append(value)
        else:
            normalized.append({"criteria": {c["id"]: {"status": c.get("calificacion"), "score": c.get("calificacion")}
                                                   for c in value.get("criterios", [])}})
    return summarize(normalized)
