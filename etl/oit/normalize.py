"""
Canonicalización de texto libre.

La planilla es un instrumento operativo: la columna ``Estado`` la completa a
mano el equipo que releva, así que acumula 280+ variantes ("wsp", "Wsp", "w",
"dis ", "hay lugar", "Cerrado/H nuevo aviso"…). Sin normalizar, esa columna es
inservible para análisis; normalizada, se vuelve el mejor termómetro de la
gestión del relevamiento.

El normalizador es a propósito **transparente y auditable**: cada regla es una
expresión regular con un nombre, y ``reporte_sin_clasificar`` devuelve todo lo
que ninguna regla capturó para que el equipo pueda ampliar las reglas en vez de
que el ETL adivine en silencio.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter

import pandas as pd

# --------------------------------------------------------------------------
# Estados
# --------------------------------------------------------------------------
# Cada entrada: (estado_canónico, familia, patrón). Se evalúan EN ORDEN y gana
# la primera que coincide, así que las reglas específicas van antes que las
# genéricas.
REGLAS_ESTADO: list[tuple[str, str, str]] = [
    # -- Respuesta efectiva del establecimiento ----------------------------
    ("Completo",              "Con respuesta", r"^\s*(completo|full|lleno|sin\s*lugar|no\s*hay\s*lugar)\b"),
    ("Con disponibilidad",    "Con respuesta", r"^\s*(disponible|dispo|disp|dis|hay\s*lugar|con\s*lugar|libre|disponibilidad)\b"),
    ("Con disponibilidad",    "Con respuesta", r"\b\d+\s*uf\b"),
    ("Ocupación parcial",     "Con respuesta", r"^\s*(parcial|media|medio)\b"),

    # -- Fuera de operación ------------------------------------------------
    ("Baja",                  "Fuera de operación", r"^\s*(baja|dado\s*de\s*baja|no\s*opera|cerr[oó]\s*definitivo)\b"),
    ("Cerrado temporalmente", "Fuera de operación", r"(cerrad|h\s*/?\s*nuevo\s*aviso|hasta\s*nuevo\s*aviso|receso|vacacion|refacci|obra)"),
    ("No es alojamiento",     "Fuera de operación", r"(no\s*es\s*alojamiento|alquiler\s*permanente|residencia)"),

    # -- Gestión sin respuesta --------------------------------------------
    ("Contactado sin respuesta", "Sin respuesta", r"^\s*(wsp|wpp|whatsapp|w|ws)\b"),
    ("Contactado sin respuesta", "Sin respuesta", r"(no\s*(contest|respond|atend)|sin\s*respuesta|no\s*llamar|buz[oó]n|apagado)"),
    ("Pendiente de gestión",     "Sin respuesta", r"^\s*(llamar|preguntad|preguntar|pendiente|e|x|-{1,3})\s*$"),
    ("Pendiente de gestión",     "Sin respuesta", r"(escribir|reintentar|volver\s*a\s*llamar|consultar)"),
]

ESTADO_SIN_DATO = "Sin gestión registrada"
FAMILIA_SIN_DATO = "Sin gestión"
ESTADO_OTRO = "Otra anotación"
FAMILIA_OTRO = "Sin clasificar"

# Orden de presentación de las familias en el tablero.
ORDEN_FAMILIA = [
    "Con respuesta",
    "Sin respuesta",
    "Fuera de operación",
    "Sin gestión",
    "Sin clasificar",
]

_REGLAS_COMPILADAS = [
    (canon, familia, re.compile(patron, re.IGNORECASE)) for canon, familia, patron in REGLAS_ESTADO
]


def _limpiar(texto: object) -> str:
    if texto is None or (isinstance(texto, float) and pd.isna(texto)):
        return ""
    s = str(texto).replace(" ", " ").strip()
    return re.sub(r"\s+", " ", s)


def normalizar_estado(valor: object) -> tuple[str, str]:
    """Devuelve ``(estado_canónico, familia)`` para un valor crudo."""
    texto = _limpiar(valor)
    if not texto or texto.lower() in {"nan", "none", "null"}:
        return ESTADO_SIN_DATO, FAMILIA_SIN_DATO
    for canon, familia, patron in _REGLAS_COMPILADAS:
        if patron.search(texto):
            return canon, familia
    return ESTADO_OTRO, FAMILIA_OTRO


def aplicar_estados(df: pd.DataFrame, columna: str = "Estado") -> pd.DataFrame:
    """Agrega ``estado_norm`` y ``estado_familia`` a partir de la columna cruda."""
    crudos = df[columna] if columna in df.columns else pd.Series([None] * len(df))
    # El texto libre se repite muchísimo: cacheamos por valor distinto.
    unicos = {v: normalizar_estado(v) for v in crudos.astype("object").unique()}
    df = df.copy()
    df["estado_norm"] = crudos.map(lambda v: unicos[v][0])
    df["estado_familia"] = crudos.map(lambda v: unicos[v][1])
    return df


def reporte_sin_clasificar(df: pd.DataFrame, columna: str = "Estado", tope: int = 40) -> list[tuple[str, int]]:
    """Valores crudos que ninguna regla capturó, ordenados por frecuencia.

    Sirve para ampliar ``REGLAS_ESTADO`` con evidencia en vez de a ciegas.
    """
    contador: Counter[str] = Counter()
    for valor in df[columna] if columna in df.columns else []:
        texto = _limpiar(valor)
        if not texto or texto.lower() in {"nan", "none", "null"}:
            continue
        if normalizar_estado(valor)[0] == ESTADO_OTRO:
            contador[texto] += 1
    return contador.most_common(tope)


# --------------------------------------------------------------------------
# Categorías y alojamientos
# --------------------------------------------------------------------------
def normalizar_categoria(valor: object, alias: dict[str, str]) -> str:
    texto = _limpiar(valor).upper()
    if not texto:
        return "SIN CATEGORIA"
    return alias.get(texto, texto)


def _sin_acentos(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def clave_alojamiento(nombre: object) -> str:
    """Clave estable para deduplicar establecimientos.

    'Angelina ' y 'angelina' son el mismo alojamiento; la planilla no siempre
    los escribe igual.
    """
    return _sin_acentos(_limpiar(nombre)).upper().strip(" .-")


def normalizar_alojamiento(valor: object) -> str:
    """Nombre de presentación: espacios colapsados y capitalización respetada."""
    return _limpiar(valor) or "Sin identificar"
