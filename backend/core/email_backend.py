"""
Backend SMTP personalizado que omite la verificación de hostname SSL.
Necesario para compatibilidad con Brevo (smtp-relay.brevo.com) en Python 3.14+
donde la verificación de certificados es más estricta.
"""
import ssl
from django.core.mail.backends.smtp import EmailBackend as _BaseEmailBackend


class BrevoEmailBackend(_BaseEmailBackend):
    """
    Igual que el backend SMTP estándar de Django pero con un contexto SSL
    que no verifica el hostname del certificado.
    """

    def open(self):
        # Creamos un contexto SSL sin verificación de hostname
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode    = ssl.CERT_NONE
        # Inyectamos el contexto antes de abrir la conexión
        self.ssl_context = ssl_context
        return super().open()
