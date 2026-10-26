"""Registro inmutable de esquemas extraídos de las plantillas oficiales 2024."""
import json
import hashlib
import re
from functools import lru_cache
from pathlib import Path

SCHEMA_FILE = Path(__file__).with_name("schemas_2024.json")

@lru_cache(maxsize=1)
def registry():
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))

def schema_checksum():
    return hashlib.sha256(SCHEMA_FILE.read_bytes()).hexdigest()

def formats_for_numeral(number):
    return [value for value in registry()["formats"] if number in value["numerals"]]

def resolve_format(indicator_code, number=None):
    code = str(indicator_code or "").upper().removeprefix("LOTAIP-")
    wanted = "5-22" if code in {"5.22", "5-22"} else code
    direct = next((value for value in registry()["formats"] if value["format_id"] == wanted), None)
    if direct: return direct
    matches = formats_for_numeral(number) if number else []
    return matches[0] if len(matches) == 1 else None

def schema_summary(number):
    values = formats_for_numeral(number)
    return {
        "formats": [v["format_id"] for v in values],
        "required_fields": {v["format_id"]: v["required_fields"] for v in values},
        "optional_fields": {v["format_id"]: v["optional_fields"] for v in values},
        "url_fields": {v["format_id"]: v["url_fields"] + v["metadata_url_fields"] for v in values},
        "email_fields": {v["format_id"]: v.get("email_fields", []) for v in values},
        "date_fields": {v["format_id"]: v["date_fields"] for v in values},
        "money_fields": {v["format_id"]: v["money_fields"] for v in values},
        "templates": [v["template"] for v in values],
    }
