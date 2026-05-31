import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

with connection.cursor() as cursor:
    try:
        cursor.execute('ALTER TABLE core.users ADD COLUMN session_id UUID;')
        print("Added session_id")
    except Exception as e:
        print(e)
        
    try:
        cursor.execute('ALTER TABLE core.users ADD COLUMN otp_code VARCHAR(6);')
        print("Added otp_code")
    except Exception as e:
        print(e)
        
    try:
        cursor.execute('ALTER TABLE core.users ADD COLUMN otp_expiry TIMESTAMP WITH TIME ZONE;')
        print("Added otp_expiry")
    except Exception as e:
        print(e)
