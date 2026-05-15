import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.scraper_engine import run_espoch_scraper
from core.models import AppUser

gen = run_espoch_scraper("https://www.espoch.edu.ec/2026-2/", 1, 1)
for line in gen:
    print(line.strip())
