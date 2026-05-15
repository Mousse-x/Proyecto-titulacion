import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://liveespochedu-my.sharepoint.com/:f:/g/personal/planificacion_espoch_edu_ec/IgD2Ug_G-ZwCQ4x5cY915N_iAbq3TLb6HwlxI-76rQa9jFc?e=9Bsnjh"
        await page.goto(url)
        
        print("Waiting for page load...")
        await page.wait_for_timeout(5000)
        
        buttons = await page.locator("button").all_inner_texts()
        print("Buttons on page:", buttons)
        
        # Take screenshot for debugging
        await page.screenshot(path="onedrive_folder.png")
        await browser.close()

asyncio.run(main())
