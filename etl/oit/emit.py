"""Escritura de los artefactos que consume el tablero."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc

from .config import Config
from .normalize import ORDEN_FAMILIA

COMPRESION_PARQUET = "zstd"

# Columnas de texto muy repetido: como 'category' viajan diccionario-codificadas
# en Arrow, lo que reduce el archivo entre 5 y 10 veces.
COLUMNAS_DICCIONARIO = {
    "categoria",
    "categoria_estrato",
    "alojamiento",
    "alojamiento_clave",
    "estado_raw",
    "estado_norm",
    "estado_familia",
    "estado_familia_dominante",
    "mes_nombre",
    "mes_abbr",
    "dow_nombre",
    "dow_abbr",
    "quincena_label",
    "temporada",
    "feriado_nombre",
    "feriado_tipo",
    "evento_nombre",
    "evento_clave",
    "vacaciones_nombre",
    "grupo",
    "etiqueta",
    "corta",
}


def _normalizar_tipos(df: pd.DataFrame) -> pd.DataFrame:
    """Tipos estables para que DuckDB-WASM lea sin sorpresas."""
    out = df.copy()
    for col in out.columns:
        s = out[col]
        if pd.api.types.is_datetime64_any_dtype(s):
            # Fecha sin componente horario: el grano del modelo es el día.
            out[col] = pd.to_datetime(s).dt.normalize()
        elif pd.api.types.is_bool_dtype(s):
            out[col] = s.astype(bool)
        elif pd.api.types.is_object_dtype(s):
            out[col] = s.astype("string")
    return out


def _a_arrow(df: pd.DataFrame) -> pa.Table:
    """Convierte a Arrow codificando como diccionario el texto repetido."""
    listo = df.copy()
    for col in listo.columns:
        if col in COLUMNAS_DICCIONARIO and not pd.api.types.is_numeric_dtype(listo[col]):
            listo[col] = listo[col].astype("category")
    return pa.Table.from_pandas(listo, preserve_index=False)


def escribir_tabla(df: pd.DataFrame, destino: Path, nombre: str, parquet: bool = True) -> dict:
    """Escribe la tabla en Arrow IPC (lo que consume el tablero) y en Parquet.

    El tablero usa **Arrow IPC** y no Parquet por una razón de despliegue: leer
    Parquet en DuckDB-WASM exige una extensión que el motor descarga desde
    ``extensions.duckdb.org`` en tiempo de ejecución, lo que rompe el tablero en
    cualquier red sin salida a internet — justamente el escenario de una
    intranet de gobierno. Arrow IPC se carga con el motor base, sin red y sin
    extensiones.

    El Parquet se sigue emitiendo porque es el formato cómodo para analizar los
    mismos datos desde Python, R o la CLI de DuckDB.
    """
    destino.mkdir(parents=True, exist_ok=True)
    limpio = _normalizar_tipos(df)
    tabla = _a_arrow(limpio)

    ruta_arrow = destino / f"{nombre}.arrow"
    with ipc.new_stream(pa.OSFile(str(ruta_arrow), "wb"), tabla.schema) as escritor:
        escritor.write_table(tabla)

    bytes_parquet = 0
    if parquet:
        ruta_parquet = destino / f"{nombre}.parquet"
        limpio.to_parquet(
            ruta_parquet, engine="pyarrow", compression=COMPRESION_PARQUET, index=False
        )
        bytes_parquet = ruta_parquet.stat().st_size

    return {
        "tabla": nombre,
        "archivo": ruta_arrow.name,
        "filas": int(len(limpio)),
        "columnas": list(limpio.columns),
        "bytes": ruta_arrow.stat().st_size,
        "bytes_parquet": bytes_parquet,
    }


def hash_archivo(ruta: Path) -> str | None:
    if not ruta.exists() or not ruta.is_file():
        return None
    h = hashlib.sha256()
    with ruta.open("rb") as fh:
        for bloque in iter(lambda: fh.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()[:16]


def _num(v):
    """Convierte numpy/NaN a tipos JSON nativos."""
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return None if not np.isfinite(v) else float(v)
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    return v


def construir_meta(
    cfg: Config,
    tablas: list[dict],
    hecho: pd.DataFrame,
    categoria_dia: pd.DataFrame,
    dia: pd.DataFrame,
    validacion: dict,
    origen: str,
    origen_hash: str | None,
    sin_clasificar: list[tuple[str, int]],
) -> dict:
    fechas = pd.to_datetime(hecho["fecha"])
    dias_publicables = int(dia["publicable_oficial"].sum())
    dias_totales = int(len(dia))

    cobertura_cat = (
        categoria_dia.groupby("categoria")
        .agg(
            dias=("fecha", "nunique"),
            dias_con_dato=("tiene_dato", "sum"),
            dias_publicables=("cumple_minimo", "sum"),
            n_establecimientos=("n_establecimientos", "max"),
        )
        .reset_index()
    )
    cobertura_cat["tasa_publicable"] = cobertura_cat["dias_publicables"] / cobertura_cat["dias"]

    return {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version_etl": "1.0.0",
        "origen": {"descripcion": origen, "hash": origen_hash},
        "destino": cfg.parametros["destino"],
        "periodo": {
            "anio": cfg.anio,
            "desde": fechas.min().strftime("%Y-%m-%d"),
            "hasta": fechas.max().strftime("%Y-%m-%d"),
            "dias_con_relevamiento": int(fechas.nunique()),
        },
        "parque": {
            "establecimientos": int(hecho["alojamiento_clave"].nunique()),
            "categorias": int(hecho["categoria"].nunique()),
            "uf_habilitadas_ult": _num(
                categoria_dia[categoria_dia["fecha"] == categoria_dia["fecha"].max()][
                    "uf_habilitada"
                ].sum()
            ),
            "pax_habilitadas_ult": _num(
                categoria_dia[categoria_dia["fecha"] == categoria_dia["fecha"].max()][
                    "pax_habilitada"
                ].sum()
            ),
        },
        "calidad": {
            "registros": int(len(hecho)),
            "registros_relevados": int(hecho["relevado"].sum()),
            "tasa_respuesta_global": _num(hecho["relevado"].mean()),
            "dias_publicables_oficial": dias_publicables,
            "dias_totales": dias_totales,
            "tasa_dias_publicables": _num(dias_publicables / dias_totales if dias_totales else 0),
            "min_categorias_general": cfg.min_categorias_general,
            "cobertura_por_categoria": [
                {
                    "categoria": r.categoria,
                    "dias": int(r.dias),
                    "dias_con_dato": int(r.dias_con_dato),
                    "dias_publicables": int(r.dias_publicables),
                    "tasa_publicable": _num(r.tasa_publicable),
                    "n_establecimientos": _num(r.n_establecimientos),
                }
                for r in cobertura_cat.itertuples()
            ],
            "estados_sin_clasificar": [
                {"valor": v, "n": n} for v, n in sin_clasificar
            ],
        },
        "validacion": validacion,
        "categorias": [
            {
                "nombre": c.nombre,
                "etiqueta": c.etiqueta,
                "corta": c.corta,
                "grupo": c.grupo,
                "orden": c.orden,
                "minimo_requerido": c.minimo_requerido,
            }
            for c in sorted(cfg.categorias, key=lambda x: x.orden)
        ],
        "orden_familia_estado": ORDEN_FAMILIA,
        "parametros": {
            "derrame": cfg.parametros.get("derrame", {}),
            "metas": cfg.parametros.get("metas", {}),
            "reglas": cfg.parametros.get("reglas", {}),
        },
        "tablas": tablas,
    }


def escribir_meta(meta: dict, destino: Path) -> Path:
    destino.mkdir(parents=True, exist_ok=True)
    ruta = destino / "meta.json"
    with ruta.open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2, default=_num)
    return ruta
