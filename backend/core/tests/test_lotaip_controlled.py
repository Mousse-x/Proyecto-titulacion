"""Validación funcional controlada del motor LOTAIP DPE-053-2024-v2."""
from datetime import date

from django.test import SimpleTestCase

from ..lotaip_engine.rules import ENGINE_VERSION, NUMERAL_CONFIG
from ..lotaip_engine.schemas import registry, schema_checksum
from ..lotaip_engine.parsers import validate_dataset
from ..lotaip_engine.scoring import summarize
from ..services.lotaip_automatic import check_links, check_sums, check_validity


def valid_row(schema):
    row = []
    for field in schema["dataset_fields"]:
        if field in schema["url_fields"]:
            row.append("https://controlled.test/documento")
        elif field in schema["date_fields"]:
            row.append("2026-01-01")
        elif field in schema["money_fields"]:
            row.append("1.00")
        else:
            row.append("Registro controlado identificable")
    values = dict(zip(schema["dataset_fields"], row))
    if schema["format_id"] == "3":
        values.update({"Decimo Tercera Remuneracion": "10.00", "Decima Cuarta Remuneracion": "20.00",
                       "Horas suplementarias y extraordinarias": "5.00", "Encargos y subrogaciones": "15.00",
                       "Total ingresos adicionales": "50.00"})
    if schema["format_id"] == "6":
        values.update({"Devengado": "30.00", "Saldo por devengar": "70.00", "Codificado": "100.00"})
    if schema["format_id"] == "16":
        values["Periodo de vigencia de la clasificacion de la reserva"] = "24 meses"
    if schema["format_id"] == "18":
        values["Plazo de duracion"] = "24 meses"
    return [values[field] for field in schema["dataset_fields"]]


def criterion(status="SI", score=None, **extra):
    result = {"status": status, "score": score}
    result.update(extra)
    return result


class ControlledPerfectEvaluationTests(SimpleTestCase):
    def test_perfect_24_numerals_25_official_formats_scores_100(self):
        schemas = registry()["formats"]
        self.assertEqual(len(NUMERAL_CONFIG), 24)
        self.assertEqual(len(schemas), 25)
        evaluations = []
        for schema in schemas:
            number = schema["numerals"][0]
            rows = [schema["dataset_fields"], valid_row(schema)]
            validation = validate_dataset(rows, schema, number)
            self.assertTrue(validation["valid"], (schema["format_id"], validation["errors"]))
            criteria = {"cta": criterion("EVALUATED", 1), "eta": criterion("EVALUATED", 1),
                        "rp": criterion("EVALUATED", 1)}
            rule = NUMERAL_CONFIG[number]
            if rule.verifiables:
                if schema["url_fields"] or schema["metadata_url_fields"]:
                    link_rows = [["Nombre", "Enlace"], ["Registro controlado identificable", "https://controlled.test/documento"]]
                    response = {"status": 200, "body": b"<html>Registro controlado identificable</html>",
                                "error": None, "content_type": "text/html"}
                    actual, reason = check_links(link_rows, lambda _url: response)
                    self.assertEqual(actual, "SI")
                    criteria["verificables"] = criterion(actual, reason=reason)
                else:
                    self.assertEqual(number, 23)
                    criteria["verificables"] = criterion("REQUIERE_REVISION")
            else:
                criteria["verificables"] = criterion("NOT_APPLICABLE")
            if rule.validez:
                actual, reason = check_sums(number, rows)
                self.assertEqual(actual, "SI")
                criteria["validez"] = criterion(actual, reason=reason)
            else:
                criteria["validez"] = criterion("NOT_APPLICABLE")
            if rule.vigencia:
                actual, reason = check_validity(rows, date(2026, 8, 31), sample_seed=number)
                self.assertEqual(actual, "SI")
                criteria["vigencia"] = criterion(actual, reason=reason)
            else:
                criteria["vigencia"] = criterion("NOT_APPLICABLE")
            evaluations.append({"criteria": criteria})
        result = summarize(evaluations)
        self.assertEqual({key: result[key] for key in ("CTA", "ETA", "RP", "CI", "SITA")},
                         {"CTA": 100.0, "ETA": 100.0, "RP": 100.0, "CI": 100.0, "SITA": 100.0})

    def test_schema_provenance_has_stable_sha256(self):
        self.assertEqual(ENGINE_VERSION, "LOTAIP-v5-OCR-IA")
        self.assertRegex(schema_checksum(), r"^[0-9a-f]{64}$")

    def test_numeral_23_url_absence_requires_review_without_zero(self):
        schema = next(item for item in registry()["formats"] if item["format_id"] == "23")
        self.assertFalse(NUMERAL_CONFIG[23].verifiables)
        self.assertEqual(schema["url_fields"] + schema["metadata_url_fields"], [])
        result = summarize([{"criteria": {
            "cta": criterion("EVALUATED", 1), "eta": criterion("EVALUATED", 1),
            "rp": criterion("EVALUATED", 1), "verificables": criterion("REQUIERE_REVISION"),
            "vigencia": criterion("NOT_APPLICABLE"), "validez": criterion("NOT_APPLICABLE"),
        }}])
        self.assertEqual(result["requires_review"], 1)
        self.assertIsNone(result["CI"])


class ControlledErrorEvaluationTests(SimpleTestCase):
    EXPECTED = {"CTA": 95.83, "ETA": 91.67, "RP": 91.67, "CI": 33.33, "SITA": 78.12}

    def test_expected_equals_actual_and_preserves_traceability(self):
        yes = criterion("SI")
        evaluations, traces = [], []
        cases = [
            ("incompleto", .5, 1, 1, yes), ("csv_invalido", 1, 0, 1, yes),
            ("fuera_plazo", 1, 1, 0, yes),
            ("enlace_404", 1, 1, 1, criterion(check_links([["Nombre", "Enlace"], ["Resolucion controlada", "https://controlled.test/404"]], lambda _: {"status": 404, "body": b"", "error": None, "content_type": "text/html"})[0])),
            ("enlace_inaccesible", 1, 1, 1, criterion("TECHNICAL_ERROR")),
            ("http_200_incorrecto", 1, 1, 1, criterion(check_links([["Nombre", "Enlace"], ["Resolucion controlada", "https://controlled.test/mismatch"]], lambda _: {"status": 200, "body": b"<html>Otro documento</html>", "error": None, "content_type": "text/html"})[0])),
            ("suma_n3", 1, 1, 1, criterion(check_sums(3, [["Decimo Tercera Remuneracion", "Decima Cuarta Remuneracion", "Horas suplementarias y extraordinarias", "Encargos y subrogaciones", "Total ingresos adicionales"], ["10", "20", "5", "15", "49"]])[0])),
            ("suma_n6", 1, 1, 1, criterion(check_sums(6, [["Devengado", "Saldo por devengar", "Codificado"], ["30", "60", "100"]])[0])),
            ("vigencia_n16", 1, 1, 1, criterion(check_validity([["Fecha de la clasificacion de la informacion reservada", "Periodo de vigencia de la clasificacion de la reserva"], ["2020-01-01", "12 meses"]], date(2026, 8, 31))[0])),
            ("vigencia_n18", 1, 1, 1, criterion(check_validity([["Fecha de suscripcion", "Plazo de duracion"], ["2020-01-01", "12 meses"]], date(2026, 8, 31))[0])),
            ("revision", 1, 1, 1, criterion("REQUIERE_REVISION")),
            ("no_aplica", 1, 1, 1, criterion("NOT_APPLICABLE")),
        ]
        for line, (name, cta, eta, rp, quality) in enumerate(cases, 2):
            criteria = {"cta": criterion("EVALUATED", cta), "eta": criterion("EVALUATED", eta),
                        "rp": criterion("EVALUATED", rp), "verificables": quality}
            evaluations.append({"criteria": criteria})
            traces.append({"numeral": min(line - 1, 24), "formato": name, "criterio": "verificables",
                           "campo_fila": line, "resultado": quality["status"], "puntuacion": quality["score"],
                           "motivo": name, "evidencia": {"caso": name},
                           "url": "https://controlled.test/" + name if "enlace" in name or "http" in name else None,
                           "valores_utilizados": {"cta": cta, "eta": eta, "rp": rp},
                           "version_motor": ENGINE_VERSION, "schema_checksum": schema_checksum()})
        actual = summarize(evaluations)
        self.assertEqual({key: actual[key] for key in self.EXPECTED}, self.EXPECTED)
        required = {"numeral", "formato", "criterio", "campo_fila", "resultado", "puntuacion", "motivo",
                    "evidencia", "url", "valores_utilizados", "version_motor", "schema_checksum"}
        self.assertTrue(all(required <= set(trace) for trace in traces))
        self.assertIsNone(cases[4][4]["score"])
        self.assertIsNone(cases[10][4]["score"])
        self.assertIsNone(cases[11][4]["score"])
