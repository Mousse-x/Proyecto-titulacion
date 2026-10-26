from types import SimpleNamespace

from django.test import SimpleTestCase

from .models import LotaipEvaluationRun
from .validation_views import _official_lotaip_result


class LotaipDashboardResultTests(SimpleTestCase):
    def test_maps_official_run_without_recalculating_sita(self):
        run = SimpleNamespace(
            id=1,
            status=LotaipEvaluationRun.Status.COMPLETED_REVIEWS,
            engine_version="DPE-053-2024-v2.1",
            completed_at=None,
            result={"summary": {
                "CTA": 44.0, "ETA": 0.0, "RP": 0.0, "CI": 21.43, "SITA": 16.36,
                "formats_evaluated": 21, "requires_review": 7,
            }},
        )

        result = _official_lotaip_result(run)

        self.assertEqual(result["sita"], 16.36)
        self.assertEqual(result["cta"], 44.0)
        self.assertEqual(result["ci"], 21.43)
        self.assertEqual(result["status"], "PROVISIONAL")
        self.assertEqual(result["engine_version"], "DPE-053-2024-v2.1")
        self.assertEqual(result["formats"], 21)

    def test_rejects_legacy_automatic_average_as_official_sita(self):
        run = SimpleNamespace(
            result={"summary": {"sita": {"resultado_automatico": {"puntaje": 25.6}}}},
        )
        self.assertIsNone(_official_lotaip_result(run))
