/* Núcleo: solo funciones puras (sin DOM, sin red, sin storage). Todo lo testeable vive aquí. */
(function (App) {
  'use strict';

  const PAGE_SIZE = 10; // OMDb devuelve 10 resultados por página
  const MAX_RATING = 5;
  const NOT_AVAILABLE = 'N/A';
  const COMMENT_LIMITS = { author: 40, text: 500 };

  // Mensajes de OMDb -> español. Una tabla en lugar de una cadena de if.
  const ERRORS = {
    'Movie not found!': 'No se encontraron películas.',
    'Too many results.': 'Demasiados resultados: escribe un título más específico.',
    'Invalid API key!': 'API key inválida. Revisa js/config.js.',
    'No API key provided.': 'Falta la API key. Configúrala en js/config.js.',
    'Incorrect IMDb ID.': 'Identificador de película incorrecto.',
    'Request limit reached!': 'Se alcanzó el límite diario de la API.',
  };

  // Campos del detalle: añadir uno es añadir una fila, no código.
  const DETAIL_FIELDS = [
    ['Año', 'Year'], ['Clasificación', 'Rated'], ['Estreno', 'Released'],
    ['Duración', 'Runtime'], ['Género', 'Genre'], ['Director', 'Director'],
    ['Guion', 'Writer'], ['Reparto', 'Actors'], ['Idioma', 'Language'],
    ['País', 'Country'], ['Premios', 'Awards'], ['Nota IMDb', 'imdbRating'],
  ];

  // Fracción de relleno de una estrella -> tipo de estrella.
  const STAR_KIND = { 0: 'empty', 0.5: 'half', 1: 'full' };

  const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  // ---------- utilidades ----------
  const clean = (value) => (value === undefined || value === null || value === NOT_AVAILABLE ? null : value);
  const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const roundToHalf = (n) => Math.round(n * 2) / 2;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);

  const toQuery = (params) => Object.entries(params)
    .filter(([, value]) => !isBlank(value))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value).trim())}`)
    .join('&');

  // ---------- OMDb: peticiones ----------
  const buildUrl = (config, params) => `${config.baseUrl}?${toQuery({ apikey: config.apiKey, ...params })}`;
  const searchParams = ({ title, year, page }) => ({ s: title, y: year, page: page || 1, type: 'movie' });
  const detailParams = (id) => ({ i: id, plot: 'full' });

  // ---------- OMDb: respuestas -> { data, error } (una sola forma para todo) ----------
  const translateError = (message) => ERRORS[message] || message || 'Error desconocido.';
  const failure = (message) => ({ data: null, error: translateError(message) });
  const fromOmdb = (json, toData) => (json && json.Response === 'True'
    ? { data: toData(json), error: null }
    : failure(json && json.Error));

  const toSummary = (m) => ({ id: m.imdbID, title: m.Title, year: m.Year, poster: clean(m.Poster) });

  // ---------- paginación (búsqueda OMDb y catálogo usan la misma forma) ----------
  const toPage = (items, total) => ({ items, total, pages: Math.ceil(total / PAGE_SIZE) });
  const pageRange = (page) => {
    const from = (Math.max(1, Number(page) || 1) - 1) * PAGE_SIZE;
    return { from, to: from + PAGE_SIZE - 1 };
  };

  const parseSearch = (json) => fromOmdb(json, (j) => toPage(j.Search.map(toSummary), Number(j.totalResults)));

  const parseDetail = (json) => fromOmdb(json, (j) => ({
    ...toSummary(j),
    plot: clean(j.Plot),
    fields: DETAIL_FIELDS
      .map(([label, key]) => ({ label, value: clean(j[key]) }))
      .filter((field) => field.value !== null),
  }));

  // ---------- catálogo propio: filas de la tabla movies ----------
  // Se guarda la respuesta completa de OMDb (omdb) y, aparte, las columnas para listar y filtrar.
  const movieRow = (json) => ({
    imdb_id: json.imdbID, title: json.Title, year: json.Year, poster: clean(json.Poster), omdb: json,
  });
  const rowToSummary = (row) => ({ id: row.imdb_id, title: row.title, year: row.year, poster: row.poster });

  // Filtro y página en memoria (base local). Supabase hace lo mismo en el servidor.
  const filterCatalog = (rows, { title, page }) => {
    const q = String(title || '').trim().toLowerCase();
    const matches = rows.filter((row) => row.title.toLowerCase().includes(q));
    const { from, to } = pageRange(page);
    return toPage(matches.slice(from, to + 1).map(rowToSummary), matches.length);
  };

  // ---------- importación en lote ----------
  const IMPORT_PAGE_OPTIONS = [1, 3, 5, 10]; // cada página: 1 búsqueda + hasta 10 detalles en OMDb
  const importPages = (value) => (IMPORT_PAGE_OPTIONS.includes(Number(value)) ? Number(value) : IMPORT_PAGE_OPTIONS[0]);
  // log: [{ status: 'saved' | 'existing' | 'failed', ... }] -> { saved, existing, failed }
  const tallyImport = (log) => log.reduce(
    (counts, entry) => ({ ...counts, [entry.status]: counts[entry.status] + 1 }),
    { saved: 0, existing: 0, failed: 0 },
  );

  // "Content-Range: 0-9/57" -> 57
  const parseTotal = (contentRange) => Number(String(contentRange || '').split('/')[1]) || 0;

  // ---------- calificaciones ----------
  const average = (numbers) => (numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0);
  const isValidRating = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_RATING;
  const starKinds = (value) => Array.from(
    { length: MAX_RATING },
    (_, i) => STAR_KIND[roundToHalf(clamp(value - i, 0, 1))],
  );

  // ---------- comentarios ----------
  const makeComment = ({ author, text }, now) => ({
    author: String(author || '').trim() || 'Anónimo',
    text: String(text || '').trim(),
    date: now.toISOString(),
  });

  // Reglas de validación como datos: [¿falla?, mensaje].
  const validateComment = (c) => [
    [c.text.length === 0, 'El comentario no puede estar vacío.'],
    [c.text.length > COMMENT_LIMITS.text, `El comentario admite máximo ${COMMENT_LIMITS.text} caracteres.`],
    [c.author.length > COMMENT_LIMITS.author, `El nombre admite máximo ${COMMENT_LIMITS.author} caracteres.`],
  ].filter(([failed]) => failed).map(([, message]) => message);

  // ---------- registro por película: { comments, ratings } (transformaciones inmutables) ----------
  const emptyRecord = () => ({ comments: [], ratings: [] });
  const addRating = (record, value) => ({ ...record, ratings: [...record.ratings, value] });
  const addComment = (record, comment) => ({ ...record, comments: [comment, ...record.comments] });
  const summarize = (record) => {
    const avg = average(record.ratings);
    return { average: avg, count: record.ratings.length, comments: record.comments };
  };

  // ---------- rutas (hash) ----------
  const parseRoute = (hash) => {
    const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
    const [view, id] = path.split('/');
    return {
      view: view || 'search',
      id: decodeURIComponent(id || ''),
      params: Object.fromEntries(new URLSearchParams(query)),
    };
  };
  const searchHash = (params) => `#/search?${toQuery(params)}`;
  const movieHash = (id) => `#/movie/${encodeURIComponent(id)}`;
  const catalogHash = (params) => `#/catalog?${toQuery(params)}`;
  const importHash = (params) => `#/import?${toQuery(params)}`;

  App.core = {
    COMMENT_LIMITS, escapeHtml, toQuery,
    buildUrl, searchParams, detailParams, failure, parseSearch, parseDetail,
    toPage, pageRange, movieRow, rowToSummary, filterCatalog, parseTotal,
    IMPORT_PAGE_OPTIONS, importPages, tallyImport,
    average, isValidRating, starKinds,
    makeComment, validateComment,
    emptyRecord, addRating, addComment, summarize,
    parseRoute, searchHash, movieHash, catalogHash, importHash,
  };
})(window.App = window.App || {});
