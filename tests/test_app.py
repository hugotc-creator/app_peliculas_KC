"""Tests de extremo a extremo: HTTP -> controlador -> modelo (SQLite en memoria) -> vista."""
from app.repositories import MovieRepository


# ---------- búsqueda ----------
def test_search_page_shows_form(client):
    response = client.get("/")
    assert response.status_code == 200
    assert 'name="title"' in response.text


def test_search_results_link_to_detail_and_import(client, fake_omdb):
    response = client.get("/", params={"title": "matrix", "year": "1999"})
    assert response.status_code == 200
    assert "The Matrix Reloaded" in response.text
    assert 'href="/movies/tt1"' in response.text
    assert "/import?title=matrix&year=1999" in response.text
    assert fake_omdb.calls == [("search", "matrix", "1999", 1)]


def test_search_without_results_shows_message_not_error_page(client):
    response = client.get("/", params={"title": "nada"})
    assert response.status_code == 200
    assert "No se encontraron películas." in response.text


def test_search_invalid_page_is_a_422_error_page(client):
    response = client.get("/", params={"title": "x", "page": "abc"})
    assert response.status_code == 422
    assert "no son válidos" in response.text


# ---------- detalle ----------
def test_detail_fetches_from_omdb_then_reads_from_db(client, fake_omdb):
    first = client.get("/movies/tt1")
    assert first.status_code == 200
    assert "Traída de OMDb y guardada en el catálogo" in first.text
    assert "<h1>The Matrix" in first.text
    assert "Wachowski" in first.text and "Writer" not in first.text

    second = client.get("/movies/tt1")
    assert "Leída de nuestra base de datos" in second.text
    assert fake_omdb.calls.count(("detail", "tt1")) == 1


def test_detail_unknown_id_is_404(client):
    response = client.get("/movies/ttXXX")
    assert response.status_code == 404
    assert "Identificador de película incorrecto." in response.text


def test_detail_when_omdb_is_down_is_502(client, fake_omdb):
    fake_omdb.down = True
    response = client.get("/movies/tt1")
    assert response.status_code == 502
    assert "No se pudo conectar con OMDb" in response.text


def test_search_when_omdb_is_down_is_502(client, fake_omdb):
    fake_omdb.down = True
    assert client.get("/", params={"title": "x"}).status_code == 502


# ---------- comentarios ----------
def test_comment_is_saved_escaped_and_listed(client):
    client.get("/movies/tt1")
    response = client.post("/movies/tt1/comments", data={"author": "<b>Ana</b>", "text": "<i>hola</i>"}, follow_redirects=False)
    assert response.status_code == 303
    page = client.get(response.headers["location"])
    assert "Comentario publicado." in page.text
    assert "&lt;i&gt;hola&lt;/i&gt;" in page.text and "<i>hola</i>" not in page.text


def test_empty_comment_is_rejected_with_message(client):
    client.get("/movies/tt1")
    response = client.post("/movies/tt1/comments", data={"author": "Ana", "text": "   "})
    assert response.status_code == 422
    assert "El comentario no puede estar vacío." in response.text


def test_comment_on_unsaved_movie_is_404(client):
    assert client.post("/movies/tt1/comments", data={"text": "x"}).status_code == 404


# ---------- calificaciones ----------
def test_ratings_average_and_stars(client):
    client.get("/movies/tt1")
    for value in (4, 2):
        assert client.post("/movies/tt1/ratings", data={"value": value}, follow_redirects=False).status_code == 303
    page = client.get("/movies/tt1")
    assert "3.0 / 5" in page.text and "(2 voto(s))" in page.text
    assert page.text.count("star--full") == 3 and page.text.count("star--empty") == 2


def test_rating_out_of_range_is_422(client):
    client.get("/movies/tt1")
    assert client.post("/movies/tt1/ratings", data={"value": 9}).status_code == 422
    assert client.post("/movies/tt1/ratings", data={"value": "x"}).status_code == 422


# ---------- catálogo ----------
def test_catalog_lists_filters_and_paginates(client, session_factory):
    repo = MovieRepository(session_factory())
    for i in range(12):
        repo.save_from_omdb({"imdbID": f"tt{i}", "Title": f"Star {i}" if i % 2 else f"Otra {i}", "Year": "2000", "Poster": "N/A"})

    page1 = client.get("/catalog")
    assert "12 película(s)" in page1.text and "Página 1 de 2" in page1.text
    assert page1.text.count("movie-card") == 10

    filtered = client.get("/catalog", params={"title": "STAR"})
    assert "6 película(s)" in filtered.text

    assert "Ninguna película del catálogo" in client.get("/catalog", params={"title": "zzz"}).text


def test_catalog_filters_by_year_alone_or_combined(client, session_factory):
    repo = MovieRepository(session_factory())
    repo.save_from_omdb({"imdbID": "tt1", "Title": "Batman", "Year": "1989", "Poster": "N/A"})
    repo.save_from_omdb({"imdbID": "tt2", "Title": "Batman Returns", "Year": "1992", "Poster": "N/A"})
    repo.save_from_omdb({"imdbID": "tt3", "Title": "Alien", "Year": "1992", "Poster": "N/A"})

    by_year = client.get("/catalog", params={"year": "1992"})
    assert "2 película(s)" in by_year.text and "Batman Returns" in by_year.text and "Alien" in by_year.text

    combined = client.get("/catalog", params={"title": "batman", "year": "1992"})
    assert "1 película(s)" in combined.text and "Batman Returns" in combined.text

    assert "Ninguna película del catálogo" in client.get("/catalog", params={"year": "1900"}).text


def test_empty_catalog_message(client):
    assert "El catálogo está vacío" in client.get("/catalog").text


# ---------- importación ----------
def test_import_saves_then_skips_existing(client, fake_omdb):
    first = client.post("/import", data={"title": "matrix", "pages": "1"})
    assert first.status_code == 200
    assert "2 nueva(s) · 0 ya estaban · 0 con error" in first.text

    second = client.post("/import", data={"title": "matrix", "pages": "1"})
    assert "0 nueva(s) · 2 ya estaban · 0 con error" in second.text
    assert fake_omdb.calls.count(("detail", "tt1")) == 1  # las existentes no gastan peticiones


def test_import_requires_title(client):
    response = client.post("/import", data={"title": " "})
    assert response.status_code == 422
    assert "Escribe un título" in response.text


# ---------- errores generales ----------
def test_unknown_route_is_404_page(client):
    response = client.get("/no-existe")
    assert response.status_code == 404
    assert "Página no encontrada." in response.text
