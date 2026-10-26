from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import json

from django.test import SimpleTestCase, override_settings

from .services.lotaip_rubric import evaluate_package, review_rubric, summarize_rubrics
from .services.lotaip_automatic import (
    _ecuador_non_working_days,
    _pnt_public_api_url,
    check_deadline,
    check_links,
    fetch_public,
)


def evidence(number=3, title="Conjunto de datos", path=None):
    return SimpleNamespace(indicator=SimpleNamespace(code=f"LOTAIP-{number}"),
                           indicator_id=number, university_id=1, period_id=1, month=8,
                           title=title, file_path=path)


def scored(number=3, cta=1, eta=1, rp=1, quality="SI"):
    rubric = evaluate_package(evidence(number), [])
    for criterion in rubric["criterios"]:
        if criterion["aplica"]:
            criterion["calificacion"] = {"cta": cta, "eta": eta, "rp": rp}.get(criterion["id"], quality)
    return rubric


class LotaipRubricTests(SimpleTestCase):
    def test_pnt_api_url_forces_json_representation(self):
        self.assertEqual(
            _pnt_public_api_url(1, 2026, 1113),
            ('https://transparencia.dpe.gob.ec/backend/v1/transparency/'
             'transparency/active/public?month=1&year=2026&establishment_id=1113&format=json'),
        )
    def test_complete_automatic_evaluation_without_manual_review(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            rows = {
                "Metadatos": "campo,valor\nFECHA ACTUALIZACIÓN DE LA INFORMACIÓN,31/03/2026\n",
                "Diccionario": "Nombre del Campo,Descripción\nDevengado,Valor devengado\nSaldo por devengar,Saldo\nCodificado,Total\n",
                "Conjunto de datos": "Devengado,Saldo por devengar,Codificado\n30.00,70.00,100.00\n",
            }
            siblings = []
            files = []
            for index, (kind, content) in enumerate(rows.items(), 1):
                filename = f"{kind}.csv"
                Path(directory, filename).write_text(content, encoding="utf-8")
                source = f"https://transparencia.dpe.gob.ec/media/{filename.replace(' ', '%20')}"
                siblings.append(SimpleNamespace(title=kind, file_path=filename, source_url=source))
                files.append({"id": index, "description": kind, "url_download": f"/media/{filename.replace(' ', '%20')}"})
            ev = evidence(6, path="Conjunto de datos.csv")
            ev.month = 3
            ev.period = SimpleNamespace(year=2026)
            ev.university = SimpleNamespace(transparency_url="https://transparencia.dpe.gob.ec/entidades/1365")
            api_payload = [{"numeral": {"name": "Numeral 6"}, "month": 3, "year": 2026,
                            "published": True, "published_at": "2026-04-14T10:00:00-05:00", "files": files}]
            def fetch(url):
                return {"status": 200, "body": json.dumps(api_payload).encode(), "error": None, "content_type": "application/json"}
            rubric = evaluate_package(ev, siblings, check_online=True, fetch=fetch)
            summary = summarize_rubrics([rubric])
            self.assertEqual(summary["puntaje"], 100)
            self.assertEqual({c["id"]: c["calificacion"] for c in rubric["criterios"] if c["aplica"]},
                             {"cta": 1, "eta": 1, "rp": 1, "validez": "SI"})
            self.assertEqual(rubric["modo"], "automatico")

    def test_verifiable_link_requires_access_legibility_and_correspondence(self):
        rows = [["Nombre", "Enlace"], ["Resolución importante", "https://example.org/documento"]]
        ok = lambda url: {"status": 200, "body": b"<html><body>Resolucion importante</body></html>", "content_type": "text/html", "error": None}
        bad = lambda url: {"status": 200, "body": b"<html><body>Contenido ajeno</body></html>", "content_type": "text/html", "error": None}
        self.assertEqual(check_links(rows, ok)[0], "SI")
        self.assertEqual(check_links(rows, bad)[0], "NO")

    def test_fetch_rejects_non_public_url(self):
        result = fetch_public("http://127.0.0.1/private")
        self.assertIsNone(result["status"])
        self.assertIn("pública", result["error"])

    def test_ecuador_calendar_includes_2026_carnival(self):
        holidays = _ecuador_non_working_days(2026)
        from datetime import date
        self.assertIn(date(2026, 2, 16), holidays)
        self.assertIn(date(2026, 2, 17), holidays)

    def test_deadline_boundaries_weekend_year_change_and_missing_date(self):
        def run(year, month, published_at):
            ev = evidence(6); ev.month = month; ev.period = SimpleNamespace(year=year)
            ev.university = SimpleNamespace(transparency_url="https://transparencia.dpe.gob.ec/entidades/1365")
            item = {"numeral": {"name": "Numeral 6"}, "month": month, "year": year,
                    "published": True, "published_at": published_at, "files": []}
            fetch = lambda _url: {"status": 200, "body": json.dumps([item]).encode(), "error": None}
            return check_deadline(ev, fetch)[0]
        self.assertEqual(run(2024, 11, "2024-12-15"), 1)  # anterior al límite laborable
        self.assertEqual(run(2024, 11, "2024-12-16"), 1)  # límite, domingo 15
        self.assertEqual(run(2024, 11, "2024-12-17"), 0)
        self.assertEqual(run(2024, 12, "2025-01-15"), 1)  # diciembre/enero
        self.assertIsNone(run(2024, 11, None))

    def test_automatic_result_is_available_without_manual_review(self):
        rubric = evaluate_package(evidence(), [])
        rubric["criterios"][0]["sugerencia"] = 0.5
        rubric["criterios"][1]["sugerencia"] = 1
        summary = summarize_rubrics([rubric])
        self.assertIsNone(summary["puntaje"])
        automatic = summary["resultado_automatico"]
        self.assertEqual(automatic["puntaje"], 75)
        self.assertEqual(automatic["criterios_calculados"], 2)
        self.assertEqual(automatic["criterios_sin_datos"], 2)
        self.assertEqual(automatic["componentes_calculados"], 2)

    def test_no_data_is_not_an_automatic_zero(self):
        summary = summarize_rubrics([evaluate_package(evidence(), [])])
        self.assertIsNone(summary["resultado_automatico"]["puntaje"])

    def test_reviewed_zero_overrides_automatic_suggestion(self):
        rubric = scored(3, cta=0, eta=0, rp=0, quality="NO")
        rubric["criterios"][0]["sugerencia"] = 1
        self.assertEqual(summarize_rubrics([rubric])["resultado_automatico"]["puntaje"], 0)

    def test_missing_local_files_do_not_prove_nonpublication(self):
        rubric = evaluate_package(evidence(), [])
        self.assertTrue(all(c["calificacion"] is None for c in rubric["criterios"]))
        self.assertIsNone(summarize_rubrics([rubric])["puntaje"])

    def test_csv_comma_only_and_check_all_rows(self):
        with TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            files = []
            for title in ["Metadatos", "Diccionario", "Conjunto de datos"]:
                path = Path(directory) / f"{title}.csv"
                path.write_text("nombre,valor\n" + "dato,valor\n" * 60 + "dato,\n", encoding="utf-8")
                files.append(evidence(title=title, path=path.name))
            rubric = evaluate_package(evidence(), files)
            self.assertEqual(rubric["criterios"][1]["sugerencia"], 1)
            self.assertIn("1 valores obligatorios vacíos", rubric["criterios"][0]["observacion"])
            self.assertEqual(rubric["criterios"][0]["sugerencia"], 0.5)
            self.assertIsNone(summarize_rubrics([rubric])["puntaje"])
            Path(directory, "Conjunto de datos.csv").write_text("nombre;valor\ndato;valor\n", encoding="utf-8")
            self.assertEqual(evaluate_package(evidence(), files)["criterios"][1]["sugerencia"], 0)

    def test_applicability_matches_article_19_table_7(self):
        for number in range(1, 25):
            rows = {c["id"]: c for c in evaluate_package(evidence(number), [])["criterios"]}
            self.assertEqual(rows["verificables"]["aplica"], number not in {2, 3, 4, 6, 23})
            self.assertEqual(rows["vigencia"]["aplica"], number in {16, 18})
            self.assertEqual(rows["validez"]["aplica"], number in {3, 6})

    def test_four_components_not_six_equal_weights(self):
        summary = summarize_rubrics([scored(3, cta=0.5, rp=0)])
        self.assertEqual(summary["puntaje"], 62.5)
        self.assertEqual(summary["componentes"], {"CTA": 50, "ETA": 100, "RP": 0, "CI": 100})

    def test_duplicates_do_not_overweight_one_package(self):
        a, b = scored(3), scored(6, cta=0, eta=0, rp=0, quality="NO")
        self.assertEqual(summarize_rubrics([a, a, a, b])["puntaje"], 50)
        self.assertEqual(summarize_rubrics([a, a, a, b])["formatos"], 2)

    def test_quality_uses_each_applicable_check_in_v3(self):
        # Dos NO en verificables y dos SI (vigencia/validez): CI 50%.
        a, b, c = scored(1, quality="NO"), scored(18), scored(3)
        next(x for x in b["criterios"] if x["id"] == "verificables")["calificacion"] = "NO"
        self.assertEqual(summarize_rubrics([a, b, c])["puntaje"], 87.5)

    def test_sin_evaluacion_is_excluded_not_full_credit(self):
        a = scored(1, quality="SIN EVALUACIÓN")
        self.assertIsNone(summarize_rubrics([a])["puntaje"])
        self.assertEqual(summarize_rubrics([a])["puntaje_formato"], 100)
        self.assertEqual(summarize_rubrics([a, scored(3, quality="NO")])["puntaje"], 75)

    def test_review_requires_date_valid_values_and_reason(self):
        rubric = evaluate_package(evidence(), [])
        payload = {"fecha_monitoreo": "2026-09-16", "criterios": deepcopy(rubric["criterios"])}
        payload["criterios"][0].update(calificacion=1, observacion="Verificado en PNT; metadatos agosto 2026 y campos completos.")
        reviewed = review_rubric(rubric, payload, 9, "2026-09-16T12:00:00Z")
        self.assertEqual(reviewed["revisado_por"], 9)
        self.assertIsNone(rubric["criterios"][0]["calificacion"])
        for bad in [2, True, "1"]:
            payload["criterios"][0]["calificacion"] = bad
            with self.assertRaises(ValueError):
                review_rubric(rubric, payload, 9, "now")
        payload["criterios"][0].update(calificacion=1, observacion=" ")
        with self.assertRaises(ValueError):
            review_rubric(rubric, payload, 9, "now")
        payload["criterios"] = payload["criterios"][:-1]
        with self.assertRaises(ValueError):
            review_rubric(rubric, payload, 9, "now")

    def test_unreviewed_criterion_blocks_even_with_other_scored_packages(self):
        summary = summarize_rubrics([scored(3), evaluate_package(evidence(6), [])])
        self.assertIsNone(summary["puntaje"])
        self.assertGreater(summary["criterios_pendientes"], 0)
