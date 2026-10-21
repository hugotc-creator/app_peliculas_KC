"""Configuración leída de variables de entorno o del archivo .env."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    omdb_api_key: str = ""
    omdb_base_url: str = "https://www.omdbapi.com/"
    omdb_timeout: float = 10.0
    database_url: str = "sqlite:///./peliculas.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
