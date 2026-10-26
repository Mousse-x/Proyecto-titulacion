"""Mide la coincidencia de la evaluación internacional con una referencia manual.

Uso:
    python manage.py compare_reference ../docs/referencia-internacional/EPN-2026.csv --university EPN --year 2026

El nombre del archivo (SIGLAS-AÑO.csv) indica la universidad y el año si no se pasan.
No consulta buscadores ni el modelo: solo lee los resultados guardados.
"""
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.models import EvaluationPeriod, IntegratedIndicatorResult, University
from core.services.integrated_transparency import ANNUAL_RESULT_MONTH
from core.services.reference_agreement import STATUSES, compare, load_reference


class Command(BaseCommand):
    help = 'Compara los resultados internacionales guardados con un CSV de referencia revisado a mano.'

    def add_arguments(self, parser):
        parser.add_argument('reference', help='CSV con codigo, estado_esperado, tambien_valido, url_evidencia, nota.')
        parser.add_argument('--university', help='Siglas de la universidad (por defecto, del nombre del archivo).')
        parser.add_argument('--year', type=int, help='Año evaluado (por defecto, del nombre del archivo).')
        parser.add_argument('--period-id', type=int, help='Período concreto, si hay varios en el año.')

    def handle(self, *args, **options):
        path = Path(options['reference'])
        if not path.exists():
            raise CommandError(f'No existe {path}.')
        match = re.match(r'^(?P<acronym>.+)-(?P<year>\d{4})$', path.stem)
        acronym = options['university'] or (match and match['acronym'])
        year = options['year'] or (match and int(match['year']))
        if not acronym or not year:
            raise CommandError('Indique --university y --year, o nombre el archivo SIGLAS-AÑO.csv.')
        university = University.objects.filter(acronym__iexact=acronym).first()
        if university is None:
            raise CommandError(f'No hay una universidad con siglas {acronym}.')
        periods = EvaluationPeriod.objects.filter(year=year)
        if options['period_id']:
            periods = periods.filter(id=options['period_id'])
        period = periods.order_by('id').first()
        if period is None:
            raise CommandError(f'No hay un período del año {year}.')

        reference = load_reference(path)
        actual = dict(IntegratedIndicatorResult.objects.filter(
            university=university, period=period, month=ANNUAL_RESULT_MONTH,
            indicator__code__in=list(reference),
        ).values_list('indicator__code', 'status'))
        report = compare(reference, actual)

        self.stdout.write(f'{university.acronym} · {period.period_name} · evaluación anual {year}\n')
        for row in report['rows']:
            mark = 'OK' if row['agrees'] else '--'
            self.stdout.write(f"  {mark} {row['code']}  esperado {row['expected']:<13} app {row['actual']}")
        self.stdout.write('')
        self.stdout.write(f"Acuerdo: {report['agreed']}/{report['total']} ({report['agreement']:.0%})")
        kappa = report['kappa']
        self.stdout.write(f"Kappa de Cohen: {kappa:.2f}" if kappa is not None else 'Kappa de Cohen: sin datos')
        self.stdout.write('\nMatriz de confusión (filas: referencia; columnas: app)')
        self.stdout.write(' ' * 14 + ''.join(f'{status[:9]:>10}' for status in STATUSES))
        for expected in STATUSES:
            counts = ''.join(f"{report['confusion'][(expected, actual)]:>10}" for actual in STATUSES)
            self.stdout.write(f'{expected[:13]:<14}{counts}')
