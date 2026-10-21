"""Controladores (C de MVC): una ruta = una función que usa el modelo y elige la vista."""
from app.controllers import catalog, imports, movies, search

routers = [search.router, movies.router, catalog.router, imports.router]
