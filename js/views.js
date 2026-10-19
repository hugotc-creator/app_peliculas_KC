/* Vistas: funciones puras dato -> HTML. Todo texto externo pasa por e() (escape). */
(function (App) {
  'use strict';

  const {
    escapeHtml: e, searchHash, movieHash, catalogHash, importHash, starKinds, COMMENT_LIMITS, IMPORT_PAGE_OPTIONS, tallyImport,
  } = App.core;

  const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="445" viewBox="0 0 300 445">'
    + '<rect width="300" height="445" fill="#262b36"/>'
    + '<text x="150" y="230" fill="#8a93a6" font-family="sans-serif" font-size="22" text-anchor="middle">Sin póster</text>'
    + '</svg>',
  );

  const formatDate = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

  // ---------- piezas comunes ----------
  const poster = (src, title) => `<img class="poster" src="${e(src || PLACEHOLDER)}" alt="Póster de ${e(title)}" loading="lazy">`;
  const message = (text, kind = 'info') => `<p class="message message--${kind}">${e(text)}</p>`;
  const loading = () => '<div class="loading" aria-live="polite"><span class="spinner"></span>Cargando…</div>';
  const backLink = (href) => `<a class="back" href="${e(href)}">← Volver</a>`;

  const stars = (value) => `<span class="stars" role="img" aria-label="${value.toFixed(1)} de 5 estrellas">${
    starKinds(value).map((kind) => `<span class="star star--${kind}">★</span>`).join('')}</span>`;

  // ---------- búsqueda ----------
  const searchForm = ({ title = '', year = '' }) => `
    <form id="search-form" class="search" role="search">
      <input name="title" type="search" placeholder="Título de la película" value="${e(title)}" required autofocus>
      <input name="year" type="number" placeholder="Año" min="1888" max="2100" value="${e(year)}">
      <button type="submit">Buscar</button>
    </form>`;

  const movieCard = (m) => `
    <a class="card" href="${e(movieHash(m.id))}">
      ${poster(m.poster, m.title)}
      <span class="card__title">${e(m.title)}</span>
      <span class="card__year">${e(m.year)}</span>
    </a>`;

  // toHash: a qué vista apuntan los enlaces de página (búsqueda o catálogo).
  const pageLink = (toHash, params, page, label, enabled) => (enabled
    ? `<a class="button" href="${e(toHash({ ...params, page }))}">${label}</a>`
    : `<span class="button button--disabled">${label}</span>`);

  const pagination = (params, pages, toHash) => {
    const page = Number(params.page) || 1;
    return `
      <nav class="pagination" aria-label="Paginación">
        ${pageLink(toHash, params, page - 1, '← Anterior', page > 1)}
        <span>Página ${page} de ${pages}</span>
        ${pageLink(toHash, params, page + 1, 'Siguiente →', page < pages)}
      </nav>`;
  };

  const results = ({ data, error }, params, toHash = searchHash) => (error ? message(error, 'error') : `
    <div class="results-bar">
      <p class="muted">${data.total} resultado(s)</p>
      ${toHash === searchHash
    ? `<a class="button button--ghost" href="${e(importHash({ title: params.title, year: params.year }))}">Importar estos resultados al catálogo</a>`
    : ''}
    </div>
    <div class="grid">${data.items.map(movieCard).join('')}</div>
    ${pagination(params, data.pages, toHash)}`);

  const searchPage = (params) => `
    ${searchForm(params)}
    <section id="results">${message('Busca una película por título y, si quieres, por año.')}</section>`;

  // ---------- catálogo (nuestra base de datos) ----------
  const catalogResults = (result, params) => {
    if (result.data && result.data.total === 0) {
      return message(params.title
        ? 'Ninguna película del catálogo coincide con ese título.'
        : 'El catálogo está vacío: abre el detalle de cualquier película y se guardará aquí.');
    }
    return results(result, params, catalogHash);
  };

  const catalogPage = (params, dbName) => `
    <h1>Catálogo</h1>
    <p class="muted">Películas guardadas en nuestra base de datos (${e(dbName)}).</p>
    <form id="catalog-form" class="search search--catalog" role="search">
      <input name="title" type="search" placeholder="Filtrar por título" value="${e(params.title || '')}">
      <button type="submit">Filtrar</button>
    </form>
    <section id="results">${loading()}</section>`;

  // ---------- importación en lote ----------
  const importPage = ({ title = '', year = '', pages }) => `
    <h1>Importar películas</h1>
    <p class="muted">Busca en OMDb y guarda todos los resultados en el catálogo. Las que ya están se saltan sin gastar peticiones.
      Cada página son hasta 11 peticiones a OMDb (límite gratis: 1.000 al día).</p>
    <form id="import-form" class="search search--import">
      <input name="title" type="search" placeholder="Título (p. ej. star wars)" value="${e(title)}" required>
      <input name="year" type="number" placeholder="Año" min="1888" max="2100" value="${e(year)}">
      <select name="pages" aria-label="Páginas a importar">${IMPORT_PAGE_OPTIONS.map((n) => `
        <option value="${n}"${Number(pages) === n ? ' selected' : ''}>${n} página(s) · hasta ${n * 10} películas</option>`).join('')}
      </select>
      <button type="submit">Importar</button>
    </form>
    <section id="import-progress"></section>`;

  const IMPORT_LABELS = { saved: 'Guardada', existing: 'Ya estaba', failed: 'Error' };

  const importEntry = (entry) => `
    <li class="import-entry import-entry--${e(entry.status)}">
      <span class="import-entry__status">${IMPORT_LABELS[entry.status]}</span>
      <a href="${e(movieHash(entry.id))}">${e(entry.title)}</a> <span class="muted">(${e(entry.year)})</span>
      ${entry.error ? `<span class="muted">— ${e(entry.error)}</span>` : ''}
    </li>`;

  // { log, status: texto de estado, done, error }
  const importProgress = ({ log, status, done, error }) => {
    const t = tallyImport(log);
    return `
      ${error ? message(error, 'error') : ''}
      <div class="import-summary">
        ${done ? '' : '<span class="spinner"></span>'}
        <strong>${e(status)}</strong>
        <span>${t.saved} nueva(s) · ${t.existing} ya estaban · ${t.failed} con error</span>
        ${done && t.saved + t.existing ? `<a href="#/catalog">Ver catálogo →</a>` : ''}
      </div>
      <ul class="import-log">${log.slice().reverse().map(importEntry).join('')}</ul>`;
  };

  // ---------- detalle ----------
  const fieldList = (fields) => `<dl class="fields">${
    fields.map(({ label, value }) => `<dt>${e(label)}</dt><dd>${e(value)}</dd>`).join('')}</dl>`;

  // Orden 5..1 + flex row-reverse: el hover ilumina la estrella y las anteriores solo con CSS.
  const ratingInput = () => `<div class="rate" role="group" aria-label="Califica de 1 a 5">${
    [5, 4, 3, 2, 1].map((n) => `<button type="button" class="rate__star" data-rate="${n}" title="${n} de 5" aria-label="${n} de 5">★</button>`).join('')}</div>`;

  const ratingSummary = (s) => `
    <div class="rating">
      ${stars(s.average)}
      <span class="rating__value">${s.average.toFixed(1)} / 5</span>
      <span class="muted">(${s.count} voto(s))</span>
    </div>`;

  const comment = (c) => `
    <li class="comment">
      <header><strong>${e(c.author)}</strong><time datetime="${e(c.date)}">${e(formatDate(c.date))}</time></header>
      <p>${e(c.text)}</p>
    </li>`;

  const comments = (list) => (list.length
    ? `<ul class="comments">${list.map(comment).join('')}</ul>`
    : message('Aún no hay comentarios. ¡Sé el primero!'));

  const commentForm = () => `
    <form id="comment-form" class="comment-form">
      <input name="author" maxlength="${COMMENT_LIMITS.author}" placeholder="Tu nombre (opcional)">
      <textarea name="text" maxlength="${COMMENT_LIMITS.text}" rows="3" placeholder="Escribe tu comentario…" required></textarea>
      <p id="comment-errors" class="form-errors" aria-live="polite"></p>
      <button type="submit">Publicar comentario</button>
    </form>`;

  const SOURCES = {
    db: 'Leída de nuestra base de datos',
    omdb: 'Traída de OMDb y guardada en el catálogo',
    'omdb-unsaved': 'Traída de OMDb (no se pudo guardar en el catálogo)',
  };

  const detailPage = (m, s, backHref, source) => `
    ${backLink(backHref)}
    <p class="source source--${e(source)}">${e(SOURCES[source] || '')}</p>
    <article class="detail">
      ${poster(m.poster, m.title)}
      <div>
        <h1>${e(m.title)} <span class="muted">(${e(m.year)})</span></h1>
        <p class="plot">${e(m.plot || '')}</p>
        ${fieldList(m.fields)}
      </div>
    </article>
    <section class="panel">
      <h2>Calificación de los usuarios</h2>
      <div id="rating">${ratingSummary(s)}</div>
      <p class="muted">Tu calificación:</p>
      ${ratingInput()}
      <p id="rating-errors" class="form-errors" aria-live="polite"></p>
    </section>
    <section class="panel">
      <h2>Comentarios</h2>
      ${commentForm()}
      <div id="comment-list">${comments(s.comments)}</div>
    </section>`;

  const errorPage = (text, backHref) => `${backLink(backHref)}${message(text, 'error')}`;

  App.views = {
    PLACEHOLDER, message, loading, stars,
    searchPage, results, catalogPage, catalogResults, importPage, importProgress, detailPage, errorPage, ratingSummary, comments,
  };
})(window.App = window.App || {});
