"""Dataset de demostración: resultados aproximados a los de la app sin consumir tokens de IA ni de búsqueda.

Los documentos LOTAIP descargados de la DPE se evalúan con el motor real (lectura de
CSV, CTA, ETA, plazo y publicación en el PNT, vigencia, sumas, SITA e índice). Sólo se
simula lo que consume tokens o depende de sitios externos lentos:

* la correspondencia documental que decide la IA en los verificables,
* el acceso HTTP a los verificables alojados fuera de la DPE,
* los 34 indicadores internacionales que requieren búsqueda web o mediciones del portal.

Las probabilidades se calibraron con las evaluaciones reales de ESPE y EPN (enero 2026).
Todo registro generado queda marcado con ``origen: simulado`` y ``--borrar`` lo elimina.
"""
import hashlib
import json
import random
from contextlib import ExitStack
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError

from core.models import (
    EvaluationPeriod, Evidence, EvidenceValidationResult, IntegratedIndicator,
    IntegratedIndicatorResult, IntegratedTransparencyResult, University, UniversityEvaluationSummary,
)

ORIGIN = 'simulado'
DPE_HOSTS = {'transparencia.dpe.gob.ec', 'www.dpe.gob.ec', 'dpe.gob.ec'}

# Nivel relativo de cada universidad (desplaza las probabilidades) y bloqueos anti-bots
# observados en sus repositorios. Una universidad nueva recibe un nivel reproducible.
PROFILES = {
    'EPN': {'level': .10, 'challenge': .15},
    'ESPE': {'level': -.05, 'challenge': .02},
    'ESPOCH': {'level': .00, 'challenge': .03},
    'UNL': {'level': .03, 'challenge': .02},
    'UNACH': {'level': -.08, 'challenge': .02},
}
# Puntaje de referencia de cada indicador web: promedio de ESPE y EPN (CUMPLE=1, PARCIAL=.5, otros=0).
WEB_BASE = {
    'IND-02': .5, 'IND-03': .5, 'IND-04': .5, 'IND-05': 1, 'IND-06': .25, 'IND-11': .75, 'IND-12': .5,
    'IND-13': .75, 'IND-14': 0, 'IND-20': 0, 'IND-21': 1, 'IND-22': .75, 'IND-25': 1, 'IND-26': .5,
    'IND-27': .75, 'IND-28': .75, 'IND-29': .5, 'IND-37': .25, 'IND-38': 0, 'IND-39': 0, 'IND-40': .25,
    'IND-41': 1, 'IND-42': .25, 'IND-43': 1, 'IND-44': 1, 'IND-45': .5, 'IND-50': .5, 'IND-51': 0,
    'IND-52': .25, 'IND-53': .5, 'IND-55': .5, 'IND-56': .5, 'IND-57': .25, 'IND-58': 0,
}
TECHNICAL_FAMILIES = {'CI-42', 'CI-45', 'CI-46'}


def _unit(*parts):
    """Número reproducible en [0, 1) a partir de un texto."""
    digest = hashlib.sha256('|'.join(str(p) for p in parts).encode('utf-8')).hexdigest()
    return int(digest[:12], 16) / float(16 ** 12)


class Simulator:
    """Sustituye la red externa y la IA para una universidad y un mes."""

    def __init__(self, university, month, seed, real_fetch):
        profile = PROFILES.get(university.acronym) or {
            'level': round(_unit(seed, university.acronym) * .2 - .1, 3), 'challenge': .03}
        # Mejora leve a lo largo del año para que la evolución mensual sea visible.
        self.level = profile['level'] + .012 * (month - 6.5)
        self.challenge = profile['challenge']
        self.not_found = max(.02, .08 - self.level / 2)
        self.match = min(.95, max(.5, .75 + self.level))
        self.key = f'{seed}:{university.acronym}:{month}'
        self.real_fetch = real_fetch

    def fetch(self, url):
        host = (urlsplit(url).hostname or '').lower()
        if host in DPE_HOSTS:
            return self.real_fetch(url)          # API pública de la DPE: sin tokens, resultado real
        if host == 'web.archive.org':
            return {'url': url, 'status': 200, 'error': None, 'content_type': 'application/json', 'body': b'[]'}
        draw = _unit(self.key, url)
        if draw < self.not_found:
            return {'url': url, 'status': 404, 'error': None, 'content_type': 'text/html', 'body': b'Not Found'}
        if draw < self.not_found + self.challenge:
            return {'url': url, 'status': 403, 'error': None, 'content_type': 'text/html',
                    'body': b'<html><head><title>Just a moment...</title></head></html>'}
        body = (f'<html><head><title>Documento institucional</title></head><body>'
                f'<p>Documento publicado por la institución.</p><p>{url}</p></body></html>')
        return {'url': url, 'status': 200, 'error': None, 'content_type': 'text/html; charset=utf-8',
                'body': body.encode('utf-8')}

    def _decision(self, context):
        record = json.dumps(context.get('registro') or {}, sort_keys=True, ensure_ascii=False)
        matches = _unit(self.key, context.get('numeral'), context.get('campo'), record) < self.match
        return {
            'corresponde': matches, 'error': None, 'usage': {}, 'decision_basis': 'simulado',
            'observacion': ('[Dato simulado] El documento corresponde al registro reportado.' if matches else
                            '[Dato simulado] El documento no corresponde a la información del registro.'),
        }

    def analyze(self, text, context, progress_callback=None):
        return self._decision(context)

    def analyze_batch(self, text, contexts, progress_callback=None, token_budget=None):
        return [self._decision(context) for context in contexts]


class Command(BaseCommand):
    help = 'Genera (o borra con --borrar) un dataset de demostración marcado como simulado.'

    def add_arguments(self, parser):
        parser.add_argument('--anio', type=int, default=2025, help='Año del período evaluado.')
        parser.add_argument('--universidades', nargs='*', help='Siglas; por defecto, todas las activas.')
        parser.add_argument('--meses', nargs='*', type=int, help='Meses a generar; por defecto, los descargados.')
        parser.add_argument('--semilla', default='sistransp-demo', help='Semilla reproducible.')
        parser.add_argument('--borrar', action='store_true', help='Elimina el dataset simulado del período.')

    def handle(self, *args, **options):
        period = (EvaluationPeriod.objects.filter(year=options['anio'], month__isnull=True).first()
                  or EvaluationPeriod.objects.filter(year=options['anio']).first())
        if not period:
            raise CommandError(f"No existe un período para {options['anio']}.")
        universities = University.objects.filter(is_active=True).order_by('id')
        if options['universidades']:
            universities = universities.filter(acronym__in=options['universidades'])
        if options['borrar']:
            return self.delete(period, universities)
        for university in universities:
            self.generate(university, period, options['meses'], options['semilla'])

    # ------------------------------------------------------------------ generación
    def generate(self, university, period, months, seed):
        from core.services.evaluator import evaluar_universidad
        from core.services import integrated_transparency as integrated
        from core.services import lotaip_automatic

        available = sorted(set(Evidence.objects.filter(university=university, period=period)
                               .values_list('month', flat=True)))
        months = [m for m in (months or available) if m in available]
        if not months:
            self.stdout.write(f'{university.acronym}: sin documentos descargados en {period.period_name}.')
            return
        real_fetch = lotaip_automatic.fetch_public
        for month in months:
            simulator = Simulator(university, month, seed, real_fetch)
            with ExitStack() as stack:
                stack.enter_context(patch.object(lotaip_automatic, 'fetch_public', simulator.fetch))
                stack.enter_context(patch('core.lotaip_engine.verificables.analyze_correspondence',
                                          simulator.analyze))
                stack.enter_context(patch('core.lotaip_engine.verificables.analyze_correspondence_batch',
                                          simulator.analyze_batch))
                final = None
                for line in evaluar_universidad(university.id, period.id, month=month,
                                                reevaluate=True, scope='lotaip'):
                    payload = json.loads(line)
                    if payload.get('status') == 'done':
                        final = payload
            sita = ((final or {}).get('summary') or {}).get('sita') or {}
            self.stdout.write(f"{university.acronym} {month:02d}: SITA {sita.get('SITA')} ({sita.get('SITA_status')})")
            self.stdout.flush()
        self._mark_lotaip(university, period)
        self._simulate_web(university, period, seed)
        for month in [*months, None]:
            integrated.sync_national_results(university.id, period.id, month)
        self._mark_integrated(university, period)
        for month in [0, *months]:
            integrated.recalculate_integrated_index(university.id, period.id, month)
        self._mark_index(university, period)
        UniversityEvaluationSummary.objects.filter(university=university, period=period).delete()
        annual = IntegratedTransparencyResult.objects.filter(university=university, period=period, month=0).first()
        self.stdout.write(self.style.SUCCESS(
            f'{university.acronym}: índice integrado anual {annual and annual.index_percent} '
            f"({'provisional' if annual and annual.is_provisional else 'definitivo'})."))

    def _simulate_web(self, university, period, seed):
        profile = PROFILES.get(university.acronym) or {'level': 0}
        website = (university.website_url or f'https://www.{university.acronym.lower()}.edu.ec').rstrip('/')
        rng = random.Random(f'{seed}:{university.acronym}:web')
        # La referencia documental y las mediciones técnicas reales nunca se reemplazan.
        real = set(IntegratedIndicatorResult.objects.filter(
            university=university, period=period, month=0,
            metadata__origen__in=['referencia_documental', 'medicion_tecnica'],
        ).values_list('indicator_id', flat=True))
        for indicator in IntegratedIndicator.objects.filter(is_active=True).exclude(
                classification=IntegratedIndicator.Classification.NATIONAL):
            value = WEB_BASE.get(indicator.code, .5) + 1.5 * profile['level'] + rng.gauss(0, .25)
            if indicator.id in real:
                continue
            if value >= .75:
                status, score = IntegratedIndicatorResult.Status.COMPLIANT, Decimal('1')
            elif value >= .3:
                status, score = IntegratedIndicatorResult.Status.PARTIAL, Decimal('0.5')
            elif rng.random() < .15:
                status, score = IntegratedIndicatorResult.Status.NON_COMPLIANT, Decimal('0')
            else:
                status, score = IntegratedIndicatorResult.Status.NO_EVIDENCE, None
            technical = indicator.family_code in TECHNICAL_FAMILIES
            found = score is not None and score > 0
            IntegratedIndicatorResult.objects.update_or_create(
                university=university, period=period, month=0, indicator=indicator,
                defaults={
                    'score': score, 'status': status,
                    'source_url': f'{website}/transparencia/' if found else '',
                    'source_title': 'Portal institucional (dato simulado)' if found else '',
                    'source_location': '', 'evidence_excerpt': '', 'search_query': '',
                    'justification': (f'[Dato simulado] {indicator.get_classification_display()} '
                                      f'{indicator.family_code}: {status.label.lower()} según la distribución '
                                      'calibrada con evaluaciones reales; no proviene de una búsqueda web.'),
                    'metadata': {'origen': ORIGIN, 'evaluation_mode': 'tecnico' if technical else 'busqueda_web',
                                 'period_cutoff': f'{period.year}-12-31'},
                },
            )

    def _mark_lotaip(self, university, period):
        for result in EvidenceValidationResult.objects.filter(evidence__university=university,
                                                              evidence__period=period):
            result.lotaip_rubric = {**(result.lotaip_rubric or {}), 'origen': ORIGIN}
            result.automatic_result = {**(result.automatic_result or {}), 'origen': ORIGIN}
            result.save(update_fields=['lotaip_rubric', 'automatic_result'])

    def _mark_integrated(self, university, period):
        for result in IntegratedIndicatorResult.objects.filter(university=university, period=period):
            if (result.metadata or {}).get('origen') != ORIGIN:
                result.metadata = {**(result.metadata or {}), 'origen': ORIGIN}
                result.save(update_fields=['metadata'])

    def _mark_index(self, university, period):
        for result in IntegratedTransparencyResult.objects.filter(university=university, period=period):
            result.coverage = {**(result.coverage or {}), 'origen': ORIGIN}
            result.save(update_fields=['coverage'])

    # ------------------------------------------------------------------ borrado
    def delete(self, period, universities):
        for university in universities:
            lotaip = EvidenceValidationResult.objects.filter(
                evidence__university=university, evidence__period=period, lotaip_rubric__origen=ORIGIN).delete()[0]
            indicators = IntegratedIndicatorResult.objects.filter(
                university=university, period=period, metadata__origen=ORIGIN).delete()[0]
            index = IntegratedTransparencyResult.objects.filter(
                university=university, period=period, coverage__origen=ORIGIN).delete()[0]
            UniversityEvaluationSummary.objects.filter(university=university, period=period).delete()
            self.stdout.write(f'{university.acronym}: borrados {lotaip} resultados LOTAIP, '
                              f'{indicators} indicadores integrados y {index} índices simulados.')
