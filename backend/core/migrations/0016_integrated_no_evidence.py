from django.db import migrations, models


def classify_missing_evidence(apps, schema_editor):
    Result = apps.get_model('core', 'IntegratedIndicatorResult')
    for row in Result.objects.filter(status='NO_CUMPLE').iterator():
        metadata = row.metadata or {}
        if metadata.get('documents_analyzed') == 0 or row.justification.startswith('La búsqueda web no encontró'):
            row.status = 'SIN_EVIDENCIA'
            row.score = None
            row.save(update_fields=['status', 'score'])


class Migration(migrations.Migration):
    dependencies = [('core', '0015_integrated_web_cache')]

    operations = [
        migrations.AlterField(
            model_name='integratedindicatorresult',
            name='status',
            field=models.CharField(
                choices=[
                    ('CUMPLE', 'Cumple'),
                    ('PARCIAL', 'Cumple parcialmente'),
                    ('NO_CUMPLE', 'No cumple'),
                    ('NO_APLICA', 'No aplica'),
                    ('SIN_EVIDENCIA', 'Sin evidencia verificable'),
                    ('PENDIENTE', 'Pendiente'),
                    ('ERROR_TECNICO', 'Error técnico'),
                ],
                default='PENDIENTE',
                max_length=20,
            ),
        ),
        migrations.RunPython(classify_missing_evidence, migrations.RunPython.noop),
    ]
