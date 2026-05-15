import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import RequestFactory
from core.evidence_views import scrape_espoch
import json
from core.models import AppUser, Role

factory = RequestFactory()
body = {"portal_url": "https://www.espoch.edu.ec/2026-2/", "period_id": 1, "user_id": 1}

user = AppUser.objects.filter(role_id__in=[1,2,3]).first()
request = factory.post('/api/scraper/espoch/', json.dumps(body), content_type='application/json')
request.user = user

response = scrape_espoch(request)
print("Status Code:", response.status_code)
try:
    print("Content:", response.content.decode('utf-8'))
except:
    print("Content:", response.content)
