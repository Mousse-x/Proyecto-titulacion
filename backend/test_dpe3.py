import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # We need accept_downloads=True to catch the download
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        url = "https://transparencia.dpe.gob.ec/entidades/1365"
        print(f"Going to {url}")
        await page.goto(url)
        await page.wait_for_timeout(5000)
        
        # Click Transparencia activa
        await page.get_by_text("Transparencia activa").first.click()
        await page.wait_for_timeout(2000)
        
        year_btn = page.get_by_role("button", name="Seleccionar año")
        if await year_btn.count() > 0:
            await year_btn.first.click()
            await page.wait_for_timeout(1000)
            await page.get_by_text("2024").first.click()
            await page.wait_for_timeout(2000)
            
        print("Clicking Descargar todas por mes")
        
        async with page.expect_download(timeout=60000) as download_info:
            await page.get_by_text("Descargar todas por mes para el a").first.click()
            
        download = await download_info.value
        path = await download.path()
        print(f"Downloaded to {path}")
        
        import shutil
        shutil.copy(path, "dpe_downloaded.zip")
        print("Saved as dpe_downloaded.zip")

        await browser.close()

asyncio.run(main())
