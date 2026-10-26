"""Regresiones de la metodología v3; no consultan PNT ni consumen IA real."""
import io
import json
import threading
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import ANY, call, patch, MagicMock

from django.test import SimpleTestCase, override_settings

from core.lotaip_engine.document_text import extract_document, extraction_error_message
from core.lotaip_engine.evaluator import evaluate_format
from core.lotaip_engine.freellm import (
    InvalidProviderResponse,
    analyze_correspondence,
    analyze_correspondence_batch,
    decode_answer,
    select_semantic_excerpt,
)
from core.lotaip_engine.parsers import validate_dataset
from core.lotaip_engine.verificables import check_package_links, collect_fields, compact_record_context
from core.lotaip_engine.schemas import resolve_format, registry
from core.lotaip_engine.rules import NUMERAL_CONFIG
from core.lotaip_engine.rules import CONTENT_POLICY_VERSION
from core.lotaip_engine.scoring import summarize
from core.services.lotaip_rubric import _required_empty_values, evaluate_package, summarize_rubrics
from core.services.lotaip_automatic import _request_cookie_header, _store_response_cookies, parse_date
from core.services.evaluator import EvaluationCancelled, evaluar_universidad


class MatrixTests(SimpleTestCase):
    def test_extraction_error_does_not_blame_tesseract_for_generic_runtime_error(self):
        message = extraction_error_message(RuntimeError('renderer failed'))
        self.assertIn('error interno (RuntimeError)', message)
        self.assertIn('No implica que falte Tesseract', message)
        self.assertNotIn('Compruebe Tesseract y el idioma', message)

    def test_lotaip_12_accepts_espe_regulation_headers_and_collects_links(self):
        schema = resolve_format('LOTAIP-1.2', 1)
        url = 'https://hcu.espe.edu.ec/wp-content/uploads/2026/01/RES-2026-001.pdf'
        rows = [[
            'TIPO', 'DESCRIPCIÓN DE REGULACIÓN', 'ENLACE A REGULACIÓN',
        ], [
            'Resolución',
            'ESPE-HCU-RES-2026-001 Aprobar el acta de la sesión ordinaria.',
            url,
        ]]

        validation = validate_dataset(rows, schema, 1)
        self.assertFalse([
            error for error in validation['errors']
            if error['code'] == 'MISSING_REQUIRED_FIELD'
        ])

        targets = collect_fields({'Conjunto de datos': {'rows': rows}}, schema)
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0]['field'], 'Enlace')
        self.assertEqual(targets[0]['value'], url)
        self.assertNotIn('missing_field', targets[0])

    def test_ai_record_context_keeps_only_relevant_compact_fields(self):
        record = {
            'Enlace': 'https://example.org/documento',
            'Objetivo estratégico': 'Incrementar la transparencia ' * 30,
            'Indicador': 'Porcentaje de cumplimiento',
            'Meta cuantificable': '95%',
            'Unidad': 'Dirección de Planificación',
            'Fecha de actualización': '2026-01-31',
            'Código': 'IND-001',
            'Texto administrativo accesorio': 'dato irrelevante ' * 100,
            'Otra URL': 'https://example.org/otra',
        }
        compact = compact_record_context(record, 'Enlace')
        self.assertLessEqual(len(compact), 6)
        self.assertLessEqual(sum(len(key) + len(value) for key, value in compact.items()), 900)
        self.assertNotIn('Enlace', compact)
        self.assertNotIn('Otra URL', compact)
        self.assertIn('Indicador', compact)
        self.assertIn('Meta cuantificable', compact)
        self.assertNotIn('Texto administrativo accesorio', compact)

    def test_lotaip_13_accepts_the_published_epn_url_header_alias(self):
        schema = resolve_format('LOTAIP-1.3', 1)
        rows = [[
            'Unidad', 'Objetivos', 'Indicador', 'Meta cuantificable',
            'Enlace al sistema de gestion de planificacion para verificacion de los indicadores y metas cuantificables por procesos o niveles',
        ], [
            'Rectorado', 'Formar profesionales', 'Empleabilidad', '38%',
            'https://atenea.epn.edu.ec/handle/25000/2371',
        ]]
        validation = validate_dataset(rows, schema, 1)
        self.assertFalse([error for error in validation['errors'] if error['code'] == 'MISSING_REQUIRED_FIELD'])

    def test_v4_closes_every_applicable_criterion_automatically(self):
        def row(identifier, applies=True, value=None):
            return {
                'id': identifier, 'aplica': applies, 'calificacion': value,
                'sugerencia': value, 'observacion': 'Fallo controlado.',
                'regla': 'Regla', 'referencia': 'Referencia', 'evidencias': [],
            }

        legacy = {'criterios': [
            row('cta'), row('eta', value=1), row('rp'), row('verificables'),
            row('vigencia', applies=False), row('validez', applies=False),
        ]}
        evidence = SimpleNamespace(
            university_id=1, period_id=1, month=1,
            indicator=SimpleNamespace(code='LOTAIP-1.1', name='Estructura orgánica'),
        )
        with patch('core.services.lotaip_rubric.evaluate_package', return_value=legacy), \
                patch('core.lotaip_engine.evaluator.resolve_format', return_value=None):
            result = evaluate_format(evidence, [], check_online=True)

        applicable = [criterion for criterion in result['criterios'] if criterion['aplica']]
        self.assertFalse(any(criterion['calificacion'] is None for criterion in applicable))
        self.assertEqual([criterion['calificacion'] for criterion in applicable], [0, 1, 0, 'NO'])
        self.assertEqual(result['errores_tecnicos'], [])
        self.assertIn('Cierre automático estricto', applicable[0]['observacion'])

    @override_settings(FREELLMAPI_CONCURRENCY=4)
    def test_independent_ai_checks_run_concurrently(self):
        field = 'Enlace para descargar el documento'
        urls = [f'https://example.org/{index}' for index in range(4)]
        files = {'Conjunto de datos': {'rows': [[field], *[[url] for url in urls]]},
                 'Metadatos': {'rows': []}, 'Diccionario': {'rows': []}}
        schema = {'url_fields': [field], 'metadata_url_fields': [], 'aliases': {}}
        lock, concurrent = threading.Lock(), threading.Event()
        active = 0

        def analyze(text, context):
            nonlocal active
            with lock:
                active += 1
                if active >= 2:
                    concurrent.set()
            concurrent.wait(.5)
            with lock:
                active -= 1
            return {'corresponde': True, 'observacion': 'Contenido correcto'}

        fetch = lambda url: {'url': url, 'status': 200, 'error': None,
                             'content_type': 'text/html', 'body': f'<p>Documento {url}</p>'.encode()}
        result = self.run_links(files, fetch, analyze, schema=schema)
        self.assertEqual(result[0], 'SI')
        self.assertTrue(concurrent.is_set())

    def test_redirect_cookies_are_scoped_to_their_domain_and_https(self):
        jar={}
        _store_response_cookies(
            jar,
            [('Set-Cookie','AnonymousAccess=token; Domain=.sharepoint.com; Path=/; Secure; HttpOnly')],
            'tenant-my.sharepoint.com',
        )
        self.assertEqual(
            _request_cookie_header(jar,'tenant-my.sharepoint.com','/personal/file.pdf',True),
            'AnonymousAccess=token',
        )
        self.assertEqual(_request_cookie_header(jar,'login.microsoftonline.com','/',True),'')
        self.assertEqual(_request_cookie_header(jar,'tenant-my.sharepoint.com','/',False),'')

    def test_dictionary_and_unlisted_columns_are_never_fetched(self):
        files = self.files([['https://example.org/unlisted', 'https://example.org/required']])
        files['Diccionario']['rows'] = [['Enlace', 'https://example.org/dictionary']]
        files['Metadatos']['rows'] = [['Otro enlace', 'https://example.org/metadata']]
        fetch = MagicMock(return_value={'status': 200, 'body': b'<html>Acta de donativo</html>', 'content_type': 'text/html'})
        result = self.run_links(files, fetch, lambda *_: {'corresponde': True})
        self.assertEqual(result[0], 'SI')
        fetch.assert_called_once_with('https://example.org/required')
        self.assertEqual(len(result[2]), 1)

    def files(self, values, note=''):
        return {'Conjunto de datos': {'rows': [['Descripcion', 'Enlace para descargar el documento mediante el cual se oficializa el regalo o donativo'], *values]},
                'Diccionario': {'rows': [['Nota aclaratoria', note]]}, 'Metadatos': {'rows': []}}

    def run_links(self, files, fetch=None, analyze=None, schema=None):
        return check_package_links(files, schema or resolve_format('LOTAIP-19'), {'numeral':'LOTAIP-19'},
                                   fetch or MagicMock(), analyze=analyze)

    def test_no_aplica_always_counts_as_success_without_network_or_ai(self):
        for value in ['no aplica', 'NO APLICA', 'No Aplica', 'nO aPlIcA', '  No   aplica.  ']:
            with self.subTest(value=value):
                fetch, ai = MagicMock(), MagicMock()
                result = self.run_links(self.files([['Sin donativos', value]], ''), fetch, ai)
                self.assertEqual(result[0], 'SI')
                self.assertTrue(result[2][0]['exception'])
                fetch.assert_not_called(); ai.assert_not_called()

    def test_literal_14_accepts_no_aplica_under_shortened_metadata_heading(self):
        official = ('Enlace para descargar el listado de responsables de atender las solicitudes '
                    'de acceso a la informacion en las unidades desconcentradas')
        published_variant = ('Enlace para descargar el listado de responsables de atender las '
                             'solicitudes de acceso a la informacion')
        schema = {
            'url_fields': [], 'metadata_url_fields': [official],
            'email_fields': [], 'aliases': {},
        }
        files = {
            'Conjunto de datos': {'rows': []},
            'Metadatos': {'rows': [[published_variant, 'NO APLICA']]},
            'Diccionario': {'rows': []},
        }
        fetch, ai = MagicMock(), MagicMock()
        result = self.run_links(files, fetch, ai, schema=schema)
        self.assertEqual(result[0], 'SI')
        self.assertEqual(result[2][0]['field'], official)
        self.assertEqual(result[2][0]['row'], 1)
        self.assertTrue(result[2][0]['exception'])
        fetch.assert_not_called()
        ai.assert_not_called()

    def test_literal_12_cpccs_report_is_verified_from_official_parameters_without_ai(self):
        field = 'Enlace'
        url = ('https://informe.cpccs.gob.ec/ReportesConsejo/Pages/ReportViewer.aspx?'
               '%2fReportesRendicionProduccion%2fInstitutosdeEducacion&Codigo=16720&anio=2024')
        files = {
            'Conjunto de datos': {'rows': [[
                'Nombre del mecanismo', 'Numero de certificado', 'Periodo', field,
            ], [
                'Formulario del informe de rendicion de cuentas presentado al Consejo de Participacion Ciudadana',
                '16720', '2024', url,
            ]]},
            'Metadatos': {'rows': []}, 'Diccionario': {'rows': []},
        }
        fetch = MagicMock(return_value={
            'url': url, 'status': 200, 'error': None, 'content_type': 'text/html',
            'body': b'<html><title>Visor de informes</title><body>Error de configuracion</body></html>',
        })
        ai = MagicMock()
        schema = {'url_fields': [field], 'metadata_url_fields': [], 'aliases': {}}
        result = self.run_links(files, fetch, ai, schema=schema)
        self.assertEqual(result[0], 'SI')
        self.assertEqual(result[2][0]['analysis']['decision_basis'], 'cpccs_report_viewer')
        self.assertIn('certificado 16720', result[2][0]['reason'])
        ai.assert_not_called()

    def test_literal_12_dpe_entity_link_is_resolved_with_annual_report_api(self):
        field = 'Enlace'
        url = 'https://transparencia.dpe.gob.ec/entidades/1113'
        api_url = ('https://transparencia.dpe.gob.ec/backend/v1/transparency/'
                   'anual-report/establishment?establishment_id=1113&format=json')
        files = {
            'Conjunto de datos': {'rows': [[
                'Nombre del mecanismo', 'Numero de certificado', 'Periodo', field,
            ], [
                'Informe anual sobre el derecho humano de acceso a la informacion publica 2025',
                'No aplica', '2025', url,
            ]]},
            'Metadatos': {'rows': []}, 'Diccionario': {'rows': []},
        }
        landing = {'url': url, 'status': 200, 'error': None, 'content_type': 'text/html',
                   'body': b'<html><title>Portal Nacional de Transparencia</title></html>'}
        api = {'url': api_url, 'status': 200, 'error': None, 'content_type': 'application/json',
               'body': json.dumps({'list': [{
                   'year': 2025, 'establishment': 1113, 'deleted': False,
                   'created_at': '2026-01-22T16:01:49-05:00',
                   'file': '/media/transparencia/1760005620001/2025/reporte_anual/reporte_anual_2025.xlsx',
               }]}).encode()}
        fetch = MagicMock(side_effect=lambda requested: api if requested == api_url else landing)
        ai = MagicMock()
        schema = {'url_fields': [field], 'metadata_url_fields': [], 'aliases': {}}
        result = self.run_links(files, fetch, ai, schema=schema)
        self.assertEqual(result[0], 'SI')
        self.assertEqual(fetch.call_args_list, [call(url), call(api_url)])
        self.assertEqual(result[2][0]['analysis']['decision_basis'], 'dpe_annual_report_api')
        self.assertIn('informe anual 2025', result[2][0]['reason'])
        self.assertTrue(result[2][0]['official_file_url'].endswith('reporte_anual_2025.xlsx'))
        ai.assert_not_called()

    def test_information_unavailable_justified_counts_as_success(self):
        result = self.run_links(self.files(
            [['Sin donativos', 'INFORMACIÓN NO DISPONIBLE']],
            'No existe información porque no se recibieron donativos durante el mes.',
        ))
        self.assertEqual(result[0], 'SI')
        self.assertTrue(result[2][0]['exception'])

    def test_invalid_values_and_unjustified_information_unavailable_are_failures(self):
        for value in ['INFORMACIÓN NO DISPONIBLE', 'ND', '', 'informe.pdf', 'https://']:
            with self.subTest(value=value):
                self.assertEqual(self.run_links(self.files([['Donativo',value]], 'NO APLICA'))[0], 'NO')

    def test_retry_does_not_reuse_old_failure_for_no_aplica(self):
        files = self.files([['Sin donativos', 'NO APLICA']], '')
        schema = resolve_format('LOTAIP-19')
        context = {'numeral': 'LOTAIP-19'}
        first = check_package_links(files, schema, context, MagicMock())
        stale = [dict(first[2][0], status='NO', reason='Resultado de la regla anterior.')]

        result = check_package_links(files, schema, context, MagicMock(), previous=stale)

        self.assertEqual(result[0], 'SI')
        self.assertEqual(result[2][0]['status'], 'SI')

    def test_valid_url_does_not_hide_invalid_second_row(self):
        files=self.files([['A','https://example.org/a'],['B','archivo.pdf']])
        fetch=lambda _: {'status':200,'body':b'<html>Donativo A</html>','content_type':'text/html'}
        ai=lambda *_: {'corresponde':True,'observacion':'Mismo donativo'}
        result=self.run_links(files,fetch,ai)
        self.assertEqual(result[0],'NO'); self.assertEqual(len(result[2]),2)

    def test_api_ocr_and_ai_failures_are_detailed_but_aggregate_as_no(self):
        files=self.files([['A','https://example.org/a']])
        result=self.run_links(files,lambda _: {'status':503,'error':'timeout'})
        self.assertEqual(result[0], 'NO'); self.assertEqual(result[2][0]['status'],'PENDIENTE')
        with patch('core.lotaip_engine.verificables.extract_document',return_value={'error':'Tesseract ausente'}):
            self.assertEqual(self.run_links(files,lambda _: {'status':200})[0], 'NO')
        with patch('core.lotaip_engine.verificables.extract_document',return_value={'text': '', 'error': None}):
            ai = MagicMock()
            empty = self.run_links(files, lambda _: {'status': 200}, ai)
            self.assertEqual(empty[0], 'NO')
            self.assertEqual(empty[2][0]['status'], 'PENDIENTE')
            ai.assert_not_called()
        self.assertEqual(self.run_links(files,lambda _: {'status':200,'body':b'<html>Donativo A</html>','content_type':'text/html'},
                                        lambda *_: {'corresponde':None,'error':'Cuota agotada'})[0], 'NO')

    def test_strict_majority_of_links_marks_verifiables_as_yes(self):
        files = self.files([
            ['A', 'https://example.org/a'],
            ['B', 'https://example.org/b'],
            ['C', 'archivo.pdf'],
        ])
        fetch = lambda url: {'status': 200, 'body': f'<html>{url}</html>'.encode(), 'content_type': 'text/html'}
        analyze = lambda *_: {'corresponde': True, 'observacion': 'Contenido correspondiente'}
        result = self.run_links(files, fetch, analyze)
        self.assertEqual(result[0], 'SI')
        self.assertIn('cumplimiento=66.67%', result[1])

    def test_link_progress_reports_download_and_ai_subprocesses(self):
        files = self.files([['Donativo A', 'https://example.org/a']])
        events = []
        result = check_package_links(
            files,
            resolve_format('LOTAIP-19'),
            {'numeral': 'LOTAIP-19'},
            lambda _: {'status': 200, 'body': b'<html>Donativo A</html>', 'content_type': 'text/html'},
            analyze=lambda *_: {'corresponde': True, 'observacion': 'Documento correspondiente'},
            progress_callback=events.append,
        )
        self.assertEqual(result[0], 'SI')
        phases = {event['phase'] for event in events}
        self.assertIn('Descargando verificables', phases)
        self.assertIn('Analizando correspondencia con IA', phases)

    def test_shared_document_is_analyzed_for_each_distinct_record(self):
        files=self.files([['Donativo A','https://example.org/a'],['Donativo B','https://example.org/a']])
        fetch=MagicMock(return_value={'status':200,'body':b'<html>Donativo A</html>','content_type':'text/html'})
        contexts=[]
        def analyze(text,context):
            contexts.append(context)
            return {'corresponde':True,'observacion':'El contenido es un acta de donativo'}
        result = self.run_links(files,fetch,analyze)
        self.assertEqual(result[0],'SI')
        self.assertEqual(len(contexts),2)
        self.assertEqual([context['registro']['Descripcion'] for context in contexts], ['Donativo A', 'Donativo B'])
        self.assertTrue(all('Enlace para descargar el documento mediante el cual se oficializa el regalo o donativo'
                            not in context['registro'] for context in contexts))
        self.assertFalse(any(item.get('analysis_reused') for item in result[2]))
        fetch.assert_called_once()

    def test_default_ai_groups_rows_that_share_a_document(self):
        files=self.files([['Donativo A','https://example.org/a'],['Donativo B','https://example.org/a']])
        fetch=MagicMock(return_value={'status':200,'body':b'<html>Donativo A Donativo B</html>','content_type':'text/html'})
        decisions = [
            {'corresponde':True,'observacion':'Coincide A','evidencias':['Donativo A'],'error':None,'usage':{'total_tokens':120}},
            {'corresponde':True,'observacion':'Coincide B','evidencias':['Donativo B'],'error':None,'usage':{}},
        ]
        with patch('core.lotaip_engine.verificables.analyze_correspondence_batch', return_value=decisions) as batch:
            result = check_package_links(
                files, resolve_format('LOTAIP-19'), {'numeral':'LOTAIP-19'}, fetch,
                ai_budget={'limit':100000,'used':0},
            )
        self.assertEqual(result[0], 'SI')
        batch.assert_called_once()
        self.assertEqual(len(batch.call_args.args[1]), 2)
        self.assertIn('2 registros nuevos en 1 lote(s)', result[1])
        fetch.assert_called_once()

    def test_repository_landing_page_downloads_and_analyzes_linked_pdf(self):
        files=self.files([['Plan institucional','https://repo.example/handle/1/10']])
        landing={
            'url':'https://repo.example/handle/1/10', 'status':200, 'error':None,
            'content_type':'text/html',
            'body':(
                b'<html><head><title>Repositorio EPN</title>'
                b'<meta name="citation_title" content="Plan Estrategico Institucional 2024-2029">'
                b'<meta name="citation_author" content="Escuela Politecnica Nacional">'
                b'<meta name="citation_date" content="2024-01-15">'
                b'<meta name="description" content="Planificacion institucional y objetivos estrategicos">'
                b'<link rel="canonical" href="/handle/1/10"></head>'
                b'<body><h1>Plan Estrategico Institucional 2024-2029</h1>'
                b'<a href="/bitstream/1/10/PEDI_2024_2029.pdf">Visualizar/Abrir</a></body></html>'
            ),
        }
        pdf_url='https://repo.example/bitstream/1/10/PEDI_2024_2029.pdf'
        pdf={'url':pdf_url, 'status':200, 'error':None,
             'content_type':'application/pdf', 'body':b'%PDF-1.7 document'}
        fetch=MagicMock(side_effect=lambda url: pdf if url == pdf_url else landing)
        analyzed={}
        def analyze(text, context):
            analyzed['text'] = text
            analyzed['context'] = context
            return {
                'corresponde':True,'observacion':'El contenido es un plan institucional',
            }
        extracted={'text':'Objetivos, indicadores y metas del Plan Estrategico Institucional',
                   'sha256':'pdf-hash','method':'pymupdf','pages':50,
                   'ocr_pages':[],'sampled_pages':[],'error':None}
        with patch('core.lotaip_engine.verificables.extract_document', return_value=extracted) as extract:
            result=self.run_links(files,fetch,analyze)
        self.assertEqual(result[0],'SI')
        self.assertEqual(fetch.call_args_list, [
            call('https://repo.example/handle/1/10'), call(pdf_url),
        ])
        extract.assert_called_once_with(pdf, deadline=ANY, sample_large=True)
        self.assertIn('indicadores y metas', analyzed['text'])
        self.assertEqual(analyzed['context']['fuente'], 'documento_repositorio')
        self.assertEqual(result[2][0]['final_url'],pdf_url)
        self.assertEqual(result[2][0]['repository_page_url'],landing['url'])
        self.assertEqual(result[2][0]['repository_document_url'],pdf_url)
        self.assertEqual(result[2][0]['page_metadata']['tipo_fuente'],'pagina_repositorio')

    def test_response_content_identifies_pdf_or_html_independently_of_url_extension(self):
        html_url='https://repo.example/registro.pdf'
        html={
            'url':html_url, 'status':200, 'error':None, 'content_type':'application/pdf',
            'body':b'<html><head><title>Ficha del repositorio</title></head><body><h1>Informe enero</h1></body></html>',
        }
        html_context={}
        with patch('core.lotaip_engine.verificables.extract_document') as extract:
            result=self.run_links(
                self.files([['Informe enero',html_url]]),
                MagicMock(return_value=html),
                lambda text, context: html_context.update({'text':json.loads(text),'context':context}) or {
                    'corresponde':True,'observacion':'La ficha coincide con el informe',
                },
            )
        self.assertEqual(result[0],'SI')
        extract.assert_not_called()
        self.assertEqual(html_context['context']['fuente'],'metadatos_json_pagina')

        opaque_url='https://repo.example/download?id=10'
        pdf={
            'url':opaque_url, 'status':200, 'error':None,
            'content_type':'application/octet-stream', 'body':b'%PDF-1.7 document',
        }
        extracted={'text':'Informe enero 2026','sha256':'abc','method':'pymupdf',
                   'pages':1,'ocr_pages':[],'error':None}
        pdf_context={}
        with patch('core.lotaip_engine.verificables.extract_document',return_value=extracted) as extract:
            result=self.run_links(
                self.files([['Informe enero',opaque_url]]),
                MagicMock(return_value=pdf),
                lambda _text, context: pdf_context.update(context) or {
                    'corresponde':True,'observacion':'El documento corresponde al informe',
                },
            )
        self.assertEqual(result[0],'SI')
        extract.assert_called_once_with(pdf, deadline=ANY, sample_large=True)
        self.assertEqual(pdf_context['fuente'],'documento_directo')

    def test_http_403_html_page_is_sent_as_json_to_ai(self):
        url='https://repo.example/handle/1/403'
        forbidden={
            'url':url, 'status':403, 'error':None, 'content_type':'text/html; charset=utf-8',
            'body':(
                b'<html><head>'
                b'<meta name="citation_title" content="Informe mensual de contratacion enero 2026">'
                b'<meta name="citation_date" content="2026-01-31">'
                b'<meta name="description" content="Procesos de contratacion publica del periodo">'
                b'</head><body><h1>Informe mensual de contratacion enero 2026</h1></body></html>'
            ),
        }
        received={}
        def analyze(text, context):
            received['json']=json.loads(text)
            received['context']=context
            return {'corresponde':True,'observacion':'La ficha 403 acredita el informe del literal'}
        with patch('core.lotaip_engine.verificables.extract_document') as extract:
            result=self.run_links(
                self.files([['Informe de contratacion',url]]),
                MagicMock(return_value=forbidden),
                analyze,
            )
        self.assertEqual(result[0],'SI')
        extract.assert_not_called()
        self.assertEqual(received['json']['estado_http'],403)
        self.assertFalse(received['json']['acceso_directo'])
        self.assertEqual(received['json']['titulo'],['Informe mensual de contratacion enero 2026'])
        self.assertEqual(received['context']['fuente'],'metadatos_json_pagina')
        self.assertEqual(result[2][0]['http_status'],403)
        self.assertEqual(result[2][0]['status'],'SI')

    def test_sharepoint_viewer_retries_public_direct_download(self):
        shared='https://tenant-my.sharepoint.com/:b:/g/personal/user/token'
        direct=shared+'?download=1'
        files=self.files([['Normativa',shared]])
        blocked={'url':'https://tenant-my.sharepoint.com/personal/user/_layouts/15/onedrive.aspx',
                 'status':200,'error':None,'content_type':'text/html','body':b'<html>Visor de OneDrive</html>'}
        pdf={'url':'https://tenant-my.sharepoint.com/personal/user/Documents/norma.pdf',
             'status':200,'error':None,'content_type':'application/pdf','body':b'%PDF-document'}
        fetch=MagicMock(side_effect=lambda url: pdf if url == direct else blocked)
        extracted={'text':'Constitucion de la Republica del Ecuador','sha256':'abc',
                   'method':'pymupdf','pages':1,'ocr_pages':[],'error':None}
        with patch('core.lotaip_engine.verificables.extract_document',return_value=extracted):
            result=self.run_links(files,fetch,lambda *_: {
                'corresponde':True,'observacion':'El contenido es normativa nacional',
            })
        self.assertEqual(result[0],'SI')
        self.assertEqual(fetch.call_args_list,[call(shared),call(direct)])
        self.assertEqual(result[2][0]['final_url'],pdf['url'])

    def test_private_sharepoint_link_is_detailed_but_aggregate_is_no(self):
        shared='https://tenant-my.sharepoint.com/:b:/g/personal/user/token'
        files=self.files([['Normativa',shared]])
        fetch=MagicMock(return_value={
            'url':'https://tenant-my.sharepoint.com/_layouts/15/Authenticate.aspx',
            'status':403,'error':None,'content_type':'text/plain','body':b'403 FORBIDDEN',
        })
        result=self.run_links(files,fetch)
        self.assertEqual(result[0], 'NO')
        self.assertEqual(result[2][0]['status'],'PENDIENTE')
        self.assertIn('recuperar automáticamente',result[2][0]['reason'])
        self.assertEqual(fetch.call_count,2)

    def test_sercop_process_page_loads_public_ajax_description(self):
        process=('https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/'
                 'informacionProcesoContratacion2.cpe?idSoliCompra=public-token')
        detail=('https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/'
                'ProcesoContratacion/tab.php?tab=1&id=public-token')
        field='Link para descargar el proceso de contratacion desde el portal de compras publicas'
        files={'Conjunto de datos':{'rows':[[field],[process]]},
               'Diccionario':{'rows':[]},'Metadatos':{'rows':[]}}
        landing={'url':process,'status':200,'error':None,'content_type':'text/html',
                 'body':b'<html><div id="content"></div><script>activeTab(1)</script></html>'}
        panel={'url':detail,'status':200,'error':None,'content_type':'text/html',
               'body':(b'<html>Descripcion del Proceso de Contratacion Entidad: EPN '
                       b'Objeto de Proceso: Adquisicion de generador Codigo: SIE-2024-009 '
                       b'Estado del Proceso: Ejecucion de Contrato</html>')}
        fetch=MagicMock(side_effect=lambda url: panel if url == detail else landing)
        captured=[]
        def analyze(text,context):
            captured.append(text)
            return {'corresponde':True,'observacion':'Ficha de contratación pública'}
        schema={'url_fields':[field],'metadata_url_fields':[],'aliases':{}}
        result=self.run_links(files,fetch,analyze,schema=schema)
        self.assertEqual(result[0],'SI')
        self.assertEqual(fetch.call_args_list,[call(process),call(detail)])
        self.assertIn('Adquisicion de generador',captured[0])
        self.assertEqual(result[2][0]['final_url'],process)
        self.assertEqual(result[2][0]['sercop_detail_url'],detail)

    def test_metadata_9_14_and_absent_23(self):
        for number,count in [(9,1),(14,4)]:
            schema=resolve_format(f'LOTAIP-{number}')
            files={'Metadatos':{'rows':[[f,'https://example.org/a'] for f in schema['metadata_url_fields']]}}
            targets=collect_fields(files,schema)
            self.assertEqual(len(targets),count)
            self.assertTrue(all(t['document']=='Metadatos' and t['column']==2 for t in targets))
        self.assertFalse(NUMERAL_CONFIG[23].verifiables)

    def test_only_declared_mixed_fields_accept_email_without_network_or_ai(self):
        cases = [
            ('LOTAIP-5.22', 'Conjunto de datos',
             'Enlace para descargar el formulario o formato del servicio - Correo electronico para solicitar el servicio'),
            ('LOTAIP-14', 'Metadatos',
             'Enlace para la recepcion de solicitudes de acceso a la informacion publica por via electronica'),
        ]
        for code, document, field in cases:
            with self.subTest(code=code):
                official = resolve_format(code)
                self.assertEqual(official['email_fields'], [field])
                schema = {
                    'url_fields': [field] if document == 'Conjunto de datos' else [],
                    'metadata_url_fields': [field] if document == 'Metadatos' else [],
                    'email_fields': [field],
                    'aliases': {},
                }
                files = {
                    'Conjunto de datos': {'rows': [[field], ['solicitudes@epn.edu.ec']]} if document == 'Conjunto de datos' else {'rows': []},
                    'Metadatos': {'rows': [[field, 'mailto:solicitudes@epn.edu.ec']]} if document == 'Metadatos' else {'rows': []},
                    'Diccionario': {'rows': []},
                }
                fetch, ai = MagicMock(), MagicMock()
                result = self.run_links(files, fetch, ai, schema=schema)
                self.assertEqual(result[0], 'SI')
                self.assertEqual(result[2][0]['email'], 'solicitudes@epn.edu.ec')
                fetch.assert_not_called()
                ai.assert_not_called()

    def test_format_5_22_only_checks_form_or_service_request_field(self):
        selected = ('Enlace para descargar el formulario o formato del servicio - '
                    'Correo electronico para solicitar el servicio')
        schema = resolve_format('LOTAIP-5.22')
        self.assertEqual(schema['url_fields'], [selected])
        self.assertEqual(schema['metadata_url_fields'], [])
        files = {
            'Conjunto de datos': {'rows': [[
                'Denominacion del servicio publico que se brinda',
                'Enlace para acceder al reporte del servicio', selected,
                'Enlace para el servicio por internet en linea',
            ], [
                'Matriculacion', 'texto que no es enlace',
                'https://example.org/formulario.pdf', 'otro valor sin importancia',
            ]]},
            'Metadatos': {'rows': [[
                'Enlace a portal unico de tramites ciudadanos', 'valor no validado',
            ]]},
            'Diccionario': {'rows': []},
        }
        targets = collect_fields(files, schema)
        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0]['field'], selected)
        self.assertEqual(targets[0]['value'], 'https://example.org/formulario.pdf')

    def test_email_is_rejected_outside_mixed_fields_and_invalid_email_is_rejected(self):
        field = 'Enlace para acceder al reporte del servicio'
        files = {'Conjunto de datos': {'rows': [[field], ['servicios@epn.edu.ec']]},
                 'Metadatos': {'rows': []}, 'Diccionario': {'rows': []}}
        schema = {'url_fields': [field], 'metadata_url_fields': [], 'email_fields': [], 'aliases': {}}
        self.assertEqual(self.run_links(files, schema=schema)[0], 'NO')

        schema['email_fields'] = [field]
        files['Conjunto de datos']['rows'][1][0] = 'correo-invalido'
        self.assertEqual(self.run_links(files, schema=schema)[0], 'NO')

    def test_dataset_validator_accepts_email_only_in_declared_mixed_field(self):
        field = ('Enlace para descargar el formulario o formato del servicio - '
                 'Correo electronico para solicitar el servicio')
        schema = {
            'dataset_fields': [field], 'required_fields': [field],
            'date_fields': [], 'money_fields': [], 'url_fields': [field],
            'email_fields': [field], 'aliases': {},
        }
        valid = validate_dataset([[field], ['tramites@epn.edu.ec']], schema, '5-22')
        self.assertFalse([e for e in valid['errors'] if e['code'] == 'INVALID_URL_FIELD'])

        schema['email_fields'] = []
        invalid = validate_dataset([[field], ['tramites@epn.edu.ec']], schema, '5-22')
        self.assertTrue([e for e in invalid['errors'] if e['code'] == 'INVALID_URL_FIELD'])

    def test_organigram_allows_empty_unit_for_hierarchical_rows(self):
        schema = resolve_format('LOTAIP-1.1')
        rows = [[
            'Nivel superior', 'Unidad',
            'Nivel de los Procesos de la Estructura Organica Funcional',
        ], [
            'Consejo de Docencia', '', 'Órgano de Gobierno',
        ]]
        validation = validate_dataset(rows, schema, '1.1')
        self.assertFalse([error for error in validation['errors']
                          if error['code'] == 'EMPTY_REQUIRED_VALUE'])
        self.assertEqual(_required_empty_values({'rows': rows, 'empty': 1}, schema), 0)

    def test_missing_metadata_field_is_failure_even_with_valid_dataset(self):
        schema=resolve_format('LOTAIP-12')
        files={'Conjunto de datos':{'rows':[['Enlace'],['NO APLICA']]},'Diccionario':{'rows':[['Nota','No se realizaron mecanismos de rendición durante este mes.']]}}
        result=self.run_links(files,schema=schema)
        self.assertEqual(result[0],'NO')
        self.assertTrue(any(t.get('missing_field') for t in result[2]))

    def test_retry_reuses_completed_rows_and_continues_pending_rows(self):
        schema=resolve_format('LOTAIP-19')
        files=self.files([['A','https://example.org/a'],['B','https://example.org/b']])
        def fetch(url):
            return {'status':200,'body':b'<html>Acta A</html>','content_type':'text/html'} if url.endswith('/a') else {'status':503}
        ai=MagicMock(return_value={'corresponde':True,'observacion':'Acta correcta'})
        first=check_package_links(files,schema,{'numeral':19},fetch,analyze=ai)
        self.assertEqual(first[0], 'NO')
        retry=MagicMock(return_value={'status':200,'body':b'<html>Acta B</html>','content_type':'text/html'})
        final=check_package_links(files,schema,{'numeral':19},retry,analyze=ai,previous=first[2])
        self.assertEqual(final[0],'SI'); retry.assert_called_once_with('https://example.org/b')

    def test_all_reviewed_sercop_fields_are_in_matrix(self):
        source=Path(__file__).resolve().parents[2]/'tmp/pnt-sercop-2025-12/inspection.json'
        if not source.exists(): self.skipTest('Muestra pública opcional no descargada')
        docs=json.loads(source.read_text(encoding='utf-8'))
        for schema in registry()['formats']:
            files={}
            import csv
            for doc in docs:
                if doc['numeral']!=schema['format_id']: continue
                kind='Metadatos' if 'metadato' in doc['file'].lower() else 'Conjunto de datos' if 'conjunto' in doc['file'].lower() else 'Diccionario'
                raw=(source.parent/doc['local']).read_bytes().decode(doc['encoding'])
                files[kind]={'rows':list(csv.reader(io.StringIO(raw),delimiter=doc['delimiter']))}
            targets=collect_fields(files,schema)
            self.assertFalse([t['field'] for t in targets if t.get('missing_field')],schema['format_id'])


class ExtractionTests(SimpleTestCase):
    def test_remote_xlsx_is_extracted_even_as_octet_stream(self):
        from openpyxl import Workbook
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Auditorías'
        sheet.append(['Informe', 'Estado'])
        sheet.append(['DNA-001-2026', 'Cumplido'])
        stream = io.BytesIO()
        workbook.save(stream)
        workbook.close()

        result = extract_document({
            'body': stream.getvalue(),
            'content_type': 'application/octet-stream',
        })

        self.assertIsNone(result['error'])
        self.assertEqual(result['method'], 'openpyxl')
        self.assertIn('DNA-001-2026', result['text'])

    @override_settings(LOTAIP_MAX_DOCUMENT_PAGES=100, LOTAIP_SEMANTIC_SAMPLE_PAGES=10,
                       LOTAIP_MAX_DOCUMENT_CHARS=100000)
    def test_semantic_review_keeps_all_readable_pages_within_document_limit(self):
        import pymupdf
        with pymupdf.open() as doc:
            for index in range(12):
                doc.new_page().insert_text((50, 50), f'Contenido documental página {index + 1}')
            data = doc.tobytes()
        result = extract_document({'body': data, 'content_type': 'application/pdf'}, sample_large=True)
        self.assertIsNone(result['error'])
        self.assertEqual(result['sampled_pages'], [])
        self.assertIn('página 1', result['text'])
        self.assertIn('página 12', result['text'])

    def test_short_readable_pdf_does_not_require_ocr(self):
        import pymupdf
        for content in ['Acta 123', 'TOTAL 1500', '12345']:
            with self.subTest(content=content):
                with pymupdf.open() as doc:
                    doc.new_page().insert_text((50, 50), content)
                    data = doc.tobytes()
                with patch('pytesseract.image_to_string') as ocr:
                    result = extract_document({'body': data})
                self.assertEqual(result['text'], content)
                self.assertIsNone(result['error'])
                ocr.assert_not_called()

    def test_pdf_with_leading_bytes_is_detected(self):
        import pymupdf
        with pymupdf.open() as doc:
            doc.new_page().insert_text((50, 50), 'Acta 123')
            data = b'\r\n' + doc.tobytes()
        result = extract_document({'body': data, 'content_type': 'application/octet-stream'})
        self.assertEqual(result['text'], 'Acta 123')
        self.assertIsNone(result['error'])

    def test_page_text_extraction_failure_falls_back_to_ocr(self):
        import pymupdf
        with pymupdf.open() as doc:
            doc.new_page()
            data = doc.tobytes()
        with patch.object(pymupdf.Page, 'get_text', side_effect=ValueError('Invalid font')), \
             patch('pytesseract.image_to_string', return_value='Acta de entrega del donativo ABC 123 a la institucion.') as ocr:
            result = extract_document({'body': data})
        self.assertIsNone(result['error'])
        ocr.assert_called_once()

    def test_unreadable_long_text_uses_ocr(self):
        import fitz
        with fitz.open() as doc:
            doc.new_page().insert_text((50, 50), '?' * 80)
            data = doc.tobytes()
        with patch('pytesseract.image_to_string', return_value='Acta de entrega del donativo ABC 123 a la institucion.') as ocr:
            result = extract_document({'body': data})
        ocr.assert_called_once()
        self.assertNotIn('???', result['text'])
        self.assertEqual(result['ocr_pages'][0]['page'], 1)
        self.assertIsNone(result['error'])

    def test_scanned_body_with_digital_header_uses_ocr(self):
        import fitz
        from PIL import Image
        buf = io.BytesIO()
        Image.new('RGB', (500, 700), 'white').save(buf, format='PNG')
        with fitz.open() as doc:
            page = doc.new_page()
            page.insert_image(page.rect, stream=buf.getvalue())
            page.insert_text((50, 50), 'Documento oficial de la institucion para el periodo actual')
            data = doc.tobytes()
        with patch('pytesseract.image_to_string', side_effect=RuntimeError('OCR unavailable')) as ocr:
            result = extract_document({'body': data})
        ocr.assert_called_once()
        self.assertTrue(result['error'])
        self.assertEqual(result['text'], '')
        self.assertEqual(result['method'], 'pymupdf+tesseract')

    def test_digital_pdf_uses_text_without_tesseract(self):
        import fitz
        with fitz.open() as doc:
            page=doc.new_page(); page.insert_text((50,50),'Acta de donativo ABC 123 entregado a la institucion en agosto.')
            data=doc.tobytes()
        with patch('pytesseract.image_to_string') as ocr:
            result=extract_document({'body':data,'content_type':'application/pdf'})
        self.assertIsNone(result['error']); self.assertIn('ABC 123',result['text']); ocr.assert_not_called()

    def test_scanned_pdf_and_image_use_tesseract(self):
        import fitz
        from PIL import Image
        buf=io.BytesIO(); Image.new('RGB',(100,100),'white').save(buf,format='PNG')
        with fitz.open() as doc:
            doc.new_page().insert_image(fitz.Rect(0,0,100,100),stream=buf.getvalue())
            pdf=doc.tobytes()
        with patch('pytesseract.image_to_string',return_value='Acta de entrega Donativo ABC 123') as ocr:
            self.assertEqual(extract_document({'body':pdf,'content_type':'application/pdf'})['method'],'pymupdf+tesseract')
            self.assertEqual(extract_document({'body':buf.getvalue(),'content_type':'image/png'})['method'],'tesseract')
        self.assertEqual(ocr.call_count,2)

    @override_settings(LOTAIP_MAX_DOCUMENT_PAGES=1)
    def test_page_limit_does_not_silently_pass_partial_document(self):
        import fitz
        with fitz.open() as doc:
            doc.new_page(); doc.new_page(); data=doc.tobytes()
        self.assertIsNotNone(extract_document({'body':data,'content_type':'application/pdf'})['error'])

    @override_settings(LOTAIP_MAX_DOCUMENT_PAGES=1, LOTAIP_SEMANTIC_SAMPLE_PAGES=2,
                       LOTAIP_MAX_DOCUMENT_CHARS=10000)
    def test_large_document_can_be_sampled_explicitly_for_semantic_classification(self):
        import fitz
        with fitz.open() as doc:
            first=doc.new_page(); first.insert_text((50,50),'Constitucion de la Republica')
            last=doc.new_page(); last.insert_text((50,50),'Disposiciones finales')
            data=doc.tobytes()
        result=extract_document({'body':data,'content_type':'application/pdf'},sample_large=True)
        self.assertIsNone(result['error'])
        self.assertEqual(result['sampled_pages'],[1,2])
        self.assertIn('Constitucion de la Republica',result['text'])
        self.assertEqual(result['method'],'pymupdf-sampled')


@override_settings(FREELLMAPI_BASE_URL='http://localhost:3001/v1',FREELLMAPI_API_KEY='test-secret',
                   FREELLMAPI_MODEL='auto', FREELLMAPI_RETRY_BASE_SECONDS=0)
class FreeLLMTests(SimpleTestCase):
    @override_settings(FREELLMAPI_MAX_ATTEMPTS=3, FREELLMAPI_RETRY_BASE_SECONDS=0)
    def test_transient_provider_error_is_retried(self):
        import urllib.error
        answer = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({
            'corresponde': True, 'observacion': 'Coincide', 'evidencias': ['Acta ABC 123'],
        })}}]}
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(answer).encode()
        transient = urllib.error.HTTPError(
            'http://localhost:3001/v1/chat/completions', 429, 'rate limit', {}, None,
        )
        opener = MagicMock()
        opener.open.side_effect = [transient, response]

        with patch('urllib.request.build_opener', return_value=opener):
            result = analyze_correspondence('Acta ABC 123', {'campo': 'Acta'})

        self.assertTrue(result['corresponde'])
        self.assertEqual(opener.open.call_count, 2)

    def test_provider_response_diagnostics(self):
        cases = [({}, 'choices'),
                 ({'choices': [{'finish_reason': 'length'}]}, 'límite de salida'),
                 ({'choices': [{'message': {'content': 'No puedo responder'}}]}, 'JSON solicitado'),
                 ({'choices': [{'message': {'content': '[]'}}]}, 'debe ser un objeto')]
        for envelope, reason in cases:
            with self.subTest(reason=reason), self.assertRaisesRegex(InvalidProviderResponse, reason):
                decode_answer(envelope)

    def test_fenced_json_on_one_line_is_supported(self):
        result = decode_answer({'choices': [{'message': {'content': '```json {"corresponde": null} ```'}}]})
        self.assertIsNone(result['corresponde'])

    def test_request_contract_and_quotes_are_validated(self):
        answer={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'corresponde':True,'observacion':'Mismo identificador','evidencias':['Acta ABC 123']})}}]}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(answer).encode()
        opener=MagicMock(); opener.open.return_value=response
        with patch('urllib.request.build_opener',return_value=opener):
            result=analyze_correspondence('Acta ABC 123',{
                'numeral':'LOTAIP-1.1', 'requisito':'Estructura organizacional',
                'campo':'Enlace para consultar el organigrama estructural',
                'institucion':'Institución evaluada', 'anio':2026, 'mes':1,
                'registro':{'id':'123'},
            })
            request=opener.open.call_args.args[0]
            self.assertEqual(request.full_url,'http://localhost:3001/v1/chat/completions')
            self.assertEqual(request.get_header('Authorization'),'Bearer test-secret')
            body=json.loads(request.data)
            sent=json.loads(body['messages'][1]['content'])['contexto']
            self.assertEqual(sent, {
                'numeral':'LOTAIP-1.1', 'requisito':'Estructura organizacional',
                'campo':'Enlace para consultar el organigrama estructural',
                'registro': {'id': '123'},
            })
            self.assertIn('Ignora por completo institución', body['messages'][0]['content'])
            self.assertIn('otra entidad o período', body['messages'][0]['content'])
            self.assertEqual(body['temperature'], 0)
            self.assertEqual(body['max_tokens'], 400)
            self.assertEqual(body['reasoning_effort'], 'none')
            self.assertEqual(body['response_format'], {'type': 'json_object'})
            self.assertTrue(result['corresponde'])
            result=analyze_correspondence('Otro documento',{})
            self.assertIsNone(result['corresponde']); self.assertNotIn('test-secret',str(result))
            self.assertEqual(result['error_code'], 'INVALID_RESPONSE')
            self.assertIn('citas literales verificables', result['error'])

    def test_provider_null_with_recovered_content_becomes_no(self):
        answer={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({
            'corresponde':None,
            'observacion':'El texto no menciona el indicador evaluado.',
            'evidencias':[],
        })}}]}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(answer).encode()
        opener=MagicMock(); opener.open.return_value=response
        with patch('urllib.request.build_opener',return_value=opener):
            result=analyze_correspondence('Reporte general disponible',{
                'campo':'Indicadores y metas',
                'registro':{'Indicador':'Porcentaje de cumplimiento'},
            })
        self.assertIs(result['corresponde'], False)
        self.assertIsNone(result['error'])
        self.assertEqual(result['decision_basis'], 'insufficient_evidence')

    @override_settings(FREELLMAPI_MAX_ATTEMPTS=2, FREELLMAPI_RETRY_BASE_SECONDS=5,
                       FREELLMAPI_MAX_RETRY_SECONDS=120, FREELLMAPI_MIN_INTERVAL_SECONDS=0)
    def test_http_429_honors_retry_after_and_reports_wait(self):
        from urllib.error import HTTPError
        answer={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({
            'corresponde':True, 'observacion':'Coincide', 'evidencias':['Indicador institucional'],
        })}}]}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(answer).encode()
        rate_limited = HTTPError('http://localhost:3001/v1/chat/completions', 429, 'Too Many Requests',
                                 {'Retry-After': '30'}, None)
        opener=MagicMock(); opener.open.side_effect=[rate_limited, response]
        events=[]
        with patch('urllib.request.build_opener',return_value=opener), patch('time.sleep') as sleep:
            result=analyze_correspondence('Indicador institucional', {'campo':'Indicador'}, events.append)
        self.assertTrue(result['corresponde'])
        sleep.assert_called_once_with(30.0)
        self.assertEqual(events[0]['phase'], 'Esperando disponibilidad de IA')
        self.assertIn('HTTP 429', events[0]['detail'])

    @override_settings(FREELLMAPI_MIN_INTERVAL_SECONDS=0, FREELLMAPI_MAX_ATTEMPTS=1,
                       FREELLMAPI_BATCH_MAX_OUTPUT_TOKENS=800)
    def test_batch_analysis_returns_independent_decisions_in_one_request(self):
        answer={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({
            'resultados':[
                {'id':'0','corresponde':True,'observacion':'Coincide A','evidencias':['Indicador Alfa']},
                {'id':'1','corresponde':False,'observacion':'No aparece Beta','evidencias':[]},
            ],
        })}}], 'usage':{'total_tokens':321}, 'model':'batch-test'}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(answer).encode()
        opener=MagicMock(); opener.open.return_value=response
        budget={'limit':10000,'used':0}
        with patch('urllib.request.build_opener',return_value=opener):
            result=analyze_correspondence_batch(
                'Indicador Alfa y contenido general',
                [{'campo':'Indicadores','registro':{'Indicador':'Alfa'}},
                 {'campo':'Indicadores','registro':{'Indicador':'Beta'}}],
                token_budget=budget,
            )
        self.assertEqual([row['corresponde'] for row in result], [True, False])
        self.assertEqual(budget['used'], 321)
        self.assertEqual(opener.open.call_count, 1)
        sent=json.loads(opener.open.call_args.args[0].data)
        user_payload=json.loads(sent['messages'][1]['content'])
        records=user_payload['registros']
        self.assertEqual([record['id'] for record in records], ['0','1'])
        self.assertEqual(user_payload['contexto_comun']['campo'], 'Indicadores')
        self.assertNotIn('contexto', records[0])
        self.assertEqual(records[0]['registro'], {'Indicador':'Alfa'})
        self.assertEqual(sent['max_tokens'], 400)

    @override_settings(FREELLMAPI_MIN_INTERVAL_SECONDS=0, FREELLMAPI_BATCH_MAX_OUTPUT_TOKENS=800)
    def test_batch_analysis_stops_before_exceeding_token_budget(self):
        budget={'limit':10,'used':0}
        with patch('urllib.request.build_opener') as opener:
            result=analyze_correspondence_batch(
                'Documento con contenido suficiente',
                [{'campo':'Indicadores','registro':{'Indicador':'Alfa'}}],
                token_budget=budget,
            )
        self.assertEqual(result[0]['error_code'], 'TOKEN_BUDGET_EXCEEDED')
        self.assertEqual(budget['used'], 0)
        opener.assert_not_called()

    @override_settings(FREELLMAPI_MIN_INTERVAL_SECONDS=0, FREELLMAPI_MAX_ATTEMPTS=2,
                       FREELLMAPI_RETRY_BASE_SECONDS=0)
    def test_batch_http_rejection_releases_reserved_tokens_before_retry(self):
        from urllib.error import HTTPError
        answer={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({
            'resultados':[{'id':'0','corresponde':True,'observacion':'Coincide',
                           'evidencias':['Indicador institucional']}],
        })}}], 'usage':{'total_tokens':123}, 'model':'reliable-test'}
        response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps(answer).encode()
        rate_limited=HTTPError('http://localhost/v1/chat/completions',429,'Too Many Requests',{},None)
        opener=MagicMock(); opener.open.side_effect=[rate_limited,response]
        budget={'limit':10000,'used':0}
        with patch('urllib.request.build_opener',return_value=opener):
            result=analyze_correspondence_batch(
                'Indicador institucional',
                [{'campo':'Indicador','registro':{'Indicador':'institucional'}}],
                token_budget=budget,
            )
        self.assertTrue(result[0]['corresponde'])
        self.assertEqual(budget['used'],123)
        self.assertEqual(opener.open.call_count,2)

    @override_settings(FREELLMAPI_MIN_INTERVAL_SECONDS=0, FREELLMAPI_MAX_ATTEMPTS=1)
    def test_batch_connection_failure_releases_reserved_tokens(self):
        from urllib.error import URLError
        opener=MagicMock(); opener.open.side_effect=URLError('offline')
        budget={'limit':10000,'used':0}
        with patch('urllib.request.build_opener',return_value=opener):
            result=analyze_correspondence_batch(
                'Indicador institucional',
                [{'campo':'Indicador','registro':{'Indicador':'institucional'}}],
                token_budget=budget,
            )
        self.assertIsNone(result[0]['corresponde'])
        self.assertEqual(budget['used'],0)

    def test_semantic_excerpt_limits_input_and_prioritizes_relevant_fragments(self):
        text = ('PORTADA DEL DOCUMENTO\n' + ('contenido general ' * 2000)
                + '\nORGANIGRAMA ESTRUCTURAL DIRECCION GENERAL\n' + ('anexo ' * 2000)
                + '\nFIN DEL DOCUMENTO')
        excerpt = select_semantic_excerpt(text, {
            'requisito': 'Estructura organizacional',
            'campo': 'Enlace para consultar el organigrama estructural',
        }, 4000)
        self.assertLessEqual(len(excerpt), 4000)
        self.assertIn('PORTADA DEL DOCUMENTO', excerpt)
        self.assertIn('ORGANIGRAMA ESTRUCTURAL DIRECCION GENERAL', excerpt)

    def test_semantic_excerpt_uses_most_budget_for_relevant_content_at_1500_chars(self):
        text = ('PORTADA RESOLUCION ADMINISTRATIVA\n'
                + ('texto introductorio sin contenido tematico. ' * 120)
                + '\nLa norma regula el procedimiento interno de adquisiciones institucionales. '
                + 'El reglamento de compras establece autorizaciones y controles especificos.\n'
                + ('pie de pagina repetido sin evidencia. ' * 120))
        excerpt = select_semantic_excerpt(text, {
            'campo': 'Enlace al repositorio de la normativa',
            'registro': {
                'Tipo': 'Reglamento interno',
                'Descripcion': 'Procedimiento interno de adquisiciones y compras',
            },
        }, 1500)
        self.assertLessEqual(len(excerpt), 1500)
        self.assertIn('PORTADA RESOLUCION ADMINISTRATIVA', excerpt)
        self.assertIn('procedimiento interno de adquisiciones institucionales', excerpt)
        self.assertIn('reglamento de compras establece autorizaciones', excerpt)
        self.assertLess(excerpt.count('pie de pagina repetido'), 5)

    def test_semantic_excerpt_uses_record_terms(self):
        text = ('PORTADA\n' + ('contenido general ' * 1500)
                + '\nPORCENTAJE DE CUMPLIMIENTO META CUANTIFICABLE\n' + ('anexo ' * 1500)
                + '\nFIN')
        excerpt = select_semantic_excerpt(text, {
            'campo': 'Enlace de verificación',
            'registro': {'Indicador': 'Porcentaje de cumplimiento', 'Meta': 'Meta cuantificable'},
        }, 3000)
        self.assertIn('PORCENTAJE DE CUMPLIMIENTO META CUANTIFICABLE', excerpt)

    def test_citation_validation_tolerates_accents_case_and_punctuation_only(self):
        answer = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({
            'corresponde': True,
            'observacion': 'Es una estructura organizacional.',
            'evidencias': ['estructura organica direccion general'],
        })}}]}
        response = MagicMock(); response.__enter__.return_value.read.return_value = json.dumps(answer).encode()
        opener = MagicMock(); opener.open.return_value = response
        with patch('urllib.request.build_opener', return_value=opener):
            result = analyze_correspondence('ESTRUCTURA ORGÁNICA – Dirección General', {
                'campo': 'Enlace para consultar el organigrama estructural',
            })
        self.assertTrue(result['corresponde'])

    @override_settings(FREELLMAPI_API_KEY='')
    def test_unconfigured_provider_is_pending_without_network(self):
        with patch('urllib.request.build_opener') as opener:
            self.assertIsNone(analyze_correspondence('Documento',{})['corresponde'])
            opener.assert_not_called()


class ScoreAndPeriodTests(SimpleTestCase):
    def test_bulk_evaluation_stops_before_next_package_when_cancelled(self):
        evidence = SimpleNamespace(
            id=10, university_id=1, period_id=2, indicator_id=3, month=1,
            indicator=SimpleNamespace(code='LOTAIP-1.1'), title='Conjunto de datos',
        )
        queryset = MagicMock()
        queryset.select_related.return_value.order_by.return_value = [evidence]
        with patch('core.services.evaluator.Evidence.objects.filter', return_value=queryset), \
             patch('core.services.evaluator.evaluar_documento') as evaluate:
            messages = [json.loads(line) for line in evaluar_universidad(
                1, 2, month=1, reevaluate=True, should_cancel=lambda: True,
            )]
        self.assertEqual(messages[-1]['status'], 'cancelled')
        evaluate.assert_not_called()

    def test_bulk_evaluation_streams_real_document_subprocesses(self):
        evidence = SimpleNamespace(
            id=10, university_id=1, period_id=2, indicator_id=3, month=1,
            indicator=SimpleNamespace(code='LOTAIP-1.1'), title='Conjunto de datos',
        )
        queryset = MagicMock()
        queryset.select_related.return_value.order_by.return_value = [evidence]
        def evaluate(*_, progress_callback=None, **__):
            progress_callback({'phase':'Procesando documento','detail':'Leyendo CSV','stage_pct':20})
            raise EvaluationCancelled()
        with patch('core.services.evaluator.Evidence.objects.filter', return_value=queryset), \
             patch('core.services.evaluator.evaluar_documento', side_effect=evaluate):
            messages = [json.loads(line) for line in evaluar_universidad(1, 2, month=1, reevaluate=True)]
        progress = [message for message in messages if message.get('status') == 'progress']
        self.assertTrue(any(message.get('phase') == 'Procesando documento' for message in progress))
        self.assertEqual(messages[-1]['status'], 'cancelled')

    def test_dictionary_is_support_only_and_is_not_evaluated(self):
        from core.services.evaluator import evaluar_documento, is_lotaip_dictionary
        evidence = SimpleNamespace(
            id=77, validation_status='aprobado', title='1. Diccionario de datos.csv',
            file_path='enero/1. Diccionario.csv',
        )
        self.assertTrue(is_lotaip_dictionary(evidence))
        with patch('core.services.evaluator.Evidence.objects') as evidence_manager, \
             patch('core.services.evaluator.process_document') as process, \
             patch('core.services.evaluator._save_validation_result') as save:
            evidence_manager.select_related.return_value.get.return_value = evidence
            result = evaluar_documento(evidence.id)
        self.assertTrue(result['excluded_from_evaluation'])
        self.assertIn('no se evalúa', result['message'])
        process.assert_not_called()
        save.assert_not_called()

    def test_verifiables_do_not_depend_on_pnt_inventory_api(self):
        indicator = SimpleNamespace(code='LOTAIP-1.1', name='Estructura organizacional')
        evidence = SimpleNamespace(
            id=1, indicator=indicator, university_id=1, period_id=1,
            indicator_id=1, month=1, period=SimpleNamespace(year=2026),
        )
        details = [{'status': 'SI', 'field': 'Organigrama'}]
        with patch('core.services.lotaip_automatic.check_publication', return_value=(None, 'API PNT no disponible')), \
             patch('core.services.lotaip_automatic.check_deadline', return_value=(None, 'API PNT no disponible')), \
             patch('core.lotaip_engine.verificables.check_package_links', return_value=('SI', 'Contenido comprobado.', details)):
            rubric = evaluate_package(evidence, [], check_online=True, fetch=MagicMock())
        rows = {row['id']: row for row in rubric['criterios']}
        self.assertIsNone(rows['cta']['calificacion'])
        self.assertEqual(rows['verificables']['calificacion'], 'SI')
        self.assertEqual(rows['verificables']['evidencias'], details)

    def test_pnt_deadline_is_checked_before_link_analysis(self):
        events = []
        indicator = SimpleNamespace(code='LOTAIP-1.3', name='Planes y programas')
        evidence = SimpleNamespace(
            id=1, indicator=indicator, university_id=1, period_id=1,
            indicator_id=1, month=1, period=SimpleNamespace(year=2026),
        )
        with patch('core.services.lotaip_automatic.check_publication',
                   side_effect=lambda *_: events.append('publication') or (True, 'Publicado')), \
             patch('core.services.lotaip_automatic.check_deadline',
                   side_effect=lambda *_: events.append('deadline') or (1, 'Dentro del plazo')), \
             patch('core.lotaip_engine.verificables.check_package_links',
                   side_effect=lambda *_args, **_kwargs: events.append('links') or ('SI', 'Contenido comprobado.', [])):
            evaluate_package(evidence, [], check_online=True, fetch=MagicMock())
        self.assertLess(events.index('deadline'), events.index('links'))

    def test_completed_evaluation_is_returned_without_processing_even_on_retry(self):
        from core.services.evaluator import evaluar_documento
        from core.models import IndicatorTemplate
        ev=SimpleNamespace(id=1,validation_status='aprobado',indicator=object(),university_id=1,period_id=1,indicator_id=1,month=8,title='Datos')
        saved=SimpleNamespace(evidence_id=1,lotaip_rubric={
            'content_policy_version':CONTENT_POLICY_VERSION,
            'criterios':[{'aplica':True,'calificacion':1}],
        })
        with patch('core.services.evaluator.Evidence.objects') as evidence_manager, \
             patch('core.services.evaluator.IndicatorTemplate.objects.get',side_effect=IndicatorTemplate.DoesNotExist), \
             patch('core.services.evaluator.EvidenceValidationResult.objects') as result_manager, \
             patch('core.validation_views._validation_result_to_dict',return_value={'evidence_id':1}) as serialize, \
             patch('core.services.evaluator.process_document') as process:
            evidence_manager.select_related.return_value.get.return_value=ev
            result_manager.filter.return_value.select_related.return_value.order_by.return_value.first.return_value=saved
            self.assertTrue(evaluar_documento(1,retry_pending=True)['resultado_guardado'])
            process.assert_not_called(); serialize.assert_called_once_with(saved)

    def test_explicit_reevaluate_bypasses_current_saved_result(self):
        from core.services.evaluator import evaluar_documento
        from core.models import IndicatorTemplate
        evidence = SimpleNamespace(
            id=1, validation_status='aprobado',
            indicator=SimpleNamespace(code='LOTAIP-1.1', name='Estructura organizacional'),
            university=None, university_id=1, period=None, period_id=1,
            indicator_id=1, month=1, title='Metadatos', file_path='Metadatos.csv', file_type='csv',
        )
        saved = SimpleNamespace(evidence_id=1, lotaip_rubric={
            'content_policy_version': CONTENT_POLICY_VERSION,
            'criterios': [{'aplica': True, 'calificacion': 'SI'}],
        })
        with patch('core.services.evaluator.Evidence.objects') as evidence_manager, \
             patch('core.services.evaluator.IndicatorTemplate.objects.get', side_effect=IndicatorTemplate.DoesNotExist), \
             patch('core.services.evaluator.EvidenceValidationResult.objects') as result_manager, \
             patch('core.services.evaluator.process_document', side_effect=RuntimeError('recalculated')) as process, \
             patch('core.services.evaluator.evaluate_international_standards', return_value={}), \
             patch('core.services.evaluator._save_validation_result'):
            evidence_manager.select_related.return_value.get.return_value = evidence
            result_manager.filter.return_value.select_related.return_value.order_by.return_value.first.return_value = saved
            result = evaluar_documento(1, reevaluate=True)
        process.assert_called_once_with(evidence)
        self.assertEqual(result['estado_cumplimiento'], 'ERROR_PROCESAMIENTO')

    def test_evaluation_before_content_only_policy_is_reprocessed(self):
        from core.services.evaluator import evaluar_documento
        from core.models import IndicatorTemplate
        ev=SimpleNamespace(
            id=1, validation_status='aprobado',
            indicator=SimpleNamespace(code='LOTAIP-1.1', name='Estructura organizacional'),
            university=None, university_id=1, period=None, period_id=1,
            indicator_id=1, month=1, title='Metadatos', file_type='csv',
        )
        saved=SimpleNamespace(evidence_id=1,lotaip_rubric={
            'criterios':[{'aplica':True,'calificacion':'NO'}],
        })
        with patch('core.services.evaluator.Evidence.objects') as evidence_manager, \
             patch('core.services.evaluator.IndicatorTemplate.objects.get',side_effect=IndicatorTemplate.DoesNotExist), \
             patch('core.services.evaluator.EvidenceValidationResult.objects') as result_manager, \
             patch('core.services.evaluator.process_document',side_effect=RuntimeError('recalculated')) as process, \
             patch('core.services.evaluator.evaluate_international_standards',return_value={}), \
             patch('core.services.evaluator._save_validation_result'):
            evidence_manager.select_related.return_value.get.return_value=ev
            result_manager.filter.return_value.select_related.return_value.order_by.return_value.first.return_value=saved
            result=evaluar_documento(1)
            process.assert_called_once_with(ev)
            self.assertEqual(result['estado_cumplimiento'],'ERROR_PROCESAMIENTO')

    def test_pending_rp_marks_sita_provisional(self):
        result=summarize([{'criteria':{'cta':{'score':1},'eta':{'score':1},'rp':{'status':'PENDIENTE'},'verificables':{'status':'SI'}}}])
        self.assertEqual(result['SITA_status'],'SITA_PROVISIONAL'); self.assertIsNone(result['RP'])
        self.assertEqual(result['SITA_min'],75); self.assertEqual(result['SITA_max'],100)

    def test_publication_timestamp_uses_ecuador_date(self):
        self.assertEqual(parse_date('2026-09-16T02:00:00Z'),date(2026,9,15))
        self.assertEqual(parse_date('2026/1/31'), date(2026,1,31))

    def test_metadata_matches_data_month_and_rp_next_month(self):
        with TemporaryDirectory() as folder, override_settings(MEDIA_ROOT=folder):
            payload={'Metadatos':'campo,valor\nFECHA ACTUALIZACIÓN DE LA INFORMACIÓN,31/08/2026\n',
                     'Diccionario':'campo,descripcion\nDevengado,Importe devengado\nSaldo por devengar,Saldo pendiente\nCodificado,Total\n',
                     'Conjunto de datos':'Devengado,Saldo por devengar,Codificado\n30,70,100\n'}
            siblings=[]; files=[]
            for kind,content in payload.items():
                path=kind+'.csv'; Path(folder,path).write_text(content,encoding='utf-8')
                url='/media/'+path.replace(' ','%20')
                siblings.append(SimpleNamespace(file_path=path,title=kind,source_url='https://transparencia.dpe.gob.ec'+url))
                files.append({'url_download':url})
            ev=SimpleNamespace(indicator=SimpleNamespace(code='LOTAIP-6'),indicator_id=6,university_id=1,period_id=1,month=8,period=SimpleNamespace(year=2026),university=SimpleNamespace(transparency_url='https://transparencia.dpe.gob.ec/entidades/1365'))
            api=[{'numeral':{'name':'Numeral 6'},'year':2026,'month':8,'published':True,'published_at':'2026-09-15','files':files}]
            rubric=evaluate_package(ev,siblings,check_online=True,fetch=lambda _: {'status':200,'body':json.dumps(api).encode()})
            self.assertEqual(summarize_rubrics([rubric])['puntaje'],100)
