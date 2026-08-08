"""
Lectura de la fuente cruda.

Admite dos orígenes intercambiables:

* un libro Excel local (``--excel ruta.xlsx``), útil para reprocesos y para
  trabajar sin conexión;
* un Google Sheet publicado (``--sheet-id <id>``), que es el flujo normal en
  producción: el ETL descarga cada hoja como CSV vía el endpoint ``gviz``.

Ambos caminos devuelven ``DataFrame`` con exactamente las mismas columnas, de
modo que el resto del ETL no sabe de dónde vinieron los datos.
"""

from __future__ import annotations

import io
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import pandas as pd

# Nombres de hoja tal como aparecen en el libro del Observatorio.
HOJA_LIMPIOS = "Histórico - Datos Limpios"
HOJA_OFICIAL = "Histórico - Ocupación Oficial"
HOJA_GENERAL = "Histórico - Ocupación General D"
HOJA_PASAJEROS = "Pasajeros"
HOJA_CAPACIDAD = "Capacidad"
HOJA_QUINCENA = "Ocupacion Quincena"
HOJA_FINDES = "Fines de Semana"
HOJA_CATEGORIA = "Ocupacion por Cateoria"  # sic: el typo está en la planilla original
HOJA_MENSUAL = "OcupacionMensualTuristas"

HOJAS_REQUERIDAS = [HOJA_LIMPIOS]
HOJAS_OPCIONALES = [
    HOJA_OFICIAL,
    HOJA_GENERAL,
    HOJA_PASAJEROS,
    HOJA_CAPACIDAD,
    HOJA_QUINCENA,
    HOJA_FINDES,
    HOJA_CATEGORIA,
    HOJA_MENSUAL,
]


@dataclass
class Libro:
    """Colección de hojas ya materializadas en memoria."""

    hojas: dict[str, pd.DataFrame]
    origen: str

    def get(self, nombre: str) -> pd.DataFrame | None:
        df = self.hojas.get(nombre)
        return None if df is None or df.empty else df

    def requerida(self, nombre: str) -> pd.DataFrame:
        df = self.get(nombre)
        if df is None:
            raise ValueError(
                f"La hoja obligatoria '{nombre}' no existe o está vacía en {self.origen}"
            )
        return df


def desde_excel(ruta: str | Path) -> Libro:
    ruta = Path(ruta)
    if not ruta.exists():
        raise FileNotFoundError(f"No se encontró el libro: {ruta}")

    disponibles = pd.ExcelFile(ruta, engine="openpyxl").sheet_names
    hojas: dict[str, pd.DataFrame] = {}
    for nombre in HOJAS_REQUERIDAS + HOJAS_OPCIONALES:
        if nombre in disponibles:
            hojas[nombre] = pd.read_excel(ruta, sheet_name=nombre, engine="openpyxl")
    faltantes = [h for h in HOJAS_REQUERIDAS if h not in hojas]
    if faltantes:
        raise ValueError(
            f"Al libro {ruta.name} le faltan hojas obligatorias: {faltantes}. "
            f"Hojas presentes: {disponibles}"
        )
    return Libro(hojas=hojas, origen=str(ruta))


def desde_google_sheets(sheet_id: str, intentos: int = 4, espera: float = 2.0) -> Libro:
    """Descarga las hojas del documento publicado como CSV.

    El documento debe estar compartido con *cualquiera con el enlace* (lectura).
    Se usa el endpoint ``gviz/tq`` porque respeta los nombres de hoja y no exige
    conocer el ``gid`` numérico de cada una.
    """
    import requests  # import diferido: solo hace falta en este camino

    base = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
    hojas: dict[str, pd.DataFrame] = {}

    for nombre in HOJAS_REQUERIDAS + HOJAS_OPCIONALES:
        url = f"{base}?tqx=out:csv&sheet={quote(nombre)}"
        ultimo_error: Exception | None = None
        for intento in range(intentos):
            try:
                resp = requests.get(url, timeout=90)
                if resp.status_code == 404:
                    ultimo_error = ValueError(f"hoja inexistente (404): {nombre}")
                    break
                resp.raise_for_status()
                hojas[nombre] = pd.read_csv(io.StringIO(resp.content.decode("utf-8")))
                ultimo_error = None
                break
            except Exception as exc:  # reintento con backoff exponencial
                ultimo_error = exc
                if intento < intentos - 1:
                    time.sleep(espera * (2**intento))
        if ultimo_error is not None and nombre in HOJAS_REQUERIDAS:
            raise RuntimeError(
                f"No se pudo descargar la hoja obligatoria '{nombre}': {ultimo_error}"
            ) from ultimo_error

    return Libro(hojas=hojas, origen=f"google-sheets:{sheet_id}")
