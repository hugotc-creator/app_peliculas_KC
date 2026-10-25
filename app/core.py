"""Funciones puras: sin base de datos, sin red, sin HTTP. Todo lo fácil de probar vive aquí."""
from __future__ import annotations

import html
import math

PAGE_SIZE = 10  # OMDb devuelve 10 resultados por página; el catálogo usa el mismo tamaño
MAX_RATING = 5
NOT_AVAILABLE = "N/A"
COMMENT_LIMITS = {"author": 40, "text": 500}
IMPORT_PAGE_OPTIONS = (1, 3, 5, 10)  # cada página: 1 búsqueda + hasta 10 detalles en OMDb

# Campos del detalle: añadir uno es añadir una fila, no código.
DETAIL_FIELDS = [
    ("Año", "Year"), ("Clasificación", "Rated"), ("Estreno", "Released"),
    ("Duración", "Runtime"), ("Género", "Genre"), ("Director", "Director"),
    ("Guion", "Writer"), ("Reparto", "Actors"), ("Idioma", "Language"),
    ("País", "Country"), ("Premios", "Awards"), ("Nota IMDb", "imdbRating"),
    ("Votos IMDb", "imdbVotes"), ("Metascore", "Metascore"), ("Taquilla", "BoxOffice"),
]

# Fracción de relleno de una estrella -> tipo de estrella.
_STAR_KIND = {0.0: "empty", 0.5: "half", 1.0: "full"}


# ---------- utilidades ----------
def clean(value):
    """OMDb usa 'N/A' para lo que no tiene: se convierte en None.

    Algunos textos llegan con entidades HTML (&quot;Batman&quot;): se decodifican aquí,
    y la vista los escapa de nuevo al mostrarlos.
    """
    if value in (None, "", NOT_AVAILABLE):
        return None
    return html.unescape(value) if isinstance(value, str) else value


def normalize_page(page) -> int:
    try:
        return max(1, int(page))
    except (TypeError, ValueError):
        return 1


def pages_for(total: int) -> int:
    return math.ceil(total / PAGE_SIZE)


def page_offset(page) -> int:
    return (normalize_page(page) - 1) * PAGE_SIZE


# ---------- OMDb -> datos de la app ----------
def summary_from_omdb(m: dict) -> dict:
    return {"id": m["imdbID"], "title": clean(m["Title"]) or "", "year": clean(m.get("Year")), "poster": clean(m.get("Poster"))}


def detail_from_omdb(m: dict) -> dict:
    fields = [{"label": label, "value": clean(m.get(key))} for label, key in DETAIL_FIELDS]
    return {
        **summary_from_omdb(m),
        "plot": clean(m.get("Plot")),
        "fields": [field for field in fields if field["value"] is not None],
    }


# ---------- calificaciones ----------
def average(values) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def is_valid_rating(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= MAX_RATING


def star_kinds(value: float) -> list[str]:
    """Promedio -> ['full', 'half', 'empty', ...] redondeado a medias estrellas."""
    kinds = []
    for i in range(MAX_RATING):
        fill = min(1.0, max(0.0, value - i))
        kinds.append(_STAR_KIND[round(fill * 2) / 2])
    return kinds


# ---------- comentarios ----------
def make_comment(author, text) -> dict:
    return {"author": str(author or "").strip() or "Anónimo", "text": str(text or "").strip()}


def validate_comment(comment: dict) -> list[str]:
    """Reglas como datos: (¿falla?, mensaje)."""
    rules = [
        (len(comment["text"]) == 0, "El comentario no puede estar vacío."),
        (len(comment["text"]) > COMMENT_LIMITS["text"], f"El comentario admite máximo {COMMENT_LIMITS['text']} caracteres."),
        (len(comment["author"]) > COMMENT_LIMITS["author"], f"El nombre admite máximo {COMMENT_LIMITS['author']} caracteres."),
    ]
    return [message for failed, message in rules if failed]


# ---------- importación en lote ----------
def import_pages(value) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return IMPORT_PAGE_OPTIONS[0]
    return n if n in IMPORT_PAGE_OPTIONS else IMPORT_PAGE_OPTIONS[0]


def tally_import(log: list[dict]) -> dict:
    counts = {"saved": 0, "existing": 0, "failed": 0}
    for entry in log:
        counts[entry["status"]] += 1
    return counts
