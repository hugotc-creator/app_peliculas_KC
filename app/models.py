"""Modelo (M de MVC): tablas de SQLite."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Movie(Base):
    """Una película: columnas para listar y filtrar + la respuesta completa de OMDb en `omdb`."""

    __tablename__ = "movies"

    imdb_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    year: Mapped[str | None] = mapped_column(String(20))
    poster: Mapped[str | None] = mapped_column(Text)
    omdb: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False, index=True)

    comments: Mapped[list[Comment]] = relationship(
        back_populates="movie", cascade="all, delete-orphan", order_by="desc(Comment.created_at)",
    )
    ratings: Mapped[list[Rating]] = relationship(back_populates="movie", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        CheckConstraint("length(author) BETWEEN 1 AND 40", name="comments_author_check"),
        CheckConstraint("length(body) BETWEEN 1 AND 500", name="comments_body_check"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    imdb_id: Mapped[str] = mapped_column(ForeignKey("movies.imdb_id", ondelete="CASCADE"), nullable=False, index=True)
    author: Mapped[str] = mapped_column(String(40), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    movie: Mapped[Movie] = relationship(back_populates="comments")


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (CheckConstraint("value BETWEEN 1 AND 5", name="ratings_value_check"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    imdb_id: Mapped[str] = mapped_column(ForeignKey("movies.imdb_id", ondelete="CASCADE"), nullable=False, index=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    movie: Mapped[Movie] = relationship(back_populates="ratings")
