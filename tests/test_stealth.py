"""Test REAL de anti-bloqueo: verifica que las senales de automatizacion
quedan enmascaradas en el Chromium que controla Playwright.

No requiere salida a internet: usa una pagina local (data URL) y comprueba
las propiedades del navegador que los servicios anti-bot inspeccionan.
"""
import os

import pytest

CHROME = os.environ.get(
    "PLAYWRIGHT_EXECUTABLE_PATH",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
)


@pytest.mark.asyncio
async def test_stealth_oculta_webdriver():
    from playwright.async_api import async_playwright

    from app.scrapers.stealth import LAUNCH_ARGS, STEALTH_JS

    async with async_playwright() as p:
        launch = {"headless": True, "args": LAUNCH_ARGS}
        if os.path.exists(CHROME):
            launch["executable_path"] = CHROME
        browser = await p.chromium.launch(**launch)
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            locale="es-ES",
        )
        await ctx.add_init_script(STEALTH_JS)
        page = await ctx.new_page()
        await page.goto("data:text/html,<h1>test</h1>")

        signals = await page.evaluate(
            """() => ({
                webdriver: navigator.webdriver,
                languages: navigator.languages,
                plugins: navigator.plugins.length,
                chrome: !!window.chrome,
                ua: navigator.userAgent,
                cores: navigator.hardwareConcurrency,
            })"""
        )
        await browser.close()

    # navigator.webdriver debe estar oculto
    assert signals["webdriver"] in (False, None)
    # idiomas coherentes con el locale
    assert "es-ES" in signals["languages"]
    # plugins no vacios (headless puro los deja a 0)
    assert signals["plugins"] >= 1
    # window.chrome presente
    assert signals["chrome"] is True
    # UA no delata HeadlessChrome
    assert "HeadlessChrome" not in signals["ua"]
    assert signals["cores"] == 8
