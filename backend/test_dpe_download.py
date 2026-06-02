import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        # Intercept network requests to find API calls
        api_calls = []
        async def on_request(request):
            url = request.url
            if "backend" in url or "api" in url or "download" in url or "archivo" in url or "s3" in url or "file" in url:
                api_calls.append({"method": request.method, "url": url})
        
        page.on("request", on_request)
        
        url = "https://transparencia.dpe.gob.ec/entidades/1365"
        print(f"Going to {url}")
        await page.goto(url, timeout=60000)
        await page.wait_for_timeout(5000)
        
        print(f"Initial API calls: {len(api_calls)}")
        for c in api_calls:
            print(f"  {c['method']} {c['url']}")
        
        # Click Transparencia activa
        api_calls.clear()
        await page.get_by_text("Transparencia activa").first.click()
        await page.wait_for_timeout(2000)
        
        # Select year 2024
        year_btn = page.get_by_role("button", name="Seleccionar año")
        if await year_btn.count() > 0:
            await year_btn.first.click()
            await page.wait_for_timeout(1000)
            await page.get_by_text("2024", exact=True).first.click()
            await page.wait_for_timeout(2000)
        
        # Click Noviembre (which has data)
        print("\nClicking Noviembre...")
        api_calls.clear()
        await page.get_by_role("button", name="Noviembre").first.click()
        await page.wait_for_timeout(5000)
        
        print(f"\nAPI calls after clicking Noviembre: {len(api_calls)}")
        for c in api_calls:
            print(f"  {c['method']} {c['url']}")
        
        # Now try to click the first download icon (Conjunto de datos for first numeral)
        # The structure is: td > div > div > div > a[href="#"] > svg
        # Let's find all download links within the table
        
        # First, let's look at the table rows
        rows = await page.locator("table tbody tr").all()
        print(f"\nTable rows: {len(rows)}")
        
        for i, row in enumerate(rows[:3]):
            text = await row.inner_text()
            print(f"  Row {i}: {text[:200]}")
        
        # Now click the FIRST download icon and listen for downloads
        api_calls.clear()
        print("\n\nClicking first download icon...")
        
        # Get all download links in the first table
        download_links = await page.locator("table a[href='#']").all()
        print(f"Download links found: {len(download_links)}")
        
        if len(download_links) > 0:
            # Try clicking with download interception
            try:
                async with page.expect_download(timeout=15000) as download_info:
                    await download_links[0].click(force=True)
                download = await download_info.value
                print(f"Download triggered! filename={download.suggested_filename}")
                path = await download.path()
                print(f"Download path: {path}")
                
                # Save it
                await download.save_as("dpe_test_download.xlsx")
                print("Saved as dpe_test_download.xlsx")
            except Exception as e:
                print(f"No download triggered: {e}")
                
                # Check API calls instead
                print(f"\nAPI calls after click: {len(api_calls)}")
                for c in api_calls:
                    print(f"  {c['method']} {c['url']}")
        
        await browser.close()

asyncio.run(main())
