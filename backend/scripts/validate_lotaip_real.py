"""Validación real LOTAIP en modo de sólo lectura; ejecución explícita."""
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from core.models import Evidence
from core.lotaip_engine.evaluator import evaluate_format, summarize_evaluations
from core.lotaip_engine.parsers import parse_csv
from core.lotaip_engine.rules import ENGINE_VERSION, NUMERAL_CONFIG
from core.lotaip_engine.schemas import registry, schema_checksum
from core.services.document_processor import detect_lotaip_document_type
from core.services.lotaip_automatic import fetch_public, normalize_text, parse_date


def main():
    university_id, period_id, month = 6, 4, 11
    rows = list(Evidence.objects.filter(university_id=university_id, period_id=period_id, month=month)
                .select_related("university", "period", "indicator").order_by("indicator__code", "id"))
    groups = defaultdict(list)
    for item in rows:
        groups[item.indicator.code].append(item)

    cache, requests = {}, []
    def recorded_fetch(url):
        if url not in cache:
            response = fetch_public(url)
            cache[url] = response
            requests.append({"url": url, "final_url": response.get("url", url), "status": response.get("status"),
                             "error": response.get("error"), "content_type": response.get("content_type", ""),
                             "bytes": len(response.get("body", b""))})
        return cache[url]

    evaluations, evaluation_by_code = [], {}
    parsed_by_code = {}
    for code, siblings in groups.items():
        primary = next((e for e in siblings if detect_lotaip_document_type(e.file_path) == "Conjunto de datos"), siblings[0])
        parsed_by_code[code] = parse_csv(primary)
        evaluated = evaluate_format(primary, siblings, check_online=True, fetch=recorded_fetch)
        evaluations.append(evaluated)
        evaluation_by_code[code] = evaluated

    # Los únicos verificables son los campos evaluados por la matriz del motor.
    link_items = [dict(item, format=code)
                  for code, evaluated in evaluation_by_code.items()
                  for item in evaluated["criteria"]["verificables"].get("evidence", [])]

    available = set()
    for code in groups:
        schema = next((s for s in registry()["formats"] if s["format_id"] == code.removeprefix("LOTAIP-").replace("5.22", "5-22")), None)
        available.update(schema["numerals"] if schema else [])
    missing = sorted(set(range(1, 25)) - available)
    missing_evaluations = []
    for number in missing:
        quality = "NO" if NUMERAL_CONFIG[number].verifiables else "NOT_APPLICABLE"
        missing_evaluations.append({"criteria": {
            "cta": {"status": "EVALUATED", "score": 0}, "eta": {"status": "EVALUATED", "score": 0},
            "rp": {"status": "EVALUATED", "score": 0}, "verificables": {"status": quality, "score": None},
            "vigencia": {"status": "NOT_APPLICABLE", "score": None},
            "validez": {"status": "NOT_APPLICABLE", "score": None}}})
    summary = summarize_evaluations(evaluations + missing_evaluations)

    all_criteria = [c for e in evaluations for c in e["criteria"].values()] + [c for e in missing_evaluations for c in e["criteria"].values()]
    counts = Counter({"CUMPLE": 0, "NO_CUMPLE": 0, "NOT_APPLICABLE": 0,
                      "REQUIERE_REVISION": 0, "ERROR_TECNICO": 0})
    for criterion in all_criteria:
        status, score = criterion["status"], criterion.get("score")
        if status == "NOT_APPLICABLE": counts["NOT_APPLICABLE"] += 1
        elif status == "REQUIERE_REVISION": counts["REQUIERE_REVISION"] += 1
        elif status in {"TECHNICAL_ERROR", "PENDIENTE"}: counts["ERROR_TECNICO"] += 1
        elif status == "SI" or (status == "EVALUATED" and score == 1): counts["CUMPLE"] += 1
        else: counts["NO_CUMPLE"] += 1

    link_summary = Counter(item["status"] for item in link_items)
    link_summary["total"] = len(link_items)
    link_summary["pendientes"] = link_summary["PENDIENTE"]
    link_summary["evaluados"] = len(link_items) - link_summary["pendientes"]

    selected = []
    for code in ("LOTAIP-3", "LOTAIP-6", "LOTAIP-16", "LOTAIP-18", "LOTAIP-8", "LOTAIP-10"):
        evaluation = next(e for e in evaluations if e["unidad"].endswith(":" + str(groups[code][0].indicator_id)))
        parsed = parsed_by_code.get(code, {})
        data_rows = parsed.get("rows", [])
        details = {"numeral": code.removeprefix("LOTAIP-"), "format": code, "files": [e.file_path for e in groups[code]],
                   "criteria": evaluation["criteria"], "links": sorted({item['url'] for item in link_items if item['format'] == code and item.get('url')}),
                   "manual_guide": {"fields": data_rows[0] if data_rows else [], "sample_rows": data_rows[1:4] if data_rows else []}}
        if code == "LOTAIP-3" and data_rows:
            wanted = ["decimo tercera remuneracion", "decima cuarta remuneracion", "horas suplementarias y extraordinarias", "encargos y subrogaciones", "total ingresos adicionales"]
            headers = [normalize_text(x) for x in data_rows[0]]
            details["manual_guide"]["operation_values"] = [{name: row[headers.index(name)] for name in wanted if name in headers and headers.index(name) < len(row)} for row in data_rows[1:4]]
        if code == "LOTAIP-6" and data_rows:
            wanted = ["codificado", "devengado", "saldo por devengar"]
            headers = [normalize_text(x) for x in data_rows[0]]
            details["manual_guide"]["operation_values"] = [{name: row[headers.index(name)] for name in wanted if name in headers and headers.index(name) < len(row)} for row in data_rows[1:4]]
            details["manual_guide"]["operation"] = "devengado + saldo por devengar = codificado"
        selected.append(details)

    publication = [r for r in requests if "active/public?" in r["url"]]
    eta_audit = []
    for code in ("LOTAIP-1.1", "LOTAIP-3", "LOTAIP-8", "LOTAIP-18", "LOTAIP-23"):
        for evidence in groups[code]:
            parsed = parse_csv(evidence)
            eta_audit.append({"format": code, "file": evidence.file_path, "extension": Path(evidence.file_path).suffix,
                              "encoding": parsed.get("encoding"), "delimiter": parsed.get("delimiter"),
                              "columns": len(parsed.get("headers", [])), "header": parsed.get("headers", []),
                              "classification": "A", "reason": "El delimitador detectado no es coma." if parsed.get("delimiter") != "," else "Cumple delimitador."})
    report = {"university": rows[0].university.name, "university_id": university_id,
              "period": {"id": period_id, "year": rows[0].period.year, "month": month},
              "engine_version": ENGINE_VERSION, "schema_checksum": schema_checksum(),
              "formats_found": len(groups), "numerals_found": sorted(available), "numerals_missing": missing,
              "publication_source": publication, "summary": summary,
              "execution_status": "PENDIENTE" if counts["ERROR_TECNICO"] else "COMPLETADA_CON_REVISIONES" if counts["REQUIERE_REVISION"] else "COMPLETADA",
              "status_counts": dict(counts), "links": dict(link_summary), "link_details": link_items,
              "selected_manual_review": selected,
              "eta_audit": eta_audit, "rp_audit": {"json_field": "published_at", "meaning": "fecha explícita de publicación según nombre y uso del endpoint público", "transformation": "ISO-8601 a fecha local; comparación con día 15 o siguiente laborable"},
              "issues": [], "original_files_modified": False}
    output = BASE.parent / "tmp" / "lotaip-real-espoch-2024-11-v3.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
