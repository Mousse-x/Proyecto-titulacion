"""Normalización de paquetes publicados, separando original y copia procesada."""
import csv
import io
import re
from collections import Counter
from pathlib import Path

from django.conf import settings
from core.services.comparison_engine import (
    ABSENCE_MARKERS,
    field_allows_email,
    normalize_email,
    normalize_text,
)
from core.services.lotaip_automatic import parse_date, money

ARTIFICIAL_PREFIXES = ("unnamed", "column", "field")

def parse_csv(evidence):
    path = Path(settings.MEDIA_ROOT) / str(getattr(evidence, "file_path", "") or "")
    result = {"original_url": getattr(evidence, "source_url", None), "processed_path": str(path),
              "rows": [], "headers": [], "warnings": [], "error": None}
    if not path.is_file():
        result["error"] = "Copia local no disponible"
        return result
    raw = path.read_bytes()
    text = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            text = raw.decode(encoding)
            if encoding == "cp1252": result["warnings"].append("Advertencia de codificación")
            break
        except UnicodeDecodeError:
            pass
    if text is None:
        result["error"] = "No se pudo decodificar el archivo"
        return result
    candidates = []
    for delimiter in (",", ";", "\t", "|"):
        try: rows = [r for r in csv.reader(io.StringIO(text), delimiter=delimiter, strict=True) if any(c.strip() for c in r)]
        except csv.Error: continue
        widths = Counter(len(r) for r in rows)
        if widths:
            width, count = widths.most_common(1)[0]
            candidates.append(((count / len(rows), width), delimiter, rows))
    if not candidates:
        result["error"] = "CSV vacío o corrupto"
        return result
    _, delimiter, rows = max(candidates, key=lambda value: value[0])
    result.update(rows=rows, headers=rows[0] if rows else [], delimiter=delimiter, text=text, encoding=encoding)
    result["ragged_rows"] = [i + 1 for i, r in enumerate(rows) if len(r) != len(rows[0])]
    result["extra_columns"] = [h for h in result["headers"] if normalize_text(h).startswith(ARTIFICIAL_PREFIXES)]
    if result["extra_columns"]:
        result["warnings"].append("Se detectaron columnas adicionales que no forman parte del esquema oficial.")
    return result

def expected_fields(template, document_type):
    configured = list(getattr(template, "expected_columns", None) or []) if template else []
    structure = getattr(template, "expected_structure", None) or {} if template else {}
    per_file = structure.get("fields", {}) if isinstance(structure, dict) else {}
    return per_file.get(document_type, configured if document_type == "Conjunto de datos" else [])

def _canonical_map(schema):
    aliases = schema.get("aliases", {})
    result = {}
    for field in schema["dataset_fields"]:
        result[normalize_text(field)] = field
    for canonical, values in aliases.items():
        for value in values:
            result[normalize_text(value)] = canonical
    return result

def validate_dataset(rows, schema, numeral):
    """Valida encabezados por significado normalizado, nunca por posición."""
    errors, warnings = [], []
    if not rows:
        return {"valid": False, "errors": [{"code": "UNREADABLE_DATASET", "numeral": numeral,
                "explanation": "El conjunto de datos no contiene filas interpretables."}], "warnings": []}
    found = [str(value).strip() for value in rows[0]]
    normalized = [normalize_text(value) for value in found]
    mapping = _canonical_map(schema)
    canonical_found = [mapping.get(value) for value in normalized]
    for expected in schema["required_fields"]:
        if expected not in canonical_found:
            errors.append({"code": "MISSING_REQUIRED_FIELD", "numeral": numeral,
                           "expected_field": expected, "found_fields": found,
                           "explanation": f"Falta la columna oficial requerida '{expected}'."})
    duplicates = [value for value in set(normalized) if value and normalized.count(value) > 1]
    if duplicates:
        errors.append({"code": "DUPLICATE_FIELD", "numeral": numeral, "fields": duplicates,
                       "explanation": "Hay encabezados duplicados después de normalizarlos."})
    indices = {canonical: i for i, canonical in enumerate(canonical_found) if canonical}
    sentinels = ABSENCE_MARKERS
    nullable_fields = set(schema.get("nullable_fields", []))
    for row_number, row in enumerate(rows[1:], 2):
        for field in schema["required_fields"]:
            index = indices.get(field)
            if index is None: continue
            value = str(row[index]).strip() if index < len(row) else ""
            normalized_value = normalize_text(value)
            if not value and field not in nullable_fields:
                errors.append({"code": "EMPTY_REQUIRED_VALUE", "numeral": numeral,
                               "field": field, "row": row_number,
                               "explanation": "Un campo oficial no puede quedar vacío; use la excepción normativa documentada cuando corresponda."})
            elif normalized_value not in sentinels and field in schema["date_fields"] and not parse_date(value):
                errors.append({"code": "INVALID_DATE", "numeral": numeral, "field": field, "row": row_number, "value": value})
            elif normalized_value not in sentinels and field in schema["money_fields"] and money(value) is None:
                errors.append({"code": "INVALID_DECIMAL", "numeral": numeral, "field": field, "row": row_number, "value": value})
            elif (normalized_value not in sentinels and field in schema["url_fields"]
                  and not re.fullmatch(r"https?://\S+", value, re.I)
                  and not (field_allows_email(schema, field) and normalize_email(value))):
                errors.append({"code": "INVALID_URL_FIELD", "numeral": numeral, "field": field, "row": row_number, "value": value})
    extras = [found[i] for i, canonical in enumerate(canonical_found) if canonical is None and found[i]]
    if extras:
        warnings.append({"code": "EXTRA_FIELD", "fields": extras,
                         "explanation": "Columnas adicionales fuera del esquema oficial; no reducen la calificación por sí solas."})
    return {"valid": not errors, "errors": errors, "warnings": warnings,
            "found_fields": found, "canonical_fields": [value for value in canonical_found if value]}
