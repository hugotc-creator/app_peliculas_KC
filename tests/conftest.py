"""Fixtures: base SQLite en memoria y cliente OMDb falso, inyectados en la app."""
import os

os.environ["DATABASE_URL"] = "sqlite://"  # antes de importar la app: nada toca peliculas.db
os.environ["OMDB_API_KEY"] = "TEST"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402, F401  (registra las tablas)
from app.database import Base, get_db  # noqa: E402
from app.dependencies import get_omdb  # noqa: E402
from app.main import app  # noqa: E402
from app.services.omdb import OmdbError, OmdbLookupError  # noqa: E402

SEARCH_ITEMS = [
    {"imdbID": "tt1", "Title": "The Matrix", "Year": "1999", "Poster": "N/A"},
    {"imdbID": "tt2", "Title": "The Matrix Reloaded", "Year": "2003", "Poster": "http://x/p.jpg"},
]
DETAILS = {
    "tt1": {"Response": "True", "imdbID": "tt1", "Title": "The Matrix", "Year": "1999", "Poster": "N/A",
            "Plot": "Neo...", "Director": "Wachowski", "Writer": "N/A", "Genre": "Sci-Fi"},
    "tt2": {"Response": "True", "imdbID": "tt2", "Title": "The Matrix Reloaded", "Year": "2003", "Poster": "http://x/p.jpg",
            "Plot": "More Neo", "Director": "Wachowski"},
}


class FakeOmdb:
    """Imita OmdbClient sin red. `down=True` simula que OMDb no responde."""

    def __init__(self):
        self.calls = []
        self.down = False

    def _check(self):
        if self.down:
            raise OmdbError("No se pudo conectar con OMDb. Inténtalo de nuevo en unos minutos.")

    def search(self, title, year="", page=1):
        self.calls.append(("search", title, year, page))
        self._check()
        if title == "nada":
            raise OmdbLookupError("No se encontraron películas.")
        return {"items": [{"id": m["imdbID"], "title": m["Title"], "year": m["Year"], "poster": None} for m in SEARCH_ITEMS],
                "total": 2, "pages": 1, "page": page}

    def detail(self, imdb_id):
        self.calls.append(("detail", imdb_id))
        self._check()
        if imdb_id not in DETAILS:
            raise OmdbLookupError("Identificador de película incorrecto.")
        return DETAILS[imdb_id]


@pytest.fixture
def session_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def fake_omdb():
    return FakeOmdb()


@pytest.fixture
def client(session_factory, fake_omdb):
    def override_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_omdb] = lambda: fake_omdb
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()
