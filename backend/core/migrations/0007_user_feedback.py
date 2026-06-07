# Generated manually for user feedback storage

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_university_logo_path"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserFeedback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_id", models.IntegerField(blank=True, null=True)),
                ("university_id", models.IntegerField(blank=True, null=True)),
                ("user_name", models.CharField(blank=True, max_length=150, null=True)),
                ("user_email", models.TextField(blank=True, null=True)),
                ("user_role", models.CharField(blank=True, max_length=100, null=True)),
                ("feedback_type", models.CharField(choices=[("system", "Sistema"), ("transparency", "Transparencia")], max_length=20)),
                ("subject", models.CharField(max_length=120)),
                ("message", models.TextField()),
                ("status", models.CharField(choices=[("pending", "Pendiente"), ("reviewed", "Revisado")], default="pending", max_length=20)),
                ("email_sent", models.BooleanField(default=False)),
                ("recipient_email", models.CharField(blank=True, max_length=254, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Feedback de usuario",
                "verbose_name_plural": "Feedback de usuarios",
                "db_table": '"core"."user_feedback"',
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="userfeedback",
            index=models.Index(fields=["feedback_type", "status"], name="user_feedback_type_status_idx"),
        ),
        migrations.AddIndex(
            model_name="userfeedback",
            index=models.Index(fields=["created_at"], name="user_feedback_created_idx"),
        ),
    ]
