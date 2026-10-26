from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('core', '0014_integrated_transparency')]

    operations = [
        migrations.CreateModel(
            name='IntegratedSearchCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.PositiveSmallIntegerField(default=0)),
                ('scope', models.CharField(max_length=40)),
                ('query', models.TextField()),
                ('results', models.JSONField(blank=True, default=list)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_search_cache', to='core.evaluationperiod')),
                ('university', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_search_cache', to='core.university')),
            ],
            options={'db_table': '"evaluation"."integrated_search_cache"'},
        ),
        migrations.CreateModel(
            name='IntegratedWebEvidenceCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url_hash', models.CharField(max_length=64)),
                ('url', models.TextField()),
                ('title', models.TextField(blank=True, default='')),
                ('content_type', models.CharField(blank=True, default='', max_length=200)),
                ('located_text', models.TextField()),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('fetched_at', models.DateTimeField(auto_now=True)),
                ('university', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrated_web_evidence_cache', to='core.university')),
            ],
            options={'db_table': '"evaluation"."integrated_web_evidence_cache"'},
        ),
        migrations.AddConstraint(
            model_name='integratedsearchcache',
            constraint=models.UniqueConstraint(fields=('university', 'period', 'month', 'scope'), name='unique_integrated_search_cache'),
        ),
        migrations.AddConstraint(
            model_name='integratedwebevidencecache',
            constraint=models.UniqueConstraint(fields=('university', 'url_hash'), name='unique_integrated_web_evidence_cache'),
        ),
    ]
