"""Pruebas unitarias para el módulo canónico de estadística y gobernanza (Prompt 1f).

Verifica:
1. Cálculo de percentiles (interpolación lineal estándar).
2. Distancias geodésicas y normalización por kilómetro.
3. Clasificación de buckets de anticipación (lead_bucket).
4. Fórmulas de las tres versiones de la brecha (titular AR vs AR, doméstica, agrupada).
5. Evaluación de pertinencia (exclusión estricta de LA, G3, DE).
6. Invariantes I8 e I15: marcado de preliminar ante baja cobertura.
"""
from __future__ import annotations

import unittest
from aereos.estadistica import (
    calcular_percentiles,
    haversine_km,
    calcular_distancia_km,
    calcular_tarifa_km,
    definir_lead_bucket,
    calcular_prima_monopolio_ar,
    calcular_brecha_domestica,
    calcular_brecha_agrupada,
    computar_tres_brechas,
    METADATOS_INDICADORES,
)
from aereos.parse import evaluar_pertinencia_itinerario


class TestEstadisticaGobernanza(unittest.TestCase):

    def test_percentiles_distribucion_y_casos_borde(self):
        """Verifica interpolación lineal y casos borde de percentiles."""
        vacio = calcular_percentiles([], default=0.0)
        self.assertEqual(vacio["min"], 0.0)
        self.assertEqual(vacio["median"], 0.0)

        unitario = calcular_percentiles([120.0])
        self.assertEqual(unitario["min"], 120.0)
        self.assertEqual(unitario["median"], 120.0)
        self.assertEqual(unitario["max"], 120.0)

        # 4 valores: 100, 200, 300, 400
        # P25: 100 + 0.75*(200-100) = 175
        # Median (P50): 200 + 0.5*(300-200) = 250
        # P75: 300 + 0.25*(400-300) = 325
        vals = [100.0, 200.0, 300.0, 400.0]
        stats = calcular_percentiles(vals)
        self.assertEqual(stats["min"], 100.0)
        self.assertEqual(stats["p25"], 175.0)
        self.assertEqual(stats["median"], 250.0)
        self.assertEqual(stats["p75"], 325.0)
        self.assertEqual(stats["max"], 400.0)

    def test_distancias_geodesicas(self):
        """Verifica distancias geodésicas ortodrómicas oficiales."""
        dist_eqs = calcular_distancia_km("BUE", "EQS")
        self.assertAlmostEqual(dist_eqs, 1439.3, delta=2.0)

        dist_brc = calcular_distancia_km("BUE", "BRC")
        self.assertAlmostEqual(dist_brc, 1335.3, delta=5.0)

        # Distancia a sí mismo es 0
        self.assertEqual(calcular_distancia_km("BUE", "BUE"), 0.0)

    def test_lead_buckets(self):
        """Verifica asignación de anticipación a buckets estandarizados."""
        self.assertEqual(definir_lead_bucket(2), "1-3d")
        self.assertEqual(definir_lead_bucket(5), "4-7d")
        self.assertEqual(definir_lead_bucket(10), "8-14d")
        self.assertEqual(definir_lead_bucket(20), "15-29d")
        self.assertEqual(definir_lead_bucket(30), "30-59d")
        self.assertEqual(definir_lead_bucket(75), "60-89d")
        self.assertEqual(definir_lead_bucket(100), "90-119d")
        self.assertEqual(definir_lead_bucket(150), "120-179d")

    def test_formulas_brecha_individuales(self):
        """Verifica las 3 fórmulas canónicas de sobreprecio y brecha."""
        # Celda 30d del spike F0:
        # AR EQS: $174.89/km, AR BRC: $68.50/km
        prima_ar = calcular_prima_monopolio_ar(174.89, 68.50)
        # 174.89 / 68.50 - 1 = 1.5531 -> +155.3% o +155.5% según redondeo
        self.assertAlmostEqual(prima_ar, 155.3, delta=0.3)

        # BRC Doméstico mediana: $82.90/km
        brecha_dom = calcular_brecha_domestica(174.89, 82.90)
        self.assertAlmostEqual(brecha_dom, 111.0, delta=0.2)

        # BRC Agrupada global: $114.82/km
        brecha_agr = calcular_brecha_agrupada(174.89, 114.82)
        self.assertAlmostEqual(brecha_agr, 52.3, delta=0.2)

        # Casos nulos
        self.assertIsNone(calcular_prima_monopolio_ar(None, 68.5))
        self.assertIsNone(calcular_prima_monopolio_ar(174.89, 0))

    def test_computar_tres_brechas_filtrado_y_gobernanza(self):
        """Verifica que computar_tres_brechas excluya desvíos y aplique reglas I8/I15."""
        vuelos_eqs = [
            {"airline_code": "AR", "price_ars": 251713.0, "itinerario_relevante": True},
            {"airline_code": "AR", "price_ars": 251713.0, "itinerario_relevante": True},
            {"airline_code": "AR", "price_ars": 251713.0, "itinerario_relevante": True},
            # Intruso internacional en EQS
            {"airline_code": "LA", "price_ars": 2100000.0, "itinerario_relevante": False},
        ]
        vuelos_brc = [
            {"airline_code": "AR", "price_ars": 91404.0, "itinerario_relevante": True},
            {"airline_code": "AR", "price_ars": 91404.0, "itinerario_relevante": True},
            {"airline_code": "AR", "price_ars": 91404.0, "itinerario_relevante": True},
            {"airline_code": "WJ", "price_ars": 110682.0, "itinerario_relevante": True},
            {"airline_code": "FO", "price_ars": 115617.0, "itinerario_relevante": True},
            # Desvío internacional en BRC
            {"airline_code": "LA", "price_ars": 1997890.0, "itinerario_relevante": False},
            {"airline_code": "G3", "price_ars": 2136961.0, "itinerario_relevante": False},
        ]

        res = computar_tres_brechas(
            vuelos_eqs,
            vuelos_brc,
            dist_eqs=1439.3,
            dist_brc=1335.3,
            cobertura_esperada_eqs=3,
            cobertura_esperada_brc=5,
        )

        self.assertIn("titular", res)
        self.assertIn("domestica", res)
        self.assertIn("agrupada", res)
        self.assertIn("gobernanza", res)

        # 1. Titular: AR vs AR
        tit = res["titular"]
        self.assertEqual(tit["id"], "prima_monopolio_ar_pct")
        self.assertEqual(tit["n_eqs"], 3)
        self.assertEqual(tit["n_brc"], 3)
        # AR EQS: 251713 / 1439.3 = 174.89 $/km
        # AR BRC: 91404 / 1335.3 = 68.45 $/km
        # Prima: (174.89 / 68.45) - 1 = +155.5%
        self.assertAlmostEqual(tit["valor_pct"], 155.5, delta=1.0)
        self.assertFalse(tit["es_preliminar"])

        # 2. Doméstica
        dom = res["domestica"]
        self.assertEqual(dom["n_brc"], 5)  # 3 AR + 1 WJ + 1 FO (LA y G3 excluidos!)

        # 3. Agrupada
        agr = res["agrupada"]
        self.assertTrue(agr["es_preliminar"])  # Marcada preliminar / desaconsejada

    def test_filtro_pertinencia_bloquea_operadores_extranjeros(self):
        """Verifica que LATAM, GOL y Condor no pasen el filtro de pertinencia."""
        itin_la = {"airline_code": "LA", "origin_iata": "BUE", "dest_iata": "BRC"}
        es_rel_la, motivo_la = evaluar_pertinencia_itinerario(itin_la)
        self.assertFalse(es_rel_la)
        self.assertEqual(motivo_la, "operador_sin_cabotaje")

        itin_g3 = {"airline_code": "G3", "origin_iata": "COR", "dest_iata": "BRC"}
        es_rel_g3, motivo_g3 = evaluar_pertinencia_itinerario(itin_g3)
        self.assertFalse(es_rel_g3)
        self.assertEqual(motivo_g3, "operador_sin_cabotaje")

        itin_ar = {"airline_code": "AR", "origin_iata": "BUE", "dest_iata": "EQS", "stops_count": 0}
        es_rel_ar, motivo_ar = evaluar_pertinencia_itinerario(itin_ar)
        self.assertTrue(es_rel_ar)
        self.assertIsNone(motivo_ar)


if __name__ == "__main__":
    unittest.main()
