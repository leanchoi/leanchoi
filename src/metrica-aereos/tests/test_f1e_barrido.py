"""Pruebas unitarias y de contrato para Prompt 1e:
- Barrido diario completo a 180 días (T+1 .. T+180).
- Etapa 1: BUE↔EQS (360 consultas/día).
- Retiro definitivo del modo ancla como criterio de muestreo.
- Ventana estacional para COR↔EQS (±30 días).
- Pestaña Vuelos: 12 columnas ordenables, cálculo de tarifa por km y visibilidad de brechas (I8/I13).
"""
import unittest
from datetime import date, timedelta

from aereos.schedule import (
    planificar_consultas_dia,
    es_fecha_en_ventana_estacional,
    cargar_configuraciones,
)
from aereos.server import (
    calcular_distancia_km,
    format_duration,
    get_cobertura_mensual,
    load_itineraries,
)


class TestF1eBarrido(unittest.TestCase):
    def test_etapa1_plan_360_consultas(self):
        today = date(2026, 9, 6)
        plan = planificar_consultas_dia(observed_date=today, etapa=1, horizonte_dias=180)

        # Criterio 2: exactamente 360 consultas (2 sentidos x 180 días)
        self.assertEqual(len(plan), 360)

        rutas_encontradas = {(c.origin, c.dest) for c in plan}
        self.assertEqual(rutas_encontradas, {("BUE", "EQS"), ("EQS", "BUE")})

        # Fechas arrancan en T+1 (2026-09-07) y terminan en T+180
        fechas_bue_eqs = [c.flight_date for c in plan if c.origin == "BUE" and c.dest == "EQS"]
        self.assertEqual(len(fechas_bue_eqs), 180)
        self.assertEqual(min(fechas_bue_eqs), (today + timedelta(days=1)).isoformat())
        self.assertEqual(max(fechas_bue_eqs), (today + timedelta(days=180)).isoformat())

        # Todas son one_way sin return_date y categorizadas como etapa1_nucleo
        for c in plan:
            self.assertEqual(c.trip_type, "one_way")
            self.assertIsNone(c.return_date)
            self.assertEqual(c.prioridad_categoria, "etapa1_nucleo")
            self.assertEqual(c.prioridad_orden, 0)

    def test_etapa2_plan_720_consultas(self):
        today = date(2026, 9, 6)
        plan = planificar_consultas_dia(observed_date=today, etapa=2, horizonte_dias=180)

        # Etapa 2 suma BUE↔BRC (4 sentidos x 180 días = 720 consultas)
        self.assertEqual(len(plan), 720)
        rutas_encontradas = {(c.origin, c.dest) for c in plan}
        self.assertEqual(rutas_encontradas, {("BUE", "EQS"), ("EQS", "BUE"), ("BUE", "BRC"), ("BRC", "BUE")})

    def test_modo_ancla_retirado(self):
        # Criterio 3: el modo ancla fue retirado; el barrido es continuo fecha a fecha
        today = date(2026, 9, 6)
        plan = planificar_consultas_dia(observed_date=today, etapa=1, horizonte_dias=180)
        fechas_unicas = sorted(list({c.flight_date for c in plan if c.origin == "BUE"}))

        self.assertEqual(len(fechas_unicas), 180)
        # Verificar que no hay saltos de días entre fechas consecutivas
        for i in range(len(fechas_unicas) - 1):
            d1 = date.fromisoformat(fechas_unicas[i])
            d2 = date.fromisoformat(fechas_unicas[i + 1])
            self.assertEqual((d2 - d1).days, 1, f"Salto detectado entre {d1} y {d2}")

    def test_filtro_estacional_cor_eqs(self):
        # Criterio 4: COR↔EQS restringida a su ventana operativa ± 30 días
        # Ventana oficial en calendario: 08-01 a 09-30. Con margen ±30d: ~07-02 a ~10-30.
        self.assertTrue(es_fecha_en_ventana_estacional("COR", "EQS", "2026-08-15"))
        self.assertTrue(es_fecha_en_ventana_estacional("COR", "EQS", "2026-09-15"))
        self.assertTrue(es_fecha_en_ventana_estacional("COR", "EQS", "2026-10-15"))  # Dentro de los +30 días

        # Fechas fuera de temporada invernal
        self.assertFalse(es_fecha_en_ventana_estacional("COR", "EQS", "2026-12-15"))
        self.assertFalse(es_fecha_en_ventana_estacional("COR", "EQS", "2027-02-10"))
        self.assertFalse(es_fecha_en_ventana_estacional("COR", "EQS", "2027-04-01"))

        # Rutas no estacionales (BUE-EQS, BUE-BRC) siempre devuelven True
        self.assertTrue(es_fecha_en_ventana_estacional("BUE", "EQS", "2026-12-15"))
        self.assertTrue(es_fecha_en_ventana_estacional("BUE", "BRC", "2027-02-10"))

    def test_distancia_geodesica_y_tarifa_km(self):
        # Distancia BUE-EQS ~1419 km
        d_eqs = calcular_distancia_km("BUE", "EQS")
        self.assertAlmostEqual(d_eqs, 1419.0, delta=20.0)

        # Distancia BUE-BRC ~1348 km
        d_brc = calcular_distancia_km("BUE", "BRC")
        self.assertAlmostEqual(d_brc, 1348.0, delta=20.0)

        # Formato de duración
        self.assertEqual(format_duration(135), "2h 15m")
        self.assertEqual(format_duration(120), "2h")
        self.assertEqual(format_duration(45), "45m")
        self.assertEqual(format_duration(None), "—")

    def test_cobertura_mensual_y_estados(self):
        today = date(2026, 9, 6)
        cobertura = get_cobertura_mensual(origen="BUE", destino="EQS", observed_date=today, horizonte_dias=180)

        self.assertIsInstance(cobertura, list)
        self.assertGreater(len(cobertura), 0)

        primer_mes = cobertura[0]
        self.assertIn("mes_clave", primer_mes)
        self.assertIn("dias_con_servicio", primer_mes)
        self.assertIn("dias_con_datos", primer_mes)
        self.assertIn("dias_sin_muestrear", primer_mes)
        self.assertIn("dias_sin_servicio", primer_mes)
        self.assertIn("cobertura_pct", primer_mes)
        self.assertIn("texto_cobertura", primer_mes)

        # En BUE-EQS los martes son sin servicio (patrón 0,2,3,4,5,6)
        # El mes de septiembre debe registrar días_sin_servicio > 0 por los martes
        self.assertGreater(primer_mes["dias_sin_servicio"], 0)


if __name__ == "__main__":
    unittest.main()
