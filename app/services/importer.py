"""Importación en lote: guarda en la base todos los resultados de una búsqueda de OMDb."""
from __future__ import annotations

from app.repositories import MovieRepository
from app.services.omdb import OmdbClient, OmdbError, OmdbLookupError


def import_movies(repo: MovieRepository, omdb: OmdbClient, title: str, year: str, pages: int) -> dict:
    """Recorre las páginas en serie. Las películas ya guardadas no gastan peticiones.

    Devuelve {"log": [{id, title, year, status: saved|existing|failed, error?}], "error": str | None}.
    """
    log: list[dict] = []
    error = None

    for page in range(1, pages + 1):
        try:
            found = omdb.search(title, year, page)
        except OmdbLookupError as exc:
            if page == 1:
                error = exc.message
            break  # sin (más) resultados
        except OmdbError as exc:
            error = exc.message
            break

        known = repo.existing_ids([movie["id"] for movie in found["items"]])
        for movie in found["items"]:
            if movie["id"] in known:
                log.append({**movie, "status": "existing"})
                continue
            try:
                repo.save_from_omdb(omdb.detail(movie["id"]))
                log.append({**movie, "status": "saved"})
            except OmdbLookupError as exc:
                log.append({**movie, "status": "failed", "error": exc.message})
            except OmdbError as exc:  # red, cuota agotada...: no tiene sentido seguir
                log.append({**movie, "status": "failed", "error": exc.message})
                return {"log": log, "error": exc.message}

        if page >= found["pages"]:
            break

    return {"log": log, "error": error}
