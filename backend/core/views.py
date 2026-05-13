from django.http import JsonResponse, FileResponse, Http404
import json
import traceback
import os
import re
import mimetypes
from pathlib import Path
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from datetime import timedelta
from django.core.mail import send_mail
from django.conf import settings
from .models import AppUser, Role, AuditLog, AuditError, University, Indicator, Category, PasswordResetToken, Evidence, EvaluationPeriod
from .encryption import encrypt_email, decrypt_email, hash_email, encrypt_field, decrypt_field
from .middleware import generate_jwt, require_auth, require_role
from .sanitizers import sanitize_text, validate_name, validate_email_format, validate_password


# ─── Helpers de auditoría ────────────────────────────────────────────

def _log(user_id, action, table_name=None, record_id=None, description=None):
    """Registra auditoría exitosa — AÍSLA la lógica de persistencia"""
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
    """Registra errores cifrados — AÍSLA la lógica de encriptación"""
    try:
        raw_trace = traceback.format_exc() if exc else None
        AuditError.objects.create(
            user_id=user_id,
            module="auth",
            function_name=function_name,
            error_message=encrypt_field(error_message),      # ← cifrado
            error_code=error_code,
            stack_trace=encrypt_field(raw_trace) if raw_trace else None,  # ← cifrado
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
                email         = encrypt_email(email_raw),   # ← cifrado
                email_hash    = email_idx,                   # ← índice HMAC
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
    SUPPORT_EMAIL = "sistematransparencia@hotmail.com"

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

        _log(
            user_id=user.id,
            action="LOGIN",
            table_name="core.users",
            record_id=user.id,
            description=f"Login exitoso (rol: {user.role.name})",
        )

        return JsonResponse({
            "message": "Login exitoso",
            "token": generate_jwt(user),   # ← JWT (HT-08)
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
                    "email":           decrypt_email(u.email),  # ← descifrado al leer
                    "role_id":         u.role.id,
                    "role_name":       u.role.name,
                    "university_id":   u.university_id,
                    "university_name": u.university.name if u.university else None,
                    "is_active":       u.is_active,
                    "is_superadmin":   u.id == superadmin_id,   # ← protegido
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
            data = [
                {
                    "id":               u.id,
                    "name":             u.acronym,
                    "full_name":        u.name,
                    "city":             u.city,
                    "province":         u.province,
                    "type":             u.institution_type,
                    "website":          u.website_url,
                    "transparency_url": u.transparency_url,
                    "is_active":        u.is_active,
                    "transparency_score": 0,
                    "rank":             0,
                    "logo_initials":    u.acronym[:4] if u.acronym else "UNIV",
                    "color":            "#6366F1",
                }
                for u in univs
            ]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener universidades: {str(exc)}"}, status=500)

    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        now = timezone.now()
        try:
            univ = University.objects.create(
                name             = data.get("full_name", "").strip(),
                acronym          = data.get("name", "").strip().upper(),
                province         = data.get("province", ""),
                city             = data.get("city", ""),
                website_url      = data.get("website", ""),
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
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        if "full_name" in data: univ.name = data["full_name"]
        if "name" in data:      univ.acronym = data["name"].upper()
        if "city" in data:      univ.city = data["city"]
        if "province" in data:  univ.province = data["province"]
        if "website" in data:   univ.website_url = data["website"]
        if "type" in data:      univ.institution_type = data["type"]
        if "is_active" in data: univ.is_active = data["is_active"]
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
            indicators = Indicator.objects.select_related("category").order_by("display_order", "code")
            data = [
                {
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
                }
                for i in indicators
            ]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener indicadores: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Stats del sistema ────────────────────────────────────────────────

@csrf_exempt
def system_stats(request):
    # ── Control de acceso: solo Administrador (HT-08) ────────────
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method == "GET":
        try:
            data = {
                "total_universities": University.objects.filter(is_active=True).count(),
                "total_documents":    0,
                "pending_reviews":    0,
                "approved_docs":      0,
                "avg_transparency":   0,
                "active_users":       AppUser.objects.filter(is_active=True).count(),
                "observations_open":  0,
                "indicators_active":  Indicator.objects.filter(is_active=True).count(),
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
                    "error_message": decrypt_field(e.error_message),   # ← descifrado aquí
                    "stack_trace":   decrypt_field(e.stack_trace) if e.stack_trace else None,  # ← descifrado aquí
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