"""Modelo (M de MVC): tablas de SQLite.

Nombres según el enunciado del proyecto: tabla `comentario` con `id`, `id_pelicula`, `persona`,
`comentario` y `fecha`. `id_pelicula` guarda el identificador que devuelve la API de OMDb (imdbID,
p. ej. "tt0133093"), que es el nexo entre nuestros datos y los del API. Es texto porque así lo entrega OMDb.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def ahora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Pelicula(Base):
    """Una película: columnas para listar y filtrar + la respuesta completa de OMDb en `omdb`."""

    __tablename__ = "pelicula"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # imdbID de OMDb
    titulo: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    anio: Mapped[str | None] = mapped_column(String(20))
    poster: Mapped[str | None] = mapped_column(Text)
    omdb: Mapped[dict] = mapped_column(JSON, nullable=False)
    fecha_alta: Mapped[datetime] = mapped_column(DateTime, default=ahora, nullable=False, index=True)

    comentarios: Mapped[list[Comentario]] = relationship(
        back_populates="pelicula", cascade="all, delete-orphan", order_by="desc(Comentario.fecha)",
    )
    calificaciones: Mapped[list[Calificacion]] = relationship(back_populates="pelicula", cascade="all, delete-orphan")


class Comentario(Base):
    __tablename__ = "comentario"
    __table_args__ = (
        CheckConstraint("length(persona) BETWEEN 1 AND 40", name="comentario_persona_check"),
        CheckConstraint("length(comentario) BETWEEN 1 AND 500", name="comentario_texto_check"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pelicula: Mapped[str] = mapped_column(ForeignKey("pelicula.id", ondelete="CASCADE"), nullable=False, index=True)
    persona: Mapped[str] = mapped_column(String(40), nullable=False)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime, default=ahora, nullable=False)  # fecha actual al publicar

    pelicula: Mapped[Pelicula] = relationship(back_populates="comentarios")


class Calificacion(Base):
    __tablename__ = "calificacion"
    __table_args__ = (CheckConstraint("puntos BETWEEN 1 AND 5", name="calificacion_puntos_check"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id_pelicula: Mapped[str] = mapped_column(ForeignKey("pelicula.id", ondelete="CASCADE"), nullable=False, index=True)
    puntos: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime, default=ahora, nullable=False)

    pelicula: Mapped[Pelicula] = relationship(back_populates="calificaciones")
