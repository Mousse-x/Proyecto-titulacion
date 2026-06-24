"""Cola ligera para enviar codigos OTP sin bloquear el login."""
import queue
import threading
import time

from django.conf import settings
from django.core.mail import EmailMessage, get_connection


_OTP_QUEUE = queue.Queue(maxsize=200)
_WORKER_STARTED = False
_WORKER_LOCK = threading.Lock()
_SENTINEL = object()


def _build_otp_message(recipient_email, otp, connection):
    return EmailMessage(
        subject="Codigo de Verificacion - Sistema Transparencia",
        body=f"Su codigo de verificacion (OTP) es: {otp}\nEste codigo expirara en 5 minutos.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient_email],
        connection=connection,
    )


def _otp_worker():
    connection = None
    last_used = 0
    idle_seconds = 60

    while True:
        try:
            item = _OTP_QUEUE.get(timeout=idle_seconds)
        except queue.Empty:
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass
                connection = None
            continue

        if item is _SENTINEL:
            _OTP_QUEUE.task_done()
            break

        user_id, recipient_email, otp, error_handler = item
        try:
            if connection is None or (time.monotonic() - last_used) > idle_seconds:
                if connection is not None:
                    try:
                        connection.close()
                    except Exception:
                        pass
                connection = get_connection(fail_silently=False)
                connection.open()

            _build_otp_message(recipient_email, otp, connection).send()
            last_used = time.monotonic()
            print(f"OTP para {recipient_email}: {otp}")
        except Exception as exc:
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass
                connection = None
            if error_handler:
                error_handler(
                    f"Error enviando OTP: {str(exc)}",
                    user_id=user_id,
                    function_name="login_user",
                    error_code="OTP_EMAIL_SEND_ERROR",
                    exc=exc,
                )
        finally:
            _OTP_QUEUE.task_done()


def _ensure_worker_started():
    global _WORKER_STARTED
    if _WORKER_STARTED:
        return
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        thread = threading.Thread(target=_otp_worker, name="otp-email-worker", daemon=True)
        thread.start()
        _WORKER_STARTED = True


def enqueue_otp_email(user_id, recipient_email, otp, error_handler=None):
    _ensure_worker_started()
    try:
        _OTP_QUEUE.put_nowait((user_id, recipient_email, otp, error_handler))
        return True
    except queue.Full as exc:
        if error_handler:
            error_handler(
                "Cola de OTP llena; no se pudo encolar el correo",
                user_id=user_id,
                function_name="login_user",
                error_code="OTP_EMAIL_QUEUE_FULL",
                exc=exc,
            )
        return False