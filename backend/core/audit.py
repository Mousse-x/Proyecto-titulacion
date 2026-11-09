"""
core/audit.py
Auditoría de todo el sistema.

AuditMiddleware registra automáticamente cada acción que cambia datos en la API
(POST, PUT, PATCH, DELETE) y cada descarga de archivos, con el usuario, el módulo,
la acción, el registro afectado, la IP y los campos enviados (nunca sus valores
sensibles). Las respuestas con error (4xx/5xx) y las excepciones no controladas se
guardan en audit.errors, con el mensaje y la traza cifrados.

Si la vista ya escribió su propio registro (login, registro, evaluación…), el
middleware no lo duplica: una señal post_save marca la petición como auditada.
"""
import json
import re
import traceback
from contextvars import ContextVar

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.urls import Resolver404, resolve
from django.utils import timezone

from .encryption import encrypt_field
from .models import AuditError, AuditLog

_audited = ContextVar("audit_written", default=False)

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}

# Rutas que no aportan a la auditoría (renovación de sesión y la propia consulta de auditoría).
SKIP_PATHS = ("/api/auth/refresh/", "/api/audit/")

# Campos cuyo nombre se registra pero cuyo valor nunca se guarda.
SENSITIVE = re.compile(r"pass|token|otp|secret|key|code|hash", re.I)

# Primer segmento de la ruta → módulo legible.
MODULES = [
    ("/api/auth/", "autenticacion"),
    ("/api/users/", "usuarios"),
    ("/api/universities/", "universidades"),
    ("/api/indicators/", "indicadores"),
    ("/api/transparency-model/indicators/", "indicadores"),
    ("/api/transparency-model/", "ponderaciones"),
    ("/api/evidences/", "documentos"),
    ("/api/scraper/", "documentos"),
    ("/api/evaluacion/", "evaluacion"),
    ("/api/lotaip/", "evaluacion"),
    ("/api/feedback/", "feedback"),
]

# Palabra en la ruta → acción concreta (se revisa en este orden).
PATH_ACTIONS = [
    ("bulk_delete", "ELIMINAR_MASIVO"),
    ("/bulk/", "ACTUALIZAR_MASIVO"),
    ("/scraper/", "IMPORTAR"),
    ("/template/", "PLANTILLA"),
    ("validar-todo", "EVALUAR"),
    ("/validar/", "EVALUAR"),
    ("reintentar", "REINTENTAR"),
    ("cancelar", "CANCELAR"),
    ("limpiar", "LIMPIAR_CACHE"),
    ("decidir", "DECIDIR"),
    ("revision-manual", "REVISION_MANUAL"),
    ("/criterios/", "REVISAR_CRITERIOS"),
    ("password-reset", "RECUPERAR_CLAVE"),
    ("/2fa/", "VERIFICAR_2FA"),
    ("/login/", "LOGIN"),
    ("/register/", "REGISTRO"),
]

METHOD_ACTIONS = {"POST": "CREAR", "PUT": "ACTUALIZAR", "PATCH": "ACTUALIZAR", "DELETE": "ELIMINAR"}


@receiver(post_save, sender=AuditLog)
@receiver(post_save, sender=AuditError)
def _mark_audited(sender, **kwargs):
    _audited.set(True)


def client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("HTTP_CF_CONNECTING_IP") or request.META.get("REMOTE_ADDR", "")


def module_for(path):
    for prefix, module in MODULES:
        if path.startswith(prefix):
            return module
    return "sistema"


def action_for(method, path):
    if method == "GET":
        return "DESCARGAR"
    if path.startswith("/api/transparency-model/") and method in {"PUT", "PATCH"} and "indicators" not in path:
        return "ACTUALIZAR_PESOS"
    for fragment, action in PATH_ACTIONS:
        if fragment in path:
            return action
    return METHOD_ACTIONS.get(method, method)


def record_id_for(path):
    match = re.search(r"/(\d+)(?:/|$)", path)
    return int(match.group(1)) if match else None


def view_name_for(path):
    try:
        return resolve(path).url_name
    except Resolver404:
        return None


def body_fields(request):
    """Nombres de los campos enviados; los sensibles se marcan sin su valor."""
    content_type = request.META.get("CONTENT_TYPE", "")
    fields = []
    try:
        if "application/json" in content_type and request.body:
            data = json.loads(request.body)
            if isinstance(data, dict):
                fields = list(data.keys())
        elif "multipart" in content_type or "form" in content_type:
            fields = list(request.POST.keys()) + [f"archivo:{name}" for name in request.FILES.keys()]
    except Exception:
        return []
    return [f"{name} (oculto)" if SENSITIVE.search(name) else name for name in fields[:20]]


def response_error(response):
    try:
        payload = json.loads(response.content or b"{}")
        if isinstance(payload, dict):
            return str(payload.get("error") or payload.get("detail") or payload)[:500]
    except Exception:
        pass
    return f"HTTP {response.status_code}"


class AuditMiddleware:
    """Registra en audit.logs / audit.errors todas las acciones de la API."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        is_download = request.method == "GET" and path.startswith("/api/") and "/download/" in path
        tracked = path.startswith("/api/") and not path.startswith(SKIP_PATHS) and (request.method in MUTATING or is_download)
        if not tracked:
            return self.get_response(request)

        fields = body_fields(request)  # leer antes: la vista puede consumir el cuerpo
        token = _audited.set(False)
        try:
            response = self.get_response(request)
            if not _audited.get():
                self._write(request, response, fields)
            return response
        finally:
            _audited.reset(token)

    def process_exception(self, request, exception):
        """Excepciones no controladas: se guardan con su traza cifrada."""
        if not request.path.startswith("/api/"):
            return None
        try:
            user = getattr(request, "auth_user", None)
            AuditError.objects.create(
                user_id=user.id if user else None,
                module=module_for(request.path),
                function_name=view_name_for(request.path),
                error_message=encrypt_field(f"{request.method} {request.path}: {exception}"),
                error_code="EXCEPCION",
                stack_trace=encrypt_field(traceback.format_exc()),
                created_at=timezone.now(),
            )
        except Exception:
            pass
        return None

    def _write(self, request, response, fields):
        user = getattr(request, "auth_user", None)
        path = request.path
        status = response.status_code
        module = module_for(path)
        action = action_for(request.method, path)
        ip = client_ip(request)
        try:
            if status >= 400:
                AuditError.objects.create(
                    user_id=user.id if user else None,
                    module=module,
                    function_name=view_name_for(path),
                    error_message=encrypt_field(
                        f"{action} · {request.method} {path} → {status}: {response_error(response)} · IP {ip}"),
                    error_code=f"HTTP_{status}",
                    stack_trace=None,
                    created_at=timezone.now(),
                )
                return
            parts = [f"{request.method} {path} → {status}", f"IP {ip}"]
            if fields:
                parts.append("Campos: " + ", ".join(fields))
            AuditLog.objects.create(
                user_id=user.id if user else None,
                module=module,
                action=action,
                table_name=view_name_for(path),
                record_id=record_id_for(path),
                description=" · ".join(parts),
                created_at=timezone.now(),
            )
        except Exception:
            pass
