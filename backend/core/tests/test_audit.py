"""Auditoría de todo el sistema: middleware, consulta, resumen y eventos del cliente."""
import json

from django.contrib.auth.hashers import make_password
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone

from ..audit import action_for, module_for, record_id_for
from ..middleware import generate_jwt
from ..encryption import decrypt_field, encrypt_email, hash_email
from ..models import AppUser, AuditError, AuditLog, Role


class AuditHelpersTests(TransactionTestCase):
    databases = set()

    def test_module_and_action_from_path(self):
        self.assertEqual(module_for('/api/users/5/'), 'usuarios')
        self.assertEqual(module_for('/api/transparency-model/'), 'ponderaciones')
        self.assertEqual(module_for('/api/transparency-model/indicators/3/'), 'indicadores')
        self.assertEqual(action_for('PUT', '/api/transparency-model/'), 'ACTUALIZAR_PESOS')
        self.assertEqual(action_for('POST', '/api/evidences/bulk_delete/'), 'ELIMINAR_MASIVO')
        self.assertEqual(action_for('POST', '/api/evaluacion/universidades/2/validar-todo/'), 'EVALUAR')
        self.assertEqual(action_for('DELETE', '/api/universities/4/'), 'ELIMINAR')
        self.assertEqual(action_for('GET', '/api/evidences/9/download/'), 'DESCARGAR')
        self.assertEqual(record_id_for('/api/universities/42/'), 42)
        self.assertIsNone(record_id_for('/api/universities/'))


class AuditMiddlewareTests(TransactionTestCase):
    databases = {'default'}

    def setUp(self):
        role, _ = Role.objects.get_or_create(id=1, defaults={'name': 'Administrador general'})
        now = timezone.now()
        self.email, self.password = 'auditoria@gmail.com', 'Prueba#2026segura'
        AppUser.objects.filter(email_hash=hash_email(self.email)).delete()
        self.user = AppUser.objects.create(
            role=role, full_name='Auditor Pruebas', email=encrypt_email(self.email),
            email_hash=hash_email(self.email), password_hash=make_password(self.password),
            is_active=True, created_at=now, updated_at=now,
        )
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM "audit"."logs"')
            cursor.execute('DELETE FROM "audit"."errors"')
        self.auth = {'HTTP_AUTHORIZATION': f"Bearer {generate_jwt(self.user)}"}

    def test_login_is_logged_once_by_the_view(self):
        self.client.post('/api/auth/login/', data=json.dumps(
            {'email': self.email, 'password': self.password}), content_type='application/json')
        self.assertEqual(AuditLog.objects.count() + AuditError.objects.count(), 1)

    def test_mutation_without_own_log_is_recorded_with_fields_but_no_secrets(self):
        before = AuditLog.objects.count()
        response = self.client.put(f'/api/users/{self.user.id}/', data=json.dumps(
            {'full_name': 'Auditor Editado', 'password': 'Otra#Clave2026'}), content_type='application/json', **self.auth)
        self.assertLess(response.status_code, 400, response.content[:300])
        self.assertEqual(AuditLog.objects.count(), before + 1)
        log = AuditLog.objects.order_by('-id').first()
        self.assertEqual((log.module, log.action, log.record_id, log.user_id), ('usuarios', 'ACTUALIZAR', self.user.id, self.user.id))
        self.assertIn('full_name', log.description)
        self.assertIn('password (oculto)', log.description)
        self.assertNotIn('Otra#Clave2026', log.description)

    def test_failed_request_goes_to_errors(self):
        response = self.client.delete('/api/universities/999999/', **self.auth)
        self.assertGreaterEqual(response.status_code, 400)
        error = AuditError.objects.order_by('-id').first()
        self.assertEqual(error.error_code, f'HTTP_{response.status_code}')
        self.assertEqual(error.module, 'universidades')
        self.assertIn('ELIMINAR', decrypt_field(error.error_message))

    def test_reads_are_not_logged(self):
        before = AuditLog.objects.count()
        self.assertEqual(self.client.get('/api/universities/', **self.auth).status_code, 200)
        self.assertEqual(AuditLog.objects.count(), before)

    def test_client_event_summary_and_filtered_listing(self):
        event = self.client.post('/api/audit/events/', data=json.dumps(
            {'action': 'EXPORTAR_REPORTE', 'description': 'Ranking ITI · PDF'}), content_type='application/json', **self.auth)
        self.assertEqual(event.status_code, 201)
        self.assertEqual(AuditLog.objects.filter(action='EXPORTAR_REPORTE').count(), 1)  # sin duplicado del middleware
        bad = self.client.post('/api/audit/events/', data=json.dumps({'action': 'BORRAR_TODO'}),
                               content_type='application/json', **self.auth)
        self.assertEqual(bad.status_code, 400)

        listing = self.client.get('/api/audit/logs/?module=reportes', **self.auth).json()
        self.assertEqual(listing['total'], 1)
        self.assertEqual(listing['results'][0]['user_name'], 'Auditor Pruebas')

        summary = self.client.get('/api/audit/summary/', **self.auth).json()
        self.assertGreaterEqual(summary['logs_today'], 1)
        self.assertIn('reportes', summary['options']['modules'])
        self.assertEqual(summary['top_users'][0]['name'], 'Auditor Pruebas')

        errors = self.client.get('/api/audit/errors/?q=BORRAR', **self.auth).json()
        self.assertIn('results', errors)
