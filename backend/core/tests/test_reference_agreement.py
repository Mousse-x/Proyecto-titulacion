import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from ..services.reference_agreement import cohen_kappa, compare, load_reference


class ReferenceAgreementTests(SimpleTestCase):
    def _reference(self, body):
        handle = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, encoding='utf-8')
        handle.write('codigo,estado_esperado,tambien_valido,url_evidencia,nota\n' + body)
        handle.close()
        self.addCleanup(Path(handle.name).unlink)
        return load_reference(handle.name)

    def test_alternative_status_counts_as_agreement(self):
        reference = self._reference(
            'IND-02,CUMPLE,,https://u.edu.ec/nosotros,\n'
            'IND-26,PARCIAL,CUMPLE,,límite\n'
            'IND-38,SIN_EVIDENCIA,,,\n'
        )
        report = compare(reference, {'IND-02': 'CUMPLE', 'IND-26': 'CUMPLE', 'IND-38': 'PARCIAL'})
        self.assertEqual(report['agreed'], 2)
        self.assertEqual(report['total'], 3)
        self.assertEqual(report['confusion'][('PARCIAL', 'PARCIAL')], 1)
        self.assertEqual(report['confusion'][('SIN_EVIDENCIA', 'PARCIAL')], 1)

    def test_missing_result_is_reported_as_disagreement(self):
        report = compare(self._reference('IND-02,CUMPLE,,,\n'), {})
        self.assertEqual(report['rows'][0]['actual'], 'PENDIENTE')
        self.assertEqual(report['agreed'], 0)

    def test_invalid_status_is_rejected(self):
        with self.assertRaises(ValueError):
            self._reference('IND-02,CASI,,,\n')

    def test_cohen_kappa(self):
        self.assertEqual(cohen_kappa([('CUMPLE', 'CUMPLE'), ('PARCIAL', 'PARCIAL')]), 1.0)
        # Acuerdo observado 0,5 con acuerdo esperado por azar 0,5 → kappa 0.
        self.assertAlmostEqual(cohen_kappa([
            ('CUMPLE', 'CUMPLE'), ('CUMPLE', 'PARCIAL'), ('PARCIAL', 'CUMPLE'), ('PARCIAL', 'PARCIAL'),
        ]), 0.0)
        self.assertIsNone(cohen_kappa([]))
