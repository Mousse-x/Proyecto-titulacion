import json
import urllib.request

base = "https://transparencia.dpe.gob.ec/backend/v1"

# Get the transparency data for ESPOCH, November 2024
url = f"{base}/transparency/transparency/active/public?month=11&year=2024&establishment_id=1365"
print(f"Fetching: {url}")

req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
resp = urllib.request.urlopen(req, timeout=30)
raw = resp.read().decode("utf-8")
data = json.loads(raw)

if isinstance(data, list):
    print(f"\nTotal items: {len(data)}")
    for i, item in enumerate(data[:3]):
        print(f"\n--- Item {i} ---")
        print(json.dumps(item, indent=2, ensure_ascii=False, default=str)[:3000])
elif isinstance(data, dict):
    print(f"\nKeys: {list(data.keys())}")
    for k in ['results', 'data', 'items', 'numerals']:
        if k in data:
            items = data[k]
            print(f"\n{k}: {len(items)} items")
            for i, item in enumerate(items[:3]):
                print(f"\n--- {k}[{i}] ---")
                print(json.dumps(item, indent=2, ensure_ascii=False, default=str)[:3000])
            break
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False, default=str)[:8000])
