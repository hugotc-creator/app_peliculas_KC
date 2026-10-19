# CineBusca (OMDb)

Buscador de películas por título y año, con detalle, comentarios y calificación de 1 a 5 estrellas (promedio). Las películas que se consultan se guardan en una base de datos propia (catálogo). HTML + CSS + JavaScript, sin dependencias.

## Uso
1. Consigue una API key gratuita en https://www.omdbapi.com/apikey.aspx
2. Pégala en `js/config.js` (`apiKey: '...'`).
3. Abre `index.html` en el navegador (doble clic; no hace falta servidor).

## Base de datos
Cada película que se abre en detalle se busca primero en nuestra base. Si no está, se trae de OMDb y se guarda (respuesta completa de OMDb en la columna `omdb`). La vista **Catálogo** lista y filtra todas las películas guardadas.

### Importar en lote
La vista **Importar** (o el botón *Importar estos resultados* de una búsqueda) guarda de golpe los resultados de una búsqueda de OMDb: de 1 a 10 páginas de 10 películas. Las que ya están en la base se saltan sin pedir su detalle. Cada página son hasta 11 peticiones a OMDb (el plan gratis permite 1.000 al día). Salir de la vista detiene la importación.

### Carga masiva por script
`scripts/seed-movies.ps1` llena Supabase con películas completas de OMDb, usando las claves de `js/config.js`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\seed-movies.ps1               # hasta 1000 en total
powershell -ExecutionPolicy Bypass -File scripts\seed-movies.ps1 -Target 1500
```

Salta las películas ya guardadas sin gastar cuota de OMDb y se detiene al agotarla. Si no llega al objetivo, vuelve a ejecutarlo al día siguiente.

### Supabase (compartida por todos los usuarios)
1. Crea un proyecto gratis en https://supabase.com
2. En **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**. Crea las tablas `movies`, `comments` y `ratings` con sus permisos.
3. En **Project Settings → API** copia la *Project URL* y la clave *anon public* y pégalas en `js/config.js` (`supabase.url` y `supabase.anonKey`).

La anon key es pública por diseño: las políticas del script solo permiten leer y añadir (no editar ni borrar).

### Sin Supabase
Si `supabase.url` está vacío, todo se guarda en `localStorage` del navegador (solo visible en ese navegador).

## Tests
Abre `tests.html` en el navegador. El título de la pestaña muestra `PASS n/n` o `FAIL`.

## Estructura
| Archivo | Responsabilidad |
|---|---|
| `js/core.js`  | Funciones puras: URLs, parseo de OMDb, filas del catálogo, paginación, promedio, estrellas, comentarios, rutas |
| `js/store.js` | Comentarios y votos en `localStorage` (`read`, `update(id, transformación)`) |
| `js/db.js`    | Base de datos propia: `createSupabaseDb` (REST de Supabase) y `createLocalDb`, misma interfaz `{ data, error }` |
| `js/api.js`   | Cliente OMDb con `fetch` inyectado; siempre devuelve `{ data, error }` |
| `js/views.js` | Funciones puras dato → HTML (todo escapado) |
| `js/app.js`   | Composición: rutas por hash, eventos delegados, efectos |
| `supabase/schema.sql` | Tablas, índices y permisos de la base de datos |
