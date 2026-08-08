"""
Metodología oficial de ocupación.

Reproduce, desde el dato atómico (establecimiento × día), exactamente los
mismos números que hoy publica la hoja ``Histórico - Ocupación Oficial``. El
test ``tests/test_indicadores.py`` verifica esa equivalencia fila por fila
contra la planilla, así que cualquier cambio acá que rompa la compatibilidad
falla en CI.

Definiciones
------------
Para cada (fecha, categoría):

    UF habilitada    = Σ Capacidad UF          (parque declarado)
    UF trabajando    = Σ UF Disponible         (parque efectivamente operando)
    n relevados      = # establecimientos con respuesta ese día

    tasa_uf          = Σ UF Ocupada  (solo relevados)
                       ─────────────────────────────
                       Σ UF Disponible (solo relevados)

    UF ocupada ext.  = tasa_uf × UF trabajando     (extrapolación al parque)
    % ocupación UF   = tasa_uf, publicable solo si n relevados ≥ mínimo requerido

Es decir: la ocupación publicada es la tasa de los establecimientos que
respondieron, ponderada por su tamaño, y proyectada al parque que opera. La
regla del mínimo evita publicar una tasa sostenida por muy pocos casos.

La misma lógica se aplica un nivel más arriba para el total del destino: el
día se publica si al menos ``min_categorias_general`` categorías tienen dato.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import Config

# Columnas de la hoja "Histórico - Datos Limpios" tal como vienen.
COLS_CRUDAS = {
    "Mes": "mes_planilla",
    "Fecha": "fecha",
    "Categoría": "categoria_raw",
    "Alojamiento": "alojamiento_raw",
    "Capacidad UF": "capacidad_uf",
    "Capacidad PAX": "capacidad_pax",
    "UF Disponible": "uf_disponible",
    "PAX Disponible": "pax_disponible",
    "UF Ocupada": "uf_ocupada",
    "PAX Ocupada": "pax_ocupada",
    "Estado": "Estado",
    "Relevado": "relevado_raw",
}

NUMERICAS = [
    "capacidad_uf",
    "capacidad_pax",
    "uf_disponible",
    "pax_disponible",
    "uf_ocupada",
    "pax_ocupada",
]


def preparar_hecho_establecimiento(limpios: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Normaliza la hoja cruda al hecho de grano más fino del modelo."""
    from .normalize import (
        aplicar_estados,
        clave_alojamiento,
        normalizar_alojamiento,
        normalizar_categoria,
    )

    faltantes = [c for c in COLS_CRUDAS if c not in limpios.columns]
    if faltantes:
        raise ValueError(
            f"La hoja de datos limpios no tiene las columnas esperadas: {faltantes}. "
            f"Columnas encontradas: {list(limpios.columns)}"
        )

    df = limpios.rename(columns=COLS_CRUDAS)[list(COLS_CRUDAS.values())].copy()

    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    df = df[df["fecha"].notna()].copy()

    for col in NUMERICAS:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    # Dos niveles de categoría:
    #   * 'categoria_estrato': el rótulo tal como lo usa el relevamiento
    #     (incluye desdoblamientos como CABAÑAS / CABAÑAS 2). Es la unidad de
    #     extrapolación, porque cada sublista se releva por separado.
    #   * 'categoria': el rótulo canónico que se publica.
    df["categoria_estrato"] = df["categoria_raw"].map(lambda v: normalizar_categoria(v, {}))
    df["categoria"] = df["categoria_raw"].map(
        lambda v: normalizar_categoria(v, cfg.alias_categoria)
    )
    df["alojamiento"] = df["alojamiento_raw"].map(normalizar_alojamiento)
    df["alojamiento_clave"] = df["alojamiento_raw"].map(clave_alojamiento)
    df["relevado"] = (
        df["relevado_raw"].astype(str).str.strip().str.lower().isin({"sí", "si", "s", "true", "1"})
    )

    df = aplicar_estados(df, "Estado")
    df = df.rename(columns={"Estado": "estado_raw"})

    # Consistencia física: no se puede ocupar más de lo disponible.
    df["uf_ocupada"] = np.minimum(df["uf_ocupada"], df["uf_disponible"])
    df["pax_ocupada"] = np.minimum(df["pax_ocupada"], df["pax_disponible"])
    df["opera"] = df["uf_disponible"] > 0

    # La bandera 'Relevado' de la planilla se completa a mano y se olvida: hay
    # establecimientos marcados 'No' que sin embargo reportan unidades ocupadas
    # (ej. 'Esquel Apart', 14/01, Estado='Disponible', 6 UF ocupadas). La hoja
    # oficial los cuenta igual, y con razón: si hay ocupación cargada, hay dato.
    # 'con_dato' es entonces la definición operativa de muestra, y 'relevado'
    # queda como métrica de gestión del relevamiento.
    df["con_dato"] = df["relevado"] | (df["uf_ocupada"] > 0) | (df["pax_ocupada"] > 0)

    cols = [
        "fecha",
        "categoria",
        "categoria_estrato",
        "alojamiento",
        "alojamiento_clave",
        "capacidad_uf",
        "capacidad_pax",
        "uf_disponible",
        "pax_disponible",
        "uf_ocupada",
        "pax_ocupada",
        "relevado",
        "con_dato",
        "opera",
        "estado_raw",
        "estado_norm",
        "estado_familia",
    ]
    return df[cols].sort_values(["fecha", "categoria", "alojamiento"]).reset_index(drop=True)


def _ratio(numerador: pd.Series, denominador: pd.Series) -> pd.Series:
    """División segura: denominador 0 o nulo ⇒ NaN (sin dato), nunca 0."""
    den = denominador.replace(0, np.nan)
    return numerador / den


def _agregar_por(hecho: pd.DataFrame, clave: str) -> pd.DataFrame:
    """Parque y muestra agregados por (fecha × `clave`)."""
    todos = hecho.groupby(["fecha", clave], as_index=False).agg(
        uf_habilitada=("capacidad_uf", "sum"),
        pax_habilitada=("capacidad_pax", "sum"),
        uf_trabajando=("uf_disponible", "sum"),
        pax_trabajando=("pax_disponible", "sum"),
        n_establecimientos=("alojamiento_clave", "nunique"),
        n_operando=("opera", "sum"),
        n_marcados_relevados=("relevado", "sum"),
    )
    muestra = hecho[hecho["con_dato"]].groupby(["fecha", clave], as_index=False).agg(
        n_relevados=("alojamiento_clave", "nunique"),
        uf_disp_relevada=("uf_disponible", "sum"),
        pax_disp_relevada=("pax_disponible", "sum"),
        uf_ocupada_relevada=("uf_ocupada", "sum"),
        pax_ocupada_relevada=("pax_ocupada", "sum"),
    )
    df = todos.merge(muestra, on=["fecha", clave], how="left")
    for col in [
        "n_relevados",
        "uf_disp_relevada",
        "pax_disp_relevada",
        "uf_ocupada_relevada",
        "pax_ocupada_relevada",
    ]:
        df[col] = df[col].fillna(0.0)
    df["n_relevados"] = df["n_relevados"].astype(int)
    return df


def construir_categoria_dia(hecho: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Agrega el hecho atómico a (fecha × categoría) aplicando la metodología.

    La extrapolación se hace **por estrato de relevamiento**, no por categoría
    publicada. Cuando una categoría se releva en dos sublistas (CABAÑAS y
    CABAÑAS 2), cada una tiene su propia tasa y su propio parque, y recién
    después se suman las unidades ocupadas estimadas. Estratificar así evita
    que una sublista chica y muy respondida arrastre a una grande y poco
    respondida — y es lo que hace la hoja oficial de la planilla.
    """
    estratos = _agregar_por(hecho, "categoria_estrato")

    # Tasa observada en la muestra de cada estrato, y extrapolación a su parque.
    estratos["tasa_uf"] = _ratio(estratos["uf_ocupada_relevada"], estratos["uf_disp_relevada"])
    estratos["tasa_pax"] = _ratio(estratos["pax_ocupada_relevada"], estratos["pax_disp_relevada"])
    estratos["uf_ocupada_ext"] = estratos["tasa_uf"] * estratos["uf_trabajando"]
    estratos["pax_ocupada_ext"] = estratos["tasa_pax"] * estratos["pax_trabajando"]

    # Mapa estrato → categoría publicada.
    mapa = (
        hecho[["categoria_estrato", "categoria"]]
        .drop_duplicates()
        .set_index("categoria_estrato")["categoria"]
    )
    estratos["categoria"] = estratos["categoria_estrato"].map(mapa)

    df = estratos.groupby(["fecha", "categoria"], as_index=False).agg(
        uf_habilitada=("uf_habilitada", "sum"),
        pax_habilitada=("pax_habilitada", "sum"),
        uf_trabajando=("uf_trabajando", "sum"),
        pax_trabajando=("pax_trabajando", "sum"),
        n_establecimientos=("n_establecimientos", "sum"),
        n_operando=("n_operando", "sum"),
        n_marcados_relevados=("n_marcados_relevados", "sum"),
        n_relevados=("n_relevados", "sum"),
        n_estratos=("categoria_estrato", "nunique"),
        uf_disp_relevada=("uf_disp_relevada", "sum"),
        pax_disp_relevada=("pax_disp_relevada", "sum"),
        uf_ocupada_relevada=("uf_ocupada_relevada", "sum"),
        pax_ocupada_relevada=("pax_ocupada_relevada", "sum"),
        uf_ocupada_ext=("uf_ocupada_ext", "sum"),
        pax_ocupada_ext=("pax_ocupada_ext", "sum"),
    )

    # Tasa publicada de la categoría: ocupadas estimadas sobre parque operando.
    sin_muestra = df["uf_disp_relevada"] <= 0
    df["tasa_uf"] = _ratio(df["uf_ocupada_ext"], df["uf_trabajando"]).mask(sin_muestra)
    df["tasa_pax"] = _ratio(df["pax_ocupada_ext"], df["pax_trabajando"]).mask(
        df["pax_disp_relevada"] <= 0
    )
    df.loc[sin_muestra, "uf_ocupada_ext"] = np.nan
    df.loc[df["pax_disp_relevada"] <= 0, "pax_ocupada_ext"] = np.nan

    # Regla del mínimo muestral.
    df["minimo_requerido"] = df["categoria"].map(cfg.minimo_requerido).astype(int)
    df["tiene_dato"] = df["tasa_uf"].notna()
    df["cumple_minimo"] = df["tiene_dato"] & (df["n_relevados"] >= df["minimo_requerido"])

    # Indicadores publicables (NaN cuando no se cumple el mínimo).
    df["pct_uf"] = df["tasa_uf"].where(df["cumple_minimo"])
    df["pct_pax"] = df["tasa_pax"].where(df["cumple_minimo"])

    # Métricas de calidad del relevamiento.
    df["cobertura_estab"] = _ratio(df["n_relevados"], df["n_establecimientos"]).fillna(0.0)
    df["cobertura_uf"] = _ratio(df["uf_disp_relevada"], df["uf_trabajando"]).fillna(0.0)
    df["faltan_para_minimo"] = (df["minimo_requerido"] - df["n_relevados"]).clip(lower=0).astype(int)

    # Plazas disponibles sin vender: el "invendido" del día.
    df["uf_libres_ext"] = df["uf_trabajando"] - df["uf_ocupada_ext"].fillna(0.0)
    df["pax_libres_ext"] = df["pax_trabajando"] - df["pax_ocupada_ext"].fillna(0.0)

    return df.sort_values(["fecha", "categoria"]).reset_index(drop=True)


def construir_dia(categoria_dia: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Total del destino por día, en dos lecturas.

    * **oficial**: solo categorías que cumplen el mínimo muestral. Es el número
      metodológicamente defendible.
    * **general**: todas las categorías con algún dato. Es el que hoy muestra el
      tablero de Looker; se conserva para comparar y para no perder continuidad
      con la serie publicada.
    """
    def _agregar(df: pd.DataFrame, sufijo: str) -> pd.DataFrame:
        g = df.groupby("fecha", as_index=False).agg(
            **{
                f"categorias_{sufijo}": ("categoria", "nunique"),
                f"uf_ocupada_{sufijo}": ("uf_ocupada_ext", "sum"),
                f"uf_trabajando_{sufijo}": ("uf_trabajando", "sum"),
                f"pax_ocupada_{sufijo}": ("pax_ocupada_ext", "sum"),
                f"pax_trabajando_{sufijo}": ("pax_trabajando", "sum"),
            }
        )
        g[f"pct_uf_{sufijo}"] = _ratio(g[f"uf_ocupada_{sufijo}"], g[f"uf_trabajando_{sufijo}"])
        g[f"pct_pax_{sufijo}"] = _ratio(g[f"pax_ocupada_{sufijo}"], g[f"pax_trabajando_{sufijo}"])
        return g

    general = _agregar(categoria_dia[categoria_dia["tiene_dato"]], "general")
    oficial = _agregar(categoria_dia[categoria_dia["cumple_minimo"]], "oficial")

    # Parque total del día, con dato o sin él.
    parque = categoria_dia.groupby("fecha", as_index=False).agg(
        uf_habilitada=("uf_habilitada", "sum"),
        pax_habilitada=("pax_habilitada", "sum"),
        uf_trabajando=("uf_trabajando", "sum"),
        pax_trabajando=("pax_trabajando", "sum"),
        n_establecimientos=("n_establecimientos", "sum"),
        n_relevados=("n_relevados", "sum"),
        categorias_totales=("categoria", "nunique"),
    )

    df = parque.merge(general, on="fecha", how="left").merge(oficial, on="fecha", how="left")
    for col in df.columns:
        if col.startswith("categorias_") and col != "categorias_totales":
            df[col] = df[col].fillna(0).astype(int)

    # Regla de publicación del total: mínimo de categorías con dato.
    minimo = cfg.min_categorias_general
    df["publicable_general"] = df["categorias_general"] >= minimo
    df["publicable_oficial"] = df["categorias_oficial"] >= minimo
    df["pct_uf_general"] = df["pct_uf_general"].where(df["publicable_general"])
    df["pct_pax_general"] = df["pct_pax_general"].where(df["publicable_general"])
    df["pct_uf_oficial"] = df["pct_uf_oficial"].where(df["publicable_oficial"])
    df["pct_pax_oficial"] = df["pct_pax_oficial"].where(df["publicable_oficial"])

    df["cobertura_estab"] = _ratio(df["n_relevados"], df["n_establecimientos"]).fillna(0.0)
    df["min_categorias_general"] = minimo

    return df.sort_values("fecha").reset_index(drop=True)


def construir_dim_alojamiento(hecho: pd.DataFrame) -> pd.DataFrame:
    """Ficha por establecimiento: parque, respuesta y ocupación observada."""
    g = hecho.groupby(["alojamiento_clave"], as_index=False).agg(
        alojamiento=("alojamiento", "first"),
        categoria=("categoria", lambda s: s.mode().iat[0] if not s.mode().empty else s.iat[0]),
        dias_en_panel=("fecha", "nunique"),
        dias_relevado=("con_dato", "sum"),
        dias_marcado_relevado=("relevado", "sum"),
        dias_operando=("opera", "sum"),
        capacidad_uf=("capacidad_uf", "median"),
        capacidad_pax=("capacidad_pax", "median"),
    )

    rel = hecho[hecho["con_dato"]]
    obs = rel.groupby("alojamiento_clave", as_index=False).agg(
        uf_disp_relevada=("uf_disponible", "sum"),
        uf_ocupada_relevada=("uf_ocupada", "sum"),
        pax_disp_relevada=("pax_disponible", "sum"),
        pax_ocupada_relevada=("pax_ocupada", "sum"),
        dias_completo=("estado_norm", lambda s: int((s == "Completo").sum())),
    )
    g = g.merge(obs, on="alojamiento_clave", how="left")

    g["dias_relevado"] = g["dias_relevado"].astype(int)
    g["dias_marcado_relevado"] = g["dias_marcado_relevado"].astype(int)
    g["dias_operando"] = g["dias_operando"].astype(int)
    g["tasa_respuesta"] = _ratio(g["dias_relevado"], g["dias_en_panel"]).fillna(0.0)
    g["ocupacion_uf_media"] = _ratio(g["uf_ocupada_relevada"], g["uf_disp_relevada"])
    g["ocupacion_pax_media"] = _ratio(g["pax_ocupada_relevada"], g["pax_disp_relevada"])
    g["dias_completo"] = g["dias_completo"].fillna(0).astype(int)

    # Estados dominantes: cómo se comporta el establecimiento frente al relevamiento.
    familia = (
        hecho.groupby(["alojamiento_clave", "estado_familia"]).size().rename("n").reset_index()
    )
    dominante = familia.sort_values("n", ascending=False).drop_duplicates("alojamiento_clave")
    g = g.merge(
        dominante[["alojamiento_clave", "estado_familia"]].rename(
            columns={"estado_familia": "estado_familia_dominante"}
        ),
        on="alojamiento_clave",
        how="left",
    )

    return g.sort_values(["categoria", "alojamiento"]).reset_index(drop=True)
