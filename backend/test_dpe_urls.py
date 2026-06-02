import json
import urllib.request
import ssl

DPE_BASE = "https://transparencia.dpe.gob.ec"
API_BASE = f"{DPE_BASE}/backend/v1"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# Get a file from the API
url = f"{API_BASE}/transparency/transparency/active/public?month=11&year=2024&establishment_id=1365"
req = urllib.request.Request(url, headers=headers)
resp = urllib.request.urlopen(req, timeout=30, context=ctx)
data = json.loads(resp.read().decode("utf-8"))

item = data[1]  # Numeral 1.1
file_info = item["files"][0]
print(f"File: {file_info['name']}")
print(f"URL from API: {file_info['url_download']}")
print(f"File ID: {file_info['id']}")

test_urls = [
    ("DIRECT", f"{DPE_BASE}{file_info['url_download']}"),
    ("BACKEND_PREFIX", f"{DPE_BASE}/backend{file_info['url_download']}"),
    ("API_PREFIX", f"{API_BASE}{file_info['url_download']}"),
    ("BACKEND_V1_PREFIX", f"{DPE_BASE}/backend/v1{file_info['url_download']}"),
    ("FILE_ID_1", f"{API_BASE}/transparency/transparency/file/{file_info['id']}/"),
    ("FILE_ID_2", f"{API_BASE}/transparency/transparency/file/download/{file_info['id']}/"),
    ("FILE_ID_3", f"{API_BASE}/transparency/file/{file_info['id']}/"),
    ("FILE_ID_4", f"{API_BASE}/transparency/file/download/{file_info['id']}/"),
    ("ADMIN_MEDIA", f"{API_BASE}/admin/media/download/{file_info['id']}/"),
]

for label, test_url in test_urls:
    try:
        req = urllib.request.Request(test_url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=10, context=ctx)
        content = resp.read()
        content_type = resp.headers.get("Content-Type", "")
        is_html = b"<!DOCTYPE" in content[:100] or b"<html" in content[:100]
        
        status = "OK-FILE" if not is_html else "HTML-PAGE"
        print(f"\n[{status}] {label}: {test_url}")
        print(f"   Status: {resp.status}, CT: {content_type}, Size: {len(content)}")
        if not is_html:
            print(f"   REAL FILE! First 200: {content[:200]}")
    except urllib.error.HTTPError as e:
        print(f"\n[HTTP-{e.code}] {label}: {test_url}")
    except Exception as e:
        print(f"\n[ERROR] {label}: {test_url}")
        print(f"   {e}")
