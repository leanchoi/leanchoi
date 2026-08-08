"""
Tests de la metodología.

Los primeros son unitarios sobre casos construidos a mano: fijan la definición
de cada indicador de forma legible, sin depender de la planilla.

El último es un test de reconciliación contra el libro real (si está presente):
verifica que el ETL siga reproduciendo la hoja oficial dentro del umbral. Se
saltea solo si el libro no está en el repositorio.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from oit import indicadores  # noqa: E402
from oit.config import cargar_config  # noqa: E402
from oit.normalize import clave_alojamiento, normalizar_estado  # noqa: E402

LIBRO = RAIZ / "Completo_Ocupacion_2026.xlsx"


@pytest.fixture(scope="module")
def cfg():
    return cargar_config()


def _fila(fecha, categoria, alojamiento, cap_uf, disp_uf, ocu_uf, relevado, estado=None):
    return {
        "Mes": "Test",
        "Fecha": pd.Timestamp(fecha),
        "Categoría": categoria,
        "Alojamiento": alojamiento,
        "Capacidad UF": cap_uf,
        "Capacidad PAX": cap_uf * 2,
        "UF Disponible": disp_uf,
        "PAX Disponible": disp_uf * 2,
        "UF Ocupada": ocu_uf,
        "PAX Ocupada": ocu_uf * 2,
        "Estado": estado,
        "Relevado": "Sí" if relevado else "No",
    }


# --------------------------------------------------------------------------
# Extrapolación
# --------------------------------------------------------------------------
def test_extrapolacion_proyecta_la_tasa_de_la_muestra_al_parque(cfg):
    """La tasa de los que responden se aplica al parque que opera."""
    crudo = pd.DataFrame(
        [
            # Responden 3 de 5 hoteles: 10 de 20 UF ocupadas ⇒ tasa 50 %.
            _fila("2026-01-01", "HOTELES", "A", 10, 10, 5, True),
            _fila("2026-01-01", "HOTELES", "B", 6, 6, 3, True),
            _fila("2026-01-01", "HOTELES", "C", 4, 4, 2, True),
            _fila("2026-01-01", "HOTELES", "D", 20, 20, 0, False),
            _fila("2026-01-01", "HOTELES", "E", 10, 10, 0, False),
        ]
    )
    hecho = indicadores.preparar_hecho_establecimiento(crudo, cfg)
    cat = indicadores.construir_categoria_dia(hecho, cfg)

    fila = cat.iloc[0]
    assert fila["uf_habilitada"] == 50
    assert fila["uf_trabajando"] == 50
    assert fila["n_relevados"] == 3
    assert fila["tasa_uf"] == pytest.approx(0.5)
    # 50 % del parque operativo (50 UF) = 25 UF.
    assert fila["uf_ocupada_ext"] == pytest.approx(25.0)


def test_minimo_muestral_gatilla_la_publicacion(cfg):
    """Por debajo del mínimo se calcula, pero no se publica."""
    # HOTELES exige 3 establecimientos; acá responden 2.
    crudo = pd.DataFrame(
        [
            _fila("2026-01-01", "HOTELES", "A", 10, 10, 5, True),
            _fila("2026-01-01", "HOTELES", "B", 10, 10, 5, True),
            _fila("2026-01-01", "HOTELES", "C", 10, 10, 0, False),
        ]
    )
    cat = indicadores.construir_categoria_dia(
        indicadores.preparar_hecho_establecimiento(crudo, cfg), cfg
    )
    fila = cat.iloc[0]

    assert fila["n_relevados"] == 2
    assert fila["cumple_minimo"] is np.False_ or fila["cumple_minimo"] is False
    assert np.isnan(fila["pct_uf"]), "no debe publicarse por debajo del mínimo"
    # La estimación sí existe: se conserva para el panel de calidad.
    assert fila["uf_ocupada_ext"] == pytest.approx(15.0)
    assert fila["faltan_para_minimo"] == 1


def test_sin_muestra_no_hay_dato_no_hay_cero(cfg):
    """Cero respuestas ⇒ sin dato. Nunca 0 % de ocupación."""
    crudo = pd.DataFrame(
        [
            _fila("2026-01-01", "HOTELES", "A", 10, 10, 0, False),
            _fila("2026-01-01", "HOTELES", "B", 10, 10, 0, False),
        ]
    )
    cat = indicadores.construir_categoria_dia(
        indicadores.preparar_hecho_establecimiento(crudo, cfg), cfg
    )
    fila = cat.iloc[0]

    assert fila["n_relevados"] == 0
    assert not fila["tiene_dato"]
    assert np.isnan(fila["tasa_uf"])
    assert np.isnan(fila["uf_ocupada_ext"])


def test_ocupacion_cargada_cuenta_como_dato_aunque_relevado_diga_no(cfg):
    """La bandera 'Relevado' se completa a mano; la ocupación cargada manda."""
    crudo = pd.DataFrame(
        [
            _fila("2026-01-01", "HOTELES", "A", 10, 10, 5, True),
            _fila("2026-01-01", "HOTELES", "B", 10, 10, 4, False, estado="Disponible"),
            _fila("2026-01-01", "HOTELES", "C", 10, 10, 0, False),
        ]
    )
    cat = indicadores.construir_categoria_dia(
        indicadores.preparar_hecho_establecimiento(crudo, cfg), cfg
    )
    fila = cat.iloc[0]

    assert fila["n_relevados"] == 2, "B tiene ocupación cargada: es dato"
    assert fila["n_marcados_relevados"] == 1
    assert fila["tasa_uf"] == pytest.approx(9 / 20)


def test_estratos_se_extrapolan_por_separado_y_luego_se_suman(cfg):
    """CABAÑAS y CABAÑAS 2 son sublistas distintas del mismo rótulo publicado."""
    crudo = pd.DataFrame(
        [
            # Sublista chica, 100 % ocupada, parque 10 UF.
            _fila("2026-01-01", "CABAÑAS", "A", 10, 10, 10, True),
            # Sublista grande, 0 % ocupada, parque 100 UF.
            _fila("2026-01-01", "CABAÑAS 2", "B", 100, 100, 0, True),
        ]
    )
    cat = indicadores.construir_categoria_dia(
        indicadores.preparar_hecho_establecimiento(crudo, cfg), cfg
    )
    fila = cat.iloc[0]

    assert fila["categoria"] == "CABAÑAS"
    assert fila["n_estratos"] == 2
    assert fila["uf_trabajando"] == 110
    # Estratificado: 1.0×10 + 0.0×100 = 10 UF (no la tasa combinada sobre el total).
    assert fila["uf_ocupada_ext"] == pytest.approx(10.0)
    assert fila["tasa_uf"] == pytest.approx(10 / 110)


def test_ocupada_nunca_supera_disponible(cfg):
    """Errores de carga (ocupadas > disponibles) se recortan, no se propagan."""
    crudo = pd.DataFrame([_fila("2026-01-01", "HOTELES", "A", 10, 8, 99, True)])
    hecho = indicadores.preparar_hecho_establecimiento(crudo, cfg)
    assert hecho.iloc[0]["uf_ocupada"] == 8
    assert hecho.iloc[0]["pax_ocupada"] == 16


# --------------------------------------------------------------------------
# Agregado del destino
# --------------------------------------------------------------------------
def test_total_del_dia_exige_minimo_de_categorias(cfg):
    """Con menos categorías que el mínimo, el día no se publica."""
    filas = [
        _fila("2026-01-01", "HOTELES", "A", 10, 10, 5, True),
        _fila("2026-01-01", "HOTELES", "B", 10, 10, 5, True),
        _fila("2026-01-01", "HOTELES", "C", 10, 10, 5, True),
    ]
    cat = indicadores.construir_categoria_dia(
        indicadores.preparar_hecho_establecimiento(pd.DataFrame(filas), cfg), cfg
    )
    dia = indicadores.construir_dia(cat, cfg)

    assert cfg.min_categorias_general == 3
    assert dia.iloc[0]["categorias_oficial"] == 1
    assert not dia.iloc[0]["publicable_oficial"]
    assert np.isnan(dia.iloc[0]["pct_uf_oficial"])


# --------------------------------------------------------------------------
# Normalización
# --------------------------------------------------------------------------
@pytest.mark.parametrize(
    "crudo,esperado,familia",
    [
        ("wsp", "Contactado sin respuesta", "Sin respuesta"),
        ("W", "Contactado sin respuesta", "Sin respuesta"),
        ("completo ", "Completo", "Con respuesta"),
        ("Disponible", "Con disponibilidad", "Con respuesta"),
        ("dis", "Con disponibilidad", "Con respuesta"),
        ("hay lugar", "Con disponibilidad", "Con respuesta"),
        ("BAJA", "Baja", "Fuera de operación"),
        ("Cerrado/H nuevo aviso", "Cerrado temporalmente", "Fuera de operación"),
        (None, "Sin gestión registrada", "Sin gestión"),
        ("", "Sin gestión registrada", "Sin gestión"),
    ],
)
def test_normalizacion_de_estados(crudo, esperado, familia):
    assert normalizar_estado(crudo) == (esperado, familia)


def test_clave_alojamiento_unifica_variantes_de_escritura():
    assert clave_alojamiento("Angelina ") == clave_alojamiento("angelina")
    assert clave_alojamiento("Peñiwen") == clave_alojamiento("PENIWEN")


# --------------------------------------------------------------------------
# Reconciliación con el libro real
# --------------------------------------------------------------------------
@pytest.mark.skipif(not LIBRO.exists(), reason="El libro fuente no está en el repo")
def test_reconciliacion_con_la_planilla_oficial(cfg):
    """El ETL debe seguir reproduciendo la hoja oficial dentro del umbral."""
    from build import UMBRAL_DIFERENCIAS, validar_contra_oficial

    limpios = pd.read_excel(LIBRO, sheet_name="Histórico - Datos Limpios")
    oficial = pd.read_excel(LIBRO, sheet_name="Histórico - Ocupación Oficial")

    hecho = indicadores.preparar_hecho_establecimiento(limpios, cfg)
    cat = indicadores.construir_categoria_dia(hecho, cfg)
    informe = validar_contra_oficial(cat, oficial, cfg)

    assert informe["ejecutada"]
    assert informe["filas_comparadas"] > 2000
    assert informe["dentro_de_umbral"], (
        f"La divergencia ({informe['peor_share']:.2%}) supera el umbral "
        f"({UMBRAL_DIFERENCIAS:.0%}). Detalle: {informe['comparaciones']}"
    )
