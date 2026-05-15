import requests

url = "https://liveespochedu-my.sharepoint.com/:f:/g/personal/planificacion_espoch_edu_ec/IgD2Ug_G-ZwCQ4x5cY915N_iAbq3TLb6HwlxI-76rQa9jFc?e=9Bsnjh&download=1"
print("Downloading:", url)

response = requests.get(url, stream=True)
print("Status:", response.status_code)
print("Content-Type:", response.headers.get("content-type"))
print("Content-Disposition:", response.headers.get("content-disposition"))

with open("test.zip", "wb") as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)

print("Downloaded test.zip")
