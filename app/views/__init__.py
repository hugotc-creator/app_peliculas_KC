"""Vista (V de MVC): plantillas Jinja2 con Bootstrap."""
from pathlib import Path

from fastapi import Request
from fastapi.templating import Jinja2Templates

from app import core

TEMPLATES_DIR = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def format_date(value) -> str:
    return value.strftime("%d/%m/%Y %H:%M") if value else ""


templates.env.filters["date"] = format_date
templates.env.globals["IMPORT_PAGE_OPTIONS"] = core.IMPORT_PAGE_OPTIONS
templates.env.globals["COMMENT_LIMITS"] = core.COMMENT_LIMITS


def render(request: Request, name: str, status_code: int = 200, **context):
    return templates.TemplateResponse(request=request, name=name, context=context, status_code=status_code)
