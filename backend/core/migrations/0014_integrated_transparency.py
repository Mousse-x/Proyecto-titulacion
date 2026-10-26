from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


def seed_integrated_catalog(apps, schema_editor):
    from core.services.transparency_catalog import DIMENSIONS, FAMILIES, INDICATORS, lotaip_numerals_for

    Dimension = apps.get_model('core', 'TransparencyDimension')
    Indicator = apps.get_model('core', 'IntegratedIndicator')
    dimensions = {}
    for order, (code, name, description) in enumerate(DIMENSIONS, 1):
        dimension, _ = Dimension.objects.update_or_create(
            code=code,
            defaults={
                'name': name,
                'description': description,
                'weight_percent': Decimal('12.50'),
                'display_order': order,
                'is_active': True,
            },
        )
        dimensions[code] = dimension

    counts = {code: sum(1 for row in INDICATORS if row[1] == code) for code, *_ in DIMENSIONS}
    used = {code: Decimal('0') for code in counts}
    seen = {code: 0 for code in counts}
    for order, (code, dimension_code, classification, family_code, statement) in enumerate(INDICATORS, 1):
        seen[dimension_code] += 1
        if seen[dimension_code] == counts[dimension_code]:
            weight = Decimal('100.00') - used[dimension_code]
        else:
            weight = (Decimal('100.00') / counts[dimension_code]).quantize(Decimal('0.01'))
            used[dimension_code] += weight
        family_name, frameworks = FAMILIES.get(family_code, ('Obligación nacional LOTAIP', ['LOTAIP']))
        Indicator.objects.update_or_create(
            code=code,
            defaults={
                'dimension': dimensions[dimension_code],
                'statement': statement,
                'classification': classification,
                'family_code': family_code,
                'family_name': family_name,
                'traceability': (
                    'LOTAIP · numeral(es) ' + ', '.join(map(str, lotaip_numerals_for(family_code)))
                    if family_code.startswith('CN-')
                    else 'Matriz de trazabilidad · ' + family_code
                ),
                'source_frameworks': frameworks,
                'lotaip_numerals': lotaip_numerals_for(family_code),
                'weight_percent': weight,
                'display_order': order,
                'is_active': True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [('core', '0013_lotaip_run_cancelled')]

    operations = [
        migrations.CreateModel(
            name='TransparencyDimension',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=4, unique=True)),
                ('name', models.CharField(max_length=180)),
                ('description', models.TextField(blank=True, default='')),
                ('weight_percent', models.DecimalField(decimal_places=2, default=12.5, max_digits=5)),
                ('display_order', models.PositiveSmallIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': '"evaluation"."transparency_dimensions"', 'ordering': ['display_order', 'code']},
        ),
        migrations.CreateModel(
            name='IntegratedIndicator',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=10, unique=True)),
                ('statement', models.TextField()),
                ('classification', models.CharField(choices=[('NACIONAL', 'Nacional'), ('MIXTO', 'Mixto'), ('INTERNACIONAL', 'Internacional complementario')], max_length=20)),
                ('family_code', models.CharField(blank=True, default='', max_length=12)),
                ('family_name', models.CharField(blank=True, default='', max_length=250)),
                ('traceability', models.TextField(blank=True, default='')),
                ('source_frameworks', models.JSONField(blank=True, default=list)),
                ('lotaip_numerals', models.JSONField(blank=True, default=list)),
                ('weight_percent', models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ('display_order', models.PositiveSmallIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('dimension', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='indicators', to='core.transparencydimension')),
            ],
            options={'db_table': '"evaluation"."integrated_indicators"', 'ordering': ['display_order', 'code']},
        ),
        migrations.CreateModel(
            name='IntegratedIndicatorResult',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.PositiveSmallIntegerField(default=0)),
                ('score', models.DecimalField(blank=True, decimal_places=4, max_digits=5, null=True)),
                ('status', models.CharField(choices=[('CUMPLE', 'Cumple'), ('PARCIAL', 'Cumple parcialmente'), ('NO_CUMPLE', 'No cumple'), ('NO_APLICA', 'No aplica'), ('PENDIENTE', 'Pendiente'), ('ERROR_TECNICO', 'Error técnico')], default='PENDIENTE', max_length=20)),
                ('source_url', models.TextField(blank=True, default='')),
                ('source_title', models.TextField(blank=True, default='')),
                ('source_location', models.TextField(blank=True, default='')),
                ('evidence_excerpt', models.TextField(blank=True, default='')),
                ('justification', models.TextField(blank=True, default='')),
                ('search_query', models.TextField(blank=True, default='')),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('evaluated_at', models.DateTimeField(auto_now=True)),
                ('indicator', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='results', to='core.integratedindicator')),
                ('period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_indicator_results', to='core.evaluationperiod')),
                ('university', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_indicator_results', to='core.university')),
            ],
            options={'db_table': '"evaluation"."integrated_indicator_results"', 'ordering': ['indicator__display_order']},
        ),
        migrations.CreateModel(
            name='IntegratedTransparencyResult',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.PositiveSmallIntegerField(default=0)),
                ('index_percent', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('is_provisional', models.BooleanField(default=True)),
                ('dimension_scores', models.JSONField(blank=True, default=list)),
                ('coverage', models.JSONField(blank=True, default=dict)),
                ('weights_snapshot', models.JSONField(blank=True, default=dict)),
                ('calculated_at', models.DateTimeField(auto_now=True)),
                ('period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_transparency_results', to='core.evaluationperiod')),
                ('university', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_transparency_results', to='core.university')),
            ],
            options={'db_table': '"evaluation"."integrated_transparency_results"'},
        ),
        migrations.AddConstraint(
            model_name='integratedindicatorresult',
            constraint=models.UniqueConstraint(fields=('university', 'period', 'month', 'indicator'), name='unique_integrated_indicator_result'),
        ),
        migrations.AddConstraint(
            model_name='integratedtransparencyresult',
            constraint=models.UniqueConstraint(fields=('university', 'period', 'month'), name='unique_integrated_transparency_result'),
        ),
        migrations.RunPython(seed_integrated_catalog, migrations.RunPython.noop),
    ]
