"""Pruebas unitarias para Prompt 1g: Escalera Tarifaria, Red de Rutas y Cotización Diaria de Dólar.

Verifica:
1. Descomposición matemática exacta: Δ ln(p_mín) = Δ_precio + Δ_composición.
2. Diagnóstico político según efecto dominante (más frecuencias vs tarifas más bajas).
3. Invariante I12 en descomposición (sin interpolación cuando falta historial).
4. Cotización del dólar con regla estricta de fecha observada (observed_date, jamás tasa de hoy).
5. Planificación de muestreo por clases de ruta (Superficie Completa vs Panel de Red semanal).
6. Etiquetas y metadatos canónicos: precio_min_ars titular y max_min_ars (mínimo más alto).
"""
from __future__ import annotations

import math
import unittest
from datetime import date, timedelta

from aereos.estadistica import (
    calcular_percentiles,
    calcular_descomposicion_escalera,
    METADATOS_INDICADORES,
)
from aereos.fx import convertir_tarifa
from aereos.ladder import parse_ladder_records
from aereos.schedule import planificar_consultas_f1g, reportar_presupuesto_red


class TestF1gEscaleraRedDolar(unittest.TestCase):

    def test_descomposicion_reprecio_puro(self):
        """Caso 1: Reprecio puro de aerolínea (la clase Base sigue disponible pero sube de precio)."""
        ant = [
            {"fare_family": "Base", "price_amount": 100000.0, "seats_remaining": 9, "booking_class": "A"},
            {"fare_family": "Plus", "price_amount": 130000.0, "seats_remaining": 9, "booking_class": "B"},
        ]
        hoy = [
            {"fare_family": "Base", "price_amount": 120000.0, "seats_remaining": 7, "booking_class": "A"},
            {"fare_family": "Plus", "price_amount": 150000.0, "seats_remaining": 9, "booking_class": "B"},
        ]

        ef_precio, ef_comp = calcular_descomposicion_escalera(ant, hoy)
        self.assertIsNotNone(ef_precio)
        self.assertIsNotNone(ef_comp)

        # Delta log total del mínimo
        delta_total = (math.log(120000.0) - math.log(100000.0)) * 100.0
        self.assertAlmostEqual(ef_precio, delta_total, places=4)
        self.assertAlmostEqual(ef_comp, 0.0, places=4)
        self.assertAlmostEqual(ef_precio + ef_comp, delta_total, places=4)

    def test_descomposicion_saturacion_capacidad_puro(self):
        """Caso 2: Agotamiento de la clase Base (efecto composición puro, la aerolínea no modificó precios)."""
        ant = [
            {"fare_family": "Base", "price_amount": 100000.0, "seats_remaining": 1, "booking_class": "A"},
            {"fare_family": "Plus", "price_amount": 140000.0, "seats_remaining": 8, "booking_class": "B"},
            {"fare_family": "Flex", "price_amount": 180000.0, "seats_remaining": 9, "booking_class": "C"},
        ]
        # Hoy se agotó Base. La clase más barata ahora es Plus, al mismo precio de ayer ($140.000)
        hoy = [
            {"fare_family": "Plus", "price_amount": 140000.0, "seats_remaining": 5, "booking_class": "B"},
            {"fare_family": "Flex", "price_amount": 180000.0, "seats_remaining": 9, "booking_class": "C"},
        ]

        ef_precio, ef_comp = calcular_descomposicion_escalera(ant, hoy)
        self.assertIsNotNone(ef_precio)
        self.assertIsNotNone(ef_comp)

        delta_total = (math.log(140000.0) - math.log(100000.0)) * 100.0
        # No hubo reprecio en Plus ni Flex
        self.assertAlmostEqual(ef_precio, 0.0, places=4)
        self.assertAlmostEqual(ef_comp, delta_total, places=4)
        self.assertAlmostEqual(ef_precio + ef_comp, delta_total, places=4)
        self.assertGreater(ef_comp, ef_precio)

    def test_descomposicion_mixta_exactitud_aditiva(self):
        """Caso 3: Reprecio y saturación simultánea. Verifica aditividad exacta: Δ ln = Δ_precio + Δ_comp."""
        ant = [
            {"fare_family": "Base", "price_amount": 100000.0, "seats_remaining": 2, "booking_class": "A"},
            {"fare_family": "Plus", "price_amount": 130000.0, "seats_remaining": 6, "booking_class": "B"},
        ]
        # Hoy Base se agotó y Plus además subió a 145.000
        hoy = [
            {"fare_family": "Plus", "price_amount": 145000.0, "seats_remaining": 4, "booking_class": "B"},
        ]

        ef_precio, ef_comp = calcular_descomposicion_escalera(ant, hoy)
        delta_total = (math.log(145000.0) - math.log(100000.0)) * 100.0
        self.assertAlmostEqual(ef_precio + ef_comp, delta_total, places=4)

    def test_invariante_i12_sin_interpolacion(self):
        """Invariante I12: Si falta una de las dos observaciones o no hay solapamiento, devuelve (None, None)."""
        ant = [{"fare_family": "Base", "price_amount": 100000.0}]
        ef_precio, ef_comp = calcular_descomposicion_escalera(ant, [])
        self.assertIsNone(ef_precio)
        self.assertIsNone(ef_comp)

        ef_precio_v, ef_comp_v = calcular_descomposicion_escalera([], ant)
        self.assertIsNone(ef_precio_v)
        self.assertIsNone(ef_comp_v)

    def test_conversion_fx_regla_fecha_observada(self):
        """Verifica que la conversión use la cotización de observed_date y NUNCA la tasa actual."""
        historial_fx = {
            "2026-08-01": {"oficial_venta": 1000.0, "blue_venta": 1200.0},
            "2026-09-01": {"oficial_venta": 1100.0, "blue_venta": 1400.0},
            "2026-09-07": {"oficial_venta": 1250.0, "blue_venta": 1500.0},
        }

        monto_ars = 140000.0
        # Observación del 1 de septiembre
        obs_date = "2026-09-01"

        # Con blue de fecha observada (1400), debe dar exactamente 100 USD
        usd_blue_obs = convertir_tarifa(monto_ars, obs_date, modo="USD_BLUE", fx_historial=historial_fx)
        self.assertEqual(usd_blue_obs, 100.0)

        # Si erróneamente se usara la fecha de hoy (1500), daría 93.33 USD
        usd_hoy_erroneo = round(monto_ars / 1500.0, 2)
        self.assertNotEqual(usd_blue_obs, usd_hoy_erroneo)

        # Oficial de fecha observada (1100)
        usd_of_obs = convertir_tarifa(monto_ars, obs_date, modo="USD_OFICIAL", fx_historial=historial_fx)
        self.assertEqual(usd_of_obs, round(140000.0 / 1100.0, 2))

    def test_planificacion_clases_de_ruta_y_presupuesto(self):
        """Verifica que el panel de red rote semanalmente manteniendo el presupuesto acotado."""
        plan_lunes = planificar_consultas_f1g(fecha_ejecucion=date(2026, 9, 7))  # Lunes
        self.assertTrue(len(plan_lunes) > 0)

        presupuesto = reportar_presupuesto_red()
        self.assertEqual(presupuesto["consultas_panel_red_dia"], 18)
        self.assertEqual(presupuesto["dias_semana_rotacion"], 7)
        self.assertIn("EQS", [r["destino"] for r in presupuesto["rutas_superficie_completa"]])
        self.assertIn("BRC", [r["destino"] for r in presupuesto["rutas_superficie_completa"]])
        self.assertIn("CPC", [r["destino"] for r in presupuesto["rutas_superficie_completa"]])

    def test_metadatos_indicadores_y_etiqueta_max_min(self):
        """Verifica que el catálogo oficial incluya los 5 nuevos indicadores y la etiqueta de máx. base."""
        self.assertIn("precio_min_ars", METADATOS_INDICADORES)
        self.assertIn("efecto_composicion_pp", METADATOS_INDICADORES)
        self.assertIn("efecto_precio_pp", METADATOS_INDICADORES)
        self.assertIn("vuelos_dia", METADATOS_INDICADORES)
        self.assertIn("fx_blue_venta", METADATOS_INDICADORES)

        valores = [150000.0, 167985.0, 185000.0]
        stats = calcular_percentiles(valores)
        self.assertEqual(stats["precio_min_ars"], 150000.0)
        self.assertEqual(stats["max_min_ars"], 185000.0)


if __name__ == "__main__":
    unittest.main()
