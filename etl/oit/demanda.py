"""
Indicadores de demanda: turistas, pernoctes, estadía y derrame económico.

La planilla ya publica estimaciones mensuales (hoja ``Pasajeros``). Acá se hace
algo más: se **recalculan** los mismos indicadores desde el dato diario y se
conservan las dos versiones lado a lado.

Por qué importa: solo una fracción de los días del año tiene ocupación
publicable. Si los pernoctes se suman únicamente sobre esos días, el total
subestima; si se proyecta la tasa observada al mes completo, se obtiene un
número comparable entre meses. El tablero muestra las tres lecturas —
declarada, observada y proyectada — porque la brecha entre ellas es
exactamente la incertidumbre con la que hay que tomar decisiones.

    pernoctes  ≈ Σ (plazas ocupadas estimadas del día)
    turistas   ≈ pernoctes / estadía promedio
    derrame    ≈ pernoctes × gasto diario promedio por turista
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .calendario import MESES
from .config import Config

# Encabezados de la hoja "Pasajeros" (posicionales: la planilla repite nombres).
IDX_PASAJEROS = {
    "mes": 0,
    "n_mes": 1,
    "estadia_q1": 2,
    "estadia_q2": 3,
    "estadia_total": 4,
    "informes_q1": 5,
    "informes_q2": 6,
    "informes_total": 7,
    "turistas_q1": 8,
    "turistas_q2": 9,
    "turistas_total": 10,
    "pernoctes_q1": 11,
    "pernoctes_q2": 12,
    "pernoctes_total": 13,
}


def _num(valor) -> float:
    v = pd.to_numeric(valor, errors="coerce")
    return float(v) if pd.notna(v) else np.nan


def leer_declarado(pasajeros: pd.DataFrame | None) -> pd.DataFrame:
    """Extrae los valores que la planilla ya publica, por mes."""
    columnas = list(IDX_PASAJEROS.keys())
    if pasajeros is None or pasajeros.empty:
        return pd.DataFrame(columns=columnas)

    cols = list(pasajeros.columns)
    filas = []
    for _, row in pasajeros.iterrows():
        n_mes = _num(row.iloc[IDX_PASAJEROS["n_mes"]]) if len(cols) > 1 else np.nan
        if not np.isfinite(n_mes) or not 1 <= int(n_mes) <= 12:
            continue
        registro = {"mes": int(n_mes)}
        for clave, idx in IDX_PASAJEROS.items():
            if clave in {"mes", "n_mes"} or idx >= len(cols):
                continue
            registro[clave] = _num(row.iloc[idx])
        filas.append(registro)

    df = pd.DataFrame(filas)
    if df.empty:
        return pd.DataFrame(columns=columnas)

    # Un 0 en meses futuros significa "todavía no medido", no "cero turistas".
    for col in df.columns:
        if col == "mes":
            continue
        df[col] = df[col].replace(0.0, np.nan)
    return df


def construir_mes_quincena(
    categoria_dia: pd.DataFrame,
    dim_cal: pd.DataFrame,
    declarado: pd.DataFrame,
    cfg: Config,
) -> pd.DataFrame:
    """Hecho de demanda con grano (mes × quincena)."""
    cal = dim_cal[["fecha", "mes", "quincena"]]
    base = categoria_dia.merge(cal, on="fecha", how="left")

    # --- Ocupación agregada del período, ponderada por parque ---------------
    con_dato = base[base["tiene_dato"]]
    agg = con_dato.groupby(["mes", "quincena"], as_index=False).agg(
        uf_ocupada=("uf_ocupada_ext", "sum"),
        uf_trabajando_cd=("uf_trabajando", "sum"),
        pax_ocupada=("pax_ocupada_ext", "sum"),
        pax_trabajando_cd=("pax_trabajando", "sum"),
        dias_con_dato=("fecha", "nunique"),
    )
    agg["pct_uf"] = agg["uf_ocupada"] / agg["uf_trabajando_cd"].replace(0, np.nan)
    agg["pct_pax"] = agg["pax_ocupada"] / agg["pax_trabajando_cd"].replace(0, np.nan)

    # --- Parque del período (todos los días, haya dato o no) ----------------
    dia = base.groupby(["fecha", "mes", "quincena"], as_index=False).agg(
        uf_trabajando=("uf_trabajando", "sum"),
        pax_trabajando=("pax_trabajando", "sum"),
        uf_habilitada=("uf_habilitada", "sum"),
        pax_habilitada=("pax_habilitada", "sum"),
    )
    parque = dia.groupby(["mes", "quincena"], as_index=False).agg(
        dias=("fecha", "nunique"),
        uf_trabajando_media=("uf_trabajando", "mean"),
        pax_trabajando_media=("pax_trabajando", "mean"),
        uf_habilitada_media=("uf_habilitada", "mean"),
        pax_habilitada_media=("pax_habilitada", "mean"),
        plazas_noche_disponibles=("pax_trabajando", "sum"),
    )

    df = parque.merge(agg, on=["mes", "quincena"], how="left")
    df["cobertura_dias"] = df["dias_con_dato"].fillna(0) / df["dias"].replace(0, np.nan)

    # --- Pernoctes: observados vs proyectados -------------------------------
    # Observado: solo los días efectivamente medidos (subestima).
    df["pernoctes_observados"] = df["pax_ocupada"]
    # Proyectado: la tasa media observada aplicada al parque de todo el período.
    df["pernoctes_proyectados"] = df["pct_pax"] * df["plazas_noche_disponibles"]

    # --- Estadía promedio ---------------------------------------------------
    estadia = declarado.set_index("mes")["estadia_total"].to_dict() if not declarado.empty else {}
    df["estadia_promedio"] = df["mes"].map(estadia).fillna(cfg.estadia_defecto)

    # --- Turistas -----------------------------------------------------------
    df["turistas_proyectados"] = df["pernoctes_proyectados"] / df["estadia_promedio"].replace(0, np.nan)
    df["turistas_observados"] = df["pernoctes_observados"] / df["estadia_promedio"].replace(0, np.nan)

    # --- Valores declarados por la planilla, para contraste ------------------
    if not declarado.empty:
        dec = declarado.set_index("mes")
        for q, suf in ((1, "q1"), (2, "q2")):
            mask = df["quincena"] == q
            for destino, origen in (
                ("turistas_declarados", f"turistas_{suf}"),
                ("pernoctes_declarados", f"pernoctes_{suf}"),
                ("informes_declarados", f"informes_{suf}"),
                ("estadia_declarada", f"estadia_{suf}"),
            ):
                if destino not in df.columns:
                    df[destino] = np.nan
                if origen in dec.columns:
                    df.loc[mask, destino] = df.loc[mask, "mes"].map(dec[origen])
    else:
        for destino in [
            "turistas_declarados",
            "pernoctes_declarados",
            "informes_declarados",
            "estadia_declarada",
        ]:
            df[destino] = np.nan

    # --- Derrame económico estimado -----------------------------------------
    derrame = cfg.parametros.get("derrame", {})
    if derrame.get("habilitado"):
        gasto = float(derrame.get("gasto_diario_por_turista", 0) or 0)
        df["derrame_estimado"] = df["pernoctes_proyectados"] * gasto
        df["derrame_declarado"] = df["pernoctes_declarados"] * gasto
    else:
        df["derrame_estimado"] = np.nan
        df["derrame_declarado"] = np.nan

    df["mes_nombre"] = df["mes"].map(lambda m: MESES[int(m) - 1])
    df["quincena_label"] = df["quincena"].map({1: "1ª quincena", 2: "2ª quincena"})
    df["periodo"] = df["mes_nombre"] + " · " + df["quincena_label"]

    return df.sort_values(["mes", "quincena"]).reset_index(drop=True)


def construir_mes(mes_quincena: pd.DataFrame, declarado: pd.DataFrame) -> pd.DataFrame:
    """Consolida el hecho de demanda a grano mensual."""
    sumas = [
        "dias",
        "dias_con_dato",
        "plazas_noche_disponibles",
        "uf_ocupada",
        "uf_trabajando_cd",
        "pax_ocupada",
        "pax_trabajando_cd",
        "pernoctes_observados",
        "pernoctes_proyectados",
        "turistas_observados",
        "turistas_proyectados",
        "turistas_declarados",
        "pernoctes_declarados",
        "informes_declarados",
        "derrame_estimado",
        "derrame_declarado",
    ]
    medias = [
        "uf_trabajando_media",
        "pax_trabajando_media",
        "uf_habilitada_media",
        "pax_habilitada_media",
        "estadia_promedio",
    ]

    agg = {c: (c, "sum") for c in sumas if c in mes_quincena.columns}
    agg.update({c: (c, "mean") for c in medias if c in mes_quincena.columns})
    df = mes_quincena.groupby("mes", as_index=False).agg(**agg)

    df["pct_uf"] = df["uf_ocupada"] / df["uf_trabajando_cd"].replace(0, np.nan)
    df["pct_pax"] = df["pax_ocupada"] / df["pax_trabajando_cd"].replace(0, np.nan)
    df["cobertura_dias"] = df["dias_con_dato"] / df["dias"].replace(0, np.nan)
    df["mes_nombre"] = df["mes"].map(lambda m: MESES[int(m) - 1])
    df["mes_abbr"] = df["mes_nombre"].str[:3]

    if not declarado.empty:
        dec = declarado.set_index("mes")
        for destino, origen in (
            ("estadia_declarada", "estadia_total"),
            ("turistas_declarados_total", "turistas_total"),
            ("pernoctes_declarados_total", "pernoctes_total"),
            ("informes_declarados_total", "informes_total"),
        ):
            df[destino] = df["mes"].map(dec[origen]) if origen in dec.columns else np.nan

    return df.sort_values("mes").reset_index(drop=True)
