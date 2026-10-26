import json
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from .models import (
    EvaluationPeriod,
    IntegratedIndicator,
    IntegratedIndicatorResult,
    IntegratedSearchCache,
    IntegratedWebEvidenceCache,
    University,
)
from .services.integrated_transparency import (
    _cached_search,
    _clear_international_run_cache,
    _best_literal_quote,
    _canonicalize_url,
    _exact_literal_quote,
    _filter_documents_by_period,
    _group_query,
    _indicator_query,
    _refined_indicator_query,
    _load_documents,
    _documents_for_indicator,
    _merge_documents,
    _missing_required_elements,
    _non_institutional_kind,
    _site_map_candidates,
    _site_map_rows,
    _annual_period_context,
    _archive_date,
    _is_truncated_legacy_pdf,
    _loose_site_candidate,
    _recalculate_after_annual_change,
    _save_prepared_result,
    ANNUAL_RESULT_MONTH,
    SITE_MAP_SCOPE,
    _normalize_search_results,
    _validate_judgment,
    SEARCH_STRATEGY_VERSION,
    _verified_source_location,
    evaluate_integrated_transparency,
    evaluate_web_indicator,
    recalculate_integrated_index,
    refresh_lotaip_derived_indicators,
)
from .services.evaluator import evaluar_universidad
from .services.transparency_catalog import (
    EVALUATION_ELEMENTS, EVALUATION_NOTES, INDICATORS, SEARCH_DOCUMENT_HINTS, SITE_PATH_HINTS,
)


class IntegratedTransparencyTests(TestCase):
    def setUp(self):
        now = timezone.now()
        self.university = University.objects.create(
            name='Universidad de prueba integrada',
            acronym='UTI-TEST',
            province='Chimborazo',
            city='Riobamba',
            website_url='https://example.edu.ec',
            transparency_url='https://example.edu.ec/transparencia',
            institution_type='Pública',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.period = EvaluationPeriod.objects.create(
            period_name='Prueba 2026',
            year=2026,
            month=1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status='OPEN',
            created_at=now,
        )

    def _create_complete_month(self, month):
        """LOTAIP completo para el mes y evaluación internacional anual completa."""
        indicators = list(IntegratedIndicator.objects.filter(is_active=True))
        IntegratedIndicatorResult.objects.bulk_create([
            IntegratedIndicatorResult(
                university=self.university,
                period=self.period,
                month=month if indicator.classification == 'NACIONAL' else ANNUAL_RESULT_MONTH,
                indicator=indicator,
                score=Decimal('1'),
                status=IntegratedIndicatorResult.Status.COMPLIANT,
                metadata={'search_strategy_version': SEARCH_STRATEGY_VERSION},
            )
            for indicator in indicators
        ])
        return indicators

    def test_catalog_has_documented_classification(self):
        self.assertEqual(len(INDICATORS), 58)
        self.assertEqual(IntegratedIndicator.objects.filter(classification='NACIONAL').count(), 24)
        self.assertEqual(IntegratedIndicator.objects.filter(classification='MIXTO').count(), 22)
        self.assertEqual(IntegratedIndicator.objects.filter(classification='INTERNACIONAL').count(), 12)

    def test_every_international_family_has_elements_and_document_queries(self):
        family_codes = {
            indicator.family_code
            for indicator in IntegratedIndicator.objects.exclude(classification='NACIONAL')
        }
        self.assertTrue(family_codes.issubset(EVALUATION_ELEMENTS))
        self.assertTrue(family_codes.issubset(SEARCH_DOCUMENT_HINTS))
        self.assertTrue(all(len(SEARCH_DOCUMENT_HINTS[code]) == 2 for code in family_codes))
        self.assertTrue(set(EVALUATION_NOTES).issubset(family_codes))
        self.assertTrue(set(SITE_PATH_HINTS).issuperset(family_codes))

    def test_complete_evaluation_produces_single_100_percent_index(self):
        self._create_complete_month(1)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        self.assertEqual(result.index_percent, Decimal('100.00'))
        self.assertFalse(result.is_provisional)
        self.assertEqual(result.coverage['resolved'], 58)
        self.assertEqual(result.coverage['components']['national']['score'], 100.0)
        self.assertEqual(result.coverage['components']['international']['score'], 100.0)

    def test_national_and_international_scores_are_independent(self):
        national = list(IntegratedIndicator.objects.filter(classification='NACIONAL'))
        IntegratedIndicatorResult.objects.bulk_create([
            IntegratedIndicatorResult(
                university=self.university,
                period=self.period,
                month=1,
                indicator=indicator,
                score=Decimal('1'),
                status=IntegratedIndicatorResult.Status.COMPLIANT,
            )
            for indicator in national
        ])
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        components = result.coverage['components']
        self.assertEqual(components['national']['score'], 100.0)
        self.assertFalse(components['national']['is_provisional'])
        self.assertIsNone(components['international']['score'])
        self.assertTrue(components['international']['is_provisional'])
        self.assertIsNone(result.index_percent)
        self.assertTrue(result.is_provisional)

    def test_pending_indicator_does_not_become_zero(self):
        indicators = self._create_complete_month(1)
        IntegratedIndicatorResult.objects.filter(
            university=self.university,
            period=self.period,
            indicator=indicators[0],
        ).update(score=None, status=IntegratedIndicatorResult.Status.PENDING)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        self.assertIsNone(result.index_percent)
        self.assertTrue(result.is_provisional)
        self.assertEqual(result.coverage['pending'], 1)

    def test_missing_web_evidence_scores_zero_without_blocking_the_index(self):
        indicators = self._create_complete_month(1)
        web_indicator = next(row for row in indicators if row.classification != 'NACIONAL')
        IntegratedIndicatorResult.objects.filter(
            university=self.university, period=self.period, month=ANNUAL_RESULT_MONTH, indicator=web_indicator,
        ).update(score=None, status=IntegratedIndicatorResult.Status.NO_EVIDENCE)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        international = result.coverage['components']['international']
        # Lo no publicado puntúa 0: hay nota, pero menor que 100.
        self.assertIsNotNone(result.index_percent)
        self.assertLess(result.index_percent, Decimal('100.00'))
        self.assertFalse(result.is_provisional)
        self.assertEqual(result.coverage['no_evidence'], 1)
        self.assertEqual(result.coverage['pending'], 0)
        self.assertEqual(international['no_evidence'], 1)
        self.assertEqual(international['pending'], 0)
        self.assertLess(international['score'], 100.0)
        # El estado sigue distinguiéndose de un incumplimiento demostrado.
        self.assertFalse(IntegratedIndicatorResult.objects.filter(
            indicator=web_indicator, status=IntegratedIndicatorResult.Status.NON_COMPLIANT,
        ).exists())

    def test_technical_error_still_blocks_the_index(self):
        indicators = self._create_complete_month(1)
        web_indicator = next(row for row in indicators if row.classification != 'NACIONAL')
        IntegratedIndicatorResult.objects.filter(
            university=self.university, month=ANNUAL_RESULT_MONTH, indicator=web_indicator,
        ).update(score=None, status=IntegratedIndicatorResult.Status.TECHNICAL_ERROR)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        self.assertIsNone(result.index_percent)
        self.assertEqual(result.coverage['technical_errors'], 1)

    def test_dimension_weights_are_applied_to_the_unique_index(self):
        self._create_complete_month(1)
        IntegratedIndicatorResult.objects.filter(
            university=self.university,
            period=self.period,
            indicator__dimension__code='D1',
        ).update(score=Decimal('0'), status=IntegratedIndicatorResult.Status.NON_COMPLIANT)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        self.assertEqual(result.index_percent, Decimal('87.50'))

    def test_not_applicable_is_excluded_from_the_denominator(self):
        indicators = self._create_complete_month(1)
        IntegratedIndicatorResult.objects.filter(
            university=self.university,
            period=self.period,
            indicator=indicators[0],
        ).update(score=None, status=IntegratedIndicatorResult.Status.NOT_APPLICABLE)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        self.assertEqual(result.index_percent, Decimal('100.00'))
        self.assertFalse(result.is_provisional)
        self.assertEqual(result.coverage['resolved'], 58)
        self.assertEqual(result.coverage['applicable'], 57)

    def test_monthly_results_are_isolated(self):
        self._create_complete_month(1)
        january = recalculate_integrated_index(self.university.id, self.period.id, 1)
        february = recalculate_integrated_index(self.university.id, self.period.id, 2)
        self.assertEqual(january.index_percent, Decimal('100.00'))
        self.assertIsNone(february.index_percent)
        self.assertNotEqual(january.pk, february.pk)
        # LOTAIP es mensual, pero el componente internacional anual vale para febrero.
        self.assertIsNone(february.coverage['components']['national']['score'])
        self.assertEqual(february.coverage['components']['international']['score'], 100.0)

    def test_old_monthly_international_rows_are_ignored(self):
        self._create_complete_month(1)
        IntegratedIndicatorResult.objects.filter(
            university=self.university, month=ANNUAL_RESULT_MONTH,
        ).update(month=1)
        result = recalculate_integrated_index(self.university.id, self.period.id, 1)
        self.assertIsNone(result.coverage['components']['international']['score'])
        self.assertEqual(result.coverage['components']['national']['score'], 100.0)

    def test_annual_window_covers_the_calendar_year_up_to_today(self):
        ongoing = _annual_period_context(self.period.id, today=date(2026, 10, 25))
        self.assertEqual(ongoing['start_date'], '2026-01-01')
        self.assertEqual(ongoing['cutoff_date'], '2026-10-25')
        self.assertEqual(ongoing['label'], '2026')
        closed = _annual_period_context(self.period.id, today=date(2027, 3, 1))
        self.assertEqual(closed['cutoff_date'], '2026-12-31')

    def test_web_result_is_saved_as_annual_even_from_a_month(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        result = _save_prepared_result(
            self.university, self.period.id, 5,
            {'indicator': indicator, 'documents': [], 'query': 'q', 'metadata': {}},
        )
        self.assertEqual(result.month, ANNUAL_RESULT_MONTH)

    def test_annual_change_refreshes_every_calculated_month(self):
        self._create_complete_month(1)
        IntegratedIndicatorResult.objects.bulk_create([
            IntegratedIndicatorResult(
                university=self.university, period=self.period, month=2, indicator=indicator,
                score=Decimal('1'), status=IntegratedIndicatorResult.Status.COMPLIANT,
            )
            for indicator in IntegratedIndicator.objects.filter(classification='NACIONAL')
        ])
        february = recalculate_integrated_index(self.university.id, self.period.id, 2)
        self.assertEqual(february.index_percent, Decimal('100.00'))
        IntegratedIndicatorResult.objects.filter(
            university=self.university, month=ANNUAL_RESULT_MONTH, indicator__dimension__code='D1',
        ).update(score=Decimal('0'), status=IntegratedIndicatorResult.Status.NON_COMPLIANT)
        _recalculate_after_annual_change(self.university.id, self.period.id, 1)
        february.refresh_from_db()
        self.assertLess(february.index_percent, Decimal('100.00'))

    def test_web_evidence_location_uses_the_verified_page_marker(self):
        location = _verified_source_location(
            '[PÁGINA 1]\nIntroducción\n[PÁGINA 2]\nLa universidad publica sus resultados de investigación.',
            'La universidad publica sus resultados de investigación.',
            'página indicada por la IA',
            'https://example.edu.ec/informe.pdf',
        )
        self.assertEqual(location, 'PÁGINA 2 · https://example.edu.ec/informe.pdf')

    def test_literal_quote_accepts_only_typographic_differences(self):
        text = 'La investigación institucional incluye proyectos, publicaciones y transferencia tecnológica.'
        quote = _exact_literal_quote(
            text,
            'La investigacion institucional incluye proyectos publicaciones y transferencia tecnologica',
        )
        self.assertEqual(quote, text.rstrip('.'))
        self.assertIn(quote, text)

    def test_relevant_literal_quote_is_recovered_from_verified_document(self):
        indicator = IntegratedIndicator.objects.get(code='IND-41')
        text = (
            '[SECCIÓN: Investigación]\nLa Escuela Politécnica Nacional desarrolla proyectos de investigación, '
            'publica artículos científicos, conserva tesis y promueve actividades de transferencia tecnológica. '
            'Esta información se presenta en el repositorio institucional.'
        )
        quote = _best_literal_quote(text, indicator)
        self.assertIn('proyectos de investigación', quote)
        self.assertIn(quote, text)
        self.assertLessEqual(len(quote.split()), 40)

    @patch('core.services.integrated_transparency._search')
    def test_search_results_are_reused_between_evaluations(self, search):
        search.return_value = [{
            'url': 'https://example.edu.ec/transparencia',
            'title': 'Transparencia',
            'snippet': 'Información pública',
        }]
        first, first_hit = _cached_search(
            self.university, self.period.id, 1, 'dimension:D1', 'consulta agrupada', 10,
        )
        second, second_hit = _cached_search(
            self.university, self.period.id, 1, 'dimension:D1', 'consulta agrupada', 10,
        )
        self.assertEqual(first, second)
        self.assertFalse(first_hit)
        self.assertTrue(second_hit)
        self.assertEqual(search.call_count, 1)
        self.assertEqual(IntegratedSearchCache.objects.count(), 1)

    def test_forced_reevaluation_invalidates_results_and_related_caches(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        url = 'https://example.edu.ec/mision'
        IntegratedSearchCache.objects.create(
            university=self.university, period=self.period, month=ANNUAL_RESULT_MONTH,
            scope='indicator:IND-02', query='consulta anterior',
            results=[{'url': url, 'title': 'Misión'}],
            expires_at=timezone.now() + timedelta(hours=1),
        )
        from hashlib import sha256
        IntegratedWebEvidenceCache.objects.create(
            university=self.university,
            url_hash=sha256(url.encode('utf-8')).hexdigest(),
            url=url, title='Misión', content_type='text/html', located_text='texto',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        saved = IntegratedIndicatorResult.objects.create(
            university=self.university, period=self.period, month=ANNUAL_RESULT_MONTH, indicator=indicator,
            score=Decimal('1'), status=IntegratedIndicatorResult.Status.COMPLIANT,
            source_url=url,
        )
        _clear_international_run_cache(
            self.university, self.period.id, 1, [indicator], invalidate_results=True,
        )
        saved.refresh_from_db()
        self.assertEqual(saved.status, IntegratedIndicatorResult.Status.PENDING)
        self.assertIsNone(saved.score)
        self.assertFalse(IntegratedSearchCache.objects.exists())
        self.assertFalse(IntegratedWebEvidenceCache.objects.exists())

    @patch('core.services.integrated_transparency.fetch_public')
    def test_downloaded_page_is_shared_by_related_indicators(self, fetch):
        fetch.return_value = {
            'url': 'https://example.edu.ec/investigacion',
            'status': 200,
            'body': b'<html><h1>Investigacion</h1><p>Proyectos, publicaciones y tesis.</p></html>',
            'content_type': 'text/html',
            'error': None,
        }
        results = [{
            'url': 'https://example.edu.ec/investigacion',
            'title': 'Investigación',
            'snippet': '',
        }]
        first, first_hits = _load_documents(results, self.university)
        second, second_hits = _load_documents(results, self.university)
        self.assertEqual(first[0]['full_text'], second[0]['full_text'])
        self.assertEqual(first_hits, 0)
        self.assertEqual(second_hits, 1)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(IntegratedWebEvidenceCache.objects.count(), 1)

    @patch('core.services.integrated_transparency.fetch_public')
    def test_nul_bytes_are_removed_before_caching_downloaded_text(self, fetch):
        fetch.return_value = {
            'url': 'https://example.edu.ec/mision', 'status': 200,
            'body': b'<html><h1>Mision\x00 institucional</h1><p>Vision e historia institucional.</p></html>',
            'content_type': 'text/html', 'error': None,
        }
        documents, _ = _load_documents([{
            'url': 'https://example.edu.ec/mision',
            'title': 'Misión\x00 y visión',
            'snippet': 'Información\x00 institucional',
        }], self.university)
        cached = IntegratedWebEvidenceCache.objects.get()
        self.assertNotIn('\x00', documents[0]['full_text'])
        self.assertNotIn('\x00', cached.located_text)
        self.assertNotIn('\x00', cached.title)

    @patch('core.services.integrated_transparency.fetch_public')
    def test_official_search_snippet_is_kept_when_direct_download_is_blocked(self, fetch):
        fetch.return_value = {
            'url': 'https://example.edu.ec/mision', 'status': 403,
            'body': b'', 'content_type': 'text/html', 'error': 'HTTP 403',
        }
        snippet = (
            'La Universidad de prueba integrada publica su misión y visión institucional, '
            'su reseña histórica y los valores que orientan sus actividades académicas y científicas.'
        )
        documents, cache_hits = _load_documents([{
            'url': 'https://example.edu.ec/mision', 'title': 'Misión y visión',
            'snippet': snippet, 'search_engine': 'tavily-search',
        }], self.university)
        self.assertEqual(cache_hits, 0)
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0]['retrieval_mode'], 'search_snippet')
        self.assertEqual(documents[0]['direct_fetch_status'], 403)
        self.assertIn('[FRAGMENTO INDEXADO POR: tavily-search]', documents[0]['full_text'])

    @patch('core.services.integrated_transparency.fetch_public')
    def test_external_search_snippet_is_not_used_when_download_is_blocked(self, fetch):
        fetch.return_value = {
            'url': 'https://noticias.example.org/epn', 'status': 403,
            'body': b'', 'content_type': 'text/html', 'error': 'HTTP 403',
        }
        documents, _ = _load_documents([{
            'url': 'https://noticias.example.org/epn', 'title': 'Nota externa',
            'snippet': 'Universidad de prueba integrada ' + ('publica información institucional. ' * 8),
            'search_engine': 'tavily-search',
        }], self.university)
        self.assertEqual(documents, [])

    def test_search_urls_are_canonicalized_and_deduplicated(self):
        rows = _normalize_search_results([
            {'url': 'https://www.example.edu.ec/ruta/?utm_source=x&id=1#seccion', 'title': 'A'},
            {'url': 'https://example.edu.ec/ruta?id=1', 'title': 'Duplicada'},
        ], 10)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['url'], 'https://www.example.edu.ec/ruta?id=1')
        self.assertEqual(
            _canonicalize_url('https://EXAMPLE.edu.ec//ruta/?fbclid=abc'),
            'https://example.edu.ec/ruta',
        )

    def test_search_json_strings_are_sanitized_for_postgresql(self):
        rows = _normalize_search_results([{
            'url': 'https://example.edu.ec/mision',
            'title': 'Misión\x00 institucional',
            'snippet': 'Misión, visión\x00 e historia.',
            'search_engine': 'tavily\x00-search',
        }], 5)
        self.assertNotIn('\x00', json.dumps(rows, ensure_ascii=False))

    def test_queries_search_the_general_web_without_site_restriction(self):
        indicator = IntegratedIndicator.objects.exclude(classification='NACIONAL').first()
        grouped = _group_query(self.university, indicator.dimension, [indicator])
        targeted = _indicator_query(self.university, indicator)
        refined = _refined_indicator_query(self.university, indicator)
        self.assertNotIn('site:', grouped)
        self.assertNotIn('site:', targeted)
        self.assertIn(f'"{self.university.name}"', grouped)
        self.assertIn(f'"{self.university.name}"', targeted)
        self.assertNotIn('"transparencia universitaria"', targeted)
        self.assertNotIn('documento informe resolución resultados', refined)

    def test_document_queries_use_family_specific_document_language(self):
        indicator = IntegratedIndicator.objects.get(code='IND-21')
        targeted = _indicator_query(self.university, indicator)
        refined = _refined_indicator_query(
            self.university, indicator, ['resultados de selección'],
        )
        self.assertIn('concurso de méritos y oposición', targeted)
        self.assertIn('resultados finales', refined)
        self.assertIn('resultados de selección', refined)

    def test_missing_elements_are_detected_before_refined_search(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        missing = _missing_required_elements([{
            'title': 'Misión institucional',
            'content': 'La misión orienta el trabajo de la comunidad universitaria.',
            'snippet': '',
        }], indicator)
        self.assertNotIn('misión', missing)
        self.assertIn('visión', missing)
        self.assertIn('historia institucional', missing)

    def test_future_document_is_excluded_from_selected_month(self):
        accepted, rejected = _filter_documents_by_period([
            {
                'url': 'https://example.edu.ec/wp-content/uploads/2026/04/informe.pdf',
                'title': 'Informe posterior', 'full_text': 'Resultados institucionales',
            },
            {
                'url': 'https://example.edu.ec/wp-content/uploads/2025/12/informe.pdf',
                'title': 'Informe vigente', 'full_text': 'Resultados institucionales',
            },
        ], {'cutoff_date': '2026-01-31'})
        self.assertEqual(len(accepted), 1)
        self.assertEqual(len(rejected), 1)
        self.assertIn('/2025/12/', accepted[0]['url'])
        self.assertIn('/2026/04/', rejected[0]['url'])

    def test_official_source_is_ranked_before_social_source(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        text = 'La misión, visión e historia institucional orientan las actividades de la universidad.'
        documents = _documents_for_indicator([
            {
                'url': 'https://www.youtube.com/watch?v=123', 'title': 'Misión y visión',
                'full_text': text, 'source_kind': 'externa',
            },
            {
                'url': 'https://example.edu.ec/mision', 'title': 'Misión y visión institucional',
                'full_text': text, 'source_kind': 'oficial', 'is_official_source': True,
            },
        ], indicator, limit=2)
        self.assertEqual(documents[0]['url'], 'https://example.edu.ec/mision')
        self.assertGreater(documents[0]['quality_score'], documents[1]['quality_score'])

    def test_site_map_prefers_institutional_sections_over_news_slugs(self):
        rows = [
            {'url': 'https://example.edu.ec/un-hito-en-la-historia-academica-de-la-universidad', 'title': ''},
            {'url': 'https://example.edu.ec/visita-de-la-mision-del-bid', 'title': ''},
            {'url': 'https://example.edu.ec/ingenieria-en-sistemas-de-informacion', 'title': ''},
            {'url': 'https://example.edu.ec/tag/historia', 'title': ''},
            {'url': 'https://example.edu.ec/nosotros', 'title': ''},
            {'url': 'https://example.edu.ec/lotaip-2020', 'title': ''},
        ]
        mission = _site_map_candidates(
            rows, IntegratedIndicator.objects.get(code='IND-02'), website_url=self.university.website_url,
        )
        self.assertEqual(mission[0]['url'], 'https://example.edu.ec/nosotros')
        self.assertTrue(mission[0]['site_path_match'])
        self.assertFalse(any(
            row['site_path_match'] for row in mission
            if 'hito' in row['url'] or 'bid' in row['url'] or '/tag/' in row['url']
        ))

        history = _site_map_candidates(
            rows, IntegratedIndicator.objects.get(code='IND-56'), website_url=self.university.website_url,
        )
        urls = [row['url'] for row in history]
        self.assertIn('https://example.edu.ec/lotaip-2020', urls)
        self.assertNotIn('https://example.edu.ec/ingenieria-en-sistemas-de-informacion', urls)

    def test_legacy_pdf_text_cut_at_30_pages_is_downloaded_again(self):
        legacy = '[PÁGINA 1]\nInicio\n' + '\n'.join(f'[PÁGINA {n}]\ntexto' for n in range(2, 31))
        self.assertTrue(_is_truncated_legacy_pdf(legacy))
        self.assertFalse(_is_truncated_legacy_pdf('[PÁGINAS LEÍDAS: 30 de 30]\n' + legacy))
        self.assertFalse(_is_truncated_legacy_pdf(legacy + '\n[PÁGINA 31]\nmás'))

    def test_loose_site_pages_need_clear_matches_and_no_news_slugs(self):
        self.assertFalse(_loose_site_candidate('https://example.edu.ec/oferta-laboral-analista-academico', 3, 3))
        self.assertFalse(_loose_site_candidate('https://example.edu.ec/la-universidad-promovio-el-dialogo', 3, 3))
        self.assertFalse(_loose_site_candidate(
            'https://example.edu.ec/contratacion-del-servicio-de-una-plataforma-virtual-para-graduados', 3, 3,
        ))
        self.assertFalse(_loose_site_candidate('https://example.edu.ec/gestion-tecnologica', 1, 0))
        self.assertTrue(_loose_site_candidate('https://example.edu.ec/estadisticas-de-matricula', 2, 0))

    def test_archive_is_used_only_for_closed_years(self):
        self.assertIsNone(_archive_date({'cutoff_date': '2026-10-25'}, today=date(2026, 10, 25)))
        self.assertEqual(
            _archive_date({'cutoff_date': '2025-12-31'}, today=date(2026, 10, 25)), date(2025, 12, 31),
        )

    @patch('core.services.integrated_transparency.fetch_public')
    def test_closed_year_reads_the_archived_official_page(self, fetch):
        archive_url = 'https://web.archive.org/web/20251017035705id_/https://example.edu.ec/nosotros/'

        def respond(url):
            if url.startswith('https://web.archive.org/cdx/'):
                return {'status': 200, 'error': None, 'content_type': 'application/json', 'body': json.dumps([
                    ['timestamp', 'original'], ['20251017035705', 'https://example.edu.ec/nosotros/'],
                ]).encode('utf-8')}
            self.assertEqual(url, archive_url)
            return {'status': 200, 'error': None, 'content_type': 'text/html', 'body': (
                '<html><h2>Misión</h2><p>' + 'Formamos profesionales e investigadores. ' * 10 + '</p></html>'
            ).encode('utf-8')}

        fetch.side_effect = respond
        rows = [{'url': 'https://example.edu.ec/nosotros', 'title': 'Nosotros'}]
        documents, _ = _load_documents(rows, self.university, archive_date=date(2025, 12, 31))
        self.assertEqual(documents[0]['url'], 'https://example.edu.ec/nosotros')
        self.assertEqual(documents[0]['retrieval_mode'], 'wayback')
        self.assertTrue(documents[0]['is_official_source'])
        self.assertIn('[COPIA ARCHIVADA: 2025-10-17', documents[0]['full_text'])
        self.assertIn('[FECHA PUBLICACIÓN: 2025-10-17]', documents[0]['full_text'])
        # La copia queda en caché: otro indicador no vuelve a consultar el archivo.
        _load_documents(rows, self.university, archive_date=date(2025, 12, 31))
        self.assertEqual(fetch.call_count, 2)

    @patch('core.services.integrated_transparency.fetch_public')
    def test_missing_archive_falls_back_to_the_live_page_once(self, fetch):
        def respond(url):
            if url.startswith('https://web.archive.org/cdx/'):
                return {'status': 200, 'error': None, 'content_type': 'application/json',
                        'body': b'[["timestamp","original"]]'}
            return {'status': 200, 'error': None, 'content_type': 'text/html', 'body': (
                '<html><p>' + 'Oferta de grado y posgrado vigente. ' * 10 + '</p></html>'
            ).encode('utf-8')}

        fetch.side_effect = respond
        rows = [{'url': 'https://example.edu.ec/oferta-de-grado', 'title': 'Oferta'}]
        documents, _ = _load_documents(rows, self.university, archive_date=date(2025, 12, 31))
        self.assertEqual(documents[0]['retrieval_mode'], 'direct')
        _load_documents(rows, self.university, archive_date=date(2025, 12, 31))
        cdx_calls = [call for call in fetch.call_args_list if call.args[0].startswith('https://web.archive.org/cdx/')]
        self.assertEqual(len(cdx_calls), 1)

    def test_cached_site_map_is_used_while_firecrawl_is_paused(self):
        IntegratedSearchCache.objects.create(
            university=self.university, period=self.period, month=0, scope=SITE_MAP_SCOPE,
            query='firecrawl-map:https://example.edu.ec',
            results=[{'url': 'https://example.edu.ec/nosotros', 'title': 'Nosotros'}],
            expires_at=timezone.now() + timedelta(days=1),
        )
        with patch('core.services.integrated_transparency.search_providers.provider_available', return_value=False):
            rows = _site_map_rows(self.university, self.period.id)
        self.assertEqual([row['url'] for row in rows], ['https://example.edu.ec/nosotros'])

    def test_laws_and_theses_are_not_institutional_evidence_unless_expected(self):
        law = {
            'url': 'https://repositorio.example.edu.ec/bitstream/1/LOES.pdf', 'title': 'LOES',
            'full_text': '[PÁGINA 1]\nLEY ORGÁNICA DE EDUCACIÓN SUPERIOR\nArt. 1.- oferta académica',
        }
        thesis = {
            'url': 'https://biblioteca.example.edu.ec/bitstream/15000/1/CD-1.pdf',
            'title': 'UNIVERSIDAD DE PRUEBA',
            'full_text': '[PÁGINA 1]\nFACULTAD DE CIENCIAS\nPROYECTO PREVIO A LA OBTENCIÓN DEL TÍTULO DE INGENIERO',
        }
        scholarship_rules = {
            'url': 'https://example.edu.ec/wp-content/uploads/reglamento-de-becas.pdf',
            'title': 'Reglamento de becas', 'full_text': '[PÁGINA 1]\nREGLAMENTO DE BECAS',
        }
        offer = IntegratedIndicator.objects.get(code='IND-25')
        self.assertEqual(_non_institutional_kind(law, offer), 'normativa')
        self.assertEqual(_non_institutional_kind(thesis, IntegratedIndicator.objects.get(code='IND-56')), 'tesis')
        self.assertEqual(_non_institutional_kind(thesis, IntegratedIndicator.objects.get(code='IND-41')), '')
        self.assertEqual(_non_institutional_kind(scholarship_rules, IntegratedIndicator.objects.get(code='IND-27')), '')

    def test_theses_are_not_sent_to_the_model_as_evidence(self):
        indicator = IntegratedIndicator.objects.get(code='IND-57')
        thesis = {
            'url': 'https://biblioteca.example.edu.ec/bitstream/1/CD-2.pdf', 'title': 'UNIVERSIDAD DE PRUEBA',
            'source_kind': 'oficial',
            'full_text': '[PÁGINA 1]\nTRABAJO DE INTEGRACIÓN CURRICULAR PRESENTADO COMO REQUISITO PARA LA OBTENCIÓN '
                         'DEL TÍTULO\nIdentificadores consistentes, metadatos e interoperabilidad de datos.',
        }
        self.assertEqual(_documents_for_indicator([thesis], indicator, require_relevance=False), [])

    def test_html_menu_mentioning_regulations_is_not_a_regulation(self):
        page = {
            'url': 'https://example.edu.ec/oferta-de-grado', 'title': 'Oferta de grado',
            'full_text': 'Inicio Reglamentos Estatuto Oferta de grado: Ingeniería Civil, Física, Matemática',
        }
        self.assertEqual(_non_institutional_kind(page, IntegratedIndicator.objects.get(code='IND-25')), '')

    def test_site_section_keeps_a_slot_against_long_regulations(self):
        indicator = IntegratedIndicator.objects.get(code='IND-25')
        vocabulary = (
            'oferta académica vigente carreras programas grado posgrado doctorado '
            'titulaciones niveles organización organizada '
        )
        regulations = [{
            'url': f'https://example.edu.ec/wp-content/uploads/estudios-{number}.pdf',
            'title': f'Normas académicas {number}: oferta académica, carreras y programas',
            'full_text': '[PÁGINA 1]\nDisposiciones generales\n' + vocabulary * 20,
            'source_kind': 'oficial',
        } for number in range(4)]
        section = {
            'url': 'https://example.edu.ec/oferta-de-grado', 'title': 'Tercer nivel',
            'full_text': 'Carreras de grado: Ingeniería Civil, Física, Matemática, Economía.',
            'source_kind': 'oficial', 'site_path_match': True,
        }
        documents = _documents_for_indicator([*regulations, section], indicator, limit=3)
        urls = [row['url'] for row in documents]
        self.assertEqual(len(documents), 4)
        self.assertIn('https://example.edu.ec/oferta-de-grado', urls)
        # La sección se suma: los tres mejores documentos no se pierden.
        self.assertEqual(sum('/estudios-' in url for url in urls), 3)

    def test_short_excerpt_of_site_section_falls_back_to_page_start(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        page = {
            'url': 'https://example.edu.ec/nosotros', 'title': 'Nosotros', 'source_kind': 'oficial',
            'site_path_match': True,
            'full_text': (
                '[SECCIÓN: MISIÓN]\nSomos una institución pública que forma profesionales e investigadores.\n'
                '[SECCIÓN: VISIÓN]\nSer una universidad de excelencia reconocida internacionalmente.\n'
                + 'Galería de fotos del campus. ' * 120
            ),
        }
        documents = _documents_for_indicator([page], indicator, limit=1)
        self.assertIn('Somos una institución pública', documents[0]['content'])
        self.assertIn('Ser una universidad de excelencia', documents[0]['content'])

    def test_site_path_match_survives_when_search_returns_the_same_page(self):
        merged = _merge_documents(
            [{'url': 'https://example.edu.ec/lotaip', 'site_path_match': True}],
            [{'url': 'https://example.edu.ec/lotaip/', 'title': 'LOTAIP'}],
        )
        self.assertEqual(len(merged), 1)
        self.assertTrue(merged[0]['site_path_match'])
        self.assertEqual(merged[0]['title'], 'LOTAIP')

    def test_elements_found_only_in_laws_remain_missing(self):
        indicator = IntegratedIndicator.objects.get(code='IND-25')
        law = {
            'title': 'LOES', 'source_kind': 'oficial', 'non_institutional_kind': 'normativa',
            'content': 'Oferta académica vigente y organización por niveles o titulaciones.',
        }
        self.assertEqual(len(_missing_required_elements([law], indicator)), 2)
        self.assertEqual(_missing_required_elements([{**law, 'non_institutional_kind': ''}], indicator), [])

    def test_unproven_non_compliance_becomes_no_evidence(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        result = _validate_judgment(indicator, [], {
            'status': 'NO_CUMPLE', 'score': 0, 'source_url': '',
            'source_location': '', 'evidence_excerpt': '',
            'justification': 'Los resultados no muestran la misión.',
        })
        self.assertEqual(result['status'], 'SIN_EVIDENCIA')
        self.assertIsNone(result['score'])

    def test_external_source_cannot_prove_non_compliance(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        url = 'https://noticias.example.org/epn'
        quote = 'La institución publicó información general sobre su historia institucional.'
        result = _validate_judgment(indicator, [{
            'url': url, 'title': 'Nota externa', 'full_text': quote,
            'source_kind': 'externa',
        }], {
            'status': 'NO_CUMPLE', 'score': 0, 'source_url': url,
            'source_location': 'cuerpo de la nota', 'evidence_excerpt': quote,
            'justification': 'No contiene todos los elementos.',
        })
        self.assertEqual(result['status'], 'SIN_EVIDENCIA')

    def test_positive_official_quote_cannot_be_used_as_non_compliance(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        url = 'https://example.edu.ec/mision'
        quote = 'La universidad publica su historia institucional para conocimiento de la comunidad.'
        result = _validate_judgment(indicator, [{
            'url': url, 'title': 'Historia institucional', 'full_text': quote,
            'source_kind': 'oficial',
        }], {
            'status': 'NO_CUMPLE', 'score': 0, 'source_url': url,
            'source_location': 'Historia institucional', 'evidence_excerpt': quote,
            'justification': 'No contiene todos los elementos.',
        })
        self.assertEqual(result['status'], 'SIN_EVIDENCIA')

    def test_indexed_snippet_cannot_prove_non_compliance(self):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        url = 'https://example.edu.ec/mision'
        quote = 'La institución no publica todos los antecedentes históricos solicitados.'
        result = _validate_judgment(indicator, [{
            'url': url, 'title': 'Misión institucional', 'full_text': quote,
            'source_kind': 'oficial', 'retrieval_mode': 'search_snippet',
        }], {
            'status': 'NO_CUMPLE', 'score': 0, 'source_url': url,
            'source_location': 'fragmento', 'evidence_excerpt': quote,
            'justification': 'El fragmento indica una ausencia.',
        })
        self.assertEqual(result['status'], 'SIN_EVIDENCIA')

    def test_complete_claim_with_declared_missing_element_becomes_partial(self):
        indicator = IntegratedIndicator.objects.get(code='IND-03')
        url = 'https://example.edu.ec/autoridades'
        quote = 'La rectora es doctora en ingeniería y cuenta con amplia experiencia académica.'
        result = _validate_judgment(indicator, [{
            'url': url, 'title': 'Autoridades', 'full_text': quote,
            'source_kind': 'oficial', 'retrieval_mode': 'direct',
        }], {
            'status': 'CUMPLE', 'score': 1, 'source_url': url,
            'source_location': 'Autoridades', 'evidence_excerpt': quote,
            'covered_elements': ['perfil académico o profesional de las autoridades'],
            'missing_elements': ['contacto institucional de las autoridades'],
            'justification': 'Se publica el perfil, pero no el contacto.',
        })
        self.assertEqual(result['status'], 'PARCIAL')
        self.assertEqual(result['score'], .5)

    def test_complete_claim_without_element_audit_becomes_partial(self):
        indicator = IntegratedIndicator.objects.get(code='IND-05')
        url = 'https://example.edu.ec/resoluciones'
        quote = 'La institución mantiene un repositorio público de resoluciones institucionales.'
        result = _validate_judgment(indicator, [{
            'url': url, 'title': 'Resoluciones', 'full_text': quote,
            'source_kind': 'oficial', 'retrieval_mode': 'direct',
        }], {
            'status': 'CUMPLE', 'score': 1, 'source_url': url,
            'source_location': 'Resoluciones', 'evidence_excerpt': quote,
            'justification': 'Existe un repositorio público.',
        })
        self.assertEqual(result['status'], 'PARCIAL')
        self.assertEqual(result['score'], .5)

    def test_cited_covered_element_cannot_remain_without_evidence(self):
        indicator = IntegratedIndicator.objects.get(code='IND-51')
        url = 'https://example.edu.ec/sugerencias'
        quote = 'La comunidad puede enviar sus propuestas mediante el buzón institucional de sugerencias.'
        result = _validate_judgment(indicator, [{
            'url': url, 'title': 'Buzón de sugerencias', 'full_text': quote,
            'source_kind': 'oficial', 'retrieval_mode': 'direct',
        }], {
            'status': 'SIN_EVIDENCIA', 'score': None, 'source_url': url,
            'source_location': 'Buzón de sugerencias', 'evidence_excerpt': quote,
            'covered_elements': ['canal de propuestas o peticiones'],
            'missing_elements': ['instrucciones de uso', 'trazabilidad pública agregada'],
            'justification': 'Solo se acredita el canal.',
        })
        self.assertEqual(result['status'], 'PARCIAL')
        self.assertEqual(result['score'], .5)

    def test_indexed_snippet_location_is_reported_honestly(self):
        url = 'https://example.edu.ec/mision'
        text = '[FRAGMENTO INDEXADO POR: tavily-search]\nLa universidad publica su misión y visión institucional.'
        location = _verified_source_location(
            text, 'La universidad publica su misión y visión institucional.', 'sección inventada', url,
        )
        self.assertEqual(
            location, f'FRAGMENTO INDEXADO POR: tavily-search · {url}',
        )

    @patch('core.services.integrated_transparency.fetch_public')
    def test_external_source_is_accepted_only_when_it_names_the_university(self, fetch):
        fetch.side_effect = [
            {
                'url': 'https://ministerio.gob.ec/informe', 'status': 200,
                'body': b'<html><p>Universidad de prueba integrada publica sus resultados institucionales.</p></html>',
                'content_type': 'text/html', 'error': None,
            },
            {
                'url': 'https://noticias.example.org/otra', 'status': 200,
                'body': b'<html><p>Resultados generales de otra entidad.</p></html>',
                'content_type': 'text/html', 'error': None,
            },
        ]
        documents, _ = _load_documents([
            {'url': 'https://ministerio.gob.ec/informe', 'title': 'Informe', 'snippet': ''},
            {'url': 'https://noticias.example.org/otra', 'title': 'Otra entidad', 'snippet': ''},
        ], self.university)
        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0]['source_kind'], 'gubernamental')
        self.assertFalse(documents[0]['is_official_source'])

    @patch('core.services.integrated_transparency._cached_search', return_value=([], False))
    @patch('core.services.integrated_transparency._judge')
    def test_indicator_specific_search_runs_even_with_grouped_page(self, judge, search):
        indicator = IntegratedIndicator.objects.get(code='IND-02')
        url = 'https://example.edu.ec/historia'
        document = {
            'url': url,
            'title': 'Misión, visión e historia',
            'snippet': '',
            'full_text': '[SECCIÓN: Identidad]\nMisión, visión e historia institucional de la universidad.',
            'source_kind': 'oficial',
            'is_official_source': True,
        }
        judge.return_value = {
            'status': 'CUMPLE',
            'score': 1,
            'source_url': url,
            'source_title': document['title'],
            'source_location': f'SECCIÓN: Identidad · {url}',
            'evidence_excerpt': 'Misión, visión e historia institucional de la universidad.',
            'justification': 'La página institucional contiene los elementos requeridos.',
        }
        result = evaluate_web_indicator(
            self.university, self.period.id, indicator, 1,
            grouped_documents=[document], grouped_query='consulta de D1',
        )
        search.assert_called_once()
        self.assertEqual(result.status, IntegratedIndicatorResult.Status.COMPLIANT)
        self.assertFalse(result.metadata['targeted_fallback'])

    @patch('core.services.integrated_transparency.evaluate_technical_indicator')
    @patch('core.services.integrated_transparency.sync_national_results')
    @patch('core.services.integrated_transparency.evaluate_web_indicator')
    @patch('core.services.integrated_transparency._cached_search')
    def test_recent_resolved_indicators_are_omitted(self, search, evaluate, sync, technical):
        web_indicators = list(IntegratedIndicator.objects.exclude(classification='NACIONAL'))
        IntegratedIndicatorResult.objects.bulk_create([
            IntegratedIndicatorResult(
                university=self.university,
                period=self.period,
                month=1,
                indicator=indicator,
                score=Decimal('1'),
                status=IntegratedIndicatorResult.Status.COMPLIANT,
                metadata={'search_strategy_version': SEARCH_STRATEGY_VERSION},
            )
            for indicator in web_indicators
        ])
        IntegratedIndicatorResult.objects.filter(university=self.university).update(month=ANNUAL_RESULT_MONTH)
        # Resultados anuales vigentes: evaluar otro mes del mismo año no repite búsquedas.
        evaluate_integrated_transparency(self.university.id, self.period.id, 3)
        search.assert_not_called()
        evaluate.assert_not_called()
        # La interoperabilidad depende de los meses LOTAIP descargados: se mide siempre.
        self.assertEqual([call.args[2].code for call in technical.call_args_list], ['IND-57'])

    @patch('core.services.integrated_transparency.evaluate_technical_indicator')
    def test_lotaip_evaluation_refreshes_interoperability_and_index(self, technical):
        self._create_complete_month(1)
        result = refresh_lotaip_derived_indicators(self.university.id, self.period.id, 1)
        self.assertEqual([call.args[2].code for call in technical.call_args_list], ['IND-57'])
        self.assertEqual(result.month, 1)
        self.assertEqual(result.index_percent, Decimal('100.00'))

    @patch('core.services.integrated_transparency.evaluate_technical_indicator')
    @patch('core.services.integrated_transparency.sync_national_results')
    @patch('core.services.integrated_transparency._save_prepared_result')
    @patch('core.services.integrated_transparency._prepare_web_indicator')
    @patch('core.services.integrated_transparency._load_documents', return_value=([], 0))
    @patch('core.services.integrated_transparency._cached_search', return_value=([], True))
    def test_pending_indicators_do_not_use_broad_dimension_searches(
        self, search, load_documents, prepare, save, sync, technical,
    ):
        prepare.side_effect = lambda university, period_id, indicator, *args, **kwargs: {
            'indicator': indicator, 'documents': [], 'query': 'q', 'metadata': {},
        }
        evaluate_integrated_transparency(self.university.id, self.period.id, 1)
        self.assertEqual(search.call_count, 0)
        # Accesibilidad, interoperabilidad y datos abiertos se miden aparte.
        self.assertEqual(prepare.call_count, 31)
        self.assertEqual(save.call_count, 31)
        self.assertEqual(
            sorted(call.args[2].code for call in technical.call_args_list), ['IND-55', 'IND-57', 'IND-58'],
        )

    @patch('core.services.integrated_transparency.evaluate_technical_indicator')
    @patch('core.services.integrated_transparency.sync_national_results')
    @patch('core.services.integrated_transparency._judge')
    @patch('core.services.integrated_transparency._judge_batch')
    @patch('core.services.integrated_transparency._save_prepared_result')
    @patch('core.services.integrated_transparency._prepare_web_indicator')
    @patch('core.services.integrated_transparency._load_documents', return_value=([], 0))
    @patch('core.services.integrated_transparency._cached_search', return_value=([], True))
    def test_ai_judgments_are_grouped_in_batches(
        self, search, load_documents, prepare, save, judge_batch, judge, sync, technical,
    ):
        prepare.side_effect = lambda university, period_id, indicator, *args, **kwargs: {
            'indicator': indicator,
            'documents': [{'url': 'https://example.edu.ec/a', 'title': 'A', 'content': 'texto'}],
            'query': 'q',
            'metadata': {},
        }
        judge_batch.side_effect = lambda university, batch: {
            item['indicator'].code: {
                'status': 'NO_CUMPLE', 'score': 0, 'source_url': '',
                'source_title': '', 'source_location': '', 'evidence_excerpt': '',
                'justification': 'No acredita el requisito.',
            }
            for item in batch
        }
        evaluate_integrated_transparency(self.university.id, self.period.id, 1)
        self.assertLess(judge_batch.call_count, 34)
        self.assertGreaterEqual(judge_batch.call_count, 8)
        judge.assert_not_called()
        self.assertEqual(save.call_count, 31)

    @patch('core.services.evaluator.evaluar_documento')
    @patch('core.services.evaluator.serialize_integrated_result')
    @patch('core.services.evaluator.evaluate_integrated_transparency')
    def test_international_scope_does_not_evaluate_lotaip_documents(
        self, evaluate_international, serialize, evaluate_document,
    ):
        evaluate_international.return_value = SimpleNamespace()
        serialize.return_value = {
            'index_percent': None,
            'component_scores': {'international': {'total': 34}},
        }
        messages = [json.loads(line) for line in evaluar_universidad(
            self.university.id, self.period.id, month=1, scope='international',
        )]
        evaluate_document.assert_not_called()
        evaluate_international.assert_called_once()
        self.assertEqual(messages[-1]['status'], 'done')
        self.assertEqual(messages[-1]['summary']['scope'], 'international')
