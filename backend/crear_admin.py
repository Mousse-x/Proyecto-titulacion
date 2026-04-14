"""
Ejecutar con:
  python manage.py shell < crear_admin.py
  
O también en una línea:
  python manage.py shell -c "exec(open('crear_admin.py').read())"
"""

from core.models import AppUser, Role
from django.contrib.auth.hashers import make_password
from django.utils import timezone

email    = 'admin'
password = '1234'
nombre   = 'Administrador del Sistema'
role_id  = 1

try:
    role = Role.objects.get(id=role_id)
except Role.DoesNotExist:
    print(f"❌ ERROR: El rol con id={role_id} no existe en core.roles")
    exit(1)

if AppUser.objects.filter(email=email).exists():
    print(f"⚠️  Ya existe un usuario con email '{email}'. Actualizando contraseña...")
    user = AppUser.objects.get(email=email)
    user.password_hash = make_password(password)
    user.updated_at    = timezone.now()
    user.save()
    print(f"✅  Contraseña actualizada para '{email}'")
else:
    now  = timezone.now()
    user = AppUser.objects.create(
        role          = role,
        full_name     = nombre,
        email         = email,
        password_hash = make_password(password),
        is_active     = True,
        created_at    = now,
        updated_at    = now,
    )
    print(f"✅  Usuario creado exitosamente:")
    print(f"    ID       : {user.id}")
    print(f"    Nombre   : {user.full_name}")
    print(f"    Email    : {user.email}")
    print(f"    Rol      : {role.name} (id={role.id})")
    print(f"    Password : {password}  [hasheado en BD]")
