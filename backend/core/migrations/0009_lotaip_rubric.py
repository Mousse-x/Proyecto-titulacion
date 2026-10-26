from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0008_extend_evaluation_summary")]
    operations = [
        migrations.AddField(model_name="evidencevalidationresult", name="lotaip_rubric",
                            field=models.JSONField(default=dict, blank=True)),
        migrations.AlterField(
            model_name="evidencevalidationresult", name="compliance_status",
            field=models.CharField(max_length=25, default="NO_PRESENTADO", choices=[
                ("CUMPLE", "Cumple"), ("CUMPLE_PARCIALMENTE", "Cumple parcialmente"),
                ("INCOMPLETO", "Incompleto"), ("NO_CUMPLE", "No cumple"),
                ("NO_PRESENTADO", "No presentado"), ("ERROR_PROCESAMIENTO", "Error de procesamiento"),
                ("PENDIENTE_REVISION", "Pendiente de revisión"),
            ])),
    ]
