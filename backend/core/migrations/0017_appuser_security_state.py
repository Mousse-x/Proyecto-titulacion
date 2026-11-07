import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Sincroniza el estado de AppUser con la tabla ``core.users``.

    ``role_id`` y ``university_id`` provienen del esquema SQL original y
    ``failed_login_attempts``/``is_locked`` de 0002. Las columnas de sesión y
    2FA se habían añadido manualmente (``add_columns.py``); aquí se crean con
    ``IF NOT EXISTS`` para que la migración sea idempotente en bases existentes.
    """

    dependencies = [
        ('core', '0016_integrated_no_evidence'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='userfeedback',
            options={'managed': True, 'ordering': ['-created_at'], 'verbose_name': 'Feedback de usuario',
                     'verbose_name_plural': 'Feedback de usuarios'},
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE "core"."users"
                            ADD COLUMN IF NOT EXISTS session_id UUID,
                            ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6),
                            ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP WITH TIME ZONE;
                    """,
                    reverse_sql="""
                        ALTER TABLE "core"."users"
                            DROP COLUMN IF EXISTS session_id,
                            DROP COLUMN IF EXISTS otp_code,
                            DROP COLUMN IF EXISTS otp_expiry;
                    """,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='appuser',
                    name='role',
                    field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.DO_NOTHING, to='core.role'),
                    preserve_default=False,
                ),
                migrations.AddField(
                    model_name='appuser',
                    name='university',
                    field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.DO_NOTHING,
                                            to='core.university'),
                ),
                migrations.AddField(
                    model_name='appuser',
                    name='failed_login_attempts',
                    field=models.SmallIntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='appuser',
                    name='is_locked',
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name='appuser',
                    name='session_id',
                    field=models.UUIDField(blank=True, default=uuid.uuid4, null=True),
                ),
                migrations.AddField(
                    model_name='appuser',
                    name='otp_code',
                    field=models.CharField(blank=True, max_length=6, null=True),
                ),
                migrations.AddField(
                    model_name='appuser',
                    name='otp_expiry',
                    field=models.DateTimeField(blank=True, null=True),
                ),
            ],
        ),
    ]
