import requests
from bs4 import BeautifulSoup
import sys

# Forzar utf-8
sys.stdout.reconfigure(encoding='utf-8')

url = "https://www.espoch.edu.ec/2026-2/"
response = requests.get(url, verify=False)
soup = BeautifulSoup(response.content, "html.parser")

for link in soup.find_all("a"):
    href = link.get("href")
    text = link.get_text(strip=True)
    if href and ("1drv.ms" in href or "sharepoint" in href or "onedrive" in href):
        print(f"[{text}] {href}")
