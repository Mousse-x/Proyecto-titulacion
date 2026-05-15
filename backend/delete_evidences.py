import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Evidence, University

try:
    espoch = University.objects.get(acronym="ESPOCH")
    evs = Evidence.objects.filter(university=espoch)
    count = evs.count()
    evs.delete()
    print(f"Se eliminaron {count} evidencias de ESPOCH con éxito.")
except Exception as e:
    print(f"Error: {e}")
