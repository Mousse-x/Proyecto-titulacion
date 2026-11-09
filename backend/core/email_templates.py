"""
Plantilla común de los correos de SisTransp.

Cada correo sale en dos versiones: texto plano (para clientes sin HTML y para
filtros de spam) y HTML con la marca del sistema. El HTML usa tablas y estilos en
línea porque Gmail y Outlook ignoran las hojas de estilo.
"""
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

BRAND = "#cf2027"
INK = "#102447"
MUTED = "#48617f"
SUBTLE = "#7d8ea8"
BORDER = "#dbe4f0"
SOFT = "#f4f7fb"


def _frontend():
    return getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _paragraphs(items):
    return "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:{INK};">{escape(text)}</p>'
        for text in items if text
    )


def render_email(*, title, greeting=None, intro=(), code=None, code_note=None, button=None,
                 items=(), box_title=None, box_text=None, outro=(), preheader=""):
    """
    Devuelve (texto, html) para un correo.
    - code: código destacado (OTP).
    - button: (texto, url) para un botón principal.
    - items: lista de viñetas (por ejemplo, documentos afectados).
    - box_title / box_text: recuadro gris con observaciones o el contenido de un comentario.
    """
    frontend = _frontend()
    year_text = "Sistema de Transparencia Universitaria · ESPOCH"

    # ── Texto plano ──
    text = []
    if greeting:
        text += [greeting, ""]
    text += [t for t in intro if t]
    if code:
        text += ["", f"    {code}", ""]
        if code_note:
            text.append(code_note)
    if items:
        text += [""] + [f"- {item}" for item in items]
    if box_text:
        text += ["", f"{box_title}:" if box_title else "", box_text]
    if button:
        text += ["", f"{button[0]}: {button[1]}"]
    if outro:
        text += [""] + [t for t in outro if t]
    text += ["", "— Equipo SisTransp", frontend]
    plain = "\n".join(text)

    # ── HTML ──
    body = ""
    if greeting:
        body += f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:{INK};font-weight:600;">{escape(greeting)}</p>'
    body += _paragraphs(intro)
    if code:
        # Sin espacios entre dígitos: la separación es solo visual (letter-spacing),
        # así al copiar (doble clic o Ctrl+C) se copia el código completo y limpio.
        # user-select: all hace que un solo clic seleccione todo en los clientes que lo admiten.
        spaced = escape(str(code))
        body += (
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;">'
            f'<tr><td align="center" style="background:{SOFT};border:1px solid {BORDER};border-radius:12px;padding:22px 12px;">'
            f'<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:{SUBTLE};font-weight:700;margin-bottom:8px;">Código de verificación</div>'
            f'<div style="font-family:Consolas,\'Courier New\',monospace;font-size:34px;letter-spacing:8px;font-weight:700;color:{INK};'
            f'-webkit-user-select:all;user-select:all;">{spaced}</div>'
            f'<div style="font-size:12px;color:{SUBTLE};margin-top:8px;">Haz doble clic sobre el código para seleccionarlo y copiarlo.</div>'
            f'</td></tr></table>'
        )
        if code_note:
            body += f'<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:{MUTED};">{escape(code_note)}</p>'
    if items:
        lis = "".join(f'<li style="margin:0 0 6px;">{escape(str(item))}</li>' for item in items)
        body += f'<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.5;color:{INK};">{lis}</ul>'
    if box_text:
        heading = (f'<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:{SUBTLE};'
                   f'font-weight:700;margin-bottom:6px;">{escape(box_title)}</div>') if box_title else ""
        content = escape(box_text).replace("\n", "<br>")
        body += (
            f'<div style="background:{SOFT};border-left:4px solid {BRAND};border-radius:8px;padding:14px 16px;margin:0 0 18px;">'
            f'{heading}<div style="font-size:14px;line-height:1.6;color:{INK};">{content}</div></div>'
        )
    if button:
        label, url = button
        body += (
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr>'
            f'<td style="background:{BRAND};border-radius:8px;">'
            f'<a href="{escape(url, quote=True)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;'
            f'color:#ffffff;text-decoration:none;letter-spacing:0.5px;">{escape(label)}</a></td></tr></table>'
            f'<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:{SUBTLE};word-break:break-all;">'
            f'Si el botón no funciona, copia este enlace en tu navegador:<br>'
            f'<a href="{escape(url, quote=True)}" style="color:{MUTED};">{escape(url)}</a></p>'
        )
    if outro:
        body += "".join(
            f'<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:{MUTED};">{escape(t)}</p>' for t in outro if t)

    html = f"""<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid {BORDER};">
    <tr><td style="background:{BRAND};padding:18px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;padding-right:12px;">
          <img src="{frontend}/email-logo.jpg" width="40" height="40" alt="" style="display:block;border-radius:8px;border:2px solid rgba(255,255,255,0.6);">
        </td>
        <td style="vertical-align:middle;">
          <div style="font-size:18px;font-weight:800;color:#ffffff;">SisTransp</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.85);">Transparencia universitaria · ESPOCH</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 28px 8px;">
      <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:{INK};">{escape(title)}</h1>
      {body}
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid {BORDER};">
      <p style="margin:0;font-size:12px;line-height:1.5;color:{SUBTLE};">
        Este es un correo automático, por favor no respondas a este mensaje.<br>
        {escape(year_text)} · <a href="{frontend}" style="color:{MUTED};">{escape(frontend.split('://')[-1])}</a>
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"""
    return plain, html


def build_email(subject, recipients, connection=None, reply_to=None, **content):
    """Mensaje listo para .send() con texto plano y HTML."""
    plain, html = render_email(**content)
    message = EmailMultiAlternatives(
        subject=subject, body=plain, from_email=settings.DEFAULT_FROM_EMAIL,
        to=list(recipients), connection=connection, reply_to=reply_to,
        headers={"Content-Language": "es"},
    )
    message.attach_alternative(html, "text/html")
    return message


def send_email(subject, recipients, fail_silently=False, **content):
    return build_email(subject, recipients, **content).send(fail_silently=fail_silently)
