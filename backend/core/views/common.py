"""Utilidades compartidas por los controladores: lectura del cuerpo y auditoría."""
import json
import traceback
from django.utils import timezone
from django.http.multipartparser import MultiPartParser, MultiPartParserError
from ..models import AuditLog, AuditError
from ..encryption import encrypt_field


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
