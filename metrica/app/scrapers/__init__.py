"""Motor de scraping de METRICA (stealth + resiliencia)."""

from .airbnb import AirbnbScraper
from .base import BaseScraper, Listing
from .booking import BookingScraper

__all__ = ["BaseScraper", "Listing", "BookingScraper", "AirbnbScraper"]

SCRAPERS = {"booking": BookingScraper, "airbnb": AirbnbScraper}
