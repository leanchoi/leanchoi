"""Test de la cola de trabajos: encolar, procesar, progreso y estado final."""
import http.server
import os
import socketserver
import threading
from datetime import date, timedelta

import pytest

os.environ.setdefault("PLAYWRIGHT_EXECUTABLE_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

from app.db import init_db, session_scope
from app.models import Destination, Family, Job
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


def _reset_db():
    from app.db import engine
    from app.models import Base
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


@pytest.mark.asyncio
async def test_oneshot_job_completes_with_progress(server, monkeypatch):
    _reset_db()  # aislar de otros tests que comparten la BD de fixtures

    class LocalBooking(BookingScraper):
        def build_url(self, *a, **k):
            return f"{server}/booking_sample.html"

    import app.scrapers.runner as runner
    monkeypatch.setitem(runner.SCRAPERS, "booking", LocalBooking)

    from app.jobs import manager

    with session_scope() as s:
        fam = Family(name="JobFam", adults=1, nights=1, platforms="booking")
        s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="Esquel")
        s.add(dest); s.flush()
        did = dest.id

    # encolar una foto rápida de 2 noches y procesarla directamente
    job = manager.enqueue_oneshot(did, days=2)
    await manager._process(job["id"])

    with session_scope() as s:
        j = s.get(Job, job["id"])
        assert j.status == "done"
        # 1 plataforma × 2 noches = 2 unidades
        assert j.total_units == 2
        assert j.done_units == 2
        # 3 listings del fixture × 2 noches = 6 observaciones
        assert j.observations == 6
        assert j.finished_at is not None


@pytest.mark.asyncio
async def test_cancel_before_start(monkeypatch):
    init_db()
    from app.jobs import manager
    with session_scope() as s:
        fam = Family(name="CancelFam", platforms="booking")
        s.add(fam); s.flush()
        dest = Destination(family_id=fam.id, name="X")
        s.add(dest); s.flush()
        did = dest.id
    job = manager.enqueue_oneshot(did, days=1)
    manager.cancel(job["id"])          # cancelar antes de procesar
    await manager._process(job["id"])
    with session_scope() as s:
        assert s.get(Job, job["id"]).status == "cancelled"
