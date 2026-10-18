# CineBusca (OMDb)

Buscador de películas por título y año, con detalle, comentarios y calificación de 1 a 5 estrellas (promedio). HTML + CSS + JavaScript, sin dependencias.

## Uso
1. Consigue una API key gratuita en https://www.omdbapi.com/apikey.aspx
2. Pégala en `js/config.js` (`apiKey: '...'`).
3. Abre `index.html` en el navegador (doble clic; no hace falta servidor).

Comentarios y calificaciones se guardan en `localStorage` del navegador, por película (`omdb:<imdbID>`).

## Tests
Abre `tests.html` en el navegador. El título de la pestaña muestra `PASS n/n` o `FAIL`.

## Estructura
| Archivo | Responsabilidad |
|---|---|
| `js/core.js`  | Funciones puras: URLs, parseo de OMDb, promedio, estrellas, comentarios, rutas |
| `js/store.js` | Persistencia (`read`, `update(id, transformación)`) con storage inyectado |
| `js/api.js`   | Cliente OMDb con `fetch` inyectado; siempre devuelve `{ data, error }` |
| `js/views.js` | Funciones puras dato → HTML (todo escapado) |
| `js/app.js`   | Composición: rutas por hash, eventos delegados, efectos |
