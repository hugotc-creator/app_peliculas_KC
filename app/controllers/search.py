from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse

from app.dependencies import get_omdb
from app.services.omdb import OmdbClient, OmdbLookupError
from app.views import render

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def search(
    request: Request,
    title: str = "",
    year: str = "",
    page: int = Query(1, ge=1),
    omdb: OmdbClient = Depends(get_omdb),
):
    result = error = None
    if title.strip():
        try:
            result = omdb.search(title, year, page)
        except OmdbLookupError as exc:  # "no encontrada" o "demasiados resultados" se muestran en la página
            error = exc.message
    return render(request, "search.html", active="search", title=title, year=year, result=result, error=error)
