from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.repositories import MovieRepository
from app.views import render

router = APIRouter()


@router.get("/catalog", response_class=HTMLResponse)
def catalog(request: Request, title: str = "", page: int = Query(1, ge=1), db: Session = Depends(get_db)):
    result = MovieRepository(db).list(title, page)
    return render(request, "catalog.html", active="catalog", title=title, result=result)
