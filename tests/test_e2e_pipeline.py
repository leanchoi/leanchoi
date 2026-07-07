"""Test end-to-end del pipeline del navegador (sin salir a internet).

Sirve las fixtures por HTTP local y ejecuta el scraper completo:
lanzar Chromium (stealth) -> navegar -> renderizar -> extraer -> parsear.
Prueba que toda la cadena funciona junta, no solo el parser sobre un string.
"""
import http.server
import os
import socketserver
import threading

import pytest

os.environ.setdefault(
    "PLAYWRIGHT_EXECUTABLE_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
)

from app.scrapers.airbnb import AirbnbScraper
from app.scrapers.booking import BookingScraper

FIX_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


class _UTF8Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=FIX_DIR, **k)

    def guess_type(self, path):
        if path.endswith(".html"):
            return "text/html; charset=utf-8"
        return super().guess_type(path)

    def log_message(self, *a):  # silenciar logs
        pass


@pytest.fixture()
def local_server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), _UTF8Handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{port}"
    httpd.shutdown()


@pytest.mark.asyncio
async def test_e2e_booking(local_server):
    class LocalBooking(BookingScraper):
        def build_url(self, *a, **k):
            return f"{local_server}/booking_sample.html"

    async with LocalBooking() as sc:
        results = await sc.search("Madrid", "2026-08-01", "2026-08-03", 2, "EUR", max_pages=1)

    assert len(results) == 3
    assert {round(r.price) for r in results} == {240, 1180, 95}
    assert all(r.currency == "EUR" for r in results)


@pytest.mark.asyncio
async def test_e2e_airbnb(local_server):
    class LocalAirbnb(AirbnbScraper):
        def build_url(self, *a, **k):
            return f"{local_server}/airbnb_sample.html"

    async with LocalAirbnb() as sc:
        results = await sc.search("Madrid", "2026-08-01", "2026-08-03", 2, "EUR", max_pages=1)

    assert len(results) == 3
    assert {round(r.price) for r in results} == {145, 98, 1210}
    assert all(r.currency == "EUR" for r in results)
