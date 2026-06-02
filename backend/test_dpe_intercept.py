import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        # Intercept ALL network requests
        all_requests = []
        async def on_request(request):
            all_requests.append({"method": request.method, "url": request.url, "headers": dict(request.headers)})
        
        page.on("request", on_request)
        
        url = "https://transparencia.dpe.gob.ec/entidades/1365"
        await page.goto(url, timeout=60000)
        await page.wait_for_timeout(5000)
        
        # Navigate to Transparencia activa > 2024 > Noviembre
        await page.get_by_text("Transparencia activa").first.click()
        await page.wait_for_timeout(2000)
        
        year_btn = page.get_by_role("button", name="Seleccionar anio")
        if await year_btn.count() == 0:
            year_btn = page.locator("button:has-text('Seleccionar')")
        await year_btn.first.click()
        await page.wait_for_timeout(1000)
        await page.get_by_text("2024", exact=True).first.click()
        await page.wait_for_timeout(2000)
        
        await page.get_by_role("button", name="Noviembre").first.click()
        await page.wait_for_timeout(5000)
        
        # Clear request log before clicking download
        all_requests.clear()
        
        # Click first download icon
        download_links = await page.locator("table a[href='#']").all()
        print(f"Download links: {len(download_links)}")
        
        if len(download_links) > 0:
            try:
                async with page.expect_download(timeout=15000) as download_info:
                    await download_links[0].click(force=True)
                download = await download_info.value
                print(f"Downloaded: {download.suggested_filename}")
                print(f"Download URL: {download.url}")
                
                # Save it
                path = await download.path()
                with open(path, "rb") as f:
                    content = f.read()
                print(f"Size: {len(content)} bytes")
                print(f"First 300 bytes: {content[:300]}")
                
            except Exception as e:
                print(f"Error: {e}")
            
            # Show all requests made during the download
            print(f"\nRequests during download ({len(all_requests)}):")
            for r in all_requests:
                if "transparen" in r["url"] or "media" in r["url"] or "download" in r["url"]:
                    print(f"  {r['method']} {r['url']}")
        
        await browser.close()

asyncio.run(main())
