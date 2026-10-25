"""Acceso a datos (parte del Modelo): todas las consultas a SQLite pasan por aquí."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import core
from app.models import Calificacion, Comentario, Pelicula


def _like_pattern(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def movie_summary(pelicula: Pelicula) -> dict:
    """Resumen para las tarjetas; director y nota IMDb salen de la ficha guardada."""
    return {
        "id": pelicula.id, "title": pelicula.titulo, "year": pelicula.anio, "poster": pelicula.poster,
        "director": core.clean(pelicula.omdb.get("Director")), "rating": core.clean(pelicula.omdb.get("imdbRating")),
    }


class MovieRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---------- películas ----------
    def get(self, imdb_id: str) -> Pelicula | None:
        return self.db.get(Pelicula, imdb_id)

    def save_from_omdb(self, raw: dict, created_at: datetime | None = None) -> Pelicula:
        """Guarda la respuesta de OMDb. Si la película ya existe, no se toca."""
        existing = self.get(raw["imdbID"])
        if existing:
            return existing
        s = core.summary_from_omdb(raw)
        pelicula = Pelicula(id=s["id"], titulo=s["title"], anio=s["year"], poster=s["poster"], omdb=raw)
        if created_at:
            pelicula.fecha_alta = created_at
        self.db.add(pelicula)
        self.db.commit()
        return pelicula

    def existing_ids(self, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        return set(self.db.scalars(select(Pelicula.id).where(Pelicula.id.in_(ids))))

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(Pelicula)) or 0

    def list(self, title: str = "", year: str = "", page=1) -> dict:
        """Catálogo filtrado por título y/o año, más reciente primero, en páginas de PAGE_SIZE."""
        query = select(Pelicula)
        if title.strip():
            query = query.where(Pelicula.titulo.ilike(_like_pattern(title.strip()), escape="\\"))
        if year.strip():
            # OMDb guarda "1999" o, en series, "1999–2003": basta con que empiece por el año.
            query = query.where(Pelicula.anio.like(f"{year.strip()}%"))
        total = self.db.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = self.db.scalars(
            query.order_by(Pelicula.fecha_alta.desc(), Pelicula.id).offset(core.page_offset(page)).limit(core.PAGE_SIZE)
        ).all()
        return {
            "items": [movie_summary(p) for p in rows],
            "total": total,
            "pages": core.pages_for(total),
            "page": core.normalize_page(page),
        }

    # ---------- comentarios y calificaciones ----------
    def add_comment(self, pelicula: Pelicula, persona: str, texto: str, fecha: datetime | None = None) -> Comentario:
        comentario = Comentario(pelicula=pelicula, persona=persona, comentario=texto)
        if fecha:
            comentario.fecha = fecha
        self.db.add(comentario)
        self.db.commit()
        return comentario

    def add_rating(self, pelicula: Pelicula, puntos: int, fecha: datetime | None = None) -> Calificacion:
        calificacion = Calificacion(pelicula=pelicula, puntos=puntos)
        if fecha:
            calificacion.fecha = fecha
        self.db.add(calificacion)
        self.db.commit()
        return calificacion

    def summary(self, pelicula: Pelicula) -> dict:
        """Promedio, número de votos, estrellas y comentarios (más recientes primero)."""
        self.db.refresh(pelicula)
        puntos = [c.puntos for c in pelicula.calificaciones]
        avg = core.average(puntos)
        return {"average": avg, "count": len(puntos), "stars": core.star_kinds(avg), "comments": pelicula.comentarios}
