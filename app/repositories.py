"""Acceso a datos (parte del Modelo): todas las consultas a SQLite pasan por aquí."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import core
from app.models import Comment, Movie, Rating


def _like_pattern(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def movie_summary(movie: Movie) -> dict:
    """Resumen para las tarjetas; director y nota IMDb salen de la ficha guardada."""
    return {
        "id": movie.imdb_id, "title": movie.title, "year": movie.year, "poster": movie.poster,
        "director": core.clean(movie.omdb.get("Director")), "rating": core.clean(movie.omdb.get("imdbRating")),
    }


class MovieRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---------- películas ----------
    def get(self, imdb_id: str) -> Movie | None:
        return self.db.get(Movie, imdb_id)

    def save_from_omdb(self, raw: dict, created_at: datetime | None = None) -> Movie:
        """Guarda la respuesta de OMDb. Si la película ya existe, no se toca."""
        existing = self.get(raw["imdbID"])
        if existing:
            return existing
        summary = core.summary_from_omdb(raw)
        movie = Movie(imdb_id=summary["id"], title=summary["title"], year=summary["year"], poster=summary["poster"], omdb=raw)
        if created_at:
            movie.created_at = created_at
        self.db.add(movie)
        self.db.commit()
        return movie

    def existing_ids(self, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        return set(self.db.scalars(select(Movie.imdb_id).where(Movie.imdb_id.in_(ids))))

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(Movie)) or 0

    def list(self, title: str = "", year: str = "", page=1) -> dict:
        """Catálogo filtrado por título y/o año, más reciente primero, en páginas de PAGE_SIZE."""
        query = select(Movie)
        if title.strip():
            query = query.where(Movie.title.ilike(_like_pattern(title.strip()), escape="\\"))
        if year.strip():
            # OMDb guarda "1999" o, en series, "1999–2003": basta con que empiece por el año.
            query = query.where(Movie.year.like(f"{year.strip()}%"))
        total = self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = self.db.scalars(
            query.order_by(Movie.created_at.desc(), Movie.imdb_id).offset(core.page_offset(page)).limit(core.PAGE_SIZE)
        ).all()
        return {
            "items": [movie_summary(m) for m in rows],
            "total": total,
            "pages": core.pages_for(total),
            "page": core.normalize_page(page),
        }

    # ---------- comentarios y calificaciones ----------
    def add_comment(self, movie: Movie, author: str, body: str, created_at: datetime | None = None) -> Comment:
        comment = Comment(movie=movie, author=author, body=body)
        if created_at:
            comment.created_at = created_at
        self.db.add(comment)
        self.db.commit()
        return comment

    def add_rating(self, movie: Movie, value: int, created_at: datetime | None = None) -> Rating:
        rating = Rating(movie=movie, value=value)
        if created_at:
            rating.created_at = created_at
        self.db.add(rating)
        self.db.commit()
        return rating

    def summary(self, movie: Movie) -> dict:
        """Promedio, número de votos, estrellas y comentarios (más recientes primero)."""
        self.db.refresh(movie)
        values = [r.value for r in movie.ratings]
        avg = core.average(values)
        return {"average": avg, "count": len(values), "stars": core.star_kinds(avg), "comments": movie.comments}
