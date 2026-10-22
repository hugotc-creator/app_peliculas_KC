# CineBusca (OMDb)

Aplicación web para buscar películas por título y año, ver su detalle, comentarlas y calificarlas de 1 a 5 estrellas (promedio en estrellas). Las películas consultadas se guardan en una base de datos propia (catálogo).

**Stack:** FastAPI · SQLite (SQLAlchemy) · Bootstrap 5 + Bootstrap Icons · Jinja2 · API externa [OMDb](https://www.omdbapi.com/) · patrón MVC.

El diseño (cabecera amarilla, títulos con barra lateral, pósters con sombra y pie oscuro) está inspirado en portales de cine como SensaCine y se define en `app/static/styles.css` sobre los componentes de Bootstrap.

## Puesta en marcha
Requiere Python 3.11 o superior.

```powershell
# 1. Entorno e instalación
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 2. API key de OMDb (gratis en https://www.omdbapi.com/apikey.aspx)
copy .env.example .env     # y escribe tu key en OMDB_API_KEY=

# 3. Arrancar
uvicorn app.main:app --reload
```

Abre http://localhost:8000. La base `peliculas.db` se crea sola en la primera ejecución.

## Funcionalidades
| Ruta | Qué hace |
|---|---|
| `/` | Búsqueda por título y año en OMDb, con paginación |
| `/movies/{imdb_id}` | Detalle. Se lee de nuestra base; si no está, se trae de OMDb y se guarda |
| `POST /movies/{id}/comments` | Publicar un comentario (validado en el servidor) |
| `POST /movies/{id}/ratings` | Votar de 1 a 5; el promedio se muestra en estrellas |
| `/catalog` | Catálogo de películas guardadas, con filtro por título y/o año (el año solo también vale) y paginación |
| `/import` | Importación en lote de los resultados de una búsqueda (1 a 10 páginas) |

## Arquitectura (MVC)
```
app/
  main.py            Arranque de FastAPI y control de errores centralizado
  config.py          Configuración desde .env (API key, base de datos)
  database.py        Conexión SQLite (SQLAlchemy)
  core.py            Funciones puras: parseo de OMDb, promedio, estrellas, validación
  models.py          MODELO: tablas movies, comments, ratings
  repositories.py    MODELO: consultas a la base (MovieRepository)
  services/omdb.py   Cliente de la API externa OMDb
  services/importer.py  Importación en lote
  controllers/       CONTROLADORES: search, movies, catalog, imports
  views/templates/   VISTAS: plantillas Jinja2 con Bootstrap
  static/            CSS propio (estrellas, pósters) y póster de relleno
scripts/
  seed_movies.py       Carga masiva de películas desde OMDb respetando la cuota
  migrate_supabase.py  Copia datos de un proyecto Supabase a SQLite
tests/               pytest: funciones puras y pruebas HTTP de extremo a extremo
```

## Control de errores
- **OMDb** (`services/omdb.py`): fallos de red, clave inválida, cuota agotada o respuesta ilegible se convierten en `OmdbError` y se muestran como página de error 502/500. "No encontrada" o "demasiados resultados" se muestran dentro de la búsqueda; un id de película inexistente da 404.
- **Formularios**: comentarios vacíos o demasiado largos y votos fuera de 1–5 devuelven 422 con el mensaje junto al campo. La base también lo impide con `CHECK`.
- **Generales** (`main.py`): 404 de rutas, 405, parámetros inválidos (422) y cualquier excepción no prevista (500, registrada en el log) muestran una página de error con Bootstrap.
- **Configuración**: sin `OMDB_API_KEY` la app avisa en lugar de fallar en silencio.

## Tests
```powershell
pytest
```
Usan SQLite en memoria y un cliente OMDb falso: no necesitan red ni API key.

## Carga masiva
```powershell
python scripts/seed_movies.py                # hasta 1000 películas en total
python scripts/seed_movies.py --target 1500
```
Salta las películas ya guardadas y se detiene al agotar la cuota diaria de OMDb (1.000 peticiones en el plan gratis). Si no llega al objetivo, vuelve a ejecutarlo al día siguiente.
