"""
core/middleware.py
Middleware de seguridad para la aplicación:
  1. JWTAuthMiddleware   — verifica tokens JWT y popula request.auth_user
  2. RateLimitMiddleware — limita peticiones por IP en rutas sensibles
"""

import time
import jwt
from collections import defaultdict
from django.http import JsonResponse
from django.conf import settings

from .models import AppUser


# ══════════════════════════════════════════════════════════════════════
#  JWT — Constantes
# ══════════════════════════════════════════════════════════════════════

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_SECONDS = 15 * 60   # 15 minutos
JWT_REFRESH_EXPIRATION_SECONDS = 7 * 24 * 3600 # 7 días

# Rutas públicas que NO requieren token
PUBLIC_PATHS = [
    "/api/auth/login/",
    "/api/auth/register/",
    "/api/auth/password-reset/request/",
    "/api/auth/2fa/verify/",
    "/api/auth/refresh/",
    # confirm lleva un token dinámico — se chequea por prefijo abajo
]

PUBLIC_PREFIXES = [
    "/api/auth/password-reset/confirm/",
    "/admin/",         # Django admin
    "/media/",         # archivos estáticos
    "/static/",        # archivos estáticos
]


def _is_public(path):
    """Retorna True si la ruta no requiere autenticación JWT."""
    if path in PUBLIC_PATHS:
        return True
    for prefix in PUBLIC_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


# ══════════════════════════════════════════════════════════════════════
#  Helpers JWT (usados también en views.py para generar tokens)
# ══════════════════════════════════════════════════════════════════════

def generate_jwt(user, is_refresh=False):
    """Genera un JWT firmado con los datos del usuario."""
    now = time.time()
    exp_seconds = JWT_REFRESH_EXPIRATION_SECONDS if is_refresh else JWT_EXPIRATION_SECONDS
    payload = {
        "user_id":  user.id,
        "role_id":  user.role_id,
        "session_id": str(user.session_id) if user.session_id else None,
        "is_refresh": is_refresh,
        "iat":      now,
        "exp":      now + exp_seconds,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_jwt(token):
    """Decodifica y valida un JWT. Lanza excepciones si es inválido/expirado."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])


# ══════════════════════════════════════════════════════════════════════
#  Middleware: JWT Authentication
# ══════════════════════════════════════════════════════════════════════

class JWTAuthMiddleware:
    """
    Middleware que:
      - Extrae el token del header Authorization: Bearer <token>
      - Decodifica el JWT y carga el usuario de la BD
      - Puebla request.auth_user (AppUser) y request.auth_role_id (int)
      - Retorna 401 si el token falta o es inválido en rutas protegidas
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Inicializar atributos
        request.auth_user = None
        request.auth_role_id = None

        path = request.path

        # Rutas públicas → no verificar token
        if _is_public(path):
            return self.get_response(request)

        # Preflight CORS (OPTIONS) → dejar pasar
        if request.method == "OPTIONS":
            return self.get_response(request)

        # Extraer token
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Bearer "):
            return JsonResponse(
                {"error": "Token de autenticación requerido"},
                status=401,
            )

        token = auth_header[7:]  # quitar "Bearer "

        try:
            payload = decode_jwt(token)
        except jwt.ExpiredSignatureError:
            return JsonResponse({"error": "Token expirado. Inicie sesión nuevamente."}, status=401)
        except jwt.InvalidTokenError:
            return JsonResponse({"error": "Token inválido"}, status=401)

        # Verificar que no sea un refresh token
        if payload.get("is_refresh"):
            return JsonResponse({"error": "No se puede usar un refresh token para acceder a la API"}, status=401)

        # Cargar usuario de la BD
        try:
            user = AppUser.objects.select_related("role").get(
                id=payload["user_id"], is_active=True
            )
        except AppUser.DoesNotExist:
            return JsonResponse({"error": "Usuario no encontrado o inactivo"}, status=401)

        # Verificar concurrencia (session_id)
        token_session_id = payload.get("session_id")
        if not token_session_id or str(user.session_id) != token_session_id:
            return JsonResponse({"error": "Su sesión ha sido cerrada porque se inició sesión en otro dispositivo."}, status=401)

        request.auth_user = user
        request.auth_role_id = user.role_id

        return self.get_response(request)


# ══════════════════════════════════════════════════════════════════════
#  Helpers de autorización (usar en vistas)
# ══════════════════════════════════════════════════════════════════════

def require_auth(request):
    """
    Verifica que el request tenga un usuario autenticado.
    Retorna (user, None) si OK, o (None, JsonResponse) si falla.
    """
    if not request.auth_user:
        return None, JsonResponse({"error": "Autenticación requerida"}, status=401)
    return request.auth_user, None


def require_role(request, allowed_roles):
    """
    Verifica autenticación + rol permitido.
    Retorna (user, None) si OK, o (None, JsonResponse) si falla.
    """
    user, err = require_auth(request)
    if err:
        return None, err
    if user.role_id not in allowed_roles:
        return None, JsonResponse(
            {"error": "No tiene permisos para realizar esta acción"},
            status=403,
        )
    return user, None


# ══════════════════════════════════════════════════════════════════════
#  Middleware: Rate Limiting (in-memory, por IP)
# ══════════════════════════════════════════════════════════════════════

# Configuración: { path_prefix: (max_requests, window_seconds) }
RATE_LIMITS = {
    "/api/auth/login/":    (10, 60),   # 10 req/min
    "/api/auth/register/": (5, 60),    # 5 req/min
    "/api/auth/password-reset/request/": (3, 60),  # 3 req/min
}

# Almacenamiento en memoria: { "IP:path": [timestamps] }
_rate_store = defaultdict(list)


class RateLimitMiddleware:
    """
    Rate limiting simple basado en IP para rutas sensibles.
    Almacena timestamps en memoria (se reinicia con cada restart del server).
    Suficiente para protección básica en desarrollo/producción ligera.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        # Solo aplicar a rutas configuradas
        limit_config = RATE_LIMITS.get(path)
        if not limit_config:
            return self.get_response(request)

        max_requests, window = limit_config

        # Obtener IP del cliente
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = x_forwarded.split(",")[0].strip() if x_forwarded else request.META.get("REMOTE_ADDR", "")

        key = f"{ip}:{path}"
        now = time.time()

        # Limpiar timestamps fuera de la ventana
        _rate_store[key] = [t for t in _rate_store[key] if now - t < window]

        if len(_rate_store[key]) >= max_requests:
            return JsonResponse(
                {"error": "Demasiadas solicitudes. Intente de nuevo en un momento."},
                status=429,
            )

        _rate_store[key].append(now)
        return self.get_response(request)
