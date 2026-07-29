"""Registro oficial de alojamientos (sitios de turismo de cada destino)."""
from .crawler import adoption_index, crawl_source, match_destination
from .extract import extract
from .match import norm_name, score

__all__ = ["crawl_source", "match_destination", "adoption_index", "extract",
           "norm_name", "score"]
