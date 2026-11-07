"""Controladores de administración de usuarios y roles."""
from django.http import JsonResponse
import json
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from ..models import AppUser, Role
from ..encryption import encrypt_email, decrypt_email, hash_email
from ..middleware import require_role


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
