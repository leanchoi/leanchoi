"""Configuracion central leida de variables de entorno / .env."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


# Pool de user-agents realistas (Chrome estable en distintos SO). Se rotan
# por peticion para no presentar siempre la misma huella.
DEFAULT_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Base de datos
    database_url: str = "sqlite:///data/prices.db"

    # Navegador
    playwright_executable_path: str | None = None
    headless: bool = True

    # Anti-bloqueo
    proxy_url: str | None = None
    min_delay: float = 1.5
    max_delay: float = 4.0
    max_retries: int = 3
    block_resources: bool = True
    locale: str = "es-ES"
    timezone: str = "Europe/Madrid"

    # Parametros de busqueda por defecto
    default_currency: str = "EUR"
    default_adults: int = 2
    default_nights: int = 2
    default_checkin_offset_days: int = 30
    max_pages: int = 2

    # Servidor
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def user_agents(self) -> list[str]:
        return DEFAULT_USER_AGENTS


@lru_cache
def get_settings() -> Settings:
    return Settings()
