from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app import core
from app.dependencies import get_db, get_omdb
from app.models import Movie
from app.repositories import MovieRepository
from app.services.omdb import OmdbClient
from app.views import render

router = APIRouter(prefix="/movies")


def load_movie(repo: MovieRepository, omdb: OmdbClient, imdb_id: str) -> tuple[Movie, str]:
    """Primero nuestra base; si no está, se trae de OMDb y se guarda (el catálogo se llena solo)."""
    movie = repo.get(imdb_id)
    if movie:
        return movie, "db"
    return repo.save_from_omdb(omdb.detail(imdb_id)), "omdb"  # OmdbError -> página de error


def back_url(request: Request) -> str:
    """Vuelve a la página anterior si es de esta app; si no, a la búsqueda."""
    referer = request.headers.get("referer", "")
    if referer.startswith(str(request.base_url)) and not referer.startswith(str(request.url).split("?")[0]):
        return referer
    return "/"


def render_detail(request, repo, movie, source, *, status_code=200, **extra):
    return render(
        request, "detail.html", status_code=status_code,
        movie=core.detail_from_omdb(movie.omdb), summary=repo.summary(movie), source=source, back=back_url(request),
        ok=extra.get("ok"), form=extra.get("form"),
        comment_errors=extra.get("comment_errors", []), rating_error=extra.get("rating_error"),
    )


def saved_movie_or_404(repo: MovieRepository, imdb_id: str) -> Movie:
    movie = repo.get(imdb_id)
    if not movie:
        raise HTTPException(404, "Esa película no está en el catálogo.")
    return movie


@router.get("/{imdb_id}", response_class=HTMLResponse)
def movie_detail(
    request: Request, imdb_id: str, ok: str | None = None,
    db: Session = Depends(get_db), omdb: OmdbClient = Depends(get_omdb),
):
    repo = MovieRepository(db)
    movie, source = load_movie(repo, omdb, imdb_id)
    return render_detail(request, repo, movie, source, ok=ok)


@router.post("/{imdb_id}/comments", response_class=HTMLResponse)
def add_comment(request: Request, imdb_id: str, author: str = Form(""), text: str = Form(""), db: Session = Depends(get_db)):
    repo = MovieRepository(db)
    movie = saved_movie_or_404(repo, imdb_id)
    comment = core.make_comment(author, text)
    errors = core.validate_comment(comment)
    if errors:
        return render_detail(request, repo, movie, "db", status_code=422, comment_errors=errors, form=comment)
    repo.add_comment(movie, comment["author"], comment["text"])
    return RedirectResponse(f"/movies/{imdb_id}?ok=comment#comments", status_code=303)


@router.post("/{imdb_id}/ratings", response_class=HTMLResponse)
def add_rating(request: Request, imdb_id: str, value: int = Form(...), db: Session = Depends(get_db)):
    repo = MovieRepository(db)
    movie = saved_movie_or_404(repo, imdb_id)
    if not core.is_valid_rating(value):
        return render_detail(request, repo, movie, "db", status_code=422, rating_error="La calificación debe ser un número entero de 1 a 5.")
    repo.add_rating(movie, value)
    return RedirectResponse(f"/movies/{imdb_id}?ok=rating#rating", status_code=303)
