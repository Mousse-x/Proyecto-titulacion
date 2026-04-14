from django.http import JsonResponse
import json
import traceback
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from .models import AppUser, Role, AuditLog, AuditError, University, Indicator, Category
from .encryption import encrypt_email, decrypt_email, hash_email, encrypt_field, decrypt_field


# ─── Helpers de auditoría ────────────────────────────────────────────

def _log(user_id, action, table_name=None, record_id=None, description=None):
    """Registra una acción exitosa en audit.logs"""
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
    """Registra un error o acción fallida en audit.errors (cifrado)"""
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

        full_name = data.get("fullName", "").strip()
        email_raw = data.get("email", "").strip().lower()
        password  = data.get("password", "")

        if not full_name or not email_raw or not password:
            _log_error(
                f"Registro fallido: campos obligatorios vacíos",
                function_name="register_user",
                error_code="MISSING_FIELDS",
            )
            return JsonResponse({"error": "Todos los campos son obligatorios"}, status=400)

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
                f"Login fallido: campos vacíos",
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
                f"Login fallido: usuario no existe",
                function_name="login_user",
                error_code="USER_NOT_FOUND",
            )
            return JsonResponse({"error": "Credenciales incorrectas"}, status=400)

        if not user.is_active:
            _log_error(
                f"Login fallido: cuenta inactiva",
                user_id=user.id,
                function_name="login_user",
                error_code="ACCOUNT_INACTIVE",
            )
            return JsonResponse({"error": "Cuenta desactivada. Contacte al administrador"}, status=403)

        if not check_password(password, user.password_hash):
            _log_error(
                f"Login fallido: contraseña incorrecta",
                user_id=user.id,
                function_name="login_user",
                error_code="WRONG_PASSWORD",
            )
            return JsonResponse({"error": "Credenciales incorrectas"}, status=400)

        # ✅ Login exitoso — actualizar last_login
        try:
            user.last_login = timezone.now()
            user.save(update_fields=["last_login"])
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
            "user": {
                "id":            user.id,
                "name":          user.full_name,
                "email":         decrypt_email(user.email),  # ← descifrado para el frontend
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
    if request.method == "GET":
        try:
            users = AppUser.objects.select_related("role", "university").order_by("id")
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


@csrf_exempt
def user_detail(request, user_id):
    try:
        user = AppUser.objects.select_related("role").get(id=user_id)
    except AppUser.DoesNotExist:
        return JsonResponse({"error": "Usuario no encontrado"}, status=404)

    if request.method == "PUT":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

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
        user.delete()
        return JsonResponse({"message": "Usuario eliminado"})

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ─── Listado de universidades ─────────────────────────────────────────

@csrf_exempt
def list_universities(request):
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