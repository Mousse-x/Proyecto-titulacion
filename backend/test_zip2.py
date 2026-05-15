import requests

# Link original: https://liveespochedu-my.sharepoint.com/:f:/g/personal/planificacion_espoch_edu_ec/IgD2Ug_G-ZwCQ4x5cY915N_iAbq3TLb6HwlxI-76rQa9jFc?e=9Bsnjh
url = "https://liveespochedu-my.sharepoint.com/:f:/g/personal/planificacion_espoch_edu_ec/IgD2Ug_G-ZwCQ4x5cY915N_iAbq3TLb6HwlxI-76rQa9jFc?download=1"

response = requests.get(url, stream=True)
print("Status:", response.status_code)
print("Content-Type:", response.headers.get("content-type"))
print("Content-Disposition:", response.headers.get("content-disposition"))
