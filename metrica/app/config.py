"""Configuracion central de METRICA (variables de entorno / .env)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # --- Identidad ---
    app_name: str = "METRICA"

    # --- Base de datos ---
    # Dev por defecto SQLite; en produccion se apunta a Postgres via .env.
    database_url: str = "sqlite:///data/metrica.db"

    # --- Seguridad / auth ---
    secret_key: str = "CAMBIAR-esta-clave-en-produccion-por-una-larga-y-aleatoria"
    access_token_expire_minutes: int = 60 * 24  # 24h
    # Admin inicial (se crea al arrancar si no existe ningun usuario)
    admin_username: str = "admin"
    admin_password: str = "metrica-admin"
    admin_email: str = "admin@metrica.local"

    # --- Navegador (Playwright) ---
    playwright_executable_path: str | None = None
    headless: bool = True

    # --- Anti-bloqueo ---
    proxy_url: str | None = None
    min_delay: float = 2.0
    max_delay: float = 6.0
    max_retries: int = 3
    block_resources: bool = True
    locale: str = "es-AR"
    timezone: str = "America/Argentina/Buenos_Aires"

    # --- Scraping / defaults ---
    default_adults: int = 1
    default_nights: int = 1
    max_pages: int = 5  # paginar mas para acercarse al inventario completo

    # --- Servidor ---
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def user_agents(self) -> list[str]:
        return DEFAULT_USER_AGENTS


@lru_cache
def get_settings() -> Settings:
    return Settings()
