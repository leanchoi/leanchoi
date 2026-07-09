"""Test del pipeline de scrapeo de dos fechas contra fixtures locales (con navegador real)."""
import http.server
import os
import socketserver
import threading
from datetime import date, timedelta

import pytest

os.environ.setdefault("PLAYWRIGHT_EXECUTABLE_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

from app.db import init_db, session_scope
from app.models import Destination, Family, Listing, Observation
from app.scrapers.booking import BookingScraper

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


class _H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=FIX, **k)
    def guess_type(self, path):
        return "text/html; charset=utf-8" if path.endswith(".html") else super().guess_type(path)
    def log_message(self, *a):
        pass


@pytest.fixture()
def server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), _H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


@pytest.mark.asyncio
async def test_run_destination_persists_two_date_observations(server, monkeypatch):
    init_db()

    class LocalBooking(BookingScraper):
        def build_url(self, *a, **k):
            return f"{server}/booking_sample.html"

    # el runner resuelve el scraper por plataforma
    import app.scrapers.runner as runner
    monkeypatch.setitem(runner.SCRAPERS, "booking", LocalBooking)

    with session_scope() as s:
        fam = Family(name="TestFam", adults=1, nights=1, platforms="booking")
        s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel")
        s.add(dest); s.flush()
        dest_id, fam_id = dest.id, fam.id

    stay_dates = [date.today() + timedelta(days=d) for d in (10, 20)]
    with session_scope() as s:
        dest = s.get(Destination, dest_id)
        summary = await runner.run_destination(
            s, dest, stay_dates, ["booking"], adults=1, nights=1, max_pages=1, family_id=fam_id
        )
    assert summary["booking"]["status"] == "ok"

    with session_scope() as s:
        listings = s.query(Listing).all()
        obs = s.query(Observation).all()
        # 3 listings del fixture, cada uno observado para 2 noches distintas
        assert len(listings) == 3
        assert len(obs) == 6
        # dos ejes de tiempo presentes
        stay_set = {o.stay_checkin for o in obs}
        assert stay_set == set(stay_dates)
        assert all(o.observed_date == date.today() for o in obs)
        # tipología clasificada (Hotel/Hostal en el fixture)
        assert any(o.typology in {"hotel", "hosteria"} for o in obs)
        # precio capturado (ARS y USD desde el mismo fixture => fx≈1)
        assert all(o.price_ars is not None for o in obs)
