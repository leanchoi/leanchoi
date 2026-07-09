"""Tests de API: auth, RBAC, seed del preset y CRUD de familias."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    import app.scheduler as scheduler
    monkeypatch.setattr(scheduler, "start", lambda: None)
    monkeypatch.setattr(scheduler, "shutdown", lambda: None)
    monkeypatch.setattr(scheduler, "schedule_family", lambda f: None)
    from app.main import app
    with TestClient(app) as c:
        yield c


def _login(client, username="admin", password="admin12345"):
    r = client.post("/api/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_and_me(client):
    token = _login(client)
    r = client.get("/api/auth/me", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_login_bad_password(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "nope"})
    assert r.status_code == 401


def test_unauthenticated_blocked(client):
    assert client.get("/api/families").status_code == 401


def test_preset_seeded(client):
    token = _login(client)
    fams = client.get("/api/families", headers=_auth(token)).json()
    bench = next((f for f in fams if f["name"] == "BENCHMARK Patagonia Andina"), None)
    assert bench is not None
    assert len(bench["destinations"]) == 9
    names = {m["name"] for m in bench["milestones"]}
    assert {"Tulipanes", "Eclipse 2027"} <= names


def test_plan_expands_dates(client):
    token = _login(client)
    fams = client.get("/api/families", headers=_auth(token)).json()
    fid = fams[0]["id"]
    plan = client.get(f"/api/families/{fid}/plan", headers=_auth(token)).json()
    assert plan["stay_dates_count"] >= 35  # 30 rolling + 5 checkpoints (+ hitos)


def test_rbac_viewer_cannot_manage_users(client):
    admin = _login(client)
    # admin crea un viewer
    r = client.post("/api/users", headers=_auth(admin),
                    json={"username": "leo", "password": "viewer123", "role": "viewer"})
    assert r.status_code == 201
    viewer = _login(client, "leo", "viewer123")
    # viewer NO puede listar usuarios ni crear familias
    assert client.get("/api/users", headers=_auth(viewer)).status_code == 403
    assert client.post("/api/families", headers=_auth(viewer),
                       json={"name": "x"}).status_code == 403
    # pero sí puede ver el dashboard
    assert client.get("/api/families", headers=_auth(viewer)).status_code == 200


def test_editor_can_create_family(client):
    admin = _login(client)
    client.post("/api/users", headers=_auth(admin),
                json={"username": "edi", "password": "editor123", "role": "editor"})
    editor = _login(client, "edi", "editor123")
    r = client.post("/api/families", headers=_auth(editor),
                    json={"name": "Familia editor", "rolling_days": 10})
    assert r.status_code == 201
    # pero un editor no puede tocar usuarios
    assert client.get("/api/users", headers=_auth(editor)).status_code == 403
