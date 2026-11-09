"""Controladores de auditoría: consulta de acciones y errores, resumen y eventos del cliente."""
import json
from datetime import datetime, timedelta

from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from ..audit import client_ip
from ..encryption import decrypt_field
from ..middleware import require_auth, require_role
from ..models import AppUser, AuditError, AuditLog

MAX_LIMIT = 1000

# Acciones que el navegador puede registrar (las de datos las registra el middleware).
CLIENT_EVENTS = {
    "EXPORTAR_REPORTE": "reportes",
    "LOGOUT": "autenticacion",
    "VER_EVALUACION": "evaluacion",
}


def _int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _date(value, end=False):
    """'YYYY-MM-DD' → datetime con zona; el final incluye el día completo."""
    if not value:
        return None
    try:
        day = datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    if end:
        day += timedelta(days=1)
    return timezone.make_aware(day) if timezone.is_naive(day) else day


def _users(ids):
    rows = AppUser.objects.filter(id__in={i for i in ids if i}).select_related("role")
    return {u.id: {"name": u.full_name, "role": getattr(u.role, "name", None)} for u in rows}


def _common_filters(request, qs, has_action=True):
    params = request.GET
    if params.get("module"):
        qs = qs.filter(module=params["module"])
    if params.get("user_id"):
        qs = qs.filter(user_id=_int(params["user_id"], 0))
    if has_action and params.get("action"):
        qs = qs.filter(action=params["action"])
    if not has_action and params.get("code"):
        qs = qs.filter(error_code=params["code"])
    start, end = _date(params.get("from")), _date(params.get("to"), end=True)
    if start:
        qs = qs.filter(created_at__gte=start)
    if end:
        qs = qs.filter(created_at__lt=end)
    return qs


def _page(request, qs):
    limit = min(max(_int(request.GET.get("limit"), 300), 1), MAX_LIMIT)
    offset = max(_int(request.GET.get("offset"), 0), 0)
    total = qs.count()
    return list(qs[offset:offset + limit]), total, limit, offset


@csrf_exempt
def list_audit_errors(request):
    """
    GET /api/audit/errors/?module=&code=&user_id=&from=&to=&q=&limit=&offset=
    Errores del sistema con mensaje y traza descifrados. Solo Administrador.
    """
    _, err = require_role(request, [1])
    if err:
        return err
    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        qs = _common_filters(request, AuditError.objects.all(), has_action=False).order_by("-created_at")
        query = (request.GET.get("q") or "").strip().lower()
        if query:
            # El mensaje está cifrado: se filtra después de descifrar sobre un máximo razonable.
            rows = list(qs[:3000])
            total = None
        else:
            rows, total, limit, offset = _page(request, qs)
        users = _users(e.user_id for e in rows)
        data = []
        for e in rows:
            message = decrypt_field(e.error_message)
            item = {
                "id": e.id,
                "user_id": e.user_id,
                "user_name": users.get(e.user_id, {}).get("name"),
                "user_role": users.get(e.user_id, {}).get("role"),
                "module": e.module,
                "function_name": e.function_name,
                "error_code": e.error_code,
                "error_message": message,
                "stack_trace": decrypt_field(e.stack_trace) if e.stack_trace else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            if query and query not in " ".join(str(v or "") for v in (message, e.error_code, e.function_name, e.module, item["user_name"])).lower():
                continue
            data.append(item)
        if query:
            total = len(data)
            limit = min(max(_int(request.GET.get("limit"), 300), 1), MAX_LIMIT)
            offset = max(_int(request.GET.get("offset"), 0), 0)
            data = data[offset:offset + limit]
        return JsonResponse({"results": data, "total": total, "limit": limit, "offset": offset})
    except Exception as exc:
        return JsonResponse({"error": f"Error al obtener errores: {str(exc)}"}, status=500)


@csrf_exempt
def list_audit_logs(request):
    """
    GET /api/audit/logs/?module=&action=&user_id=&from=&to=&q=&limit=&offset=
    Historial de acciones del sistema. Solo Administrador.
    """
    _, err = require_role(request, [1])
    if err:
        return err
    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        qs = _common_filters(request, AuditLog.objects.all())
        query = (request.GET.get("q") or "").strip()
        if query:
            matching_users = list(AppUser.objects.filter(full_name__icontains=query).values_list("id", flat=True))
            qs = qs.filter(Q(description__icontains=query) | Q(action__icontains=query) | Q(module__icontains=query)
                           | Q(table_name__icontains=query) | Q(user_id__in=matching_users))
        rows, total, limit, offset = _page(request, qs.order_by("-created_at"))
        users = _users(l.user_id for l in rows)
        data = [
            {
                "id": l.id,
                "user_id": l.user_id,
                "user_name": users.get(l.user_id, {}).get("name"),
                "user_role": users.get(l.user_id, {}).get("role"),
                "module": l.module,
                "action": l.action,
                "table_name": l.table_name,
                "record_id": l.record_id,
                "description": l.description,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in rows
        ]
        return JsonResponse({"results": data, "total": total, "limit": limit, "offset": offset})
    except Exception as exc:
        return JsonResponse({"error": f"Error al obtener logs: {str(exc)}"}, status=500)


@csrf_exempt
def audit_summary(request):
    """
    GET /api/audit/summary/
    Totales para el panel: hoy, últimos 7 días, por módulo, por acción, usuarios más activos
    y opciones para los filtros. Solo Administrador.
    """
    _, err = require_role(request, [1])
    if err:
        return err
    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        now = timezone.now()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week = now - timedelta(days=7)
        logs, errors = AuditLog.objects.all(), AuditError.objects.all()
        top = list(logs.filter(created_at__gte=week, user_id__isnull=False)
                   .values("user_id").annotate(total=Count("id")).order_by("-total")[:5])
        users = _users(row["user_id"] for row in top)
        all_users = AppUser.objects.order_by("full_name").values("id", "full_name")
        return JsonResponse({
            "logs_total": logs.count(),
            "errors_total": errors.count(),
            "logs_today": logs.filter(created_at__gte=today).count(),
            "errors_today": errors.filter(created_at__gte=today).count(),
            "logs_week": logs.filter(created_at__gte=week).count(),
            "errors_week": errors.filter(created_at__gte=week).count(),
            "logins_week": logs.filter(created_at__gte=week, action__in=["LOGIN", "LOGIN_2FA", "LOGIN_BYPASS_2FA"]).count(),
            "denied_week": errors.filter(created_at__gte=week, error_code__in=["HTTP_403", "WRONG_PASSWORD", "USER_NOT_FOUND", "ACCOUNT_LOCKED", "ACCOUNT_INACTIVE"]).count(),
            "by_module": list(logs.filter(created_at__gte=week).values("module").annotate(total=Count("id")).order_by("-total")),
            "top_users": [{**row, "name": users.get(row["user_id"], {}).get("name")} for row in top],
            "options": {
                "modules": sorted(set(logs.values_list("module", flat=True).distinct()) | set(errors.exclude(module__isnull=True).values_list("module", flat=True).distinct())),
                "actions": sorted(logs.values_list("action", flat=True).distinct()),
                "codes": sorted(c for c in errors.values_list("error_code", flat=True).distinct() if c),
                "users": [{"id": u["id"], "name": u["full_name"]} for u in all_users],
            },
        })
    except Exception as exc:
        return JsonResponse({"error": f"Error al obtener el resumen: {str(exc)}"}, status=500)


@csrf_exempt
def audit_event(request):
    """
    POST /api/audit/events/  {"action": "EXPORTAR_REPORTE", "description": "..."}
    Registra acciones que ocurren en el navegador (exportar reportes, cerrar sesión).
    Cualquier usuario autenticado; solo se aceptan acciones conocidas.
    """
    user, err = require_auth(request)
    if err:
        return err
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        body = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)
    action = str(body.get("action") or "").upper()
    if action not in CLIENT_EVENTS:
        return JsonResponse({"error": "Acción no permitida"}, status=400)
    description = str(body.get("description") or "")[:500]
    AuditLog.objects.create(
        user_id=user.id, module=CLIENT_EVENTS[action], action=action, table_name=None,
        record_id=None, description=f"{description} · IP {client_ip(request)}".strip(" ·"),
        created_at=timezone.now(),
    )
    return JsonResponse({"ok": True}, status=201)
