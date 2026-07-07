"""Configuracion global de tests.

Se ejecuta antes de importar cualquier modulo de la app, de modo que la BD
apunte a un fichero temporal (una sola BD compartida por todas las conexiones,
a diferencia de sqlite :memory: que crea una por conexion).
"""
import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="scraper-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmpdir, 'test.db')}"
os.environ.setdefault(
    "PLAYWRIGHT_EXECUTABLE_PATH",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
)
