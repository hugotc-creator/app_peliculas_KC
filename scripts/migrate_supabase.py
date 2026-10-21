"""Copia películas, comentarios y calificaciones de Supabase a la base SQLite de la app.

Uso (desde la carpeta del proyecto, con el entorno activado):
    python scripts/migrate_supabase.py https://xxxx.supabase.co <anon_key>

Se puede repetir: lo que ya existe en SQLite se salta.
"""
import sys
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, init_db  # noqa: E402
from app.repositories import MovieRepository  # noqa: E402

BATCH = 1000


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def fetch_all(http: httpx.Client, table: str, select: str) -> list[dict]:
    rows: list[dict] = []
    while True:
        response = http.get(f"/rest/v1/{table}", params={"select": select, "order": "created_at.asc", "limit": BATCH, "offset": len(rows)})
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < BATCH:
            return rows


def main(url: str, anon_key: str) -> None:
    init_db()
    http = httpx.Client(base_url=url.rstrip("/"), headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}, timeout=60)
    db = SessionLocal()
    repo = MovieRepository(db)

    movies = fetch_all(http, "movies", "imdb_id,omdb,created_at")
    before = repo.count()
    for row in movies:
        repo.save_from_omdb(row["omdb"], created_at=parse_date(row["created_at"]))
    print(f"Películas: {len(movies)} en Supabase, {repo.count() - before} nuevas en SQLite (total {repo.count()}).")

    skipped = 0
    for row in fetch_all(http, "comments", "imdb_id,author,body,created_at"):
        movie = repo.get(row["imdb_id"])
        if movie is None or any(c.body == row["body"] and c.author == row["author"] for c in movie.comments):
            skipped += 1
            continue
        repo.add_comment(movie, row["author"], row["body"], created_at=parse_date(row["created_at"]))
    print(f"Comentarios copiados (omitidos {skipped} duplicados o sin película).")

    skipped = 0
    for row in fetch_all(http, "ratings", "imdb_id,value,created_at"):
        movie = repo.get(row["imdb_id"])
        created = parse_date(row["created_at"])
        if movie is None or any(r.created_at == created for r in movie.ratings):
            skipped += 1
            continue
        repo.add_rating(movie, int(row["value"]), created_at=created)
    print(f"Calificaciones copiadas (omitidas {skipped} duplicadas o sin película).")
    db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
