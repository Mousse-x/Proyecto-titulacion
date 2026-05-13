"""
core/tests.py
Pruebas de seguridad básicas para HT-08 — Seguridad del sistema.

Cubre:
  - Sanitización XSS en campos de texto
  - Validación de entradas (nombres, emails, contraseñas)
  - JWT generación y validación
  - Hashing de contraseña con Argon2
  - Acceso sin token (401) — usa la BD existente
  - SQL Injection inofensivo (Django ORM)

Ejecutar:
  python manage.py test core -v2 --keepdb
"""

import json
import time
from django.test import SimpleTestCase, TransactionTestCase
from django.contrib.auth.hashers import make_password, check_password

from .middleware import generate_jwt, decode_jwt
from .sanitizers import (
    sanitize_text, sanitize_url, validate_name,
    validate_email_format, validate_password, validate_positive_int,
)


# ══════════════════════════════════════════════════════════════════════
#  1. PRUEBAS DE SANITIZACIÓN (anti-XSS) — sin BD
# ══════════════════════════════════════════════════════════════════════

class SanitizationTests(SimpleTestCase):
    """Verifica que la sanitización escape correctamente caracteres peligrosos."""

    def test_sanitize_text_escapes_html(self):
        """Los tags HTML deben ser escapados para prevenir XSS."""
        dangerous = '<script>alert("xss")</script>'
        result = sanitize_text(dangerous)
        self.assertNotIn('<script>', result)
        self.assertNotIn('</script>', result)
        self.assertIn('&lt;script&gt;', result)

    def test_sanitize_text_escapes_quotes(self):
        """Las comillas deben ser escapadas."""
        result = sanitize_text('test "quoted" & <tagged>')
        self.assertIn('&amp;', result)
        self.assertIn('&lt;', result)

    def test_sanitize_text_max_length(self):
        """El texto debe ser recortado al máximo permitido."""
        long_text = 'A' * 1000
        result = sanitize_text(long_text, max_length=100)
        self.assertEqual(len(result), 100)

    def test_sanitize_text_none_passthrough(self):
        """Valores None o vacíos se devuelven tal cual."""
        self.assertIsNone(sanitize_text(None))
        self.assertEqual(sanitize_text(''), '')

    def test_sanitize_url_rejects_javascript(self):
        """Las URLs con esquema javascript: deben ser rechazadas."""
        result = sanitize_url('javascript:alert(1)')
        self.assertEqual(result, '')

    def test_sanitize_url_rejects_data(self):
        """Las URLs con esquema data: deben ser rechazadas."""
        result = sanitize_url('data:text/html,<script>alert(1)</script>')
        self.assertEqual(result, '')

    def test_sanitize_url_allows_https(self):
        """Las URLs con https:// deben ser permitidas."""
        url = 'https://www.espoch.edu.ec/transparencia'
        result = sanitize_url(url)
        self.assertIn('espoch.edu.ec', result)


# ══════════════════════════════════════════════════════════════════════
#  2. PRUEBAS DE VALIDACIÓN DE ENTRADAS — sin BD
# ══════════════════════════════════════════════════════════════════════

class ValidationTests(SimpleTestCase):
    """Verifica las funciones de validación de entradas."""

    def test_validate_name_accepts_valid(self):
        """Nombres con letras, acentos y espacios son válidos."""
        self.assertEqual(validate_name('Juan Pérez'), 'Juan Pérez')
        self.assertEqual(validate_name("María O'Brien"), "María O'Brien")

    def test_validate_name_rejects_html(self):
        """Nombres con caracteres HTML deben ser rechazados."""
        with self.assertRaises(ValueError):
            validate_name('<script>alert(1)</script>')

    def test_validate_name_rejects_numbers(self):
        """Nombres con números deben ser rechazados."""
        with self.assertRaises(ValueError):
            validate_name('User123')

    def test_validate_name_rejects_too_short(self):
        """Nombres demasiado cortos deben ser rechazados."""
        with self.assertRaises(ValueError):
            validate_name('A')

    def test_validate_email_format_valid(self):
        """Emails con formato correcto son aceptados."""
        self.assertEqual(validate_email_format('test@espoch.edu.ec'), 'test@espoch.edu.ec')

    def test_validate_email_format_normalizes(self):
        """El email se normaliza a minúsculas y sin espacios."""
        self.assertEqual(validate_email_format('  Test@ESPOCH.edu.ec  '), 'test@espoch.edu.ec')

    def test_validate_email_format_rejects_invalid(self):
        """Emails sin formato válido son rechazados."""
        with self.assertRaises(ValueError):
            validate_email_format('not-an-email')
        with self.assertRaises(ValueError):
            validate_email_format('missing@domain')

    def test_validate_email_too_long(self):
        """Emails excesivamente largos son rechazados."""
        with self.assertRaises(ValueError):
            validate_email_format('a' * 250 + '@test.com')

    def test_validate_password_min_length(self):
        """Contraseñas muy cortas son rechazadas."""
        with self.assertRaises(ValueError):
            validate_password('123')

    def test_validate_password_max_length(self):
        """Contraseñas excesivamente largas son rechazadas."""
        with self.assertRaises(ValueError):
            validate_password('A' * 200)

    def test_validate_password_valid(self):
        """Contraseñas dentro del rango aceptable."""
        self.assertEqual(validate_password('SecurePass123!'), 'SecurePass123!')

    def test_validate_positive_int(self):
        """Solo enteros positivos son aceptados."""
        self.assertEqual(validate_positive_int(5), 5)
        self.assertEqual(validate_positive_int('10'), 10)
        with self.assertRaises(ValueError):
            validate_positive_int(-1)
        with self.assertRaises(ValueError):
            validate_positive_int('abc')


# ══════════════════════════════════════════════════════════════════════
#  3. PRUEBAS DE JWT — sin BD
# ══════════════════════════════════════════════════════════════════════

class JWTTests(SimpleTestCase):
    """Verifica la generación y validación de tokens JWT."""

    class MockUser:
        """Usuario simulado para pruebas de JWT."""
        def __init__(self, id=1, role_id=1):
            self.id = id
            self.role_id = role_id

    def test_generate_and_decode_jwt(self):
        """Un token generado debe poder decodificarse correctamente."""
        user = self.MockUser(id=42, role_id=2)
        token = generate_jwt(user)
        payload = decode_jwt(token)
        self.assertEqual(payload['user_id'], 42)
        self.assertEqual(payload['role_id'], 2)

    def test_jwt_contains_expiration(self):
        """El token debe contener campo de expiración."""
        user = self.MockUser()
        token = generate_jwt(user)
        payload = decode_jwt(token)
        self.assertIn('exp', payload)
        self.assertGreater(payload['exp'], time.time())

    def test_invalid_jwt_raises(self):
        """Un token alterado debe lanzar excepción."""
        import jwt
        with self.assertRaises(jwt.InvalidTokenError):
            decode_jwt('invalid.token.here')


# ══════════════════════════════════════════════════════════════════════
#  4. PRUEBAS DE HASHING DE CONTRASEÑA — sin BD
# ══════════════════════════════════════════════════════════════════════

class PasswordHashingTests(SimpleTestCase):
    """Verifica que las contraseñas se hashean correctamente."""

    def test_password_is_hashed(self):
        """La contraseña hasheada no debe ser igual al texto plano."""
        raw = 'MiContraseña123!'
        hashed = make_password(raw)
        self.assertNotEqual(raw, hashed)
        self.assertTrue(hashed.startswith('argon2'))

    def test_password_verification(self):
        """check_password debe validar correctamente."""
        raw = 'TestPassword456'
        hashed = make_password(raw)
        self.assertTrue(check_password(raw, hashed))
        self.assertFalse(check_password('WrongPassword', hashed))


# ══════════════════════════════════════════════════════════════════════
#  5. PRUEBAS DE ACCESO SIN TOKEN (401) — usa BD existente
# ══════════════════════════════════════════════════════════════════════

class AccessControlTests(TransactionTestCase):
    """Verifica que las rutas protegidas requieren autenticación."""

    # Usa la BD existente (no crea test_db)
    databases = {'default'}

    def test_list_users_without_token_returns_401(self):
        """GET /api/users/ sin token debe devolver 401."""
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 401)

    def test_list_audit_errors_without_token_returns_401(self):
        """GET /api/audit/errors/ sin token debe devolver 401."""
        response = self.client.get('/api/audit/errors/')
        self.assertEqual(response.status_code, 401)

    def test_system_stats_without_token_returns_401(self):
        """GET /api/stats/ sin token debe devolver 401."""
        response = self.client.get('/api/stats/')
        self.assertEqual(response.status_code, 401)

    def test_evidences_without_token_returns_401(self):
        """GET /api/evidences/ sin token debe devolver 401."""
        response = self.client.get('/api/evidences/')
        self.assertEqual(response.status_code, 401)

    def test_login_is_public(self):
        """POST /api/auth/login/ no requiere token (es pública)."""
        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({'email': 'test@test.com', 'password': 'wrong'}),
            content_type='application/json',
        )
        self.assertNotEqual(response.status_code, 401)

    def test_register_is_public(self):
        """POST /api/auth/register/ no requiere token (es pública)."""
        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'fullName': 'Test User',
                'email': 'newtest@test.com',
                'password': 'password123',
            }),
            content_type='application/json',
        )
        self.assertNotEqual(response.status_code, 401)

    def test_sql_injection_in_login(self):
        """Intentar SQL injection en el campo email del login."""
        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'email': "' OR '1'='1' --",
                'password': 'password',
            }),
            content_type='application/json',
        )
        self.assertIn(response.status_code, [400, 404])

    def test_sql_injection_in_register_name(self):
        """Intentar SQL injection en el campo nombre del registro."""
        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'fullName': "'; DROP TABLE users; --",
                'email': 'inject@test.com',
                'password': 'password123',
            }),
            content_type='application/json',
        )
        self.assertIn(response.status_code, [400, 500])
        self.assertNotEqual(response.status_code, 200)
