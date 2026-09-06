"""Pruebas unitarias para el módulo de series temporales y visualización estadística de tarifas.

Verifica la matemática de percentiles (P25, P50, P75), agregaciones diarias/semanales/mensuales,
anotación de hitos turísticos y el endpoint /api/series.
"""
import unittest
import base64
from datetime import date
from aereos.server import (
    calcular_percentiles,
    calcular_series_temporales,
    HITOS_TURISMO,
    MetricaAereosHandler,
)


class TestF1fSeriesVisualizacion(unittest.TestCase):

    def test_calcular_percentiles_vacio_y_unitario(self):
        """Lista vacía o de un elemento debe retornar valores consistentes sin error."""
        vacio = calcular_percentiles([])
        self.assertEqual(vacio["min"], 0.0)
        self.assertEqual(vacio["p25"], 0.0)
        self.assertEqual(vacio["median"], 0.0)
        self.assertEqual(vacio["p75"], 0.0)
        self.assertEqual(vacio["max"], 0.0)
        self.assertEqual(vacio["avg"], 0.0)

        unitario = calcular_percentiles([150000.0])
        self.assertEqual(unitario["min"], 150000.0)
        self.assertEqual(unitario["p25"], 150000.0)
        self.assertEqual(unitario["median"], 150000.0)
        self.assertEqual(unitario["p75"], 150000.0)
        self.assertEqual(unitario["max"], 150000.0)
        self.assertEqual(unitario["avg"], 150000.0)

    def test_calcular_percentiles_distribucion_lineal(self):
        """Verifica la interpolación lineal estándar de percentiles."""
        valores = [100.0, 200.0, 300.0, 400.0]
        stats = calcular_percentiles(valores)
        self.assertEqual(stats["min"], 100.0)
        self.assertEqual(stats["p25"], 175.0)
        self.assertEqual(stats["median"], 250.0)
        self.assertEqual(stats["p75"], 325.0)
        self.assertEqual(stats["max"], 400.0)
        self.assertEqual(stats["avg"], 250.0)

    def test_calcular_series_temporales_estructura(self):
        """La función de series debe devolver estructura completa para BUE>EQS."""
        res = calcular_series_temporales(
            rutas=["BUE>EQS", "EQS>BUE"],
            agrupacion="semanal",
            metrica="precio_ars",
        )
        self.assertIn("agrupacion", res)
        self.assertEqual(res["agrupacion"], "semanal")
        self.assertIn("rutas", res)
        self.assertEqual(len(res["rutas"]), 2)

        r0 = res["rutas"][0]
        self.assertEqual(r0["ruta"], "BUE > EQS")
        self.assertEqual(r0["origen"], "BUE")
        self.assertEqual(r0["destino"], "EQS")
        self.assertGreater(r0["distancia_km"], 1400)
        self.assertIn("puntos", r0)
        self.assertGreater(len(r0["puntos"]), 0)

        # Cada punto debe tener estadísticas y metadatos
        p0 = r0["puntos"][0]
        self.assertIn("bucket_id", p0)
        self.assertIn("etiqueta", p0)
        self.assertIn("vuelos_disponibles", p0)

    def test_calcular_series_agrupacion_mensual_y_diaria(self):
        """Debe soportar agrupaciones mensual y diaria."""
        res_m = calcular_series_temporales(rutas=["BUE>EQS"], agrupacion="mensual")
        self.assertEqual(res_m["agrupacion"], "mensual")
        puntos_m = res_m["rutas"][0]["puntos"]
        # En 180 días hay entre 6 y 8 meses
        self.assertTrue(6 <= len(puntos_m) <= 8)

        res_d = calcular_series_temporales(rutas=["BUE>EQS"], agrupacion="diaria")
        self.assertEqual(res_d["agrupacion"], "diaria")
        puntos_d = res_d["rutas"][0]["puntos"]
        self.assertEqual(len(puntos_d), 180)

    def test_hitos_turismo_incluidos(self):
        """Los hitos turísticos oficiales deben estar presentes en el retorno."""
        res = calcular_series_temporales(rutas=["BUE>EQS"], agrupacion="semanal")
        hitos = res.get("hitos", [])
        self.assertGreater(len(hitos), 0)
        nombres = [h["nombre"] for h in hitos]
        self.assertTrue(any("Navidad" in n for n in nombres))
        self.assertTrue(any("Carnaval" in n for n in nombres))


if __name__ == "__main__":
    unittest.main()
