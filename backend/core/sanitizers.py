"""
core/sanitizers.py
Utilidades de sanitización y validación de entradas para prevenir XSS,
inyección de datos maliciosos y entradas fuera de rango.

Todas las funciones devuelven el valor limpio o lanzan ValueError
cuando la validación falla de forma irrecuperable.
"""

import re
import html


# ─── Sanitización de texto genérico (anti-XSS) ──────────────────────

def sanitize_text(value, max_length=500):
    """
    Escapa caracteres HTML peligrosos (<, >, ", ', &) y recorta al largo máximo.
    Usar en TODOS los campos de texto libre ingresados por el usuario.
    """
    if not value:
        return value
    if not isinstance(value, str):
        value = str(value)
    # Escapar entidades HTML para prevenir XSS
    cleaned = html.escape(value.strip(), quote=True)
    # Recortar al largo máximo
    return cleaned[:max_length]


def sanitize_url(value, max_length=2048):
    """
    Valida y sanitiza una URL. Solo permite http:// y https://.
    Previene ataques javascript: y data: URI.
    """
    if not value:
        return value
    value = value.strip()[:max_length]
    # Solo permitir esquemas seguros
    if value and not re.match(r'^https?://', value, re.IGNORECASE):
        if not value.startswith('/'):  # permite rutas relativas internas
            return ''  # rechazar esquemas no seguros (javascript:, data:, etc.)
    return html.escape(value, quote=True)


# ─── Validación de nombres ──────────────────────────────────────────

# Letras (incluye acentos y ñ), espacios, guiones y apóstrofos
_NAME_RE = re.compile(r"^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-'\.]{2,150}$")

def validate_name(name):
    """
    Valida que un nombre contenga solo caracteres permitidos.
    Retorna el nombre limpio (stripped) o lanza ValueError.
    """
    if not name or not isinstance(name, str):
        raise ValueError("El nombre es obligatorio")
    name = name.strip()
    if not _NAME_RE.match(name):
        raise ValueError(
            "El nombre solo puede contener letras, espacios, guiones y apóstrofos (2-150 caracteres)"
        )
    return name


# ─── Validación de email ────────────────────────────────────────────

# RFC 5321 simplificado — suficiente para validación de entrada
_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')

def validate_email_format(email):
    """
    Valida formato de email. Retorna email normalizado (lower, strip)
    o lanza ValueError.
    """
    if not email or not isinstance(email, str):
        raise ValueError("El correo electrónico es obligatorio")
    email = email.strip().lower()
    if len(email) > 254:
        raise ValueError("El correo electrónico es demasiado largo (máx. 254 caracteres)")
    if not _EMAIL_RE.match(email):
        raise ValueError("Formato de correo electrónico inválido")
    return email


# ─── Validación de contraseña ────────────────────────────────────────

def validate_password(password, min_length=6, max_length=128):
    """
    Valida longitud de contraseña.
    Retorna la contraseña o lanza ValueError.
    """
    if not password:
        raise ValueError("La contraseña es obligatoria")
    if len(password) < min_length:
        raise ValueError(f"La contraseña debe tener al menos {min_length} caracteres")
    if len(password) > max_length:
        raise ValueError(f"La contraseña no debe exceder {max_length} caracteres")
    return password


# ─── Validación de ID numérico ───────────────────────────────────────

def validate_positive_int(value, field_name="ID"):
    """
    Valida que un valor sea un entero positivo.
    Retorna el entero o lanza ValueError.
    """
    try:
        val = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} debe ser un número entero válido")
    if val <= 0:
        raise ValueError(f"{field_name} debe ser un número positivo")
    return val
