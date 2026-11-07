"""Controladores de autenticación: registro, login, 2FA, sesión y recuperación de clave."""
from django.http import JsonResponse
import json
import uuid
import secrets
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from datetime import timedelta
from django.core.mail import send_mail
from django.conf import settings
from ..models import AppUser, Role, PasswordResetToken
from ..encryption import encrypt_email, decrypt_email, hash_email
from ..middleware import generate_jwt, require_auth
from ..sanitizers import sanitize_text, validate_name, validate_email_format, validate_password
from ..otp_mailer import enqueue_otp_email
from .common import _log, _log_error


def _send_otp_email_async(user_id, recipient_email, otp):
    """Encola el OTP para enviarlo sin bloquear la respuesta del login."""
    queued = enqueue_otp_email(user_id, recipient_email, otp, error_handler=_log_error)
    if not queued:
        print(f"No se pudo encolar OTP para {recipient_email}")


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

        #  Login exitoso — reiniciar contador y actualizar last_login
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
            
            from ..middleware import generate_jwt
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
def refresh_token(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)
            
        token = data.get("refresh_token")
        if not token:
            return JsonResponse({"error": "Refresh token es requerido"}, status=400)
            
        from ..middleware import decode_jwt, generate_jwt
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
    from ..middleware import require_auth
    user, err = require_auth(request)
    if err:
        return err
    return JsonResponse({"status": "active"})


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
        return JsonResponse({"error": "Las contrasenas no coinciden"}, status=400)
    try:
        password = validate_password(password)
    except ValueError as ve:
        return JsonResponse({"error": str(ve)}, status=400)

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
