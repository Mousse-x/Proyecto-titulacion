from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('core', '0011_lotaip_engine_v2')]
    operations = [migrations.CreateModel(name='LotaipLinkReview', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('numeral', models.PositiveSmallIntegerField()), ('format_code', models.CharField(max_length=30)),
        ('row_number', models.PositiveIntegerField(blank=True, null=True)), ('field_name', models.CharField(blank=True, default='', max_length=255)),
        ('original_url', models.TextField()), ('final_url', models.TextField(blank=True, default='')),
        ('http_status', models.PositiveSmallIntegerField(blank=True, null=True)), ('reason_code', models.CharField(max_length=60)),
        ('expected_identifiers', models.JSONField(default=list)), ('automatic_evidence', models.JSONField(default=dict)),
        ('automatic_decision', models.CharField(max_length=40)),
        ('status', models.CharField(choices=[('PENDIENTE_REVISION','Pendiente de revisión'),('APROBADO_MANUALMENTE','Aprobado manualmente'),('RECHAZADO_MANUALMENTE','Rechazado manualmente')], default='PENDIENTE_REVISION', max_length=32)),
        ('reviewed_at', models.DateTimeField(blank=True, null=True)), ('review_observation', models.TextField(blank=True, default='')),
        ('review_evidence', models.JSONField(blank=True, default=dict)), ('created_at', models.DateTimeField(auto_now_add=True)),
        ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to='core.appuser')),
        ('run', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='link_reviews', to='core.lotaipevaluationrun')),
    ], options={'db_table':'lotaip_link_reviews','ordering':['numeral','original_url']})]
