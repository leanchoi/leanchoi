import json
import os
import unittest
from aereos.server import (
    get_summary_status,
    get_routes_summary,
    get_canary_data,
    get_calendar_config,
    get_disk_usage,
    load_itineraries,
    get_bitacora_entries,
)


class TestMetricaAereosServer(unittest.TestCase):
    def test_summary_status_structure(self):
        status = get_summary_status()
        self.assertIsInstance(status, dict)
        self.assertIn("fecha_observacion", status)
        self.assertIn("total_consultas", status)
        self.assertIn("cobertura_valida_pct", status)
        self.assertIn("total_itinerarios", status)
        self.assertIn("itinerarios_por_aerolinea", status)
        self.assertIn("disco", status)
        self.assertIn("estado_sistema", status)

    def test_disk_usage_structure(self):
        disk = get_disk_usage()
        self.assertIsInstance(disk, dict)
        self.assertEqual(disk["presupuesto_mb"], 8192.0)
        self.assertIn("total_usado_mb", disk)
        self.assertIn("porcentaje_usado", disk)
        self.assertIn("alerta_activa", disk)

    def test_canary_data_structure(self):
        canary = get_canary_data()
        self.assertIsInstance(canary, dict)
        self.assertIn("estado_general", canary)
        self.assertIn("operadores", canary)
        self.assertIsInstance(canary["operadores"], list)

    def test_calendar_config_structure(self):
        cal = get_calendar_config()
        self.assertIsInstance(cal, dict)
        if "rutas" in cal:
            self.assertIn("BUE>EQS", cal["rutas"])

    def test_routes_summary_structure(self):
        routes = get_routes_summary()
        self.assertIsInstance(routes, list)
        for r in routes:
            self.assertIn("ruta", r)
            self.assertIn("vuelos_totales", r)
            self.assertIn("precio_minimo", r)
            self.assertIn("precio_promedio", r)
            self.assertIn("aerolineas", r)

    def test_itineraries_filtering_empty_or_valid(self):
        # Filtrar con origen inexistente debe devolver lista vacía sin crashear
        items = load_itineraries(origen="NONEXISTENT")
        self.assertEqual(items, [])

    def test_bitacora_entries_empty_or_valid(self):
        entries = get_bitacora_entries(limit=10)
        self.assertIsInstance(entries, list)


if __name__ == "__main__":
    unittest.main()
