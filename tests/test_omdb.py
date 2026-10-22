"""Cliente OMDb contra respuestas HTTP simuladas (sin red)."""
import httpx
import pytest

from app.config import Settings
from app.services.omdb import OmdbClient, OmdbError, OmdbLookupError


def make_client(handler, api_key="KEY"):
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return OmdbClient(Settings(omdb_api_key=api_key, _env_file=None), http)


def json_response(status, body):
    return lambda request: httpx.Response(status, json=body)


def test_search_sends_key_title_year_page_and_parses():
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        return httpx.Response(200, json={"Response": "True", "totalResults": "23",
                                         "Search": [{"imdbID": "tt1", "Title": "Matrix", "Year": "1999", "Poster": "N/A"}]})

    result = make_client(handler).search("Matrix", "1999", "2")
    assert seen == {"apikey": "KEY", "s": "Matrix", "y": "1999", "page": "2", "type": "movie"}
    assert result == {"items": [{"id": "tt1", "title": "Matrix", "year": "1999", "poster": None}], "total": 23, "pages": 3, "page": 2}


def test_detail_asks_full_plot_and_returns_raw_json():
    raw = {"Response": "True", "imdbID": "tt1", "Title": "Matrix"}
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        return httpx.Response(200, json=raw)

    assert make_client(handler).detail("tt1") == raw
    assert seen == {"apikey": "KEY", "i": "tt1", "plot": "full"}


def test_not_found_is_lookup_error_404():
    with pytest.raises(OmdbLookupError) as exc:
        make_client(json_response(200, {"Response": "False", "Error": "Movie not found!"})).search("x")
    assert exc.value.status_code == 404 and exc.value.message == "No se encontraron películas."


def test_request_limit_with_http_401_reports_quota_not_network():
    with pytest.raises(OmdbError) as exc:
        make_client(json_response(401, {"Response": "False", "Error": "Request limit reached!"})).detail("tt1")
    assert "límite diario" in exc.value.message
    assert exc.value.status_code == 502


def test_invalid_key_with_http_401():
    with pytest.raises(OmdbError) as exc:
        make_client(json_response(401, {"Response": "False", "Error": "Invalid API key!"})).search("x")
    assert "API key de OMDb inválida" in exc.value.message


def test_network_failure():
    def handler(request):
        raise httpx.ConnectError("offline")

    with pytest.raises(OmdbError) as exc:
        make_client(handler).search("x")
    assert "No se pudo conectar" in exc.value.message


def test_non_json_error_page():
    with pytest.raises(OmdbError) as exc:
        make_client(lambda request: httpx.Response(503, text="<html>down</html>")).search("x")
    assert "HTTP 503" in exc.value.message


def test_missing_api_key_is_500_without_calling_omdb():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={})

    with pytest.raises(OmdbError) as exc:
        make_client(handler, api_key="").search("x")
    assert exc.value.status_code == 500 and "Falta la API key" in exc.value.message
    assert calls == []
