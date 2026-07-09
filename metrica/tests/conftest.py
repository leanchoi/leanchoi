"""Config global de tests: BD temporal antes de importar la app."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="metrica-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp, 'test.db')}"
os.environ["SECRET_KEY"] = "test-secret-key-para-tests"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin12345"
os.environ.setdefault("PLAYWRIGHT_EXECUTABLE_PATH", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
