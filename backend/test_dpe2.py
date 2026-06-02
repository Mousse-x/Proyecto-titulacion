import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://transparencia.dpe.gob.ec/entidades/1365"
        print(f"Going to {url}")
        await page.goto(url)
        
        print("Waiting for page load...")
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
            
        # Click Septiembre
        await page.get_by_text("Septiembre", exact=True).first.click()
        await page.wait_for_timeout(5000)
        
        links = await page.locator("a").all_inner_texts()
        print("Links after clicking Septiembre:", links)

        # Let's see if there is an accordion or a table
        content = await page.content()
        with open("dpe_sept_rendered.html", "w", encoding="utf-8") as f:
            f.write(content)

        await browser.close()

asyncio.run(main())
