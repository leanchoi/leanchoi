"""Dimensión de calendario: fechas, feriados, eventos, temporadas y quincenas."""

from __future__ import annotations

from datetime import date

import pandas as pd

from .config import Config

MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
MESES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
DIAS_ABBR = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def _rango(desde: str, hasta: str) -> tuple[date, date]:
    return date.fromisoformat(desde), date.fromisoformat(hasta)


def construir_dim_calendario(cfg: Config) -> pd.DataFrame:
    """Un registro por día del año configurado, con todos sus atributos."""
    anio = cfg.anio
    fechas = pd.date_range(f"{anio}-01-01", f"{anio}-12-31", freq="D")

    feriados = {date.fromisoformat(f["fecha"]): f for f in cfg.calendario["feriados"]}
    eventos = [
        {**e, "_rango": _rango(e["desde"], e["hasta"])} for e in cfg.calendario["eventos"]
    ]
    vacaciones = [
        {**v, "_rango": _rango(v["desde"], v["hasta"])} for v in cfg.calendario["vacaciones"]
    ]
    temporadas = [
        {**t, "_rango": _rango(t["desde"], t["hasta"])} for t in cfg.calendario["temporadas"]
    ]
    temporada_defecto = cfg.calendario["temporada_por_defecto"]

    filas = []
    for ts in fechas:
        d = ts.date()
        dow = d.weekday()  # 0 = lunes
        fer = feriados.get(d)

        evento = next((e for e in eventos if e["_rango"][0] <= d <= e["_rango"][1]), None)
        vac = next((v for v in vacaciones if v["_rango"][0] <= d <= v["_rango"][1]), None)
        temp = next((t for t in temporadas if t["_rango"][0] <= d <= t["_rango"][1]), None)

        filas.append(
            {
                "fecha": ts,
                "anio": d.year,
                "mes": d.month,
                "mes_nombre": MESES[d.month - 1],
                "mes_abbr": MESES_ABBR[d.month - 1],
                "dia": d.day,
                "dia_del_anio": int(ts.dayofyear),
                "semana_iso": int(d.isocalendar()[1]),
                "dow": dow,
                "dow_nombre": DIAS[dow],
                "dow_abbr": DIAS_ABBR[dow],
                "quincena": 1 if d.day <= 15 else 2,
                "quincena_label": "1ª quincena" if d.day <= 15 else "2ª quincena",
                "es_finde": bool(dow >= 5),
                "es_feriado": fer is not None,
                "feriado_nombre": fer["nombre"] if fer else None,
                "feriado_tipo": fer["tipo"] if fer else None,
                # Un día "no laborable" a efectos turísticos: finde o feriado.
                "es_no_laborable": bool(dow >= 5 or fer is not None),
                "evento_nombre": evento["nombre"] if evento else None,
                "evento_clave": evento["clave_planilla"] if evento else None,
                "vacaciones_nombre": vac["nombre"] if vac else None,
                "en_vacaciones": vac is not None,
                "temporada": temp["nombre"] if temp else temporada_defecto,
            }
        )

    df = pd.DataFrame(filas)
    df["fecha"] = pd.to_datetime(df["fecha"])
    return df


def construir_dim_evento(cfg: Config, findes: pd.DataFrame | None) -> pd.DataFrame:
    """Fines de semana largos y ventanas especiales, con el dato ya relevado.

    La hoja ``Fines de Semana`` trae el porcentaje que el Observatorio publicó
    para cada evento; lo cruzamos por ``clave_planilla`` y conservamos ambos
    (lo declarado y lo que después recalculamos desde el dato diario), porque
    la diferencia entre los dos es en sí misma un control de calidad.
    """
    declarado: dict[str, dict[str, float]] = {}
    if findes is not None and not findes.empty:
        cols = list(findes.columns)
        c_evt, c_uf, c_pz = cols[0], cols[1], cols[2]
        for _, row in findes.iterrows():
            clave = str(row[c_evt]).strip()
            if not clave or clave.lower() == "nan":
                continue
            declarado[clave] = {
                "pct_uf_declarado": pd.to_numeric(row[c_uf], errors="coerce"),
                "pct_pax_declarado": pd.to_numeric(row[c_pz], errors="coerce"),
            }

    filas = []
    for e in cfg.calendario["eventos"]:
        desde, hasta = _rango(e["desde"], e["hasta"])
        dec = declarado.get(e["clave_planilla"], {})
        filas.append(
            {
                "evento_clave": e["clave_planilla"],
                "evento_nombre": e["nombre"],
                "desde": pd.Timestamp(desde),
                "hasta": pd.Timestamp(hasta),
                "dias": (hasta - desde).days + 1,
                "mes": desde.month,
                "mes_nombre": MESES[desde.month - 1],
                "pct_uf_declarado": dec.get("pct_uf_declarado"),
                "pct_pax_declarado": dec.get("pct_pax_declarado"),
            }
        )
    return pd.DataFrame(filas)
