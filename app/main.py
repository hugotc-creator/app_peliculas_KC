"""Arranque de FastAPI: rutas, archivos estáticos y control de errores centralizado."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.controllers import routers
from app.database import init_db
from app.services.omdb import OmdbError
from app.views import render

log = logging.getLogger("cinebusca")

HTTP_MESSAGES = {
    404: "Página no encontrada.",
    405: "Método no permitido.",
    422: "Los datos enviados no son válidos.",
    500: "Ha ocurrido un error inesperado. Inténtalo de nuevo.",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="CineBusca", docs_url=None, redoc_url=None, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")
for router in routers:
    app.include_router(router)


def error_page(request: Request, status: int, message: str):
    return render(request, "error.html", status_code=status, status=status, message=message)


@app.exception_handler(OmdbError)
async def omdb_error(request: Request, exc: OmdbError):
    return error_page(request, exc.status_code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    message = exc.detail if isinstance(exc.detail, str) and exc.status_code in (404, 400) and exc.detail != "Not Found" \
        else HTTP_MESSAGES.get(exc.status_code, str(exc.detail))
    return error_page(request, exc.status_code, message)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    details = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return error_page(request, 422, f"{HTTP_MESSAGES[422]} ({details})")


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    log.exception("Error no controlado en %s", request.url.path)
    return error_page(request, 500, HTTP_MESSAGES[500])
