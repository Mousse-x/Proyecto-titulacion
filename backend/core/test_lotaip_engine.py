from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from django.conf import settings
from django.test import SimpleTestCase, override_settings

from .lotaip_engine.parsers import parse_csv, validate_dataset
from .lotaip_engine.rules import ENGINE_VERSION, NUMERAL_CONFIG
from .lotaip_engine.schemas import formats_for_numeral
from .lotaip_engine.scoring import summarize
from .services.lotaip_automatic import check_links, check_sums, check_validity, parse_date, money
from .services.lotaip_rubric import expected_data_period
from .lotaip_engine.link_validator import validate_links_batch
from datetime import date


class LotaipEngineV2Tests(SimpleTestCase):
    def test_all_24_numerals_have_explicit_table_7_configuration(self):
        self.assertEqual(set(NUMERAL_CONFIG), set(range(1, 25)))
        for number, rule in NUMERAL_CONFIG.items():
            config = rule.as_dict()
            self.assertTrue(config["criteria"]["cta"])
            self.assertTrue(config["criteria"]["eta"])
            self.assertTrue(config["criteria"]["rp"])
            self.assertEqual(config["criteria"]["verificables"], number not in {2, 3, 4, 6, 23})
            self.assertEqual(config["criteria"]["vigencia"], number in {16, 18})
            self.assertEqual(config["criteria"]["validez"], number in {3, 6})

    def test_sita_excludes_not_applicable_and_requires_four_components(self):
        result = summarize([{"criteria": {
            "cta": {"score": 1}, "eta": {"score": 1}, "rp": {"score": 0},
            "verificables": {"status": "NOT_APPLICABLE"},
            "vigencia": {"status": "NOT_APPLICABLE"}, "validez": {"status": "SI"},
        }}])
        self.assertEqual(result, {"CTA": 100.0, "ETA": 100.0, "RP": 0.0, "CI": 100.0,
                                  "SITA": 75.0, "CI_status": "CI_DEFINITIVO", "SITA_status": "SITA_DEFINITIVO",
                                  "SITA_min": 75.0, "SITA_max": 75.0,
                                  "formats_evaluated": 1, "requires_review": 0,
                                  "technical_errors": 0, "formula": "SITA = (CTA + ETA + RP + CI) / 4"})

    def test_pending_quality_is_provisional_and_has_range(self):
        result = summarize([{"criteria": {"cta":{"score":.44}, "eta":{"score":0}, "rp":{"score":0},
            "verificables":{"status":"SI"}, "vigencia":{"status":"REQUIERE_REVISION"},
            "validez":{"status":"TECHNICAL_ERROR"}}}])
        self.assertEqual(result["CI_status"], "CI_PROVISIONAL")
        self.assertEqual(result["SITA_status"], "SITA_PROVISIONAL")
        self.assertLess(result["SITA_min"], result["SITA_max"])

    def test_technical_error_is_not_scored_as_zero(self):
        result = summarize([{"criteria": {"cta": {"status": "TECHNICAL_ERROR"}}}])
        self.assertIsNone(result["SITA"])
        self.assertEqual(result["technical_errors"], 1)

    def test_artificial_columns_are_warning_only(self):
        temp_root = Path(settings.BASE_DIR) / ".test-lotaip"
        temp_root.mkdir(exist_ok=True)
        with TemporaryDirectory(dir=temp_root) as directory, override_settings(MEDIA_ROOT=directory):
            Path(directory, "data.csv").write_text("nombre,valor,Unnamed: 3\nuno,dos,\n", encoding="utf-8")
            parsed = parse_csv(SimpleNamespace(file_path="data.csv", source_url="https://example.test/data.csv"))
            self.assertIsNone(parsed["error"])
            self.assertIn("Unnamed: 3", parsed["extra_columns"])
            self.assertTrue(parsed["warnings"])

    def test_engine_version_is_persistable_identifier(self):
        self.assertRegex(ENGINE_VERSION, r"^LOTAIP-v\d+-OCR-IA$")

    def test_http_404_is_non_compliance(self):
        rows = [["Nombre", "Enlace"], ["Resolución 123456", "https://example.test/a"]]
        value, _ = check_links(rows, lambda _: {"status": 404, "body": b"", "error": None, "content_type": "text/html"})
        self.assertEqual(value, "NO")

    def test_http_403_is_not_public_access(self):
        rows = [["Nombre", "Enlace"], ["Convenio 987654", "https://example.test/private"]]
        response = {"status": 403, "body": b"", "error": None, "content_type": "text/html"}
        self.assertIsNone(check_links(rows, lambda _: response)[0])

    def test_timeout_is_unverified_not_zero(self):
        rows = [["Nombre", "Enlace"], ["Resolución 123456", "https://example.test/a"]]
        value, _ = check_links(rows, lambda _: {"status": None, "body": b"", "error": "timeout", "content_type": ""})
        self.assertIsNone(value)

    def test_html_error_with_200_fails_correspondence(self):
        rows = [["Nombre", "Enlace"], ["Resolución 123456", "https://example.test/a"]]
        response = {"status": 200, "body": b"<html><body>Error inesperado</body></html>", "error": None, "content_type": "text/html"}
        self.assertEqual(check_links(rows, lambda _: response)[0], "NO")

    def test_link_without_identifiers_requires_review(self):
        rows = [["URL"], ["https://example.test/a"]]
        response = {"status": 200, "body": b"<html><body>Documento legible</body></html>", "error": None, "content_type": "text/html"}
        self.assertIsNone(check_links(rows, lambda _: response)[0])

    def test_numeral_3_decimal_sum(self):
        rows = [["Décimo Tercera Remuneración", "Décima Cuarta Remuneración", "Horas suplementarias y extraordinarias", "Encargos y subrogaciones", "Total ingresos adicionales"],
                ["10.00", "20.00", "5.00", "15.00", "50.00"]]
        self.assertEqual(check_sums(3, rows)[0], "SI")

    def test_numeral_6_detects_material_difference(self):
        rows = [["Devengado", "Saldo por devengar", "Codificado"], ["75.00", "20.00", "100.00"]]
        self.assertEqual(check_sums(6, rows)[0], "NO")

    def test_vigencia_samples_exactly_three_rows_reproducibly(self):
        rows = [["Fecha de inicio", "Fecha de fin"]] + [["01/01/2026", "31/12/2026"] for _ in range(8)]
        first = check_validity(rows, date(2026, 8, 31), sample_seed=55)
        second = check_validity(rows, date(2026, 8, 31), sample_seed=55)
        self.assertEqual(first, second)
        self.assertIn("3 comprobadas", first[1])

    def test_vigencia_supports_years_months_days_and_expiration(self):
        for duration in ("3 años", "36 meses", "1095 días"):
            value, _ = check_validity([["Fecha de suscripcion", "Plazo de duracion"],
                                       ["25/04/2023", duration]], date(2024, 11, 30))
            self.assertEqual(value, "SI")
        self.assertEqual(check_validity([["Fecha de suscripcion", "Plazo de duracion"],
                                         ["01/01/2020", "12 meses"]], date(2024, 11, 30))[0], "NO")
        self.assertEqual(check_validity([["Fecha de suscripcion", "Plazo de duracion"],
                                         ["01/01/2024", "INDEFINIDO"]], date(2024, 11, 30))[0], "SI")
        self.assertEqual(check_validity([["Fecha de suscripcion", "Plazo de duracion"],
                                         ["01/01/2025", "indefinido"]], date(2024, 11, 30))[0], "NO")

    def test_vigencia_without_start_dates_is_not_evaluated(self):
        rows = [["Tema", "Fecha de la clasificacion de la informacion reservada",
                 "Periodo de vigencia de la clasificacion de la reserva", "Enlace"],
                ["No aplica", "No aplica", "No aplica", "https://example.org/resolucion"]]
        self.assertEqual(check_validity(rows, date(2026, 1, 31))[0], "SIN EVALUACIÓN")

    def test_remuneration_sum_treats_empty_components_as_zero(self):
        rows = [["Decimo Tercera Remuneracion", "Decima Cuarta Remuneracion",
                 "Horas suplementarias y extraordinarias", "Encargos y subrogaciones",
                 "Total ingresos adicionales"],
                ["270,58", "39,17", "", "NO APLICA", "309,75"]]
        self.assertEqual(check_sums(3, rows)[0], "SI")
        rows[1][-1] = "400,00"
        self.assertEqual(check_sums(3, rows)[0], "NO")

    def test_numeral_18_real_samples_are_current(self):
        rows = [["Fecha de suscripcion", "Plazo de duracion"],
                ["25/04/2023", "3 años"], ["25/01/2022", "3 años"], ["27/06/2022", "3 años"]]
        self.assertEqual(check_validity(rows, date(2024, 11, 30), sample_seed=18)[0], "SI")

    def test_supported_dates_and_decimal_money(self):
        self.assertEqual(parse_date("31-01-2026"), date(2026, 1, 31))
        self.assertEqual(str(money("1.234,50")), "1234.50")

    def test_expected_data_period_boundaries(self):
        self.assertEqual(expected_data_period(2024, 11), (2024, 10))
        self.assertEqual(expected_data_period(2025, 1), (2024, 12))
        self.assertEqual(expected_data_period(2024, 12), (2024, 11))

    def test_batch_link_exact_contradiction_indeterminate_and_403(self):
        rows = [["Codigo del proceso", "Enlace"], ["ABC-123", "https://example.test/doc"]]
        exact = lambda _: {"status": 200, "body": b"<html>ABC-123</html>", "content_type":"text/html", "error":None}
        vague = lambda _: {"status": 200, "body": b"<html>otro documento</html>", "content_type":"text/html", "error":None}
        forbidden = lambda _: {"status":403, "body":b"", "content_type":"text/plain", "error":None}
        self.assertEqual(validate_links_batch(rows, exact)[0]["result"], "SI")
        self.assertEqual(validate_links_batch(rows, vague)[0]["result"], "REQUIERE_REVISION")
        self.assertEqual(validate_links_batch(rows, forbidden)[0]["result"], "REQUIERE_REVISION")


class LotaipNumeralSchemaTests(SimpleTestCase):
    """Se añaden abajo 24 pruebas con nombres estables, una por numeral."""

    def assert_numeral_schema(self, number):
        rule = NUMERAL_CONFIG[number].as_dict()
        schemas = formats_for_numeral(number)
        self.assertTrue(schemas, f"Numeral {number} sin esquema")
        self.assertEqual(rule["criteria"]["verificables"], number not in {2, 3, 4, 6, 23})
        self.assertEqual(rule["criteria"]["vigencia"], number in {16, 18})
        self.assertEqual(rule["criteria"]["validez"], number in {3, 6})
        for schema in schemas:
            self.assertTrue(schema["required_fields"])
            row = []
            for field in schema["dataset_fields"]:
                if field in schema["url_fields"]: row.append("https://example.test/documento")
                elif field in schema["date_fields"]: row.append("2026-01-31")
                elif field in schema["money_fields"]: row.append("1.00")
                else: row.append("dato")
            valid = validate_dataset([schema["dataset_fields"], row], schema, number)
            self.assertTrue(valid["valid"], valid["errors"])
            missing = validate_dataset([schema["dataset_fields"][1:], row[1:]], schema, number)
            self.assertIn("MISSING_REQUIRED_FIELD", {item["code"] for item in missing["errors"]})
            detected_urls = [field for field in schema["dataset_fields"] if any(token in field.lower() for token in ("enlace", "link", "url"))]
            self.assertEqual(schema["url_fields"], detected_urls)


def _make_schema_test(number):
    def test(self):
        self.assert_numeral_schema(number)
    test.__name__ = f"test_numeral_{number:02d}_schema"
    return test

for _number in range(1, 25):
    setattr(LotaipNumeralSchemaTests, f"test_numeral_{_number:02d}_schema", _make_schema_test(_number))
