"""Llena la base SQLite con películas completas de OMDb (usa OMDB_API_KEY del archivo .env).

Uso (desde la carpeta del proyecto, con el entorno activado):
    python scripts/seed_movies.py              # hasta 1000 películas en total
    python scripts/seed_movies.py --target 1500

Se puede ejecutar las veces que haga falta: salta las películas ya guardadas
(sin gastar cuota de OMDb en ellas) y se detiene al agotar la cuota diaria.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.repositories import MovieRepository  # noqa: E402
from app.services.omdb import OmdbClient, OmdbError, OmdbLookupError  # noqa: E402

# Términos variados para cubrir géneros y épocas; los primeros resultados de OMDb suelen ser los más conocidos.
TERMS = [
    "star wars", "star trek", "harry potter", "lord of the rings", "batman", "superman", "spider-man", "avengers",
    "x-men", "james bond", "mission impossible", "fast and furious", "jurassic", "alien", "terminator", "rocky",
    "toy story", "shrek", "pirates of the caribbean", "indiana jones", "back to the future", "matrix", "godfather",
    "transformers", "planet of the apes", "die hard", "john wick", "hunger games", "twilight", "saw", "scream",
    "halloween", "pixar", "disney", "love", "war", "man", "woman", "night", "day", "life", "world", "king", "queen",
    "dead", "girl", "boy", "house", "city", "time", "dark", "last", "black", "blood", "american", "story", "dream",
    "game", "heart", "secret", "lost", "island", "princess", "dragon", "ghost", "zombie", "monster", "space", "fire",
    "water", "ice", "money", "kill", "love story", "christmas", "summer", "school", "family", "father", "mother",
    "brother", "sister", "friends", "hero", "legend", "revenge", "escape", "red", "blue", "gold", "sun", "moon", "road",
]


def seed(target: int, pages_per_term: int) -> None:
    init_db()
    db = SessionLocal()
    repo = MovieRepository(db)
    omdb = OmdbClient(get_settings())
    total = repo.count()
    saved = requests = 0
    seen: set[str] = set()
    print(f"En la base: {total} películas. Objetivo: {target}.")

    try:
        for term in TERMS:
            for page in range(1, pages_per_term + 1):
                if total >= target:
                    raise StopIteration
                try:
                    requests += 1
                    found = omdb.search(term, page=page)
                except OmdbLookupError:
                    break  # sin (más) resultados para este término
                ids = [m["id"] for m in found["items"] if m["id"] not in seen]
                seen.update(ids)
                new_ids = [i for i in ids if i not in repo.existing_ids(ids)]
                added = 0
                for imdb_id in new_ids:
                    if total >= target:
                        break
                    requests += 1
                    try:
                        repo.save_from_omdb(omdb.detail(imdb_id))
                    except OmdbLookupError as exc:
                        print(f"  - {imdb_id} omitida: {exc.message}")
                        continue
                    total += 1
                    saved += 1
                    added += 1
                print(f"[{term} p.{page}] +{added} nuevas | total {total} | peticiones OMDb {requests}")
                if page >= found["pages"]:
                    break
    except StopIteration:
        pass
    except OmdbError as exc:
        print(f"Detenido: {exc.message}")
    finally:
        db.close()

    print(f"\nListo: {saved} películas nuevas en esta ejecución. Total en la base: {total}. Peticiones a OMDb: {requests}.")
    if total < target:
        print(f"Faltan {target - total}. Vuelve a ejecutar el script mañana (la cuota de OMDb se renueva cada 24 h).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", type=int, default=1000, help="total de películas que queremos en la base")
    parser.add_argument("--pages-per-term", type=int, default=3, help="páginas de 10 resultados por término de búsqueda")
    args = parser.parse_args()
    seed(args.target, args.pages_per_term)
