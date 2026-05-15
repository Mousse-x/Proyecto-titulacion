import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Evidence, University

espoch = University.objects.filter(acronym='ESPOCH').first()
print(Evidence.objects.filter(university=espoch).count())
