"""Dependencias inyectables de FastAPI (los tests las sustituyen)."""
from functools import lru_cache

from app.config import get_settings
from app.database import get_db  # noqa: F401  (reexportada para los controladores)
from app.services.omdb import OmdbClient


@lru_cache
def get_omdb() -> OmdbClient:
    return OmdbClient(get_settings())
