from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app import core
from app.dependencies import get_db, get_omdb
from app.repositories import MovieRepository
from app.services.importer import import_movies
from app.services.omdb import OmdbClient
from app.views import render

router = APIRouter(prefix="/import")


def render_import(request, *, status_code=200, title="", year="", pages=1, result=None, form_error=None):
    return render(
        request, "import.html", status_code=status_code, active="import",
        title=title, year=year, pages=pages, result=result, form_error=form_error,
        tally=core.tally_import(result["log"]) if result else None,
    )


@router.get("", response_class=HTMLResponse)
def import_form(request: Request, title: str = "", year: str = ""):
    return render_import(request, title=title, year=year)


@router.post("", response_class=HTMLResponse)
def run_import(
    request: Request, title: str = Form(""), year: str = Form(""), pages: str = Form("1"),
    db: Session = Depends(get_db), omdb: OmdbClient = Depends(get_omdb),
):
    pages_n = core.import_pages(pages)
    if not title.strip():
        return render_import(request, status_code=422, year=year, pages=pages_n, form_error="Escribe un título para buscar.")
    result = import_movies(MovieRepository(db), omdb, title, year, pages_n)
    return render_import(request, title=title, year=year, pages=pages_n, result=result)
