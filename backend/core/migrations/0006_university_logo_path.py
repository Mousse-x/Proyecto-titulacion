from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0005_alter_appuser_options"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql='ALTER TABLE "universities"."universities" ADD COLUMN IF NOT EXISTS "logo_path" text NULL;',
                    reverse_sql='ALTER TABLE "universities"."universities" DROP COLUMN IF EXISTS "logo_path";',
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="university",
                    name="logo_path",
                    field=models.TextField(blank=True, null=True),
                ),
            ],
        ),
    ]
