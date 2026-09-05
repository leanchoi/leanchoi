"""Test de contrato del parser de Métrica Aéreos.

Verifica que el parser extraiga correctamente itinerarios con precios válidos
para Aerolíneas Argentinas, Flybondi y JetSMART a partir de la fixture real.
"""
from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, "/opt/metrica-aereos")

from aereos.parse import parse_payload_json


class TestParseGoogleFlights(unittest.TestCase):
    def setUp(self):
        fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "bue_brc_roundtrip_payload.json")
        with open(fixture_path, "r", encoding="utf-8") as fh:
            self.payload = json.load(fh)

    def test_extracts_all_three_operators(self):
        obs, counts, err = parse_payload_json(
            self.payload,
            origin="BUE",
            dest="BRC",
            flight_date="2026-10-05",
            return_date="2026-10-08",
            observed_date="2026-09-05",
            trip_type="round_trip",
            currency="ARS",
        )
        self.assertIsNone(err)
        self.assertGreaterEqual(len(obs), 15)

        # Criterio clave: deben estar presentes los tres operadores
        self.assertIn("AR", counts, "Aerolíneas Argentinas debe estar presente")
        self.assertIn("FO", counts, "Flybondi debe estar presente (prueba anti-regresión del spike)")
        self.assertIn("WJ", counts, "JetSMART debe estar presente")

        self.assertGreater(counts["AR"], 0)
        self.assertGreater(counts["FO"], 0)
        self.assertGreater(counts["WJ"], 0)

        # Verificar que las tarifas de cada aerolínea sean números reales > 0
        operators_with_valid_price = set()
        for o in obs:
            self.assertEqual(len(o["itinerary_hash"]), 32)
            self.assertIn(o["trip_type"], ("one_way", "round_trip"))
            if o["price_amount"] and o["price_amount"] > 0:
                operators_with_valid_price.add(o["airline_code"])

        self.assertIn("AR", operators_with_valid_price)
        self.assertIn("FO", operators_with_valid_price)
        self.assertIn("WJ", operators_with_valid_price)

        # Al menos un itinerario debe estar marcado como el más barato
        cheapest = [o for o in obs if o["is_cheapest_of_query"]]
        self.assertGreaterEqual(len(cheapest), 1)


if __name__ == "__main__":
    unittest.main()
