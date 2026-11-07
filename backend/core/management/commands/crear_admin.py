"""Crea o actualiza el administrador general con el correo cifrado y la clave validada."""
from getpass import getpass

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.encryption import encrypt_email, hash_email
from core.models import AppUser, Role
from core.sanitizers import validate_email_format, validate_name, validate_password

ADMIN_ROLE_ID = 1


class Command(BaseCommand):
    help = 'Crea el administrador general (rol 1) o restablece su contraseña si el correo ya existe.'

    def add_arguments(self, parser):
        parser.add_argument('email', help='Correo del administrador.')
        parser.add_argument('--nombre', default='Administrador del Sistema', help='Nombre completo.')

    def handle(self, *args, **options):
        try:
            email = validate_email_format(options['email'])
            full_name = validate_name(options['nombre'])
        except ValueError as exc:
            raise CommandError(str(exc))
        # La clave se pide de forma interactiva para no dejarla en el historial de la consola.
        password = getpass('Contraseña: ')
        if password != getpass('Repita la contraseña: '):
            raise CommandError('Las contraseñas no coinciden.')
        try:
            password = validate_password(password)
        except ValueError as exc:
            raise CommandError(str(exc))
        try:
            role = Role.objects.get(id=ADMIN_ROLE_ID)
        except Role.DoesNotExist:
            raise CommandError(f'No existe el rol con id={ADMIN_ROLE_ID} en core.roles.')

        now = timezone.now()
        email_idx = hash_email(email)
        user = AppUser.objects.filter(email_hash=email_idx).first()
        if user:
            user.password_hash = make_password(password)
            user.failed_login_attempts = 0
            user.is_locked = False
            user.updated_at = now
            user.save(update_fields=['password_hash', 'failed_login_attempts', 'is_locked', 'updated_at'])
            self.stdout.write(self.style.SUCCESS(f'Contraseña actualizada para el usuario {user.id}.'))
            return
        user = AppUser.objects.create(
            role=role, full_name=full_name,
            email=encrypt_email(email), email_hash=email_idx,
            password_hash=make_password(password),
            is_active=True, created_at=now, updated_at=now,
        )
        self.stdout.write(self.style.SUCCESS(f'Administrador creado con id {user.id}.'))
