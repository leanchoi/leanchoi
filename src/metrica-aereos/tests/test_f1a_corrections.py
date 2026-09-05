import unittest
import os
import gzip
import json
import hashlib
from datetime import date

from aereos.schedule import planificar_consultas_dia, generar_fechas_ancla, cargar_configuraciones
from aereos.runs import BitacoraManager, ScrapeRunLog
from aereos.collect import es_dia_sin_servicio, reprocesar_crudo, guardar_crudo


class TestF1aCorrections(unittest.TestCase):
    def test_criterio_3_oneway_bidireccional(self):
        plan = planificar_consultas_dia()
        bue_eqs = [c for c in plan if c.origin == "BUE" and c.dest == "EQS" and not c.is_calibration]
        eqs_bue = [c for c in plan if c.origin == "EQS" and c.dest == "BUE" and not c.is_calibration]
        self.assertGreater(len(bue_eqs), 0)
        self.assertGreater(len(eqs_bue), 0)
        self.assertEqual(bue_eqs[0].trip_type, "one_way")
        self.assertIsNone(bue_eqs[0].return_date)
        self.assertEqual(eqs_bue[0].trip_type, "one_way")
        self.assertIsNone(eqs_bue[0].return_date)

    def test_criterio_4_sin_servicio_martes_eqs(self):
        # 2026-10-13 es martes
        self.assertTrue(es_dia_sin_servicio("BUE", "EQS", "2026-10-13"))
        self.assertTrue(es_dia_sin_servicio("EQS", "BUE", "2026-10-13"))
        # 2026-10-14 es miércoles (sí vuela)
        self.assertFalse(es_dia_sin_servicio("BUE", "EQS", "2026-10-14"))
        # BRC vuela diario
        self.assertFalse(es_dia_sin_servicio("BUE", "BRC", "2026-10-13"))

        # Cobertura en bitácora
        bm = BitacoraManager("/tmp/test_bitacora_unit")
        bm.registrar(ScrapeRunLog("1", "b1", "2026-09-05T00:00:00", "2026-09-05", "BUE", "EQS", "2026-10-13", None, 1, "ARS", "gflights_tfs", "sin_servicio", 0, {}, {}, 200, 200, "1.0.0", "1.0.1"))
        bm.registrar(ScrapeRunLog("2", "b1", "2026-09-05T00:00:00", "2026-09-05", "BUE", "EQS", "2026-10-14", None, 1, "ARS", "gflights_tfs", "ok", 2, {"AR": 2}, {}, 200, 200, "1.0.0", "1.0.1"))
        res = bm.leer_resumen_dia("2026-09-05")
        self.assertEqual(res["cobertura_valida_pct"], 100.0)

    def test_criterio_6_muestras_estables(self):
        cfg, cal = cargar_configuraciones()
        generadores = cfg["conjuntos_de_fechas"]["ancla"]["generadores"]
        today = date(2026, 9, 5)
        f1 = generar_fechas_ancla(today, horizonte_dias=90, cal=cal, generadores=generadores)
        f2 = generar_fechas_ancla(today, horizonte_dias=90, cal=cal, generadores=generadores)
        self.assertEqual(f1, f2)

    def test_criterio_7_presupuesto_menor_250(self):
        plan = planificar_consultas_dia()
        self.assertLessEqual(len(plan), 250)


if __name__ == "__main__":
    unittest.main()
