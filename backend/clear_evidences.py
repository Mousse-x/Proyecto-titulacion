import os
import django
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from core.models import Evidence
from django.conf import settings

evidences = Evidence.objects.all()
count = 0
for ev in evidences:
    if ev.file_path:
        abs_path = Path(settings.MEDIA_ROOT) / ev.file_path
        if abs_path.exists():
            abs_path.unlink()
    ev.delete()
    count += 1

print(f"Deleted {count} evidences and their physical files.")
