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
        
        # We assume 2024 is available, let's try to change the year
        # In the button list we saw "Seleccionar año2026"
        year_btn = page.get_by_role("button", name="Seleccionar año")
        if await year_btn.count() > 0:
            await year_btn.first.click()
            await page.wait_for_timeout(1000)
            await page.get_by_text("2024").first.click()
            await page.wait_for_timeout(2000)
            
        # Click a month, e.g. Enero
        await page.get_by_text("Enero").first.click()
        await page.wait_for_timeout(5000)
        
        buttons = await page.locator("button").all_inner_texts()
        print("Buttons after selecting Enero 2024:", buttons)
        
        links = await page.locator("a").all_inner_texts()
        print("Links:", links)
        
        content = await page.content()
        with open("dpe_month_rendered.html", "w", encoding="utf-8") as f:
            f.write(content)

        await browser.close()

asyncio.run(main())
