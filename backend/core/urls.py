from django.urls import path
from .views import (
    register_user, login_user,
    list_users, user_detail,
    list_universities, university_detail,
    list_indicators,
    system_stats,
    list_roles,
    list_audit_errors,
    list_audit_logs,
    request_password_reset,
    confirm_password_reset,
)

urlpatterns = [
    # Auth
    path("auth/register/", register_user,   name="register_user"),
    path("auth/login/",    login_user,       name="login_user"),
    path("auth/password-reset/request/",          request_password_reset, name="password_reset_request"),
    path("auth/password-reset/confirm/<str:token>/", confirm_password_reset, name="password_reset_confirm"),

    # Users
    path("users/",               list_users,       name="list_users"),
    path("users/<int:user_id>/", user_detail,      name="user_detail"),

    # Universities
    path("universities/",              list_universities,   name="list_universities"),
    path("universities/<int:univ_id>/", university_detail, name="university_detail"),

    # Indicators
    path("indicators/", list_indicators, name="list_indicators"),

    # Stats
    path("stats/", system_stats, name="system_stats"),

    # Roles
    path("roles/", list_roles, name="list_roles"),

    # Auditoría — solo admin
    path("audit/errors/", list_audit_errors, name="list_audit_errors"),
    path("audit/logs/",   list_audit_logs,   name="list_audit_logs"),
]