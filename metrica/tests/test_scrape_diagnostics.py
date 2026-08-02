"""Diagnóstico de scrapeo: cada modo de falla debe reportarse por lo que ES.

Antes, CUALQUIER corrida con 0 resultados quedaba como "blocked" — daba igual si
la plataforma mostró un captcha, si cambió el markup o si el navegador ni arrancó.
Eso hacía imposible repararlo. Estos tests fijan la taxonomía:
    ok · blocked · empty · error
"""
import http.server
import os
import socketserver
import threading
import uuid
from datetime import date, timedelta

import pytest

os.environ.setdefault("PLAYWRIGHT_EXECUTABLE_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

from app.db import init_db, session_scope
from app.models import Destination, Family, ScrapeRun
from app.scrapers.base import classify_outcome
from app.scrapers.booking import BookingScraper

FIX = os.path.join(os.path.dirname(__file__), "fixtures")

PAGE_CAPTCHA = ("<html><head><title>Verificación</title></head><body>"
                "<h1>Please verify you are human</h1><div id='px-captcha'></div></body></html>")
PAGE_EMPTY = ("<html><head><title>Booking.com</title></head><body><div id='search'>"
              "<p>Resultados</p></div>" + ("<span>relleno</span>" * 200) + "</body></html>")
# Markup "nuevo": ya no existe data-testid="property-card"; sólo matchea la alternativa.
PAGE_CHANGED = ("<html><head><title>Booking.com</title></head><body>"
                "<div data-hotelid='77'><h3><a href='/hotel/ar/cabana-nueva.es.html'>"
                "Cabaña Nueva</a></h3><span class='Price'>$ 72.000</span></div>"
                "</body></html>")


class _H(http.server.SimpleHTTPRequestHandler):
    """Sirve el fixture real, una pantalla anti-bot o una página vacía."""

    def __init__(self, *a, **k):
        super().__init__(*a, directory=FIX, **k)

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/captcha"):
            body = PAGE_CAPTCHA.encode()
        elif self.path.startswith("/empty"):
            body = PAGE_EMPTY.encode()
        elif self.path.startswith("/changed"):
            body = PAGE_CHANGED.encode()
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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


def _dest():
    init_db()
    tok = uuid.uuid4().hex[:8]
    with session_scope() as s:
        fam = Family(name=f"Diag-{tok}", platforms="booking")
        s.add(fam); s.flush()
        d = Destination(family_id=fam.id, name="Esquel")
        s.add(d); s.flush()
        return fam.id, d.id


async def _run_with(monkeypatch, url_path, server, retries=1):
    """Corre run_destination contra una página concreta y devuelve el ScrapeRun."""
    import app.scrapers.runner as runner

    class LocalBooking(BookingScraper):
        def build_url(self, *a, **k):
            return f"{server}{url_path}"

    monkeypatch.setitem(runner.SCRAPERS, "booking", LocalBooking)
    fam_id, dest_id = _dest()
    stay = [date.today() + timedelta(days=10)]
    with session_scope() as s:
        dest = s.get(Destination, dest_id)
        await runner.run_destination(s, dest, stay, ["booking"], adults=1, nights=1,
                                     max_pages=1, family_id=fam_id, fast=True,
                                     currencies=("ARS",))
    with session_scope() as s:
        return s.query(ScrapeRun).filter(ScrapeRun.destination_id == dest_id) \
            .order_by(ScrapeRun.id.desc()).first()


# ---------------- clasificación pura ----------------
def test_classify_outcome_taxonomy():
    base = {"pages": 1, "blocked": 0, "parsed": 0, "last_error": None,
            "html_len": 5000, "launched": True}
    assert classify_outcome(3, base)[0] == "ok"
    assert classify_outcome(0, {**base, "blocked": 2})[0] == "blocked"
    assert classify_outcome(0, {**base, "last_error": "Timeout"})[0] == "error"
    # cargó bien, sin bloqueo, sin resultados => markup/sin disponibilidad
    oc, detail = classify_outcome(0, base)
    assert oc == "empty" and "markup" in detail
    # el navegador ni arrancó => error de infraestructura, NO bloqueo
    oc, detail = classify_outcome(0, {**base, "launched": False,
                                      "last_error": "navegador no pudo iniciar"})
    assert oc == "error" and "navegador" in detail


# ---------------- extremo a extremo con navegador real ----------------
@pytest.mark.asyncio
async def test_run_ok_against_fixture(server, monkeypatch):
    run = await _run_with(monkeypatch, "/booking_sample.html", server)
    assert run.status == "ok", run.error
    assert run.observations > 0


@pytest.mark.asyncio
async def test_run_blocked_reports_blocked_with_proxy_hint(server, monkeypatch):
    run = await _run_with(monkeypatch, "/captcha", server)
    assert run.status == "blocked", run.error
    assert "proxy" in (run.error or "").lower()


@pytest.mark.asyncio
async def test_run_empty_is_not_reported_as_blocked(server, monkeypatch):
    """Una página que carga bien pero no parsea NADA no debe decir 'blocked':
    eso mandaba a buscar un proxy cuando el problema era el markup."""
    run = await _run_with(monkeypatch, "/empty", server)
    assert run.status == "empty", run.error
    assert "markup" in (run.error or "")


@pytest.mark.asyncio
async def test_run_browser_failure_reports_error(server, monkeypatch):
    """Si Chromium no arranca, el run dice 'error' con la causa — no 'blocked'."""
    import app.scrapers.runner as runner

    class BrokenBooking(BookingScraper):
        async def __aenter__(self):
            raise RuntimeError("Executable doesn't exist at /nope/chrome")

        async def __aexit__(self, *exc):
            return None

    monkeypatch.setitem(runner.SCRAPERS, "booking", BrokenBooking)
    fam_id, dest_id = _dest()
    with session_scope() as s:
        dest = s.get(Destination, dest_id)
        await runner.run_destination(s, dest, [date.today() + timedelta(days=5)], ["booking"],
                                     adults=1, nights=1, max_pages=1, family_id=fam_id,
                                     fast=True, currencies=("ARS",))
    with session_scope() as s:
        run = s.query(ScrapeRun).filter(ScrapeRun.destination_id == dest_id) \
            .order_by(ScrapeRun.id.desc()).first()
    assert run.status == "error", run.error
    assert "Executable" in (run.error or "") or "navegador" in (run.error or "")


@pytest.mark.asyncio
async def test_circuit_breaker_stops_hammering_when_blocked(server, monkeypatch):
    """Con la plataforma bloqueando, no se recorren las 30 noches: se corta a las
    pocas. Golpear durante horas profundiza el bloqueo de IP y no trae nada."""
    import app.scrapers.runner as runner

    calls = {"n": 0}

    class CountingBlocked(BookingScraper):
        def build_url(self, *a, **k):
            calls["n"] += 1
            return f"{server}/captcha"

    monkeypatch.setitem(runner.SCRAPERS, "booking", CountingBlocked)
    fam_id, dest_id = _dest()
    nights = [date.today() + timedelta(days=i) for i in range(1, 21)]  # 20 noches
    with session_scope() as s:
        dest = s.get(Destination, dest_id)
        await runner.run_destination(s, dest, nights, ["booking"], adults=1, nights=1,
                                     max_pages=1, family_id=fam_id, fast=True,
                                     currencies=("ARS",))
    with session_scope() as s:
        run = s.query(ScrapeRun).filter(ScrapeRun.destination_id == dest_id) \
            .order_by(ScrapeRun.id.desc()).first()
    assert run.status == "blocked"
    assert "cortada" in (run.error or "")
    # se cortó cerca del umbral, no recorrió las 20 noches
    assert calls["n"] <= runner.CIRCUIT_BREAK_NIGHTS + 2, calls["n"]


@pytest.mark.asyncio
async def test_degraded_selector_raises_early_warning(server, monkeypatch):
    """Si Booking cambia el markup y sobrevivimos por la alternativa, el run trae
    datos PERO avisa — para arreglar el selector antes de quedar en cero."""
    import app.scrapers.runner as runner

    class ChangedMarkup(BookingScraper):
        def build_url(self, *a, **k):
            return f"{server}/changed"

    monkeypatch.setitem(runner.SCRAPERS, "booking", ChangedMarkup)
    fam_id, dest_id = _dest()
    with session_scope() as s:
        dest = s.get(Destination, dest_id)
        await runner.run_destination(s, dest, [date.today() + timedelta(days=7)], ["booking"],
                                     adults=1, nights=1, max_pages=1, family_id=fam_id,
                                     fast=True, currencies=("ARS",))
    with session_scope() as s:
        run = s.query(ScrapeRun).filter(ScrapeRun.destination_id == dest_id) \
            .order_by(ScrapeRun.id.desc()).first()
    assert run.status == "ok" and run.observations > 0      # no perdimos datos
    assert run.diag and run.diag.get("degraded") is True    # pero quedó registrado
    assert "cambió el markup" in (run.error or "")          # y avisa


def test_selftest_endpoint_validates_parsers(client_diag):
    c, h = client_diag
    r = c.get("/api/diagnostics/selftest", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True, data
    names = {c["check"] for c in data["checks"]}
    assert "booking · selector primario" in names
    assert all(c["ok"] for c in data["checks"]), data["checks"]


@pytest.fixture()
def client_diag(monkeypatch):
    from fastapi.testclient import TestClient
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_family", lambda f: None)
    from app.main import app
    with TestClient(app) as c:
        r = c.post("/api/auth/login", data={"username": "admin", "password": "admin12345"})
        yield c, {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------- fugas de recursos ----------------
@pytest.mark.asyncio
async def test_failed_launch_does_not_leak_playwright():
    """Si el navegador no arranca, `async with` NO llama a __aexit__: hay que
    limpiar el driver a mano. Sin esto se acumulaban procesos hasta el
    BlockingIOError [Errno 11] que dejó el sistema sin medir."""
    sc = BookingScraper(retries=1)
    sc.settings.playwright_executable_path = "/no/existe/chrome"
    with pytest.raises(Exception):
        async with sc:
            pass
    # el driver quedó detenido y las referencias limpias
    assert sc._pw is None and sc._browser is None
    assert "navegador no pudo iniciar" in (sc.diag.get("last_error") or "")


@pytest.mark.asyncio
async def test_shutdown_survives_a_failing_close():
    """Si cerrar el navegador falla, igual hay que detener el driver."""
    sc = BookingScraper(retries=1)

    class _Boom:
        async def close(self):
            raise RuntimeError("browser ya murió")

    stopped = {"v": False}

    class _PW:
        async def stop(self):
            stopped["v"] = True

    sc._browser, sc._pw = _Boom(), _PW()
    await sc._shutdown()
    assert stopped["v"] is True, "el driver quedó colgado tras fallar el cierre"
    assert sc._browser is None and sc._pw is None


def test_resource_exhaustion_is_its_own_diagnosis():
    """BlockingIOError es el SERVIDOR sin recursos, no un bloqueo de plataforma."""
    diag = {"pages": 0, "blocked": 0, "parsed": 0, "html_len": 0, "launched": False,
            "last_error": "BlockingIOError: [Errno 11] Resource temporarily unavailable"}
    oc, detail = classify_outcome(0, diag)
    assert oc == "resources", (oc, detail)
    assert "recursos" in detail and "proxy" not in detail.lower()


def test_doctor_reports_and_can_repair():
    from app.doctor import check_parsers, orphan_chromium
    rows = check_parsers()
    assert any(r["check"] == "parser booking" and r["level"] == "OK" for r in rows), rows
    orph = orphan_chromium(kill=False)          # sin --repair no mata nada
    assert orph["killed"] == [] and "total" in orph


# ---------------- resiliencia de markup ----------------
def test_booking_parse_falls_back_when_testid_changes():
    """Si Booking renombra data-testid, el scraper degrada a selectores alternativos
    en vez de devolver 0 (que antes se leía como 'bloqueado')."""
    html = """
    <html><body>
      <div data-hotelid="123">
        <h3><a href="/hotel/ar/mi-cabana.es.html">Cabaña del Lago</a></h3>
        <span class="Price">$ 85.000</span>
      </div>
    </body></html>"""
    out = BookingScraper().parse(html, "2026-08-01", "2026-08-02")
    assert len(out) == 1, out
    assert out[0].name == "Cabaña del Lago"
    assert out[0].price == 85000.0
