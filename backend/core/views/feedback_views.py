"""Controladores de retroalimentación de usuarios."""
from django.http import JsonResponse
import json
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from email.utils import parseaddr
from ..models import UserFeedback
from ..encryption import decrypt_email
from ..middleware import require_auth, require_role
from ..sanitizers import sanitize_text
from .common import _log, _log_error


FEEDBACK_TYPES = {
    "system": "Sistema",
    "transparency": "Transparencia",
}


def _default_feedback_recipient():
    configured = getattr(settings, "FEEDBACK_RECIPIENT_EMAIL", "")
    if configured:
        return configured
    _, email = parseaddr(settings.DEFAULT_FROM_EMAIL)
    return email or settings.DEFAULT_FROM_EMAIL


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
        action="SEND_FEEDBACK", module="feedback",
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
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Metodo no permitido"}, status=405)

    queryset = UserFeedback.objects.all().order_by("-created_at")
    feedback_type = request.GET.get("type", "").strip().lower()
    status = request.GET.get("status", "").strip().lower()

    if user.role_id in (2, 3):
        queryset = queryset.filter(feedback_type="transparency")
    elif feedback_type in FEEDBACK_TYPES:
        queryset = queryset.filter(feedback_type=feedback_type)

    if status in {"pending", "reviewed"}:
        queryset = queryset.filter(status=status)

    items = [_serialize_user_feedback(item) for item in queryset[:300]]
    return JsonResponse(items, safe=False)


@csrf_exempt
def user_feedback_detail(request, feedback_id):
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err

    try:
        item = UserFeedback.objects.get(id=feedback_id)
    except UserFeedback.DoesNotExist:
        return JsonResponse({"error": "Comentario no encontrado"}, status=404)

    if user.role_id in (2, 3) and item.feedback_type != "transparency":
        return JsonResponse({"error": "No autorizado"}, status=403)

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
            action="UPDATE_FEEDBACK_STATUS", module="feedback",
            table_name="core.user_feedback",
            record_id=item.id,
            description=f"Estado de feedback actualizado a {status}",
        )
        return JsonResponse(_serialize_user_feedback(item))

    return JsonResponse({"error": "Metodo no permitido"}, status=405)
