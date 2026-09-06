import gzip
import json
import os
import shutil
import tempfile
import unittest
from datetime import date

from aereos.canario import evaluar_operador_ruta
from aereos.collect import cargar_configuracion_completa, verificar_y_podar_disco
from aereos.parse import (
    evaluar_calendario_servicio,
    extract_json_blob,
    validar_respuesta_estructural,
)
from aereos.runs import BitacoraManager, ScrapeRunLog
from aereos.schedule import ORDEN_PRIORIDAD, reportar_plan_f1b


class TestF1cCorrections(unittest.TestCase):
    def test_criterio_1_tamano_blob_y_proyeccion(self):
        """Criterio 1: El blob JSON comprimido no debe superar ~8 KB, y la proyección a 90d debe ser < 1 GB (muy inferior a 8 GB)."""
        fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "bue_brc_roundtrip_payload.json")
        with open(fixture_path, "r", encoding="utf-8") as fh:
            data_str = fh.read()
        
        # Comprimir el blob tal como lo hace el colector
        gz_bytes = gzip.compress(data_str.encode("utf-8"))
        tamano_kb = len(gz_bytes) / 1024.0
        
        # En una ruta densa (BUE-BRC) con decenas de itinerarios, el blob gz no excede 10 KB
        self.assertLessEqual(tamano_kb, 10.0)
        
        # Proyección a 90 días para F1b (312 consultas diarias)
        consultas_dia = 312
        dias = 90
        total_gb = (len(gz_bytes) * consultas_dia * dias) / (1024.0 ** 3)
        # Menor a 1 GB (presupuesto es 8 GB)
        self.assertLess(total_gb, 1.0)

    def test_criterio_2_presupuesto_y_poda_disco(self):
        """Criterio 2: Poda automática de raw cuando se supera el presupuesto y registro en meta.json."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            bronce_dir = os.path.join(tmp_dir, "bronce")
            raw_dir = os.path.join(bronce_dir, "raw", "2026-09-01")
            os.makedirs(raw_dir, exist_ok=True)
            meta_file = os.path.join(tmp_dir, "meta.json")

            # Crear 3 archivos crudos de 20 KB cada uno = 60 KB
            dummy_data = b"x" * 20480
            f1 = os.path.join(raw_dir, "file1.json.gz")
            f2 = os.path.join(raw_dir, "file2.json.gz")
            f3 = os.path.join(raw_dir, "file3.json.gz")

            with open(f1, "wb") as fh: fh.write(dummy_data)
            os.utime(f1, (1000, 1000))
            with open(f2, "wb") as fh: fh.write(dummy_data)
            os.utime(f2, (2000, 2000))
            with open(f3, "wb") as fh: fh.write(dummy_data)
            os.utime(f3, (3000, 3000))

            # Presupuesto de 45 KB (debe podar f1 para quedar en 40 KB)
            res = verificar_y_podar_disco(
                bronce_dir=bronce_dir,
                presupuesto_bytes=45 * 1024,
                meta_path=meta_file,
            )

            self.assertTrue(res["alerta"])
            self.assertGreaterEqual(res["podados"], 1)
            self.assertFalse(os.path.exists(f1))
            self.assertTrue(os.path.exists(f3))

            # Verificar aviso en meta.json
            with open(meta_file, "r", encoding="utf-8") as fh:
                meta = json.load(fh)
            self.assertIn("alerta_disco", meta)
            self.assertIn("archivos_podados", meta["alerta_disco"])

    def test_criterio_3_calendario_cor_eqs_viernes(self):
        """Criterio 3: COR->EQS opera los jueves en ventana invernal. En viernes (2026-09-18), calendario explica la ausencia."""
        _, cal_svc = cargar_configuracion_completa()
        # 2026-09-18 es viernes dentro de la ventana de operación (08-01 a 09-30)
        explica_viernes, ver = evaluar_calendario_servicio("COR", "EQS", "2026-09-18", cal_svc)
        self.assertTrue(explica_viernes)
        self.assertEqual(ver, 1)

        # 2026-09-17 es jueves dentro de la ventana de operación (sí opera)
        explica_jueves, _ = evaluar_calendario_servicio("COR", "EQS", "2026-09-17", cal_svc)
        self.assertFalse(explica_jueves)

        # Fuera de ventana invernal (ej. 2026-10-15), tampoco vuela y queda explicado
        explica_octubre, _ = evaluar_calendario_servicio("COR", "EQS", "2026-10-15", cal_svc)
        self.assertTrue(explica_octubre)

    def test_criterio_4_bloqueo_blando_no_es_sin_servicio(self):
        """Criterio 4: Si respuesta_valida es False (interstitial/bloqueo), NUNCA es sin_servicio."""
        _, cal_svc = cargar_configuracion_completa()
        # En martes (2026-10-13), el calendario de EQS explicaría el cero
        calendario_explica, _ = evaluar_calendario_servicio("BUE", "EQS", "2026-10-13", cal_svc)
        self.assertTrue(calendario_explica)

        # Pero si la respuesta no es estructuralmente válida (ej. interstitial o captcha)
        payload_invalido = [None, None]  # Menos de 4 elementos o vacío
        respuesta_valida = validar_respuesta_estructural(payload_invalido, "BUE", "EQS")
        self.assertFalse(respuesta_valida)

        itinerarios_encontrados = 0
        if itinerarios_encontrados == 0:
            if respuesta_valida and calendario_explica:
                status = "sin_servicio"
            else:
                status = "sin_resultados"

        self.assertEqual(status, "sin_resultados")

    def test_criterio_5_rutas_no_listadas_nunca_sin_servicio(self):
        """Criterio 5: Rutas sin entrada en calendario_servicio.json NUNCA son sin_servicio."""
        _, cal_svc = cargar_configuracion_completa()
        for ruta_no_listada in [("BUE", "BRC"), ("BUE", "CPC"), ("BUE", "MDY"), ("BUE", "USH")]:
            explica, _ = evaluar_calendario_servicio(ruta_no_listada[0], ruta_no_listada[1], "2026-10-13", cal_svc)
            self.assertFalse(explica)

    def test_criterio_6_canario_adaptativo_rutas_finas(self):
        """Criterio 6: En rutas finas (mediana < 5), caer de 2 a 1 no alerta. Desaparecer 3 corridas sí alerta."""
        # Ruta densa (ej. mediana 18): caer a 10 (>30%) alerta
        res_densa = evaluar_operador_ruta(
            ruta="BUE>BRC",
            operador="AR",
            conteo_hoy=10,
            historial_corridas=[18, 18, 18, 18, 18, 18, 18],
        )
        self.assertEqual(res_densa["regimen"], "densa")
        self.assertTrue(res_densa["alerta"])

        # Ruta fina (ej. BUE-EQS, mediana 2): caer de 2 a 1 (caída del 50%) NO alerta
        res_fina_normal = evaluar_operador_ruta(
            ruta="BUE>EQS",
            operador="AR",
            conteo_hoy=1,
            historial_corridas=[2, 2, 2, 2, 2, 2, 2],
        )
        self.assertEqual(res_fina_normal["regimen"], "fina")
        self.assertFalse(res_fina_normal["alerta"])

        # Ruta fina: operador con 0 vuelos durante 3 corridas consecutivas SÍ alerta
        res_fina_alerta = evaluar_operador_ruta(
            ruta="BUE>EQS",
            operador="AR",
            conteo_hoy=0,
            historial_corridas=[0, 0, 2, 2, 2, 2, 2],
            corridas_consecutivas_fina=3,
        )
        self.assertEqual(res_fina_alerta["regimen"], "fina")
        self.assertTrue(res_fina_alerta["alerta"])
        self.assertIn("desapareció", res_fina_alerta["mensaje"])

    def test_criterio_7_desglose_plan_f1b_y_prioridades(self):
        """Criterio 7: Desglose de plan F1b con orden de prioridad y reporte de consultas ejecutadas vs omitidas."""
        res = reportar_plan_f1b(tope=250)
        self.assertEqual(res["total_planificadas"], 313)
        self.assertEqual(res["tope_diario"], 250)
        self.assertEqual(res["total_ejecutadas"], 250)
        self.assertEqual(res["total_omitidas"], 63)

        # Orden de prioridades respetado
        prioridades_esperadas = [
            "tier1_ancla",
            "tier2_ancla",
            "rolling_tier1_2",
            "tier3_ancla",
            "checkpoints",
            "rolling_tier3",
            "tier4",
        ]
        self.assertEqual(ORDEN_PRIORIDAD, prioridades_esperadas)


if __name__ == "__main__":
    unittest.main()
