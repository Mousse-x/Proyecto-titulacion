"""Controladores de consulta de auditoría: errores y acciones registradas."""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from ..models import AuditLog, AuditError
from ..encryption import decrypt_field
from ..middleware import require_role


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
