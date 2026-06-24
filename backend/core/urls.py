from django.urls import path
from .views import (
    register_user, login_user,
    list_users, user_detail,
    list_universities, university_detail,
    list_indicators, indicator_detail, indicator_template_view,
    system_stats,
    list_roles,
    list_audit_errors,
    list_audit_logs,
    request_password_reset,
    confirm_password_reset,
    verify_otp,
    submit_feedback,
    list_user_feedback,
    user_feedback_detail,
    refresh_token,
    auth_status,
)
from .evidence_views import (
    list_evidences, evidence_detail, download_evidence, scrape_espoch,
    bulk_update_evidences, bulk_delete_evidences,
)
from .validation_views import (
    validate_document, validate_all_university,
    get_validation_result, get_compliance_summary, get_observations,
    get_latest_validation_period,
)

urlpatterns = [
    # Auth
    path("auth/register/", register_user,   name="register_user"),
    path("auth/login/",    login_user,       name="login_user"),
    path("auth/2fa/verify/", verify_otp,      name="verify_otp"),
    path("auth/refresh/",  refresh_token,    name="refresh_token"),
    path("auth/status/",   auth_status,      name="auth_status"),
    path("auth/password-reset/request/",             request_password_reset, name="password_reset_request"),
    path("auth/password-reset/confirm/<str:token>/", confirm_password_reset, name="password_reset_confirm"),

    # Users
    path("users/",               list_users,  name="list_users"),
    path("users/<int:user_id>/", user_detail, name="user_detail"),

    # Universities
    path("universities/",               list_universities, name="list_universities"),
    path("universities/<int:univ_id>/", university_detail, name="university_detail"),

    # Indicators
    path("indicators/", list_indicators, name="list_indicators"),
    path("indicators/<int:ind_id>/", indicator_detail, name="indicator_detail"),
    path("indicators/<int:ind_id>/template/", indicator_template_view, name="indicator_template"),

    # Stats
    path("stats/", system_stats, name="system_stats"),

    # Roles
    path("roles/", list_roles, name="list_roles"),
    path("feedback/", submit_feedback, name="submit_feedback"),
    path("feedback/admin/", list_user_feedback, name="list_user_feedback"),
    path("feedback/admin/<int:feedback_id>/", user_feedback_detail, name="user_feedback_detail"),

    # Auditoría — solo admin
    path("audit/errors/", list_audit_errors, name="list_audit_errors"),
    path("audit/logs/",   list_audit_logs,   name="list_audit_logs"),

    # Evidencias / Documentos
    path("evidences/",                      list_evidences,    name="list_evidences"),
    path("evidences/bulk/",                 bulk_update_evidences, name="bulk_update_evidences"),
    path("evidences/bulk_delete/",          bulk_delete_evidences, name="bulk_delete_evidences"),
    path("evidences/<int:ev_id>/",          evidence_detail,   name="evidence_detail"),
    path("evidences/<int:ev_id>/download/", download_evidence, name="download_evidence"),

    # Scraper automatizado ESPOCH
    path("scraper/espoch/", scrape_espoch, name="scrape_espoch"),

    # ── Validación automática LOTAIP ──
    path("evaluacion/documentos/<int:ev_id>/validar/",                      validate_document,       name="validate_document"),
    path("evaluacion/documentos/<int:ev_id>/resultado/",                    get_validation_result,   name="get_validation_result"),
    path("evaluacion/universidades/<int:univ_id>/validar-todo/",            validate_all_university,  name="validate_all_university"),
    path("evaluacion/universidades/<int:univ_id>/resumen/",                 get_compliance_summary,   name="get_compliance_summary"),
    path("evaluacion/universidades/<int:univ_id>/ultimo-periodo/",         get_latest_validation_period, name="get_latest_validation_period"),
    path("evaluacion/universidades/<int:univ_id>/observaciones/",           get_observations,         name="get_observations"),
]
