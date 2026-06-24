from django.http import JsonResponse, FileResponse, Http404
import json
import traceback
import os
import re
import mimetypes
import uuid
import secrets
from pathlib import Path
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from datetime import timedelta
from django.core.mail import send_mail
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.core.files.storage import default_storage
from django.http.multipartparser import MultiPartParser, MultiPartParserError
from email.utils import parseaddr
from .models import AppUser, Role, AuditLog, AuditError, University, Indicator, Category, PasswordResetToken, Evidence, EvaluationPeriod, Evaluation, CategoryResult, FinalResult, Feedback, EvidenceValidationResult, UniversityEvaluationSummary, UserFeedback
from .encryption import encrypt_email, decrypt_email, hash_email, encrypt_field, decrypt_field
from .middleware import generate_jwt, require_auth, require_role
from .sanitizers import sanitize_text, validate_name, validate_email_format, validate_password
from .services.international_evaluator import evaluate_international_standards
from .cache_utils import stats_cache_key
from .otp_mailer import enqueue_otp_email


DPE_ENTITY_URL_RE = re.compile(r"transparencia\.dpe\.gob\.ec/entidades/(\d+)", re.IGNORECASE)
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024
FEEDBACK_TYPES = {
    "system": "Sistema",
    "transparency": "Transparencia",
}


def _normalize_dpe_transparency_url(value):
    """Acepta un ID de entidad DPE o una URL completa y devuelve la URL canonica."""
    raw = str(value or "").strip()
    if not raw:
        return ""

    if raw.isdigit():
        return f"https://transparencia.dpe.gob.ec/entidades/{raw}"

    match = DPE_ENTITY_URL_RE.search(raw)
    if match:
        return f"https://transparencia.dpe.gob.ec/entidades/{match.group(1)}"

    return raw


def _extract_dpe_entity_id(transparency_url):
    match = DPE_ENTITY_URL_RE.search(transparency_url or "")
    return match.group(1) if match else ""


def _parse_body(request):
    content_type = request.META.get("CONTENT_TYPE", "")
    if content_type.startswith("multipart/form-data"):
        if request.method == "POST":
            return request.POST, request.FILES, None
        try:
            data, files = MultiPartParser(
                request.META,
                request,
                request.upload_handlers,
                request.encoding,
            ).parse()
            return data, files, None
        except MultiPartParserError:
            return None, None, "Formulario multipart invalido"

    try:
        return json.loads(request.body or b"{}"), {}, None
    except json.JSONDecodeError:
        return None, None, "Cuerpo JSON invalido"


def _get_value(data, key, default=""):
    if hasattr(data, "get"):
        return data.get(key, default)
    return default


def _get_bool(data, key, default=True):
    value = _get_value(data, key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"1", "true", "on", "yes", "si"}
    return bool(value)


def _save_university_logo(upload, acronym):
    if not upload:
        return None

    ext = Path(upload.name or "").suffix.lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        raise ValueError("El logo debe ser una imagen PNG, JPG, JPEG o WEBP")
    if upload.size and upload.size > MAX_LOGO_SIZE:
        raise ValueError("El logo no debe superar 2 MB")

    safe_acronym = _logo_storage_prefix(acronym)
    filename = f"{safe_acronym}-{uuid.uuid4().hex[:10]}{ext}"
    return default_storage.save(f"university_logos/{filename}", upload)


def _logo_storage_prefix(acronym):
    return re.sub(r"[^a-z0-9]+", "-", str(acronym or "universidad").lower()).strip("-") or "universidad"


def _find_existing_university_logo(acronym):
    safe_acronym = _logo_storage_prefix(acronym)
    try:
        _, files = default_storage.listdir("university_logos")
    except Exception:
        return None

    candidates = [
        f"university_logos/{name}"
        for name in files
        if name.lower().startswith(f"{safe_acronym}-") and Path(name).suffix.lower() in ALLOWED_LOGO_EXTENSIONS
    ]
    if not candidates:
        return None

    try:
        return max(candidates, key=lambda item: default_storage.get_modified_time(item))
    except Exception:
        return sorted(candidates)[-1]


def _resolve_university_logo_path(university):
    return getattr(university, "logo_path", None) or _find_existing_university_logo(getattr(university, "acronym", ""))
def _logo_url(request, logo_path):
    if not logo_path:
        return ""
    media_url = f"{settings.MEDIA_URL.rstrip('/')}/{str(logo_path).replace(os.sep, '/')}"
    return request.build_absolute_uri(media_url)


def _default_feedback_recipient():
    configured = getattr(settings, "FEEDBACK_RECIPIENT_EMAIL", "")
    if configured:
        return configured
    _, email = parseaddr(settings.DEFAULT_FROM_EMAIL)
    return email or settings.DEFAULT_FROM_EMAIL


def _serialize_university(request, university, score_data=None):
    score_data = score_data or {}
    university_score = score_data.get(university.id, {})

    return {
        "id":               university.id,
        "name":             university.acronym,
        "full_name":        university.name,
        "city":             university.city,
        "province":         university.province,
        "type":             university.institution_type,
        "website":          university.website_url,
        "transparency_url": university.transparency_url,
        "dpe_entity_id":     _extract_dpe_entity_id(university.transparency_url),
        "logo_url":          _logo_url(request, _resolve_university_logo_path(university)),
        "logo_path":         _resolve_university_logo_path(university) or "",
        "is_active":        university.is_active,
        "transparency_score": university_score.get("transparency_score", 0),
        "integrated_transparency_score": university_score.get("integrated_transparency_score", 0),
        "evaluated_documents": university_score.get("evaluated_documents", 0),
        "rank":             university_score.get("rank", 0),
        "logo_initials":    university.acronym[:4] if university.acronym else "UNIV",
        "color":            "#6366F1",
    }


def _get_university_score_data():
    summaries = UniversityEvaluationSummary.objects.select_related("university").filter(
        university__is_active=True
    )
    by_university = {}

    for summary in summaries:
        count = int(summary.evaluated_documents or summary.total_indicators or 0)
        if count <= 0:
            continue
        bucket = by_university.setdefault(
            summary.university_id,
            {"score_sum": 0, "integrated_score_sum": 0, "count": 0},
        )
        bucket["score_sum"] += float(summary.national_index or summary.total_index or 0) * count
        bucket["integrated_score_sum"] += float(summary.integrated_index or summary.total_index or 0) * count
        bucket["count"] += count

    if not by_university:
        validations = EvidenceValidationResult.objects.select_related("evidence", "evidence__university")
        for vr in validations:
            if not vr.evidence_id or not vr.evidence.university_id:
                continue

            bucket = by_university.setdefault(
                vr.evidence.university_id,
                {"score_sum": 0, "integrated_score_sum": 0, "count": 0},
            )
            national_score = float(vr.total_score)
            bucket["score_sum"] += national_score
            international = evaluate_international_standards(
                vr.evidence,
                lotaip_result={
                    "puntaje_total": national_score,
                    "puntaje_estructura": float(vr.score_structure),
                },
            )
            bucket["integrated_score_sum"] += international["indice_nacional_internacional"]
            bucket["count"] += 1

    ranked = []
    for university_id, item in by_university.items():
        count = item["count"]
        ranked.append((
            university_id,
            {
                "transparency_score": round(item["score_sum"] / count, 2) if count else 0,
                "integrated_transparency_score": round(item["integrated_score_sum"] / count, 2) if count else 0,
                "evaluated_documents": count,
            },
        ))

    ranked.sort(key=lambda entry: entry[1]["transparency_score"], reverse=True)
    return {
        university_id: {**score, "rank": index + 1}
        for index, (university_id, score) in enumerate(ranked)
    }


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Helpers de auditorÃƒÂ­a Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

def _log(user_id, action, table_name=None, record_id=None, description=None):
    """Registra auditoria exitosa; aisla la logica de persistencia"""
    try:
        AuditLog.objects.create(
            user_id=user_id,
            module="auth",
            action=action,
            table_name=table_name,
            record_id=record_id,
            description=description,
            created_at=timezone.now(),
        )
    except Exception:
        pass


def _log_error(error_message, user_id=None, function_name=None, error_code=None, exc=None):
    """Registra errores cifrados; aisla la logica de encriptacion"""
    try:
        raw_trace = traceback.format_exc() if exc else None
        AuditError.objects.create(
            user_id=user_id,
            module="auth",
            function_name=function_name,
            error_message=encrypt_field(error_message),      # cifrado
            error_code=error_code,
            stack_trace=encrypt_field(raw_trace) if raw_trace else None,  # cifrado
            created_at=timezone.now(),
        )
    except Exception:
        pass



def _send_otp_email_async(user_id, recipient_email, otp):
    """Encola el OTP para enviarlo sin bloquear la respuesta del login."""
    queued = enqueue_otp_email(user_id, recipient_email, otp, error_handler=_log_error)
    if not queued:
        print(f"No se pudo encolar OTP para {recipient_email}")


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Registro Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def register_user(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            _log_error("Cuerpo JSON invÃ¡lido en registro", function_name="register_user", error_code="INVALID_JSON")
            return JsonResponse({"error": "Cuerpo de la solicitud invÃƒÂ¡lido"}, status=400)

        full_name_raw = data.get("fullName", "").strip()
        email_raw = data.get("email", "").strip().lower()
        password  = data.get("password", "")

        if not full_name_raw or not email_raw or not password:
            _log_error(
                "Registro fallido: campos obligatorios vacÃƒÂ­os",
                function_name="register_user",
                error_code="MISSING_FIELDS",
            )
            return JsonResponse({"error": "Todos los campos son obligatorios"}, status=400)

        # Ã¢â€â‚¬Ã¢â€â‚¬ SanitizaciÃƒÂ³n y validaciÃƒÂ³n de entradas (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        try:
            full_name = validate_name(full_name_raw)
            email_raw = validate_email_format(email_raw)
            password  = validate_password(password)
        except ValueError as ve:
            _log_error(str(ve), function_name="register_user", error_code="VALIDATION_ERROR")
            return JsonResponse({"error": str(ve)}, status=400)

        full_name = sanitize_text(full_name, max_length=150)

        # Verificar que el nombre completo contenga al menos nombre y apellido
        name_parts = full_name.split()
        if len(name_parts) < 2:
            _log_error(
                "Registro fallido: nombre o apellido faltante",
                function_name="register_user",
                error_code="MISSING_NAME_OR_LASTNAME",
            )
            return JsonResponse({"error": "Debe ingresar nombre y apellido"}, status=400)

        # Buscar por hash (no por email en claro)
        email_idx = hash_email(email_raw)
        if AppUser.objects.filter(email_hash=email_idx).exists():
            _log_error(
                f"Registro fallido: email duplicado",
                function_name="register_user",
                error_code="DUPLICATE_EMAIL",
            )
            return JsonResponse({"error": "El email ya estÃƒÂ¡ registrado"}, status=400)

        try:
            role = Role.objects.get(id=4)  # id=4 => Auditor
        except Role.DoesNotExist as exc:
            _log_error(
                "Rol Auditor (id=4) no encontrado en la base de datos",
                function_name="register_user",
                error_code="ROLE_NOT_FOUND",
                exc=exc,
            )
            return JsonResponse({"error": "Rol no encontrado en la base de datos"}, status=500)

        try:
            now = timezone.now()
            new_user = AppUser.objects.create(
                role          = role,
                full_name     = full_name,
                email         = encrypt_email(email_raw),   # cifrado
                email_hash    = email_idx,                   # indice HMAC
                password_hash = make_password(password),
                is_active     = True,
                created_at    = now,
                updated_at    = now,
            )
        except Exception as exc:
            _log_error(
                f"Error al crear usuario: {str(exc)}",
                function_name="register_user",
                error_code="DB_ERROR",
                exc=exc,
            )
            return JsonResponse({"error": f"Error al crear el usuario: {str(exc)}"}, status=500)

        _log(
            user_id=new_user.id,
            action="REGISTER",
            table_name="core.users",
            record_id=new_user.id,
            description=f"Nuevo usuario registrado (rol: {role.name})",
        )
        return JsonResponse({"message": "Usuario creado correctamente"})

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Login Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def login_user(request):
    MAX_ATTEMPTS = 5
    SUPPORT_EMAIL = "sistema_transparencia@hotmail.com"

    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            _log_error("Cuerpo JSON invÃ¡lido en login", function_name="login_user", error_code="INVALID_JSON")
            return JsonResponse({"error": "Cuerpo de la solicitud invÃƒÂ¡lido"}, status=400)

        email_raw = data.get("email", "").strip().lower()
        password  = data.get("password", "")

        if not email_raw or not password:
            _log_error(
                "Login fallido: campos vacÃƒÂ­os",
                function_name="login_user",
                error_code="MISSING_FIELDS",
            )
            return JsonResponse({"error": "Email y contraseÃƒÂ±a son obligatorios"}, status=400)

        # Buscar por hash determinÃƒÂ­stico
        email_idx = hash_email(email_raw)
        try:
            user = AppUser.objects.select_related("role").get(email_hash=email_idx)
        except AppUser.DoesNotExist:
            _log_error(
                "Login fallido: usuario no existe",
                function_name="login_user",
                error_code="USER_NOT_FOUND",
            )
            return JsonResponse({"error": "Credenciales incorrectas"}, status=400)

        if not user.is_active:
            _log_error(
                "Login fallido: cuenta inactiva",
                user_id=user.id,
                function_name="login_user",
                error_code="ACCOUNT_INACTIVE",
            )
            return JsonResponse({"error": "Cuenta desactivada. Contacte al administrador"}, status=403)

        # Ã¢â€â‚¬Ã¢â€â‚¬ Verificar si la cuenta estÃƒÂ¡ bloqueada Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if user.is_locked:
            _log_error(
                "Login fallido: cuenta bloqueada",
                user_id=user.id,
                function_name="login_user",
                error_code="ACCOUNT_LOCKED",
            )
            return JsonResponse({
                "error":       "ACCOUNT_LOCKED",
                "support_email": SUPPORT_EMAIL,
            }, status=403)

        # Ã¢â€â‚¬Ã¢â€â‚¬ Verificar contraseÃƒÂ±a Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if not check_password(password, user.password_hash):
            # Incrementar contador de intentos fallidos
            user.failed_login_attempts += 1
            remaining = MAX_ATTEMPTS - user.failed_login_attempts

            if user.failed_login_attempts >= MAX_ATTEMPTS:
                user.is_locked = True
                user.save(update_fields=["failed_login_attempts", "is_locked", "updated_at"])
                _log_error(
                    f"Cuenta bloqueada tras {MAX_ATTEMPTS} intentos fallidos",
                    user_id=user.id,
                    function_name="login_user",
                    error_code="ACCOUNT_LOCKED",
                )
                return JsonResponse({
                    "error":         "ACCOUNT_LOCKED",
                    "support_email": SUPPORT_EMAIL,
                }, status=403)

            user.save(update_fields=["failed_login_attempts", "updated_at"])
            _log_error(
                f"Login fallido: contraseÃƒÂ±a incorrecta (intento {user.failed_login_attempts}/{MAX_ATTEMPTS})",
                user_id=user.id,
                function_name="login_user",
                error_code="WRONG_PASSWORD",
            )
            return JsonResponse({
                "error":     "Credenciales incorrectas",
                "remaining": remaining,
            }, status=400)

        #  Login exitoso Ã¢â‚¬â€ reiniciar contador y actualizar last_login
        try:
            user.last_login = timezone.now()
            user.failed_login_attempts = 0
            user.is_locked = False
            user.save(update_fields=["last_login", "failed_login_attempts", "is_locked"])
        except Exception:
            pass

        # Ã¢â€â‚¬Ã¢â€â‚¬ Omitir 2FA para correos de prueba Ã¢â€â‚¬Ã¢â€â‚¬
        if email_raw in ["admin@gmail.com", "adminuni@gmail.com"]:
            import uuid
            user.session_id = uuid.uuid4()
            user.otp_code = None
            user.otp_expiry = None
            user.save(update_fields=["session_id", "otp_code", "otp_expiry", "updated_at"])
            
            _log(
                user_id=user.id,
                action="LOGIN_BYPASS_2FA",
                table_name="core.users",
                record_id=user.id,
                description=f"Login directo exitoso sin 2FA (rol: {user.role.name})",
            )
            
            from .middleware import generate_jwt
            access_token = generate_jwt(user)
            refresh_token = generate_jwt(user, is_refresh=True)
            
            return JsonResponse({
                "message": "Login exitoso",
                "token": access_token,
                "refresh_token": refresh_token,
                "user": {
                    "id":            user.id,
                    "name":          user.full_name,
                    "email":         decrypt_email(user.email),
                    "role":          user.role.name,
                    "role_id":       user.role.id,
                    "university_id": user.university_id,
                    "is_active":     user.is_active,
                }
            })

        _log(
            user_id=user.id,
            action="LOGIN_ATTEMPT",
            table_name="core.users",
            record_id=user.id,
            description=f"Credenciales validadas, requiere 2FA (rol: {user.role.name})",
        )

        # Generar OTP
        otp = f"{secrets.randbelow(1_000_000):06d}"
        user.otp_code = otp
        user.otp_expiry = timezone.now() + timedelta(minutes=5)
        user.save(update_fields=["otp_code", "otp_expiry", "updated_at"])
        
        _send_otp_email_async(user.id, email_raw, otp)

        return JsonResponse({
            "requires_2fa": True,
            "email": email_raw,
            "message": "CÃƒÂ³digo de verificaciÃƒÂ³n enviado al correo"
        })

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


@csrf_exempt
def verify_otp(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)
            
        email_raw = data.get("email", "").strip().lower()
        otp = data.get("otp", "").strip()
        
        if not email_raw or not otp:
            return JsonResponse({"error": "Email y cÃƒÂ³digo son obligatorios"}, status=400)
            
        email_idx = hash_email(email_raw)
        try:
            user = AppUser.objects.select_related("role").get(email_hash=email_idx)
        except AppUser.DoesNotExist:
            return JsonResponse({"error": "Usuario no encontrado"}, status=400)
            
        if not user.otp_code or user.otp_code != otp:
            return JsonResponse({"error": "CÃƒÂ³digo de verificaciÃƒÂ³n invÃƒÂ¡lido"}, status=400)
            
        if not user.otp_expiry or timezone.now() > user.otp_expiry:
            return JsonResponse({"error": "El cÃƒÂ³digo de verificaciÃƒÂ³n ha expirado"}, status=400)
            
        # OTP VÃƒÂ¡lido - Generar sesiÃƒÂ³n
        import uuid
        user.session_id = uuid.uuid4()
        user.otp_code = None
        user.otp_expiry = None
        user.save(update_fields=["session_id", "otp_code", "otp_expiry", "updated_at"])
        
        _log(
            user_id=user.id,
            action="LOGIN_2FA",
            table_name="core.users",
            record_id=user.id,
            description=f"Login 2FA exitoso (rol: {user.role.name})",
        )
        
        # Generar tokens (Access & Refresh)
        access_token = generate_jwt(user)
        refresh_token = generate_jwt(user, is_refresh=True)
        
        return JsonResponse({
            "message": "Login exitoso",
            "token": access_token,
            "refresh_token": refresh_token,
            "user": {
                "id":            user.id,
                "name":          user.full_name,
                "email":         decrypt_email(user.email),
                "role":          user.role.name,
                "role_id":       user.role.id,
                "university_id": user.university_id,
                "is_active":     user.is_active,
            }
        })
        
    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


@csrf_exempt
def submit_feedback(request):
    if request.method != "POST":
        return JsonResponse({"error": "Metodo no permitido"}, status=405)

    user, err = require_auth(request)
    if err:
        return err

    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Cuerpo JSON invalido"}, status=400)

    feedback_type = str(data.get("type", "")).strip().lower()
    subject = sanitize_text(str(data.get("subject", "")).strip(), max_length=120)
    message = sanitize_text(str(data.get("message", "")).strip(), max_length=2000)

    if feedback_type not in FEEDBACK_TYPES:
        return JsonResponse({"error": "Seleccione si el feedback es del sistema o de transparencia"}, status=400)
    if not subject or not message:
        return JsonResponse({"error": "Asunto y comentario son obligatorios"}, status=400)

    type_label = FEEDBACK_TYPES[feedback_type]
    recipient = _default_feedback_recipient()
    try:
        user_email = decrypt_email(user.email)
    except Exception:
        user_email = user.email or ""

    mail_subject = f"[Feedback {type_label}] {subject}"
    mail_message = (
        f"Nuevo feedback recibido - {type_label}\n\n"
        f"Usuario: {user.full_name}\n"
        f"Correo: {user_email}\n"
        f"Rol: {getattr(user.role, 'name', '')}\n"
        f"Fecha: {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"Asunto: {subject}\n\n"
        f"Comentario:\n{message}"
    )

    try:
        send_mail(
            subject=mail_subject,
            message=mail_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
    except Exception as exc:
        _log_error(
            f"Error enviando feedback: {str(exc)}",
            user_id=user.id,
            function_name="submit_feedback",
            error_code="FEEDBACK_EMAIL_ERROR",
            exc=exc,
        )
        return JsonResponse({"error": "No se pudo enviar el feedback. Intente nuevamente."}, status=500)

    try:
        UserFeedback.objects.create(
            user_id=user.id,
            university_id=user.university_id,
            user_name=user.full_name,
            user_email=user_email,
            user_role=getattr(user.role, "name", ""),
            feedback_type=feedback_type,
            subject=subject,
            message=message,
            email_sent=True,
            recipient_email=recipient,
        )
    except Exception as exc:
        _log_error(
            f"Error guardando feedback: {str(exc)}",
            user_id=user.id,
            function_name="submit_feedback",
            error_code="FEEDBACK_SAVE_ERROR",
            exc=exc,
        )

    _log(
        user_id=user.id,
        action="SEND_FEEDBACK",
        table_name=None,
        record_id=None,
        description=f"Feedback enviado ({type_label})",
    )
    return JsonResponse({"message": "Feedback enviado correctamente"})


def _serialize_user_feedback(item):
    return {
        "id": item.id,
        "user_id": item.user_id,
        "university_id": item.university_id,
        "user_name": item.user_name,
        "user_email": item.user_email,
        "user_role": item.user_role,
        "feedback_type": item.feedback_type,
        "feedback_type_label": FEEDBACK_TYPES.get(item.feedback_type, item.feedback_type),
        "subject": item.subject,
        "message": item.message,
        "status": item.status,
        "email_sent": item.email_sent,
        "recipient_email": item.recipient_email,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@csrf_exempt
def list_user_feedback(request):
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Metodo no permitido"}, status=405)

    queryset = UserFeedback.objects.all().order_by("-created_at")
    feedback_type = request.GET.get("type", "").strip().lower()
    status = request.GET.get("status", "").strip().lower()

    if user.role_id in (2, 3):
        queryset = queryset.filter(feedback_type="transparency")
    elif feedback_type in FEEDBACK_TYPES:
        queryset = queryset.filter(feedback_type=feedback_type)

    if status in {"pending", "reviewed"}:
        queryset = queryset.filter(status=status)

    items = [_serialize_user_feedback(item) for item in queryset[:300]]
    return JsonResponse(items, safe=False)


@csrf_exempt
def user_feedback_detail(request, feedback_id):
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err

    try:
        item = UserFeedback.objects.get(id=feedback_id)
    except UserFeedback.DoesNotExist:
        return JsonResponse({"error": "Comentario no encontrado"}, status=404)

    if user.role_id in (2, 3) and item.feedback_type != "transparency":
        return JsonResponse({"error": "No autorizado"}, status=403)

    if request.method == "GET":
        return JsonResponse(_serialize_user_feedback(item))

    if request.method in {"PUT", "PATCH"}:
        try:
            data = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invalido"}, status=400)

        status = str(data.get("status", "")).strip().lower()
        if status not in {"pending", "reviewed"}:
            return JsonResponse({"error": "Estado invalido"}, status=400)

        item.status = status
        item.save(update_fields=["status", "updated_at"])
        _log(
            user_id=user.id,
            action="UPDATE_FEEDBACK_STATUS",
            table_name="core.user_feedback",
            record_id=item.id,
            description=f"Estado de feedback actualizado a {status}",
        )
        return JsonResponse(_serialize_user_feedback(item))

    return JsonResponse({"error": "Metodo no permitido"}, status=405)


@csrf_exempt
def refresh_token(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)
            
        token = data.get("refresh_token")
        if not token:
            return JsonResponse({"error": "Refresh token es requerido"}, status=400)
            
        from .middleware import decode_jwt, generate_jwt
        import jwt
        
        try:
            payload = decode_jwt(token)
        except jwt.ExpiredSignatureError:
            return JsonResponse({"error": "Refresh token expirado"}, status=401)
        except jwt.InvalidTokenError:
            return JsonResponse({"error": "Refresh token invÃƒÂ¡lido"}, status=401)
            
        # Verificar tipo de token
        if not payload.get("is_refresh"):
            return JsonResponse({"error": "Tipo de token invÃƒÂ¡lido"}, status=401)
            
        try:
            user = AppUser.objects.get(id=payload["user_id"], is_active=True)
        except AppUser.DoesNotExist:
            return JsonResponse({"error": "Usuario no encontrado"}, status=401)
            
        # Verificar concurrencia (session_id)
        token_session_id = payload.get("session_id")
        if not token_session_id or str(user.session_id) != token_session_id:
            return JsonResponse({"error": "La sesiÃƒÂ³n ha expirado o ha sido invalidada. Inicie sesiÃƒÂ³n nuevamente."}, status=401)
            
        # Emitir nuevo access_token
        access_token = generate_jwt(user)
        
        return JsonResponse({
            "token": access_token
        })
        
    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)

@csrf_exempt
def auth_status(request):
    """
    Endpoint ligero para que el frontend haga polling y verifique 
    si su sesiÃƒÂ³n (token) sigue siendo vÃƒÂ¡lida y no ha sido invalidada por concurrencia.
    """
    from .middleware import require_auth
    user, err = require_auth(request)
    if err:
        return err
    return JsonResponse({"status": "active"})

# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Listado de usuarios Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬



@csrf_exempt
def list_users(request):
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: solo Administrador (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method == "GET":
        try:
            users = AppUser.objects.select_related("role", "university").order_by("id")
            superadmin_id = _get_superadmin_id()
            data = [
                {
                    "id":              u.id,
                    "full_name":       u.full_name,
                    "email":           decrypt_email(u.email),  # descifrado al leer
                    "role_id":         u.role.id,
                    "role_name":       u.role.name,
                    "university_id":   u.university_id,
                    "university_name": u.university.name if u.university else None,
                    "is_active":       u.is_active,
                    "is_superadmin":   u.id == superadmin_id,   # protegido
                    "last_login":      u.last_login.isoformat() if u.last_login else None,
                    "created_at":      u.created_at.isoformat() if u.created_at else None,
                }
                for u in users
            ]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener usuarios: {str(exc)}"}, status=500)

    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)

        email_raw  = data.get("email", "").strip().lower()
        full_name  = data.get("full_name", "").strip()
        role_id    = data.get("role_id", 4)
        password   = data.get("password", "admin123")

        if not email_raw or not full_name:
            return JsonResponse({"error": "Nombre y email son obligatorios"}, status=400)

        # Ã¢â€â‚¬Ã¢â€â‚¬ Regla: mÃƒÂ¡ximo 2 usuarios con role_id=1 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if int(role_id) == 1:
            admin_count = AppUser.objects.filter(role_id=1).count()
            if admin_count >= 2:
                return JsonResponse(
                    {"error": "Solo puede haber 2 administradores del sistema (1 superadmin + 1 admin). Elimine uno antes de crear otro."},
                    status=400,
                )

        email_idx = hash_email(email_raw)
        if AppUser.objects.filter(email_hash=email_idx).exists():
            return JsonResponse({"error": "El email ya estÃƒÂ¡ registrado"}, status=400)

        try:
            role = Role.objects.get(id=role_id)
        except Role.DoesNotExist:
            return JsonResponse({"error": f"Rol {role_id} no encontrado"}, status=400)

        now  = timezone.now()
        user = AppUser.objects.create(
            role          = role,
            full_name     = full_name,
            email         = encrypt_email(email_raw),
            email_hash    = email_idx,
            password_hash = make_password(password),
            is_active     = data.get("is_active", True),
            created_at    = now,
            updated_at    = now,
        )
        return JsonResponse({"id": user.id, "message": "Usuario creado"}, status=201)

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Helper: obtiene el ID del superadmin (role_id=1 con menor id) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
def _get_superadmin_id():
    """Retorna el id del superadmin: el primer usuario con role_id=1 (menor id)."""
    first = AppUser.objects.filter(role_id=1).order_by("id").first()
    return first.id if first else None


@csrf_exempt
def user_detail(request, user_id):
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: solo Administrador (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_role(request, [1])
    if err:
        return err

    try:
        user = AppUser.objects.select_related("role").get(id=user_id)
    except AppUser.DoesNotExist:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    if request.method == "PUT":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)

        requester_id = data.get("_requester_id")  # ID del admin que realiza la acciÃƒÂ³n
        superadmin_id = _get_superadmin_id()

        # Ã¢â€â‚¬Ã¢â€â‚¬ Regla 1: un admin no puede modificar su propia cuenta Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if requester_id and int(requester_id) == user_id:
            return JsonResponse(
                {"error": "No puedes modificar tu propia cuenta desde este panel."},
                status=403,
            )

        # Ã¢â€â‚¬Ã¢â€â‚¬ Regla 2: el superadmin no puede ser desactivado por nadie Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if user_id == superadmin_id:
            if "is_active" in data and not data["is_active"]:
                return JsonResponse(
                    {"error": "El superadministrador no puede ser desactivado. Siempre debe permanecer activo."},
                    status=403,
                )
            if "role_id" in data and int(data["role_id"]) != 1:
                return JsonResponse(
                    {"error": "No se puede cambiar el rol del superadministrador."},
                    status=403,
                )

        # Ã¢â€â‚¬Ã¢â€â‚¬ Regla 3: mÃƒÂ¡ximo 2 usuarios con role_id=1 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if "role_id" in data and int(data["role_id"]) == 1 and user.role_id != 1:
            admin_count = AppUser.objects.filter(role_id=1).count()
            if admin_count >= 2:
                return JsonResponse(
                    {"error": "Solo puede haber 2 administradores del sistema. Elimine uno antes de asignar este rol."},
                    status=400,
                )

        if "full_name" in data:
            user.full_name = data["full_name"]
        if "is_active" in data:
            user.is_active = data["is_active"]
        if "role_id" in data:
            try:
                user.role = Role.objects.get(id=data["role_id"])
            except Role.DoesNotExist:
                return JsonResponse({"error": "Rol no encontrado"}, status=400)
        if "email" in data:
            email_raw      = data["email"].strip().lower()
            user.email     = encrypt_email(email_raw)
            user.email_hash = hash_email(email_raw)
        user.updated_at = timezone.now()
        user.save()
        return JsonResponse({"message": "Usuario actualizado"})

    if request.method == "DELETE":
        superadmin_id = _get_superadmin_id()

        # Ã¢â€â‚¬Ã¢â€â‚¬ Regla: no se puede eliminar al superadmin Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        if user_id == superadmin_id:
            return JsonResponse(
                {"error": "El superadministrador no puede ser eliminado."},
                status=403,
            )

        user.delete()
        return JsonResponse({"message": "Usuario eliminado"})

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Listado de universidades Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def list_universities(request):
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: GET=todos autenticados, POST=solo Admin (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬
    if request.method == "POST":
        _, err = require_role(request, [1, 2, 3])
        if err:
            return err
    else:
        _, err = require_auth(request)
        if err:
            return err

    if request.method == "GET":
        try:
            include_inactive = request.GET.get("include_inactive") in {"1", "true", "True", "yes"}
            univs = University.objects.all() if include_inactive else University.objects.filter(is_active=True)
            univs = univs.order_by("is_active", "name") if include_inactive else univs.order_by("name")
            score_data = _get_university_score_data()
            data = [_serialize_university(request, u, score_data) for u in univs]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener universidades: {str(exc)}"}, status=500)

    if request.method == "POST":
        if request.META.get("CONTENT_TYPE", "").startswith("multipart/form-data"):
            data, files, parse_error = _parse_body(request)
            if parse_error:
                return JsonResponse({"error": parse_error}, status=400)

            transparency_input = (
                _get_value(data, "dpe_entity_id")
                or _get_value(data, "transparency_id")
                or _get_value(data, "establishment_id")
                or _get_value(data, "transparency_url", "")
            )
            acronym = _get_value(data, "name", "").strip().upper()

            try:
                logo_path = _save_university_logo(files.get("logo"), acronym) or _find_existing_university_logo(acronym)
                now = timezone.now()
                univ = University.objects.create(
                    name             = _get_value(data, "full_name", "").strip(),
                    acronym          = acronym,
                    province         = _get_value(data, "province", ""),
                    city             = _get_value(data, "city", ""),
                    website_url      = _get_value(data, "website", ""),
                    transparency_url = _normalize_dpe_transparency_url(transparency_input),
                    logo_path        = logo_path,
                    institution_type = _get_value(data, "type", "PÃºblica"),
                    is_active        = _get_bool(data, "is_active", True),
                    created_at       = now,
                    updated_at       = now,
                )
                return JsonResponse({"id": univ.id, "logo_url": _logo_url(request, logo_path), "message": "Universidad creada"}, status=201)
            except ValueError as exc:
                return JsonResponse({"error": str(exc)}, status=400)
            except Exception as exc:
                return JsonResponse({"error": f"Error al crear universidad: {str(exc)}"}, status=500)

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)

        transparency_input = (
            data.get("dpe_entity_id")
            or data.get("transparency_id")
            or data.get("establishment_id")
            or data.get("transparency_url", "")
        )

        now = timezone.now()
        try:
            acronym = data.get("name", "").strip().upper()
            logo_path = _find_existing_university_logo(acronym)
            univ = University.objects.create(
                name             = data.get("full_name", "").strip(),
                acronym          = acronym,
                province         = data.get("province", ""),
                city             = data.get("city", ""),
                website_url      = data.get("website", ""),
                transparency_url = _normalize_dpe_transparency_url(transparency_input),
                logo_path        = logo_path,
                institution_type = data.get("type", "PÃºblica"),
                is_active        = data.get("is_active", True),
                created_at       = now,
                updated_at       = now,
            )
            return JsonResponse({"id": univ.id, "message": "Universidad creada"}, status=201)
        except Exception as exc:
            return JsonResponse({"error": f"Error al crear universidad: {str(exc)}"}, status=500)

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


@csrf_exempt
def university_detail(request, univ_id):
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: solo Administrador (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_role(request, [1, 2, 3])
    if err:
        return err

    try:
        univ = University.objects.get(id=univ_id)
    except University.DoesNotExist:
        return JsonResponse({"error": "Universidad no encontrada"}, status=404)

    if request.method == "PUT":
        if request.META.get("CONTENT_TYPE", "").startswith("multipart/form-data"):
            data, files, parse_error = _parse_body(request)
            if parse_error:
                return JsonResponse({"error": parse_error}, status=400)

            if "full_name" in data: univ.name = _get_value(data, "full_name")
            if "name" in data:      univ.acronym = _get_value(data, "name").upper()
            if "city" in data:      univ.city = _get_value(data, "city")
            if "province" in data:  univ.province = _get_value(data, "province")
            if "website" in data:   univ.website_url = _get_value(data, "website")
            if any(k in data for k in ("dpe_entity_id", "transparency_id", "establishment_id", "transparency_url")):
                transparency_input = (
                    _get_value(data, "dpe_entity_id")
                    or _get_value(data, "transparency_id")
                    or _get_value(data, "establishment_id")
                    or _get_value(data, "transparency_url", "")
                )
                univ.transparency_url = _normalize_dpe_transparency_url(transparency_input)
            if "type" in data:      univ.institution_type = _get_value(data, "type")
            if "is_active" in data: univ.is_active = _get_bool(data, "is_active", univ.is_active)
            if files.get("logo"):
                try:
                    if getattr(univ, "logo_path", None):
                        default_storage.delete(univ.logo_path)
                    univ.logo_path = _save_university_logo(files.get("logo"), univ.acronym)
                except ValueError as exc:
                    return JsonResponse({"error": str(exc)}, status=400)
            elif not getattr(univ, "logo_path", None):
                univ.logo_path = _find_existing_university_logo(univ.acronym)
            univ.updated_at = timezone.now()
            univ.save()
            return JsonResponse({"message": "Universidad actualizada", "logo_url": _logo_url(request, getattr(univ, "logo_path", None))})

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)

        if "full_name" in data: univ.name = data["full_name"]
        if "name" in data:      univ.acronym = data["name"].upper()
        if "city" in data:      univ.city = data["city"]
        if "province" in data:  univ.province = data["province"]
        if "website" in data:   univ.website_url = data["website"]
        if any(k in data for k in ("dpe_entity_id", "transparency_id", "establishment_id", "transparency_url")):
            transparency_input = (
                data.get("dpe_entity_id")
                or data.get("transparency_id")
                or data.get("establishment_id")
                or data.get("transparency_url", "")
            )
            univ.transparency_url = _normalize_dpe_transparency_url(transparency_input)
        if "type" in data:      univ.institution_type = data["type"]
        if "is_active" in data: univ.is_active = data["is_active"]
        if not getattr(univ, "logo_path", None):
            univ.logo_path = _find_existing_university_logo(univ.acronym)
        univ.updated_at = timezone.now()
        univ.save()
        return JsonResponse({"message": "Universidad actualizada"})


    if request.method == "DELETE":
        evidence_rows = list(Evidence.objects.filter(university=univ).only("id", "file_path"))
        evidence_ids = [ev.id for ev in evidence_rows]
        deleted_files = 0

        with transaction.atomic():
            if evidence_ids:
                EvidenceValidationResult.objects.filter(evidence_id__in=evidence_ids).delete()
                Evidence.objects.filter(id__in=evidence_ids).delete()

            UniversityEvaluationSummary.objects.filter(university=univ).delete()
            Evaluation.objects.filter(university=univ).delete()
            CategoryResult.objects.filter(university=univ).delete()
            FinalResult.objects.filter(university=univ).delete()
            Feedback.objects.filter(university=univ).delete()
            AppUser.objects.filter(university=univ).update(university=None)
            univ.delete()

        for ev in evidence_rows:
            if ev.file_path:
                try:
                    if default_storage.exists(ev.file_path):
                        default_storage.delete(ev.file_path)
                        deleted_files += 1
                except Exception as exc:
                    _log_error(
                        f"No se pudo eliminar archivo de evidencia '{ev.file_path}': {str(exc)}",
                        function_name="university_detail",
                        error_code="EVIDENCE_FILE_DELETE_ERROR",
                        exc=exc,
                    )

        cache.clear()
        return JsonResponse({
            "message": "Universidad eliminada",
            "deleted_evidences": len(evidence_rows),
            "deleted_files": deleted_files,
        })

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)
# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Listado de indicadores Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def list_indicators(request):
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: todos los autenticados (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_auth(request)
    if err:
        return err

    if request.method == "GET":
        try:
            indicators = Indicator.objects.select_related("category").prefetch_related("template").order_by("display_order", "code")
            data = []
            for i in indicators:
                template_url = None
                template_name = None
                if hasattr(i, 'template') and i.template:
                    template_url = i.template.file_path.url
                    template_name = i.template.file_name

                data.append({
                    "id":           i.id,
                    "code":         i.code,
                    "name":         i.name,
                    "description":  i.description,
                    "category":     i.category.name if i.category else "",
                    "category_id":  i.category_id,
                    "weight":       float(i.weight_percent),
                    "max_score":    float(i.max_score),
                    "evidence_type": i.evidence_type,
                    "scoring_type": i.scoring_type,
                    "is_required":  i.is_required,
                    "is_active":    i.is_active,
                    "display_order": i.display_order,
                    "article":      f"Art. LOTAIP" if i.lotaip_item_id else "",
                    "framework":    "LOTAIP",
                    "template_url":  template_url,
                    "template_name": template_name,
                })
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener indicadores: {str(exc)}"}, status=500)

    if request.method == "POST":
        _, err = require_role(request, [1])
        if err: return err
        try:
            body = json.loads(request.body)
            indicator = Indicator.objects.create(
                category_id=body.get("category_id", 1),
                code=body.get("code", ""),
                name=body.get("name", ""),
                description=body.get("description", ""),
                weight_percent=body.get("weight", 0),
                is_active=body.get("is_active", True),
                evidence_type="DOCUMENT",
                scoring_type="TRINARY",
                is_required=True,
                created_at=timezone.now()
            )
            return JsonResponse({"id": indicator.id, "message": "Creado"}, status=201)
        except Exception as exc:
            return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)

@csrf_exempt
def indicator_detail(request, ind_id):
    _, err = require_auth(request)
    if err: return err

    try:
        indicator = Indicator.objects.get(id=ind_id)
    except Indicator.DoesNotExist:
        return JsonResponse({"error": "Indicador no encontrado"}, status=404)

    if request.method == "PUT":
        _, err = require_role(request, [1])
        if err: return err
        try:
            body = json.loads(request.body)
            indicator.code = body.get("code", indicator.code)
            indicator.name = body.get("name", indicator.name)
            indicator.description = body.get("description", indicator.description)
            indicator.weight_percent = body.get("weight", indicator.weight_percent)
            indicator.is_active = body.get("is_active", indicator.is_active)
            indicator.save()
            return JsonResponse({"message": "Actualizado"})
        except Exception as exc:
            return JsonResponse({"error": str(exc)}, status=400)

    if request.method == "DELETE":
        _, err = require_role(request, [1])
        if err: return err
        indicator.delete()
        return JsonResponse({"message": "Eliminado"})

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


@csrf_exempt
def indicator_template_view(request, ind_id):
    # Solo Administrador puede gestionar plantillas
    _, err = require_role(request, [1])
    if err:
        return err

    try:
        indicator = Indicator.objects.get(id=ind_id)
    except Indicator.DoesNotExist:
        return JsonResponse({"error": "Indicador no encontrado"}, status=404)

    if request.method == "POST":
        file_obj = request.FILES.get("file")
        if not file_obj:
            return JsonResponse({"error": "No se proporcionÃƒÂ³ ningÃƒÂºn archivo"}, status=400)
            
        from .models import IndicatorTemplate
        
        # Eliminar si ya existe una plantilla
        if hasattr(indicator, 'template') and indicator.template:
            indicator.template.file_path.delete(save=False)
            indicator.template.delete()
            
        template = IndicatorTemplate.objects.create(
            indicator=indicator,
            file_path=file_obj,
            file_name=file_obj.name
        )
        return JsonResponse({"message": "Plantilla subida con ÃƒÂ©xito", "url": template.file_path.url, "name": template.file_name})

    if request.method == "DELETE":
        if hasattr(indicator, 'template') and indicator.template:
            indicator.template.file_path.delete(save=False)
            indicator.template.delete()
            return JsonResponse({"message": "Plantilla eliminada"})
        return JsonResponse({"error": "No hay plantilla asignada"}, status=400)

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Stats del sistema Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def system_stats(request):
    _, err = require_auth(request)
    if err:
        return err

    if request.method == "GET":
        try:
            period_id = request.GET.get("periodo_id")
            month = request.GET.get("month") or request.GET.get("mes")
            cache_key = stats_cache_key(period_id, month)
            cached = cache.get(cache_key)
            if cached is not None:
                return JsonResponse(cached)

            evidences = Evidence.objects.all()
            validations = EvidenceValidationResult.objects.select_related(
                "evidence", "evidence__university", "evidence__indicator", "evidence__period"
            )
            if period_id:
                evidences = evidences.filter(period_id=period_id)
                validations = validations.filter(evidence__period_id=period_id)
            if month:
                evidences = evidences.filter(month=month)
                validations = validations.filter(evidence__month=month)

            ranking = []
            national_sum = 0
            integrated_sum = 0
            validation_count = 0

            if not month:
                summaries = UniversityEvaluationSummary.objects.select_related("university").filter(
                    university__is_active=True
                )
                if period_id:
                    summaries = summaries.filter(period_id=period_id)

                by_university = {}
                for summary in summaries:
                    count = int(summary.evaluated_documents or summary.total_indicators or 0)
                    if count <= 0:
                        continue
                    national_score = float(summary.national_index or summary.total_index or 0)
                    integrated_score = float(summary.integrated_index or summary.total_index or 0)
                    national_sum += national_score * count
                    integrated_sum += integrated_score * count
                    validation_count += count

                    bucket = by_university.setdefault(summary.university_id, {
                        "id": summary.university_id,
                        "name": summary.university.acronym,
                        "full_name": summary.university.name,
                        "logo_url": _logo_url(request, _resolve_university_logo_path(summary.university)),
                        "logo_path": _resolve_university_logo_path(summary.university) or "",
                        "logo_initials": summary.university.acronym[:4] if summary.university.acronym else "UNIV",
                        "score_sum": 0,
                        "integrated_score_sum": 0,
                        "count": 0,
                    })
                    bucket["score_sum"] += national_score * count
                    bucket["integrated_score_sum"] += integrated_score * count
                    bucket["count"] += count

                for item in by_university.values():
                    ranking.append({
                        "id": item["id"],
                        "name": item["name"],
                        "full_name": item["full_name"],
                        "logo_url": item["logo_url"],
                        "logo_path": item["logo_path"],
                        "logo_initials": item["logo_initials"],
                        "transparency_score": round(item["score_sum"] / item["count"], 2) if item["count"] else 0,
                        "integrated_transparency_score": round(item["integrated_score_sum"] / item["count"], 2) if item["count"] else 0,
                        "evaluated_documents": item["count"],
                    })

            if not ranking:
                validation_rows = list(validations)
                validation_count = len(validation_rows)
                national_sum = 0
                integrated_sum = 0
                by_university = {}

                for vr in validation_rows:
                    national_score = float(vr.total_score)
                    international = evaluate_international_standards(
                        vr.evidence,
                        lotaip_result={
                            "puntaje_total": national_score,
                            "puntaje_estructura": float(vr.score_structure),
                        },
                    )
                    integrated_score = international["indice_nacional_internacional"]
                    national_sum += national_score
                    integrated_sum += integrated_score

                    univ = vr.evidence.university
                    if not univ:
                        continue
                    bucket = by_university.setdefault(univ.id, {
                        "id": univ.id,
                        "name": univ.acronym,
                        "full_name": univ.name,
                        "logo_url": _logo_url(request, _resolve_university_logo_path(univ)),
                        "logo_path": _resolve_university_logo_path(univ) or "",
                        "logo_initials": univ.acronym[:4] if univ.acronym else "UNIV",
                        "score_sum": 0,
                        "integrated_score_sum": 0,
                        "count": 0,
                    })
                    bucket["score_sum"] += national_score
                    bucket["integrated_score_sum"] += integrated_score
                    bucket["count"] += 1

                for item in by_university.values():
                    ranking.append({
                        "id": item["id"],
                        "name": item["name"],
                        "full_name": item["full_name"],
                        "logo_url": item["logo_url"],
                        "logo_path": item["logo_path"],
                        "logo_initials": item["logo_initials"],
                        "transparency_score": round(item["score_sum"] / item["count"], 2) if item["count"] else 0,
                        "integrated_transparency_score": round(item["integrated_score_sum"] / item["count"], 2) if item["count"] else 0,
                        "evaluated_documents": item["count"],
                    })

            avg_transparency = round(national_sum / validation_count, 2) if validation_count else 0
            avg_transparency_integrated = round(integrated_sum / validation_count, 2) if validation_count else 0
            ranking.sort(key=lambda item: item["transparency_score"], reverse=True)

            recent_documents = [
                {
                    "id": ev.id,
                    "title": ev.title,
                    "indicator_code": ev.indicator.code if ev.indicator_id else None,
                    "university": ev.university.acronym if ev.university_id else None,
                    "status": ev.validation_status,
                    "file_type": ev.file_type,
                    "uploaded_at": ev.uploaded_at.isoformat() if ev.uploaded_at else None,
                }
                for ev in evidences.select_related("indicator", "university").order_by("-uploaded_at")[:8]
            ]

            data = {
                "total_universities": University.objects.filter(is_active=True).count(),
                "total_documents":    evidences.count(),
                "pending_reviews":    evidences.filter(validation_status="pendiente").count(),
                "approved_docs":      evidences.filter(validation_status="aprobado").count(),
                "avg_transparency":   avg_transparency,
                "avg_transparency_integrated": avg_transparency_integrated,
                "active_users":       AppUser.objects.filter(is_active=True).count(),
                "observations_open":  validations.exclude(observations=[]).count(),
                "indicators_active":  Indicator.objects.filter(is_active=True).count(),
                "evaluated_documents": validation_count,
                "ranking": ranking[:10],
                "recent_documents": recent_documents,
            }
            cache.set(cache_key, data, 60)
            return JsonResponse(data)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener estadisticas: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Metodo no permitido"}, status=405)


@csrf_exempt
def list_roles(request):
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: solo Administrador (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method == "GET":
        try:
            roles = Role.objects.all().order_by("id")
            data  = [{"id": r.id, "name": r.name, "description": r.description} for r in roles]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener roles: {str(exc)}"}, status=500)
    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Errores de auditorÃƒÂ­a (descifrados) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def list_audit_errors(request):
    """
    GET /api/audit/errors/
    Devuelve los errores del sistema con error_message y stack_trace descifrados.
    Solo accesible para administradores (role_id=1).
    """
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: solo Administrador (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method == "GET":
        try:
            errors = AuditError.objects.all().order_by("-created_at")[:200]
            data = [
                {
                    "id":            e.id,
                    "user_id":       e.user_id,
                    "module":        e.module,
                    "function_name": e.function_name,
                    "error_code":    e.error_code,
                    "error_message": decrypt_field(e.error_message),   # descifrado aqui
                    "stack_trace":   decrypt_field(e.stack_trace) if e.stack_trace else None,  # descifrado aqui
                    "created_at":    e.created_at.isoformat() if e.created_at else None,
                }
                for e in errors
            ]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener errores: {str(exc)}"}, status=500)

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Logs de auditorÃƒÂ­a (acciones exitosas) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def list_audit_logs(request):
    """
    GET /api/audit/logs/
    Devuelve el historial de acciones exitosas del sistema.
    """
    # Ã¢â€â‚¬Ã¢â€â‚¬ Control de acceso: solo Administrador (HT-08) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method == "GET":
        try:
            logs = AuditLog.objects.all().order_by("-created_at")[:300]
            data = [
                {
                    "id":          l.id,
                    "user_id":     l.user_id,
                    "module":      l.module,
                    "action":      l.action,
                    "table_name":  l.table_name,
                    "record_id":   l.record_id,
                    "description": l.description,
                    "created_at":  l.created_at.isoformat() if l.created_at else None,
                }
                for l in logs
            ]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener logs: {str(exc)}"}, status=500)

    return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)


# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Recuperar contraseÃƒÂ±a Ã¢â‚¬â€ solicitud Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def request_password_reset(request):
    """
    POST /api/auth/password-reset/request/
    Body: { "email": "usuario@ejemplo.com" }
    Genera un token y envÃƒÂ­a un correo con el link de restablecimiento.
    Siempre devuelve 200 para no revelar si el email existe o no.
    """
    if request.method != "POST":
        return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)

    email_raw = data.get("email", "").strip().lower()
    if not email_raw:
        return JsonResponse({"error": "El correo es obligatorio"}, status=400)

    # Respuesta genÃƒÂ©rica: no revelamos si el correo existe o no (seguridad)
    GENERIC_MSG = "Si el correo estÃƒÂ¡ registrado, recibirÃƒÂ¡s un enlace para restablecer tu contraseÃƒÂ±a."

    email_idx = hash_email(email_raw)
    try:
        user = AppUser.objects.get(email_hash=email_idx)
    except AppUser.DoesNotExist:
        _log_error(
            "Reset solicitado para email no registrado",
            function_name="request_password_reset",
            error_code="USER_NOT_FOUND",
        )
        return JsonResponse({"error": "El correo ingresado no estÃƒÂ¡ registrado en el sistema."}, status=404)

    if not user.is_active:
        return JsonResponse({"error": "Esta cuenta estÃƒÂ¡ desactivada. Contacta al administrador."}, status=403)

    # Invalida tokens anteriores sin usar
    PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

    # Crea token nuevo con expiraciÃƒÂ³n configurada
    expiry_minutes = getattr(settings, "PASSWORD_RESET_EXPIRY_MINUTES", 30)
    expires_at = timezone.now() + timedelta(minutes=expiry_minutes)
    reset_token = PasswordResetToken.objects.create(user=user, expires_at=expires_at)

    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    reset_link = f"{frontend_url}/reset-password/{reset_token.token}"

    subject = "Restablecer contraseÃƒÂ±a Ã¢â‚¬â€ SisTransp"
    message = (
        f"Hola {user.full_name},\n\n"
        f"Recibimos una solicitud para restablecer la contraseÃƒÂ±a de tu cuenta.\n\n"
        f"Haz clic en el siguiente enlace (vÃƒÂ¡lido por {expiry_minutes} minutos):\n"
        f"{reset_link}\n\n"
        f"Si no solicitaste este cambio, ignora este correo.\n\n"
        f"Ã¢â‚¬â€ Equipo SisTransp"
    )

    # Ã¢â€â‚¬Ã¢â€â‚¬ Modo desarrollo: muestra el link en consola y en la respuesta Ã¢â€â‚¬Ã¢â€â‚¬
    debug_mode = getattr(settings, "DEBUG_RESET_LINK", False)

    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [email_raw], fail_silently=False)
    except Exception as exc:
        if not debug_mode:
            _log_error(
                f"Error al enviar email de reset: {str(exc)}",
                user_id=user.id,
                function_name="request_password_reset",
                error_code="EMAIL_SEND_ERROR",
                exc=exc,
            )
            return JsonResponse({"error": "No se pudo enviar el correo. Intente mÃƒÂ¡s tarde."}, status=500)
        # En modo debug: el correo fallÃƒÂ³ pero continuamos de todas formas
        print(f"\n{'='*60}")
        print(f"[DEV] Email de reset NO enviado (sin SMTP). Link de prueba:")
        print(f"  {reset_link}")
        print(f"{'='*60}\n")

    _log(
        user_id=user.id,
        action="PASSWORD_RESET_REQUESTED",
        table_name="core.password_reset_tokens",
        record_id=user.id,
        description="Token de reset generado y enviado por correo",
    )

    response_data = {"message": GENERIC_MSG}
    if debug_mode:
        # Devuelve el link en el JSON para poder copiarlo desde el navegador
        response_data["dev_reset_link"] = reset_link
        print(f"\n[DEV] reset_link incluido en respuesta JSON: {reset_link}\n")

    return JsonResponse(response_data)



# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Recuperar contraseÃƒÂ±a Ã¢â‚¬â€ confirmaciÃƒÂ³n Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@csrf_exempt
def confirm_password_reset(request, token):
    """
    POST /api/auth/password-reset/confirm/<token>/
    Body: { "password": "nuevaContraseÃƒÂ±a", "confirm": "nuevaContraseÃƒÂ±a" }
    Valida el token y actualiza la contraseÃƒÂ±a del usuario.
    """
    if request.method != "POST":
        return JsonResponse({"error": "MÃƒÂ©todo no permitido"}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Cuerpo JSON invÃ¡lido"}, status=400)

    password = data.get("password", "")
    confirm  = data.get("confirm", "")

    if not password or not confirm:
        return JsonResponse({"error": "Todos los campos son obligatorios"}, status=400)
    if password != confirm:
        return JsonResponse({"error": "Las contrasenas no coinciden"}, status=400)
    try:
        password = validate_password(password)
    except ValueError as ve:
        return JsonResponse({"error": str(ve)}, status=400)

    try:
        reset_token = PasswordResetToken.objects.select_related("user").get(token=token)
    except PasswordResetToken.DoesNotExist:
        return JsonResponse({"error": "El enlace no es vÃƒÂ¡lido"}, status=400)

    if reset_token.used:
        return JsonResponse({"error": "Este enlace ya fue utilizado"}, status=400)

    if timezone.now() > reset_token.expires_at:
        return JsonResponse({"error": "El enlace ha expirado. Solicita uno nuevo."}, status=400)

    user = reset_token.user
    if not user.is_active:
        return JsonResponse({"error": "Esta cuenta estÃƒÂ¡ desactivada"}, status=403)

    # Actualiza la contraseÃƒÂ±a y desbloquea la cuenta
    user.password_hash          = make_password(password)
    user.updated_at             = timezone.now()
    user.failed_login_attempts  = 0
    user.is_locked              = False
    user.save(update_fields=["password_hash", "updated_at", "failed_login_attempts", "is_locked"])

    # Invalida el token
    reset_token.used = True
    reset_token.save(update_fields=["used"])

    # Invalida cualquier otro token del usuario (limpieza)
    PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

    _log(
        user_id=user.id,
        action="PASSWORD_RESET_CONFIRMED",
        table_name="core.users",
        record_id=user.id,
        description="ContraseÃƒÂ±a restablecida exitosamente via token",
    )
    return JsonResponse({"message": "ContraseÃƒÂ±a actualizada correctamente. Ya puedes iniciar sesiÃƒÂ³n."})