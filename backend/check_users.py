import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import AppUser
users = AppUser.objects.all()
for u in users:
    print(f'{u.full_name} - {u.email} - Role: {u.role_id}')
