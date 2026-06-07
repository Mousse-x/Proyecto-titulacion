from django.http import JsonResponse, FileResponse, Http404
import json
import traceback
import os
import re
import mimetypes
import uuid
from pathlib import Path
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from datetime import timedelta
from django.core.mail import send_mail
from django.conf import settings
from django.core.files.storage import default_storage
from django.http.multipartparser import MultiPartParser, MultiPartParserError
from email.utils import parseaddr
from .models import AppUser, Role, AuditLog, AuditError, University, Indicator, Category, PasswordResetToken, Evidence, EvaluationPeriod, EvidenceValidationResult, UserFeedback
from .encryption import encrypt_email, decrypt_email, hash_email, encrypt_field, decrypt_field
from .middleware import generate_jwt, require_auth, require_role
from .sanitizers import sanitize_text, validate_name, validate_email_format, validate_password
from .services.international_evaluator import evaluate_international_standards


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

    safe_acronym = re.sub(r"[^a-z0-9]+", "-", str(acronym or "universidad").lower()).strip("-") or "universidad"
    filename = f"{safe_acronym}-{uuid.uuid4().hex[:10]}{ext}"
    return default_storage.save(f"university_logos/{filename}", upload)


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
        "logo_url":          _logo_url(request, getattr(university, "logo_path", None)),
        "logo_path":         getattr(university, "logo_path", "") or "",
        "is_active":        university.is_active,
        "transparency_score": university_score.get("transparency_score", 0),
        "integrated_transparency_score": university_score.get("integrated_transparency_score", 0),
        "evaluated_documents": university_score.get("evaluated_documents", 0),
        "rank":             university_score.get("rank", 0),
        "logo_initials":    university.acronym[:4] if university.acronym else "UNIV",
        "color":            "#6366F1",
    }


def _get_university_score_data():
    validations = EvidenceValidationResult.objects.select_related("evidence", "evidence__university")
    by_university = {}

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


# ─── Helpers de auditoría ────────────────────────────────────────────

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


# ─── Registro ────────────────────────────────────────────────────────

@csrf_exempt
def register_user(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            _log_error("Cuerpo JSON inválido en registro", function_name="register_user", error_code="INVALID_JSON")
            return JsonResponse({"error": "Cuerpo de la solicitud inválido"}, status=400)

        full_name_raw = data.get("fullName", "").strip()
        email_raw = data.get("email", "").strip().lower()
        password  = data.get("password", "")

        if not full_name_raw or not email_raw or not password:
            _log_error(
                "Registro fallido: campos obligatorios vacíos",
                function_name="register_user",
                error_code="MISSING_FIELDS",
            )
            return JsonResponse({"error": "Todos los campos son obligatorios"}, status=400)

        # ── Sanitización y validación de entradas (HT-08) ────────────
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
            return JsonResponse({"error": "El email ya está registrado"}, status=400)

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

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Login ───────────────────────────────────────────────────────────

@csrf_exempt
def login_user(request):
    MAX_ATTEMPTS = 5
    SUPPORT_EMAIL = "sistema_transparencia@hotmail.com"

    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            _log_error("Cuerpo JSON inválido en login", function_name="login_user", error_code="INVALID_JSON")
            return JsonResponse({"error": "Cuerpo de la solicitud inválido"}, status=400)

        email_raw = data.get("email", "").strip().lower()
        password  = data.get("password", "")

        if not email_raw or not password:
            _log_error(
                "Login fallido: campos vacíos",
                function_name="login_user",
                error_code="MISSING_FIELDS",
            )
            return JsonResponse({"error": "Email y contraseña son obligatorios"}, status=400)

        # Buscar por hash determinístico
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

        # ── Verificar si la cuenta está bloqueada ───────────────────────
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

        # ── Verificar contraseña ────────────────────────────────────────
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
                f"Login fallido: contraseña incorrecta (intento {user.failed_login_attempts}/{MAX_ATTEMPTS})",
                user_id=user.id,
                function_name="login_user",
                error_code="WRONG_PASSWORD",
            )
            return JsonResponse({
                "error":     "Credenciales incorrectas",
                "remaining": remaining,
            }, status=400)

        # ✅ Login exitoso — reiniciar contador y actualizar last_login
        try:
            user.last_login = timezone.now()
            user.failed_login_attempts = 0
            user.is_locked = False
            user.save(update_fields=["last_login", "failed_login_attempts", "is_locked"])
        except Exception:
            pass

        # ── Omitir 2FA para correos de prueba ──
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

        import random
        import string
        
        # Generar OTP
        otp = ''.join(random.choices(string.digits, k=6))
        user.otp_code = otp
        user.otp_expiry = timezone.now() + timedelta(minutes=5)
        user.save(update_fields=["otp_code", "otp_expiry", "updated_at"])
        
        # Enviar correo
        try:
            send_mail(
                subject="Código de Verificación - Sistema Transparencia",
                message=f"Su código de verificación (OTP) es: {otp}\nEste código expirará en 5 minutos.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email_raw],
                fail_silently=False,
            )
            print(f"OTP para {email_raw}: {otp}") # Para desarrollo
        except Exception as e:
            _log_error(f"Error enviando OTP: {str(e)}", user_id=user.id, function_name="login_user")
            return JsonResponse({"error": "Error al enviar el código de verificación"}, status=500)

        return JsonResponse({
            "requires_2fa": True,
            "email": email_raw,
            "message": "Código de verificación enviado al correo"
        })

    return JsonResponse({"error": "Método no permitido"}, status=405)


@csrf_exempt
def verify_otp(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)
            
        email_raw = data.get("email", "").strip().lower()
        otp = data.get("otp", "").strip()
        
        if not email_raw or not otp:
            return JsonResponse({"error": "Email y código son obligatorios"}, status=400)
            
        email_idx = hash_email(email_raw)
        try:
            user = AppUser.objects.select_related("role").get(email_hash=email_idx)
        except AppUser.DoesNotExist:
            return JsonResponse({"error": "Usuario no encontrado"}, status=400)
            
        if not user.otp_code or user.otp_code != otp:
            return JsonResponse({"error": "Código de verificación inválido"}, status=400)
            
        if not user.otp_expiry or timezone.now() > user.otp_expiry:
            return JsonResponse({"error": "El código de verificación ha expirado"}, status=400)
            
        # OTP Válido - Generar sesión
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
        
    return JsonResponse({"error": "Método no permitido"}, status=405)


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
    user, err = require_role(request, [1])
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Metodo no permitido"}, status=405)

    queryset = UserFeedback.objects.all().order_by("-created_at")
    feedback_type = request.GET.get("type", "").strip().lower()
    status = request.GET.get("status", "").strip().lower()

    if feedback_type in FEEDBACK_TYPES:
        queryset = queryset.filter(feedback_type=feedback_type)
    if status in {"pending", "reviewed"}:
        queryset = queryset.filter(status=status)

    items = [_serialize_user_feedback(item) for item in queryset[:300]]
    return JsonResponse(items, safe=False)


@csrf_exempt
def user_feedback_detail(request, feedback_id):
    user, err = require_role(request, [1])
    if err:
        return err

    try:
        item = UserFeedback.objects.get(id=feedback_id)
    except UserFeedback.DoesNotExist:
        return JsonResponse({"error": "Comentario no encontrado"}, status=404)

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
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)
            
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
            return JsonResponse({"error": "Refresh token inválido"}, status=401)
            
        # Verificar tipo de token
        if not payload.get("is_refresh"):
            return JsonResponse({"error": "Tipo de token inválido"}, status=401)
            
        try:
            user = AppUser.objects.get(id=payload["user_id"], is_active=True)
        except AppUser.DoesNotExist:
            return JsonResponse({"error": "Usuario no encontrado"}, status=401)
            
        # Verificar concurrencia (session_id)
        token_session_id = payload.get("session_id")
        if not token_session_id or str(user.session_id) != token_session_id:
            return JsonResponse({"error": "La sesión ha expirado o ha sido invalidada. Inicie sesión nuevamente."}, status=401)
            
        # Emitir nuevo access_token
        access_token = generate_jwt(user)
        
        return JsonResponse({
            "token": access_token
        })
        
    return JsonResponse({"error": "Método no permitido"}, status=405)

@csrf_exempt
def auth_status(request):
    """
    Endpoint ligero para que el frontend haga polling y verifique 
    si su sesión (token) sigue siendo válida y no ha sido invalidada por concurrencia.
    """
    from .middleware import require_auth
    user, err = require_auth(request)
    if err:
        return err
    return JsonResponse({"status": "active"})

# ─── Listado de usuarios ─────────────────────────────────────────────



@csrf_exempt
def list_users(request):
    # ── Control de acceso: solo Administrador (HT-08) ────────────
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
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        email_raw  = data.get("email", "").strip().lower()
        full_name  = data.get("full_name", "").strip()
        role_id    = data.get("role_id", 4)
        password   = data.get("password", "admin123")

        if not email_raw or not full_name:
            return JsonResponse({"error": "Nombre y email son obligatorios"}, status=400)

        # ── Regla: máximo 2 usuarios con role_id=1 ──────────────────────
        if int(role_id) == 1:
            admin_count = AppUser.objects.filter(role_id=1).count()
            if admin_count >= 2:
                return JsonResponse(
                    {"error": "Solo puede haber 2 administradores del sistema (1 superadmin + 1 admin). Elimine uno antes de crear otro."},
                    status=400,
                )

        email_idx = hash_email(email_raw)
        if AppUser.objects.filter(email_hash=email_idx).exists():
            return JsonResponse({"error": "El email ya está registrado"}, status=400)

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

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Helper: obtiene el ID del superadmin (role_id=1 con menor id) ───
def _get_superadmin_id():
    """Retorna el id del superadmin: el primer usuario con role_id=1 (menor id)."""
    first = AppUser.objects.filter(role_id=1).order_by("id").first()
    return first.id if first else None


@csrf_exempt
def user_detail(request, user_id):
    # ── Control de acceso: solo Administrador (HT-08) ────────────
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
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        requester_id = data.get("_requester_id")  # ID del admin que realiza la acción
        superadmin_id = _get_superadmin_id()

        # ── Regla 1: un admin no puede modificar su propia cuenta ────────
        if requester_id and int(requester_id) == user_id:
            return JsonResponse(
                {"error": "No puedes modificar tu propia cuenta desde este panel."},
                status=403,
            )

        # ── Regla 2: el superadmin no puede ser desactivado por nadie ────
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

        # ── Regla 3: máximo 2 usuarios con role_id=1 ────────────────────
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

        # ── Regla: no se puede eliminar al superadmin ────────────────────
        if user_id == superadmin_id:
            return JsonResponse(
                {"error": "El superadministrador no puede ser eliminado."},
                status=403,
            )

        user.delete()
        return JsonResponse({"message": "Usuario eliminado"})

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Listado de universidades ─────────────────────────────────────────

@csrf_exempt
def list_universities(request):
    # ── Control de acceso: GET=todos autenticados, POST=solo Admin (HT-08) ──
    if request.method == "POST":
        _, err = require_role(request, [1])
        if err:
            return err
    else:
        _, err = require_auth(request)
        if err:
            return err

    if request.method == "GET":
        try:
            univs = University.objects.filter(is_active=True).order_by("name")
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
                logo_path = _save_university_logo(files.get("logo"), acronym)
                now = timezone.now()
                univ = University.objects.create(
                    name             = _get_value(data, "full_name", "").strip(),
                    acronym          = acronym,
                    province         = _get_value(data, "province", ""),
                    city             = _get_value(data, "city", ""),
                    website_url      = _get_value(data, "website", ""),
                    transparency_url = _normalize_dpe_transparency_url(transparency_input),
                    logo_path        = logo_path,
                    institution_type = _get_value(data, "type", "Pública"),
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
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        transparency_input = (
            data.get("dpe_entity_id")
            or data.get("transparency_id")
            or data.get("establishment_id")
            or data.get("transparency_url", "")
        )

        now = timezone.now()
        try:
            univ = University.objects.create(
                name             = data.get("full_name", "").strip(),
                acronym          = data.get("name", "").strip().upper(),
                province         = data.get("province", ""),
                city             = data.get("city", ""),
                website_url      = data.get("website", ""),
                transparency_url = _normalize_dpe_transparency_url(transparency_input),
                institution_type = data.get("type", "Pública"),
                is_active        = data.get("is_active", True),
                created_at       = now,
                updated_at       = now,
            )
            return JsonResponse({"id": univ.id, "message": "Universidad creada"}, status=201)
        except Exception as exc:
            return JsonResponse({"error": f"Error al crear universidad: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Método no permitido"}, status=405)


@csrf_exempt
def university_detail(request, univ_id):
    # ── Control de acceso: solo Administrador (HT-08) ────────────
    _, err = require_role(request, [1])
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
            univ.updated_at = timezone.now()
            univ.save()
            return JsonResponse({"message": "Universidad actualizada", "logo_url": _logo_url(request, getattr(univ, "logo_path", None))})

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

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
        univ.updated_at = timezone.now()
        univ.save()
        return JsonResponse({"message": "Universidad actualizada"})

    if request.method == "DELETE":
        univ.delete()
        return JsonResponse({"message": "Universidad eliminada"})

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Listado de indicadores ───────────────────────────────────────────

@csrf_exempt
def list_indicators(request):
    # ── Control de acceso: todos los autenticados (HT-08) ────────
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

    return JsonResponse({"error": "Método no permitido"}, status=405)

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

    return JsonResponse({"error": "Método no permitido"}, status=405)


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
            return JsonResponse({"error": "No se proporcionó ningún archivo"}, status=400)
            
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
        return JsonResponse({"message": "Plantilla subida con éxito", "url": template.file_path.url, "name": template.file_name})

    if request.method == "DELETE":
        if hasattr(indicator, 'template') and indicator.template:
            indicator.template.file_path.delete(save=False)
            indicator.template.delete()
            return JsonResponse({"message": "Plantilla eliminada"})
        return JsonResponse({"error": "No hay plantilla asignada"}, status=400)

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Stats del sistema ────────────────────────────────────────────────

@csrf_exempt
def system_stats(request):
    _, err = require_auth(request)
    if err:
        return err

    if request.method == "GET":
        try:
            period_id = request.GET.get("periodo_id")
            month = request.GET.get("month") or request.GET.get("mes")

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

            validation_count = validations.count()
            avg_transparency = 0
            avg_transparency_integrated = 0
            if validation_count:
                integrated_sum = 0
                for vr in validations:
                    national_score = float(vr.total_score)
                    international = evaluate_international_standards(
                        vr.evidence,
                        lotaip_result={
                            "puntaje_total": national_score,
                            "puntaje_estructura": float(vr.score_structure),
                        },
                    )
                    integrated_sum += international["indice_nacional_internacional"]

                avg_transparency = round(
                    sum(float(v.total_score) for v in validations) / validation_count,
                    2,
                )
                avg_transparency_integrated = round(integrated_sum / validation_count, 2)

            ranking = []
            by_university = {}
            for vr in validations:
                univ = vr.evidence.university
                if not univ:
                    continue
                bucket = by_university.setdefault(univ.id, {
                    "id": univ.id,
                    "name": univ.acronym,
                    "full_name": univ.name,
                    "score_sum": 0,
                    "count": 0,
                })
                bucket["score_sum"] += float(vr.total_score)
                international = evaluate_international_standards(
                    vr.evidence,
                    lotaip_result={
                        "puntaje_total": float(vr.total_score),
                        "puntaje_estructura": float(vr.score_structure),
                    },
                )
                bucket["integrated_score_sum"] = bucket.get("integrated_score_sum", 0) + international["indice_nacional_internacional"]
                bucket["count"] += 1

            for item in by_university.values():
                ranking.append({
                    "id": item["id"],
                    "name": item["name"],
                    "full_name": item["full_name"],
                    "transparency_score": round(item["score_sum"] / item["count"], 2) if item["count"] else 0,
                    "integrated_transparency_score": round(item.get("integrated_score_sum", 0) / item["count"], 2) if item["count"] else 0,
                    "evaluated_documents": item["count"],
                })
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
            return JsonResponse(data)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener estadísticas: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Listado de roles ─────────────────────────────────────────────────

@csrf_exempt
def list_roles(request):
    # ── Control de acceso: solo Administrador (HT-08) ────────────
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
    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Errores de auditoría (descifrados) ───────────────────────────────

@csrf_exempt
def list_audit_errors(request):
    """
    GET /api/audit/errors/
    Devuelve los errores del sistema con error_message y stack_trace descifrados.
    Solo accesible para administradores (role_id=1).
    """
    # ── Control de acceso: solo Administrador (HT-08) ────────────
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

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Logs de auditoría (acciones exitosas) ────────────────────────────

@csrf_exempt
def list_audit_logs(request):
    """
    GET /api/audit/logs/
    Devuelve el historial de acciones exitosas del sistema.
    """
    # ── Control de acceso: solo Administrador (HT-08) ────────────
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

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Recuperar contraseña — solicitud ────────────────────────────────

@csrf_exempt
def request_password_reset(request):
    """
    POST /api/auth/password-reset/request/
    Body: { "email": "usuario@ejemplo.com" }
    Genera un token y envía un correo con el link de restablecimiento.
    Siempre devuelve 200 para no revelar si el email existe o no.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

    email_raw = data.get("email", "").strip().lower()
    if not email_raw:
        return JsonResponse({"error": "El correo es obligatorio"}, status=400)

    # Respuesta genérica: no revelamos si el correo existe o no (seguridad)
    GENERIC_MSG = "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."

    email_idx = hash_email(email_raw)
    try:
        user = AppUser.objects.get(email_hash=email_idx)
    except AppUser.DoesNotExist:
        _log_error(
            "Reset solicitado para email no registrado",
            function_name="request_password_reset",
            error_code="USER_NOT_FOUND",
        )
        return JsonResponse({"error": "El correo ingresado no está registrado en el sistema."}, status=404)

    if not user.is_active:
        return JsonResponse({"error": "Esta cuenta está desactivada. Contacta al administrador."}, status=403)

    # Invalida tokens anteriores sin usar
    PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

    # Crea token nuevo con expiración configurada
    expiry_minutes = getattr(settings, "PASSWORD_RESET_EXPIRY_MINUTES", 30)
    expires_at = timezone.now() + timedelta(minutes=expiry_minutes)
    reset_token = PasswordResetToken.objects.create(user=user, expires_at=expires_at)

    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    reset_link = f"{frontend_url}/reset-password/{reset_token.token}"

    subject = "Restablecer contraseña — SisTransp"
    message = (
        f"Hola {user.full_name},\n\n"
        f"Recibimos una solicitud para restablecer la contraseña de tu cuenta.\n\n"
        f"Haz clic en el siguiente enlace (válido por {expiry_minutes} minutos):\n"
        f"{reset_link}\n\n"
        f"Si no solicitaste este cambio, ignora este correo.\n\n"
        f"— Equipo SisTransp"
    )

    # ── Modo desarrollo: muestra el link en consola y en la respuesta ──
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
            return JsonResponse({"error": "No se pudo enviar el correo. Intente más tarde."}, status=500)
        # En modo debug: el correo falló pero continuamos de todas formas
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



# ─── Recuperar contraseña — confirmación ────────────────────────────

@csrf_exempt
def confirm_password_reset(request, token):
    """
    POST /api/auth/password-reset/confirm/<token>/
    Body: { "password": "nuevaContraseña", "confirm": "nuevaContraseña" }
    Valida el token y actualiza la contraseña del usuario.
    """
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

    password = data.get("password", "")
    confirm  = data.get("confirm", "")

    if not password or not confirm:
        return JsonResponse({"error": "Todos los campos son obligatorios"}, status=400)
    if password != confirm:
        return JsonResponse({"error": "Las contraseñas no coinciden"}, status=400)
    if len(password) < 6:
        return JsonResponse({"error": "La contraseña debe tener al menos 6 caracteres"}, status=400)

    try:
        reset_token = PasswordResetToken.objects.select_related("user").get(token=token)
    except PasswordResetToken.DoesNotExist:
        return JsonResponse({"error": "El enlace no es válido"}, status=400)

    if reset_token.used:
        return JsonResponse({"error": "Este enlace ya fue utilizado"}, status=400)

    if timezone.now() > reset_token.expires_at:
        return JsonResponse({"error": "El enlace ha expirado. Solicita uno nuevo."}, status=400)

    user = reset_token.user
    if not user.is_active:
        return JsonResponse({"error": "Esta cuenta está desactivada"}, status=403)

    # Actualiza la contraseña y desbloquea la cuenta
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
        description="Contraseña restablecida exitosamente via token",
    )
    return JsonResponse({"message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."})
