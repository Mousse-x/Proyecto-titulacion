from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0012_lotaip_link_review')]

    operations = [
        migrations.AlterField(
            model_name='lotaipevaluationrun',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDIENTE', 'Pendiente'),
                    ('PROCESANDO', 'Procesando'),
                    ('COMPLETADA', 'Completada'),
                    ('COMPLETADA_CON_REVISIONES', 'Completada con revisiones'),
                    ('CANCELADA', 'Cancelada'),
                    ('ERROR', 'Error'),
                ],
                default='PENDIENTE',
                max_length=32,
            ),
        ),
    ]
