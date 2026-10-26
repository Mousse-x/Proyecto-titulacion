import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('core', '0010_add_no_verificable_status')]
    operations = [
        migrations.AddField(model_name='evidencevalidationresult', name='engine_version', field=models.CharField(blank=True, default='', max_length=50)),
        migrations.AddField(model_name='evidencevalidationresult', name='automatic_result', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='evidencevalidationresult', name='manual_override', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='evidencevalidationresult', name='requires_review', field=models.BooleanField(default=False)),
        migrations.CreateModel(name='LotaipEvaluationRun', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('month', models.PositiveSmallIntegerField()),
            ('status', models.CharField(choices=[('PENDIENTE','Pendiente'),('PROCESANDO','Procesando'),('COMPLETADA','Completada'),('COMPLETADA_CON_REVISIONES','Completada con revisiones'),('ERROR','Error')], default='PENDIENTE', max_length=32)),
            ('engine_version', models.CharField(max_length=50)), ('legal_source', models.CharField(max_length=255)),
            ('result', models.JSONField(blank=True, default=dict)), ('error', models.TextField(blank=True, default='')),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('started_at', models.DateTimeField(blank=True, null=True)), ('completed_at', models.DateTimeField(blank=True, null=True)),
            ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.appuser')),
            ('period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lotaip_runs', to='core.evaluationperiod')),
            ('university', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lotaip_runs', to='core.university')),
        ], options={'db_table':'lotaip_evaluation_runs','ordering':['-created_at']}),
        migrations.CreateModel(name='LotaipManualReview', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('criterion', models.CharField(max_length=40)), ('automatic_result', models.JSONField(default=dict)),
            ('decision', models.CharField(choices=[('ACEPTAR','Aceptar cumplimiento'),('RECHAZAR','Rechazar cumplimiento')], max_length=10)),
            ('observation', models.TextField()), ('reviewed_at', models.DateTimeField(auto_now_add=True)),
            ('reviewed_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='core.appuser')),
            ('validation_result', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='manual_reviews', to='core.evidencevalidationresult')),
        ], options={'db_table':'lotaip_manual_reviews','ordering':['-reviewed_at']}),
    ]
