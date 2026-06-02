import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        url = "https://transparencia.dpe.gob.ec/entidades/1365"
        print(f"Going to {url}")
        await page.goto(url, timeout=60000)
        await page.wait_for_timeout(5000)
        
        # Click Transparencia activa
        await page.get_by_text("Transparencia activa").first.click()
        await page.wait_for_timeout(2000)
        
        # Select year 2024
        year_btn = page.get_by_role("button", name="Seleccionar año")
        if await year_btn.count() > 0:
            await year_btn.first.click()
            await page.wait_for_timeout(1000)
            await page.get_by_text("2024", exact=True).first.click()
            await page.wait_for_timeout(2000)
        
        # Click Diciembre (which should have data based on previous test)
        print("Clicking Diciembre...")
        await page.get_by_role("button", name="Diciembre").first.click()
        await page.wait_for_timeout(5000)
        
        # Now let's inspect the page structure in detail
        # Look for tables, links, or download buttons
        
        # Get all visible text
        all_text = await page.inner_text("body")
        # Save first 5000 chars
        print("=== PAGE TEXT (first 5000 chars) ===")
        print(all_text[:5000])
        
        # Look for any elements with href that contain "download" or file extensions
        links = await page.locator("a[href]").all()
        print(f"\n=== LINKS WITH HREF ({len(links)}) ===")
        for i, link in enumerate(links):
            href = await link.get_attribute("href")
            text = await link.inner_text()
            if href and ("download" in href.lower() or ".xlsx" in href.lower() or ".pdf" in href.lower() or ".csv" in href.lower() or "archivo" in href.lower() or "s3" in href.lower() or "blob" in href.lower()):
                print(f"  [{i}] text='{text[:60]}' href='{href[:150]}'")
        
        # Look for ALL links
        print(f"\n=== ALL LINKS ===")
        for i, link in enumerate(links):
            href = await link.get_attribute("href")
            text = (await link.inner_text()).strip()
            if text or (href and href != "#"):
                print(f"  [{i}] text='{text[:80]}' href='{href[:200] if href else 'None'}'")
        
        # Look for buttons that might trigger downloads
        buttons = await page.locator("button").all()
        print(f"\n=== BUTTONS ({len(buttons)}) ===")
        for i, btn in enumerate(buttons):
            text = (await btn.inner_text()).strip()
            if text:
                print(f"  [{i}] '{text[:100]}'")
        
        # Look for any SVG or icons that might be download buttons
        svg_links = await page.locator("a svg").all()
        print(f"\n=== SVG inside links: {len(svg_links)} ===")
        
        # Get the parent <a> of each SVG
        for i, svg in enumerate(svg_links):
            parent = svg.locator("..")
            href = await parent.get_attribute("href")
            print(f"  [{i}] parent href='{href[:200] if href else 'None'}'")
        
        # Save full HTML for analysis
        content = await page.content()
        with open("dpe_dic_full.html", "w", encoding="utf-8") as f:
            f.write(content)
        print(f"\nSaved HTML ({len(content)} bytes)")
        
        await browser.close()

asyncio.run(main())
