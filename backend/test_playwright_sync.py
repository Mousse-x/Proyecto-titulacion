from playwright.sync_api import sync_playwright
import zipfile
import os

def test_download():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        url = "https://liveespochedu-my.sharepoint.com/:f:/g/personal/planificacion_espoch_edu_ec/IgD2Ug_G-ZwCQ4x5cY915N_iAbq3TLb6HwlxI-76rQa9jFc?e=9Bsnjh"
        page.goto(url)
        page.wait_for_timeout(3000)
        
        # Expect a download
        with page.expect_download() as download_info:
            page.locator("button:has-text('Descargar')").click()
        
        download = download_info.value
        print("Downloaded:", download.suggested_filename)
        download.save_as("test_download.zip")
        
        # Unzip
        with zipfile.ZipFile("test_download.zip", 'r') as zip_ref:
            zip_ref.extractall("extracted_onedrive")
            print("Extracted files:", zip_ref.namelist())
            
        browser.close()

if __name__ == "__main__":
    test_download()
