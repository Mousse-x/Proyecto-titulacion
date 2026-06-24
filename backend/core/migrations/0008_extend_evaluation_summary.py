# Generated for cached dashboard summaries

from django.db import migrations, models


def backfill_summary_indices(apps, schema_editor):
    Summary = apps.get_model('core', 'UniversityEvaluationSummary')
    for summary in Summary.objects.all():
        summary.national_index = summary.total_index
        summary.integrated_index = summary.total_index
        summary.evaluated_documents = summary.total_indicators
        summary.save(update_fields=['national_index', 'integrated_index', 'evaluated_documents'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_user_feedback'),
    ]

    operations = [
        migrations.AddField(
            model_name='universityevaluationsummary',
            name='national_index',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name='universityevaluationsummary',
            name='international_index',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name='universityevaluationsummary',
            name='integrated_index',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name='universityevaluationsummary',
            name='international_average_score',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=8),
        ),
        migrations.AddField(
            model_name='universityevaluationsummary',
            name='international_max_score',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=8),
        ),
        migrations.AddField(
            model_name='universityevaluationsummary',
            name='evaluated_documents',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.RunPython(backfill_summary_indices, migrations.RunPython.noop),
    ]
