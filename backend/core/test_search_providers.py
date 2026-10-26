import json
import urllib.error
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from .services import integrated_transparency as it
from .services import search_providers as sp
from .services.transparency_catalog import FAMILIES, INDICATORS


KEYS = dict(
    SEARCH_DIRECT_ENABLED=True, TAVILY_API_KEY='t', EXA_API_KEY='e',
    FIRECRAWL_API_KEY='f', LINKUP_API_KEY='l', SERP_API_KEY='s', SERP_PROVIDER='serpapi',
)


class _Response:
    def __init__(self, payload):
        self.body = json.dumps(payload).encode('utf-8')

    def read(self, _limit=-1):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _indicator(code):
    code, _dimension, classification, family, statement = next(row for row in INDICATORS if row[0] == code)
    return SimpleNamespace(
        code=code, statement=statement, classification=classification,
        family_code=family, family_name=FAMILIES[family][0],
    )


@override_settings(**KEYS)
class SearchProviderTests(SimpleTestCase):
    def setUp(self):
        sp.reset_exhausted_providers()
        self.requests = []

    def tearDown(self):
        sp.reset_exhausted_providers()

    def _fake_urlopen(self, request, timeout=None):
        url = request.full_url
        self.requests.append((url, json.loads(request.data) if request.data else None))
        if 'tavily' in url:
            return _Response({'results': [
                {'url': 'https://www.uni.edu.ec/etica', 'title': 'Ética', 'content': 'c', 'raw_content': 'x' * 400},
            ]})
        if 'serpapi' in url:
            return _Response({'organic_results': [
                {'link': 'https://uni.edu.ec/etica/', 'title': 'Ética', 'snippet': 's'},
                {'link': 'https://uni.edu.ec/codigo.pdf', 'title': 'Código'},
            ]})
        if 'exa' in url:
            return _Response({'results': [{'url': 'https://uni.edu.ec/c', 'title': 'C', 'text': 't' * 400}]})
        raise AssertionError(url)

    def test_targeted_search_fuses_engines_and_keeps_full_text(self):
        with patch('urllib.request.urlopen', self._fake_urlopen):
            rows = sp.tiered_search('"Uni" código de ética', 8, 'uni.edu.ec', 'targeted')
        self.assertEqual(rows[0]['url'], 'https://www.uni.edu.ec/etica')
        self.assertEqual(rows[0]['search_engine'], 'tavily+serpapi-google')
        self.assertEqual(len(rows[0]['raw_content']), 400)

    def test_refined_search_restricts_semantic_engine_to_official_domain(self):
        with patch('urllib.request.urlopen', self._fake_urlopen):
            sp.tiered_search('site:uni.edu.ec código', 8, 'uni.edu.ec', 'refined', semantic_query='ética')
        exa = next(body for url, body in self.requests if 'exa' in url)
        tavily = next(body for url, body in self.requests if 'tavily' in url)
        self.assertEqual(exa['includeDomains'], ['uni.edu.ec'])
        self.assertEqual(tavily['include_domains'], ['uni.edu.ec'])
        self.assertNotIn('site:', tavily['query'])

    def test_quota_errors_disable_only_the_exhausted_provider(self):
        def quota(request, timeout=None):
            raise urllib.error.HTTPError(request.full_url, 429, 'quota', {}, None)
        with patch('urllib.request.urlopen', quota):
            with self.assertRaises(sp.ProviderError) as error:
                sp.tiered_search('q', 5, None, 'targeted')
        self.assertNotIn('Bearer', str(error.exception))
        self.assertNotIn('tavily', sp.configured_providers())
        self.assertIn('exa', sp.configured_providers())

    def test_rate_limit_pauses_provider_instead_of_disabling_it(self):
        def rate_limited(request, timeout=None):
            raise urllib.error.HTTPError(request.full_url, 429, 'slow down', {'Retry-After': '30'}, None)
        with patch('urllib.request.urlopen', rate_limited), patch.object(sp.time, 'monotonic', return_value=1000.0):
            with self.assertRaises(sp.ProviderError):
                sp.firecrawl_scrape('https://www.uni.edu.ec/nosotros')
            self.assertNotIn('firecrawl', sp.configured_providers())
        with patch.object(sp.time, 'monotonic', return_value=1031.0):
            self.assertIn('firecrawl', sp.configured_providers())

    def test_payment_required_disables_provider_for_the_process(self):
        def payment(request, timeout=None):
            raise urllib.error.HTTPError(request.full_url, 402, 'payment', {}, None)
        with patch('urllib.request.urlopen', payment):
            with self.assertRaises(sp.ProviderError):
                sp.firecrawl_scrape('https://www.uni.edu.ec/nosotros')
        with patch.object(sp.time, 'monotonic', return_value=10 ** 9):
            self.assertNotIn('firecrawl', sp.configured_providers())

    @override_settings(SEARCH_DIRECT_ENABLED=False)
    def test_direct_search_can_be_disabled(self):
        self.assertFalse(sp.direct_search_enabled())


class EvidenceStrategyTests(SimpleTestCase):
    university = SimpleNamespace(
        name='Universidad X', acronym='UX', website_url='https://www.uni.edu.ec', transparency_url='',
    )

    def test_queries_use_a_single_exact_phrase(self):
        query = it._indicator_query(self.university, _indicator('IND-21'))
        self.assertEqual(query.count('"'), 2)
        refined = it._refined_indicator_query(self.university, _indicator('IND-21'))
        self.assertTrue(refined.startswith('site:uni.edu.ec'))

    def test_site_map_candidates_are_ranked_by_indicator_terms(self):
        rows = [
            {'url': 'https://uni.edu.ec/noticias/2024'},
            {'url': 'https://uni.edu.ec/codigo-de-etica.pdf', 'title': 'Código de ética'},
            {'url': 'https://uni.edu.ec/mision-vision'},
        ]
        etica = it._site_map_candidates(rows, _indicator('IND-11'))
        mision = it._site_map_candidates(rows, _indicator('IND-02'))
        self.assertEqual(etica[0]['url'], 'https://uni.edu.ec/codigo-de-etica.pdf')
        self.assertEqual([row['url'] for row in mision], ['https://uni.edu.ec/mision-vision'])

    def test_gender_variants_count_as_the_same_required_element(self):
        missing = it._missing_required_elements([{
            'title': 'Código de ética', 'snippet': '',
            'content': 'El código de ética y el comité de ética velan por la integridad.',
        }], _indicator('IND-11'))
        self.assertNotIn('código ético o de conducta', missing)

    def test_provider_extract_cannot_prove_non_compliance(self):
        document = {
            'url': 'https://uni.edu.ec/etica', 'title': 'Ética',
            'full_text': 'No existe código de ética publicado',
            'retrieval_mode': 'provider_extract', 'source_kind': 'oficial',
        }
        result = it._validate_judgment(_indicator('IND-11'), [document], {
            'status': 'NO_CUMPLE', 'score': 0, 'source_url': document['url'],
            'source_location': 'inicio', 'evidence_excerpt': 'No existe código de ética publicado',
        })
        self.assertEqual(result['status'], 'SIN_EVIDENCIA')

    def test_markdown_headings_become_citable_sections(self):
        text = it._markdown_to_located_text('# Código de ética\nTexto')
        self.assertIn('[SECCIÓN: Código de ética]', text)

    def test_university_domain_keeps_hosts_that_start_with_w(self):
        self.assertTrue(it._same_university_domain('https://web.uni.edu.ec/a', 'https://web.uni.edu.ec'))
