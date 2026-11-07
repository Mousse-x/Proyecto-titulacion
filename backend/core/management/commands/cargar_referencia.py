"""Carga la referencia documental de los indicadores internacionales y mide los técnicos.

La referencia es el CSV revisado de ``docs/referencia-internacional/<SIGLA>-<año>.csv``
(investigación documental con la URL de evidencia de cada indicador). Reemplaza el
resultado anual (mes 0) de esos indicadores, marcado como ``referencia_documental``.

Los indicadores técnicos de D8 (accesibilidad, interoperabilidad y datos abiertos)
se miden con el motor de la app, que no consume tokens de IA ni de búsqueda: el
mapa del portal se arma con las páginas verificadas en lugar de usar Firecrawl.
"""
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import (
    EvaluationPeriod, IntegratedIndicator, IntegratedIndicatorResult, IntegratedTransparencyResult, University,
)
from core.services import digital_indicators, integrated_transparency as integrated
from core.services.reference_agreement import load_reference

ORIGIN = 'referencia_documental'
SCORES = {'CUMPLE': Decimal('1'), 'PARCIAL': Decimal('0.5'), 'NO_CUMPLE': Decimal('0'), 'SIN_EVIDENCIA': None}
STATUS = {'CUMPLE': IntegratedIndicatorResult.Status.COMPLIANT, 'PARCIAL': IntegratedIndicatorResult.Status.PARTIAL,
          'NO_CUMPLE': IntegratedIndicatorResult.Status.NON_COMPLIANT,
          'SIN_EVIDENCIA': IntegratedIndicatorResult.Status.NO_EVIDENCE}
TECHNICAL_FAMILIES = {'CI-42', 'CI-45', 'CI-46'}
REFERENCE_DIR = Path(settings.BASE_DIR).parent / 'docs' / 'referencia-internacional'


class Command(BaseCommand):
    help = 'Carga la referencia documental internacional de un año y mide los indicadores técnicos de D8.'

    def add_arguments(self, parser):
        parser.add_argument('--anio', type=int, default=2025)
        parser.add_argument('--universidades', nargs='*', help='Siglas; por defecto, las que tienen CSV.')
        parser.add_argument('--sin-tecnicos', action='store_true', help='No medir IND-55, IND-57 ni IND-58.')

    def handle(self, *args, **options):
        year = options['anio']
        period = (EvaluationPeriod.objects.filter(year=year, month__isnull=True).first()
                  or EvaluationPeriod.objects.filter(year=year).first())
        if not period:
            raise CommandError(f'No existe un período para {year}.')
        universities = University.objects.filter(is_active=True).order_by('id')
        if options['universidades']:
            universities = universities.filter(acronym__in=options['universidades'])
        indicators = {i.code: i for i in IntegratedIndicator.objects.filter(is_active=True)}
        for university in universities:
            path = REFERENCE_DIR / f'{university.acronym}-{year}.csv'
            if not path.exists():
                self.stdout.write(f'{university.acronym}: sin referencia ({path.name}).')
                continue
            loaded = self.load(university, period, path, indicators)
            measured = [] if options['sin_tecnicos'] else self.measure(university, period, indicators, path)
            months = sorted(set(IntegratedTransparencyResult.objects.filter(
                university=university, period=period).values_list('month', flat=True)) | {0})
            for month in months:
                integrated.recalculate_integrated_index(university.id, period.id, month)
            annual = IntegratedTransparencyResult.objects.get(university=university, period=period, month=0)
            for result in IntegratedTransparencyResult.objects.filter(university=university, period=period):
                result.coverage = {**(result.coverage or {}), 'origen_internacional': ORIGIN}
                result.save(update_fields=['coverage'])
            self.stdout.write(self.style.SUCCESS(
                f'{university.acronym}: {loaded} indicadores de referencia, técnicos {measured or "omitidos"}; '
                f'índice anual {annual.index_percent} ({"provisional" if annual.is_provisional else "definitivo"}).'))

    def load(self, university, period, path, indicators):
        reference = load_reference(path)
        for code, row in reference.items():
            indicator = indicators.get(code)
            if indicator is None:
                raise CommandError(f'{path.name}: {code} no es un indicador activo.')
            expected = row['expected']
            IntegratedIndicatorResult.objects.update_or_create(
                university=university, period=period, month=0, indicator=indicator,
                defaults={
                    'score': SCORES[expected], 'status': STATUS[expected],
                    'source_url': row['url'], 'source_title': 'Referencia documental' if row['url'] else '',
                    'source_location': '', 'evidence_excerpt': '', 'search_query': '',
                    'justification': f"[Referencia documental] {row['note']}",
                    'metadata': {'origen': ORIGIN, 'evaluation_mode': 'referencia_documental',
                                 'reference_file': path.name, 'also_valid': sorted(row['alternatives']),
                                 'period_cutoff': f'{period.year}-12-31'},
                },
            )
        return len(reference)

    def measure(self, university, period, indicators, path):
        """Mide D8 con el motor real; el mapa del portal sale de las URLs verificadas."""
        if not university.website_url:
            # Sólo en memoria y sólo el dominio: el registro de la universidad no se modifica.
            from urllib.parse import urlsplit
            first = urlsplit(next((u for u in self._urls(path) if '.edu.ec' in u), ''))
            university.website_url = f'{first.scheme}://{first.netloc}' if first.netloc else ''
        site = university.website_url.rstrip('/')
        urls = [site + '/', *self._urls(path), university.transparency_url or '']
        site_rows = [{'url': url} for url in dict.fromkeys(u for u in urls if u)]
        context = integrated._annual_period_context(period.id)
        archive_date = integrated._archive_date(context)
        done = []
        for indicator in indicators.values():
            if indicator.family_code not in TECHNICAL_FAMILIES:
                continue
            # Wayback Machine a veces no responde a tiempo; se repite antes de dejar error técnico.
            for _attempt in range(3):
                try:
                    outcome = digital_indicators.evaluate_technical_indicator(
                        university, period.id, indicator, context, site_rows, integrated._wayback_snapshot,
                        archive_date)
                except Exception as exc:  # una falla técnica no detiene la carga de la referencia
                    outcome = {'status': 'ERROR_TECNICO', 'score': None, 'metadata': {},
                               'justification': f'No fue posible completar la medición técnica: {exc}'}
                if outcome['status'] != 'ERROR_TECNICO':
                    break
            score = outcome.get('score')
            IntegratedIndicatorResult.objects.update_or_create(
                university=university, period=period, month=0, indicator=indicator,
                defaults={
                    'status': IntegratedIndicatorResult.Status(outcome['status']),
                    'score': None if score is None else Decimal(str(score)),
                    'source_url': outcome.get('source_url') or '', 'source_title': outcome.get('source_title') or '',
                    'source_location': outcome.get('source_location') or '',
                    'evidence_excerpt': outcome.get('evidence_excerpt') or '',
                    'justification': outcome.get('justification') or '', 'search_query': '',
                    'metadata': {**outcome.get('metadata', {}), 'origen': 'medicion_tecnica',
                                 'period_cutoff': context['cutoff_date']},
                },
            )
            done.append(f"{indicator.code}={outcome['status']}")
        return done

    @staticmethod
    def _urls(path):
        import csv
        return [row['url_evidencia'].strip() for row in csv.DictReader(open(path, encoding='utf-8-sig'))
                if (row.get('url_evidencia') or '').startswith('http') and not row['url_evidencia'].lower().endswith('.pdf')]
