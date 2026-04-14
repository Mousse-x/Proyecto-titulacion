"""
core/encryption.py
Utilidades para cifrar/descifrar campos sensibles en la BD.

Estrategia para campos buscables (email):
  - campo cifrado  : Fernet (AES-128-CBC + HMAC-SHA256) — no buscable, IV aleatorio
  - campo_hash     : HMAC-SHA256 determinístico — usado para búsquedas y unicidad

Estrategia para campos NO buscables (error_message, stack_trace, full_name):
  - Solo encrypt_field / decrypt_field — sin índice ciego necesario
"""

import hmac
import hashlib
import base64
from cryptography.fernet import Fernet
from django.conf import settings


def _get_fernet() -> Fernet:
    """Retorna una instancia Fernet usando la clave de settings."""
    key = settings.FIELD_ENCRYPTION_KEY
    # Fernet necesita una clave de exactamente 32 bytes en base64-url
    if isinstance(key, str):
        key = key.encode()
    return Fernet(key)


def encrypt_email(email: str) -> str:
    """Cifra el email con Fernet (AES-128-CBC + HMAC). El resultado NO es determinístico."""
    if not email:
        return email
    f = _get_fernet()
    return f.encrypt(email.lower().encode()).decode()


def decrypt_email(token: str) -> str:
    """Descifra el token Fernet y retorna el email original."""
    if not token:
        return token
    # Si el valor no parece estar cifrado (datos existentes), devolverlo tal cual
    try:
        f = _get_fernet()
        return f.decrypt(token.encode()).decode()
    except Exception:
        return token  # Fallback: email en texto plano (datos migrados/legacy)


def hash_email(email: str) -> str:
    """
    HMAC-SHA256 determinístico del email normalizado.
    Usado para búsquedas (login, registro) y constraint UNIQUE en la BD.
    """
    key = settings.FIELD_ENCRYPTION_KEY
    if isinstance(key, str):
        key = key.encode()
    return hmac.new(key, email.lower().strip().encode(), hashlib.sha256).hexdigest()


# ─── Funciones genéricas para campos NO buscables ───────────────────────────
# Usar para: error_message, stack_trace, full_name, etc.
# No necesitan índice ciego porque nunca se busca por esos valores.

def encrypt_field(value: str) -> str:
    """
    Cifra cualquier campo de texto con Fernet AES-128-CBC.
    Usar cuando el campo NO necesita ser buscable en la BD.
    """
    if not value:
        return value
    f = _get_fernet()
    return f.encrypt(value.encode('utf-8')).decode()


def decrypt_field(value: str) -> str:
    """
    Descifra un campo cifrado con encrypt_field().
    Si el valor no está cifrado (datos legacy), lo devuelve tal cual.
    """
    if not value:
        return value
    try:
        f = _get_fernet()
        return f.decrypt(value.encode()).decode('utf-8')
    except Exception:
        return value  # Fallback para datos en texto plano (registros anteriores)
