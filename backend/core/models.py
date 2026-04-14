from django.db import models


# =========================
# CORE
# =========================

class Role(models.Model):
    name = models.CharField(unique=True, max_length=30)
    description = models.CharField(max_length=150, blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"core"."roles"'
        verbose_name = "Rol"
        verbose_name_plural = "Roles"

    def __str__(self):
        return self.name


class University(models.Model):
    name = models.CharField(max_length=200)
    acronym = models.CharField(unique=True, max_length=30)
    province = models.CharField(max_length=100, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    website_url = models.TextField(blank=True, null=True)
    transparency_url = models.TextField(blank=True, null=True)
    institution_type = models.CharField(max_length=50)
    is_active = models.BooleanField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"universities"."universities"'
        verbose_name = "Universidad"
        verbose_name_plural = "Universidades"

    def __str__(self):
        return f"{self.acronym} - {self.name}"


class AppUser(models.Model):
    role = models.ForeignKey(Role, models.DO_NOTHING)
    university = models.ForeignKey(University, models.DO_NOTHING, blank=True, null=True)
    full_name = models.CharField(max_length=150)
    email = models.TextField()                                              # cifrado Fernet
    email_hash = models.CharField(max_length=64, blank=True, null=True)    # HMAC-SHA256 para búsquedas
    password_hash = models.TextField()
    is_active = models.BooleanField()
    last_login = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"core"."users"'
        verbose_name = "Usuario del sistema"
        verbose_name_plural = "Usuarios del sistema"

    def __str__(self):
        return self.full_name


# =========================
# TRANSPARENCY
# =========================

class Category(models.Model):
    code = models.CharField(unique=True, max_length=20)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, null=True)
    weight_percent = models.DecimalField(max_digits=5, decimal_places=2)
    display_order = models.SmallIntegerField()
    is_active = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"transparency"."categories"'
        verbose_name = "Categoría"
        verbose_name_plural = "Categorías"
        ordering = ["display_order", "name"]

    def __str__(self):
        return f"{self.code} - {self.name}"


class LotaipItem(models.Model):
    item_number = models.SmallIntegerField(unique=True)
    code = models.CharField(unique=True, max_length=20)
    title = models.CharField(max_length=250)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"transparency"."lotaip_items"'
        verbose_name = "Ítem LOTAIP"
        verbose_name_plural = "Ítems LOTAIP"
        ordering = ["item_number"]

    def __str__(self):
        return f"{self.item_number}. {self.code}"


class Indicator(models.Model):
    category = models.ForeignKey(Category, models.DO_NOTHING)
    lotaip_item = models.ForeignKey(LotaipItem, models.DO_NOTHING, blank=True, null=True)
    code = models.CharField(unique=True, max_length=30)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True, null=True)
    evidence_type = models.CharField(max_length=20)
    scoring_type = models.CharField(max_length=20)
    weight_percent = models.DecimalField(max_digits=5, decimal_places=2)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    validation_rule = models.TextField(blank=True, null=True)
    is_required = models.BooleanField()
    display_order = models.SmallIntegerField()
    is_active = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"transparency"."indicators"'
        verbose_name = "Indicador"
        verbose_name_plural = "Indicadores"

    def __str__(self):
        return f"{self.code} - {self.name}"


# =========================
# CATALOGS
# =========================

class InternationalStandard(models.Model):
    organization = models.CharField(max_length=50)
    code = models.CharField(unique=True, max_length=50)
    title = models.CharField(max_length=250)
    description = models.TextField(blank=True, null=True)
    dimension = models.CharField(max_length=120, blank=True, null=True)
    reference_url = models.TextField(blank=True, null=True)
    is_active = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"catalogs"."international_standards"'
        verbose_name = "Estándar internacional"

    def __str__(self):
        return f"{self.organization} - {self.code}"


class IndicatorStandardLink(models.Model):
    indicator = models.ForeignKey(Indicator, models.DO_NOTHING)
    standard = models.ForeignKey(InternationalStandard, models.DO_NOTHING)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = '"catalogs"."indicator_standard_links"'
        unique_together = (("indicator", "standard"),)

    def __str__(self):
        return f"{self.indicator.code} ↔ {self.standard.code}"


# =========================
# EVIDENCE
# =========================

class Evidence(models.Model):
    university = models.ForeignKey(University, models.DO_NOTHING)
    period = models.ForeignKey("EvaluationPeriod", models.DO_NOTHING)
    indicator = models.ForeignKey(Indicator, models.DO_NOTHING)
    uploaded_by_user = models.ForeignKey(AppUser, models.DO_NOTHING, blank=True, null=True)
    title = models.CharField(max_length=200)
    uploaded_at = models.DateTimeField()
    validation_status = models.CharField(max_length=20)

    class Meta:
        managed = False
        db_table = '"evidence"."evidences"'

    def __str__(self):
        return self.title


# =========================
# EVALUATION
# =========================

class EvaluationPeriod(models.Model):
    period_name = models.CharField(max_length=100)
    year = models.SmallIntegerField()
    month = models.SmallIntegerField(blank=True, null=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"evaluation"."evaluation_periods"'

    def __str__(self):
        return self.period_name


class Evaluation(models.Model):
    university = models.ForeignKey(University, models.DO_NOTHING)
    period = models.ForeignKey(EvaluationPeriod, models.DO_NOTHING)
    indicator = models.ForeignKey(Indicator, models.DO_NOTHING)
    evaluator_user = models.ForeignKey(AppUser, models.DO_NOTHING, blank=True, null=True)
    evaluation_status = models.CharField(max_length=20)
    raw_score = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    weighted_score = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"evaluation"."evaluations"'

    def __str__(self):
        return f"{self.university.acronym} - {self.indicator.code}"


class CategoryResult(models.Model):
    university = models.ForeignKey(University, models.DO_NOTHING)
    period = models.ForeignKey(EvaluationPeriod, models.DO_NOTHING)
    category = models.ForeignKey(Category, models.DO_NOTHING)
    score_percent = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        managed = False
        db_table = '"evaluation"."category_results"'


class FinalResult(models.Model):
    university = models.ForeignKey(University, models.DO_NOTHING)
    period = models.ForeignKey(EvaluationPeriod, models.DO_NOTHING)
    total_score_percent = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        managed = False
        db_table = '"evaluation"."final_results"'


class Feedback(models.Model):
    university = models.ForeignKey(University, models.DO_NOTHING)
    period = models.ForeignKey(EvaluationPeriod, models.DO_NOTHING)
    message = models.TextField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = '"evaluation"."feedback"'


# =========================
# AUDIT
# =========================

class AuditLog(models.Model):
    """Registra acciones exitosas en el sistema (audit.logs)"""
    user_id = models.IntegerField(blank=True, null=True)
    module = models.CharField(max_length=100)
    action = models.CharField(max_length=100)
    table_name = models.CharField(max_length=100, blank=True, null=True)
    record_id = models.IntegerField(blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"audit"."logs"'
        verbose_name = "Log de auditoría"
        verbose_name_plural = "Logs de auditoría"

    def __str__(self):
        return f"[{self.module}] {self.action} - user_id={self.user_id}"


class AuditError(models.Model):
    """Registra errores y acciones fallidas (audit.errors)"""
    user_id = models.IntegerField(blank=True, null=True)
    module = models.CharField(max_length=100, blank=True, null=True)
    function_name = models.CharField(max_length=100, blank=True, null=True)
    error_message = models.TextField()
    error_code = models.CharField(max_length=50, blank=True, null=True)
    stack_trace = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = '"audit"."errors"'
        verbose_name = "Error de auditoría"
        verbose_name_plural = "Errores de auditoría"

    def __str__(self):
        return f"[{self.module}/{self.function_name}] {self.error_message[:60]}"