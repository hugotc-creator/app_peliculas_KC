"""Cliente de la API externa OMDb (https://www.omdbapi.com/). Todo fallo se convierte en OmdbError."""
from __future__ import annotations

import httpx

from app import core
from app.config import Settings

# Mensajes de OMDb -> español. Una tabla en lugar de una cadena de if.
ERRORS = {
    "Movie not found!": "No se encontraron películas.",
    "Too many results.": "Demasiados resultados: escribe un título más específico.",
    "Invalid API key!": "API key de OMDb inválida. Revisa el archivo .env.",
    "No API key provided.": "Falta la API key de OMDb. Configúrala en el archivo .env.",
    "Incorrect IMDb ID.": "Identificador de película incorrecto.",
    "Error getting data.": "OMDb no tiene datos para esa película.",
    "Request limit reached!": "Se alcanzó el límite diario de peticiones a OMDb.",
}

# Errores que son "no hay nada para lo que pides" (404), no fallos del servicio.
LOOKUP_ERRORS = {"Movie not found!", "Too many results.", "Incorrect IMDb ID.", "Error getting data."}


class OmdbError(Exception):
    """OMDb no pudo atender la petición (red, clave, cuota...)."""

    status_code = 502

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class OmdbLookupError(OmdbError):
    """OMDb respondió, pero no tiene lo que se pide."""

    status_code = 404


class OmdbClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None):
        self._settings = settings
        self._http = http or httpx.Client(timeout=settings.omdb_timeout)

    def _get(self, **params) -> dict:
        if not self._settings.omdb_api_key:
            raise OmdbError(ERRORS["No API key provided."], 500)
        query = {"apikey": self._settings.omdb_api_key}
        query.update({key: value for key, value in params.items() if value not in (None, "")})
        try:
            response = self._http.get(self._settings.omdb_base_url, params=query)
        except httpx.HTTPError as exc:
            raise OmdbError("No se pudo conectar con OMDb. Inténtalo de nuevo en unos minutos.") from exc
        # OMDb explica sus errores en el JSON incluso con HTTP 401 (clave inválida, cuota agotada):
        # se lee antes de mirar el código de estado.
        try:
            data = response.json()
        except ValueError as exc:
            if response.status_code >= 400:
                raise OmdbError(f"OMDb respondió con un error HTTP {response.status_code}.") from exc
            raise OmdbError("OMDb devolvió una respuesta que no se pudo leer.") from exc

        if data.get("Response") != "True":
            raw_message = data.get("Error", "")
            message = ERRORS.get(raw_message, raw_message or "Error desconocido de OMDb.")
            if raw_message in LOOKUP_ERRORS:
                raise OmdbLookupError(message)
            raise OmdbError(message)
        return data

    def search(self, title: str, year: str = "", page=1) -> dict:
        page = core.normalize_page(page)
        data = self._get(s=title.strip(), y=(year or "").strip(), page=page, type="movie")
        total = int(data.get("totalResults", 0))
        return {
            "items": [core.summary_from_omdb(m) for m in data["Search"]],
            "total": total,
            "pages": core.pages_for(total),
            "page": page,
        }

    def detail(self, imdb_id: str) -> dict:
        """Respuesta completa de OMDb, que es lo que se guarda en la base."""
        return self._get(i=imdb_id.strip(), plot="full")
