/* Vistas: funciones puras dato -> HTML. Todo texto externo pasa por e() (escape). */
(function (App) {
  'use strict';

  const { escapeHtml: e, searchHash, movieHash, starKinds, COMMENT_LIMITS } = App.core;

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
  const backLink = (href) => `<a class="back" href="${e(href)}">← Volver a la búsqueda</a>`;

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

  const pageLink = (params, page, label, enabled) => (enabled
    ? `<a class="button" href="${e(searchHash({ ...params, page }))}">${label}</a>`
    : `<span class="button button--disabled">${label}</span>`);

  const pagination = (params, pages) => {
    const page = Number(params.page) || 1;
    return `
      <nav class="pagination" aria-label="Paginación">
        ${pageLink(params, page - 1, '← Anterior', page > 1)}
        <span>Página ${page} de ${pages}</span>
        ${pageLink(params, page + 1, 'Siguiente →', page < pages)}
      </nav>`;
  };

  const results = ({ data, error }, params) => (error ? message(error, 'error') : `
    <p class="muted">${data.total} resultado(s)</p>
    <div class="grid">${data.items.map(movieCard).join('')}</div>
    ${pagination(params, data.pages)}`);

  const searchPage = (params) => `
    ${searchForm(params)}
    <section id="results">${message('Busca una película por título y, si quieres, por año.')}</section>`;

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

  const detailPage = (m, s, backHref) => `
    ${backLink(backHref)}
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
    </section>
    <section class="panel">
      <h2>Comentarios</h2>
      ${commentForm()}
      <div id="comment-list">${comments(s.comments)}</div>
    </section>`;

  const errorPage = (text, backHref) => `${backLink(backHref)}${message(text, 'error')}`;

  App.views = {
    PLACEHOLDER, message, loading, stars,
    searchPage, results, detailPage, errorPage, ratingSummary, comments,
  };
})(window.App = window.App || {});
