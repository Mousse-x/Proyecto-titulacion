import json
import tempfile
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from ..services import digital_indicators as d


def _page(passes, violations, archived_at=''):
    return {
        'url': 'https://u.edu.ec/', 'measured_url': 'https://u.edu.ec/', 'archived_at': archived_at,
        'passes': passes, 'violations': violations,
    }


def _violation(rule, impact='serious'):
    return {'id': rule, 'impact': impact, 'help': rule, 'tags': ['wcag2aa'], 'nodes': 2}


class AccessibilityTests(SimpleTestCase):
    def test_challenge_page_is_never_scored(self):
        self.assertTrue(d._is_challenge(403, 'Un momento…', ''))
        self.assertTrue(d._is_challenge(503, '', '<script src="/cdn-cgi/challenge-platform/x.js">'))
        self.assertFalse(d._is_challenge(200, 'Nosotros – EPN', '<html></html>'))

    def test_pass_rate_sets_the_status(self):
        passes = [f'rule-{n}' for n in range(30)]
        compliant = d._accessibility_outcome([_page(passes, [])], [])
        self.assertEqual((compliant['status'], compliant['score']), ('CUMPLE', 1))
        partial = d._accessibility_outcome([_page(passes, [_violation(f'v{n}') for n in range(5)])], [])
        self.assertEqual(partial['status'], 'PARCIAL')
        self.assertIn('30 de 35', partial['evidence_excerpt'])
        failing = d._accessibility_outcome([_page(passes[:10], [_violation(f'v{n}') for n in range(10)])], [])
        self.assertEqual(failing['status'], 'NO_CUMPLE')

    def test_critical_violation_prevents_full_compliance(self):
        passes = [f'rule-{n}' for n in range(40)]
        result = d._accessibility_outcome([_page(passes, [_violation('button-name', 'critical')])], [])
        self.assertEqual(result['status'], 'PARCIAL')

    def test_rule_failing_on_any_page_counts_as_failed(self):
        result = d._accessibility_outcome([
            _page(['a', 'b'], []), _page(['a'], [_violation('b')]),
        ], [])
        self.assertEqual(result['metadata']['rules_passed'], ['a'])
        self.assertEqual([row['id'] for row in result['metadata']['rules_failed']], ['b'])

    def test_nothing_measured_is_a_technical_error_not_a_zero(self):
        result = d._accessibility_outcome([], [{'url': 'https://u.edu.ec/', 'reason': 'HTTP 403'}])
        self.assertEqual(result['status'], 'ERROR_TECNICO')
        self.assertIsNone(result['score'])

    def test_sample_takes_home_and_shortest_transparency_sections(self):
        university = SimpleNamespace(website_url='https://u.edu.ec/')
        rows = [{'url': f'https://u.edu.ec/{path}'} for path in (
            'lotaip-2020', 'lotaip', 'transparencia', 'rendicion-de-cuentas', 'noticia',
        )]
        self.assertEqual(d._accessibility_pages(university, rows), [
            'https://u.edu.ec/', 'https://u.edu.ec/lotaip', 'https://u.edu.ec/transparencia',
            'https://u.edu.ec/rendicion-de-cuentas',
        ])


class InteroperabilityTests(SimpleTestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def _file(self, name, text, encoding='utf-8'):
        path = Path(self.media.name) / name
        path.write_bytes(text.encode(encoding))
        return SimpleNamespace(file_path=name, title=name, source_url='')

    def test_consistent_package_passes_every_check(self):
        checks, header = d._package_checks({
            'dataset': self._file('Conjunto.csv', 'Fecha;Monto;Período\n2026-01-31;1500.50;2026\n'),
            'dictionary': self._file('Diccionario.csv', 'Nombre del campo;Descripción\nFecha;x\nMonto;y\nPeriodo;z\n'),
            'metadata': self._file('Metadatos.csv', 'Licencia;CC-BY-4.0\n'),
        })
        self.assertEqual(header, ['fecha', 'monto', 'periodo'])
        self.assertTrue(all(checks.values()), checks)

    def test_local_formats_renamed_columns_and_closed_license_fail(self):
        checks, _ = d._package_checks({
            'dataset': self._file('Conjunto.csv', 'Nombres y apellidos;Valor\nAna Muñoz;$ 1.250,00\n', 'cp1252'),
            'dictionary': self._file('Diccionario.csv', 'Nombre del campo;Descripción\nApellidos y nombres;x\nValor;y\n'),
            'metadata': self._file('Metadatos.csv', 'Licencia;Todos los derechos reservados\n'),
        })
        self.assertEqual(checks, {
            'utf8': False, 'dictionary_matches_columns': False,
            'standard_formats': False, 'open_license': False,
        })

    def test_renamed_column_between_months_is_reported(self):
        dictionary = 'Nombre del campo;Descripción\nMonto;x\nValor;y\n'
        packages = {
            ('LOTAIP-8', 1): {
                'dataset': self._file('enero.csv', 'Monto\n10\n'),
                'dictionary': self._file('dic-enero.csv', dictionary),
            },
            ('LOTAIP-8', 2): {
                'dataset': self._file('febrero.csv', 'Valor\n10\n'),
                'dictionary': self._file('dic-febrero.csv', dictionary),
            },
        }
        with patch.object(d, '_lotaip_packages', return_value=packages):
            result = d.evaluate_interoperability(SimpleNamespace(), 1)
        self.assertEqual(result['status'], 'NO_CUMPLE')
        self.assertEqual(result['metadata']['months'], [1, 2])
        self.assertEqual(
            result['metadata']['failures']['columnas estables entre meses'], ['LOTAIP-8 (01)', 'LOTAIP-8 (02)'],
        )
        self.assertNotIn('solo hay un mes', result['justification'])

    def test_delimiter_is_read_from_the_header(self):
        checks, header = d._package_checks({
            'dataset': self._file('Conjunto.csv', 'No.;Nombre del examen\n1;"Examen de bienes, servicios, obras"\n'),
        })
        self.assertEqual(header, ['no', 'nombre del examen'])


class OpenDataTests(SimpleTestCase):
    university = SimpleNamespace(
        name='Universidad de Prueba', acronym='UDP', website_url='https://www.udp.edu.ec/',
    )

    def test_only_datasets_published_by_the_university_count(self):
        self.assertTrue(d._university_organization({'organization': {'title': 'Universidad de Prueba'}}, self.university))
        self.assertFalse(d._university_organization({'organization': {'title': 'SENESCYT'}}, self.university))

    def test_lotaip_links_are_not_open_data(self):
        links = d._data_links('https://www.udp.edu.ec/datos/', (
            '<a href="/lotaip/2026/numeral1.csv">Numeral 1</a>'
            '<a href="/datos/matricula-2025.csv">Matrícula por carrera</a>'
        ))
        self.assertEqual([row['url'] for row in links], ['https://www.udp.edu.ec/datos/matricula-2025.csv'])

    @patch('core.services.digital_indicators.fetch_public')
    def test_catalog_with_university_datasets_complies(self, fetch):
        page = ''.join(
            f'<a href="/datos/{name}.csv">{name}</a>' for name in ('matricula', 'graduados', 'docentes')
        ).encode('utf-8')

        def respond(url):
            if url.startswith(d.CKAN_SEARCH_URL):
                return {'status': 200, 'error': None, 'body': json.dumps({'result': {'results': []}}).encode()}
            if url == 'https://www.udp.edu.ec/datos-abiertos':
                return {'status': 200, 'error': None, 'body': page}
            return {'status': None, 'error': 'DNS', 'body': b''}

        fetch.side_effect = respond
        rows = [{'url': 'https://www.udp.edu.ec/datos-abiertos'}]
        result = d.evaluate_open_data(self.university, rows, lambda url, day: None, date(2026, 10, 25))
        self.assertEqual(result['status'], 'CUMPLE')
        self.assertEqual(len(result['metadata']['university_topic_datasets']), 3)

    @patch('core.services.digital_indicators.fetch_public')
    def test_only_lotaip_means_no_open_data_evidence(self, fetch):
        fetch.return_value = {'status': 200, 'error': None, 'body': json.dumps({'result': {'results': []}}).encode()}
        result = d.evaluate_open_data(self.university, [], lambda url, day: None, date(2026, 10, 25))
        self.assertEqual(result['status'], 'SIN_EVIDENCIA')
