/* Composición: une rutas, API, base de datos y vistas. Aquí (y solo aquí) viven los efectos. */
(function (App) {
  'use strict';

  const { core, views, config } = App;
  const root = document.getElementById('app');
  const api = App.createApi(config, (url) => fetch(url));
  const db = config.supabase && config.supabase.url && config.supabase.anonKey
    ? App.createSupabaseDb(config.supabase, (url, options) => fetch(url, options))
    : App.createLocalDb(window.localStorage);
  const state = { nav: 0, lastList: '#/search' };

  const render = (html) => { root.innerHTML = html; };
  const fill = (id, html) => { document.getElementById(id).innerHTML = html; };
  const currentId = () => core.parseRoute(location.hash).id;

  // Primero nuestra base; si no está, se trae de OMDb y se guarda (el catálogo se llena solo).
  const loadMovie = async (id) => {
    const saved = await db.getMovie(id);
    if (saved.data) return { data: saved.data, error: null, source: 'db' };
    const fresh = await api.detail(id);
    if (fresh.error) return fresh;
    const stored = await db.saveMovie(fresh.raw);
    return { data: fresh.data, error: null, source: stored.error ? 'omdb-unsaved' : 'omdb' };
  };

  // ---------- vistas ----------
  const showSearch = async ({ params }, stillHere) => {
    state.lastList = location.hash || '#/search';
    render(views.searchPage(params));
    if (!params.title) return;
    fill('results', views.loading());
    const result = await api.search(params);
    if (stillHere()) fill('results', views.results(result, params));
  };

  const showCatalog = async ({ params }, stillHere) => {
    state.lastList = location.hash;
    render(views.catalogPage(params, db.name));
    const result = await db.listMovies(params);
    if (stillHere()) fill('results', views.catalogResults(result, params));
  };

  const showMovie = async ({ id }, stillHere) => {
    render(views.loading());
    const [movie, record] = await Promise.all([loadMovie(id), db.readRecord(id)]);
    if (!stillHere()) return;
    if (movie.error) return render(views.errorPage(movie.error, state.lastList));
    render(views.detailPage(movie.data, core.summarize(record.data || core.emptyRecord()), state.lastList, movie.source));
    if (record.error) fill('comment-errors', core.escapeHtml(record.error));
  };

  const showImport = ({ params }) => render(views.importPage(params));

  const VIEWS = { search: showSearch, catalog: showCatalog, import: showImport, movie: showMovie };

  // Cada navegación invalida las respuestas pendientes de la anterior.
  const route = () => {
    if (!config.apiKey) return render(views.message('Falta la API key de OMDb: configúrala en js/config.js.', 'error'));
    const nav = ++state.nav;
    const r = core.parseRoute(location.hash);
    return (VIEWS[r.view] || VIEWS.search)(r, () => nav === state.nav);
  };

  // ---------- acciones ----------
  const refreshCommunity = (record) => {
    const summary = core.summarize(record);
    fill('rating', views.ratingSummary(summary));
    fill('comment-list', views.comments(summary.comments));
  };

  // Guarda en la base y repinta; errorsId: dónde mostrar el fallo.
  const saveAndRefresh = async (promise, errorsId) => {
    const result = await promise;
    fill(errorsId, result.error ? core.escapeHtml(result.error) : '');
    if (!result.error) refreshCommunity(result.data);
    return !result.error;
  };

  const submitSearch = (form) => {
    location.hash = core.searchHash({ ...Object.fromEntries(new FormData(form)), page: 1 });
  };

  const submitCatalog = (form) => {
    location.hash = core.catalogHash({ ...Object.fromEntries(new FormData(form)), page: 1 });
  };

  const submitComment = async (form) => {
    const comment = core.makeComment(Object.fromEntries(new FormData(form)), new Date());
    const errors = core.validateComment(comment);
    fill('comment-errors', errors.map(core.escapeHtml).join('<br>'));
    if (errors.length) return;
    const button = form.querySelector('button');
    button.disabled = true;
    if (await saveAndRefresh(db.addComment(currentId(), comment), 'comment-errors')) form.reset();
    button.disabled = false;
  };

  // Trae el detalle de OMDb y lo guarda -> { status, error? }
  const importOne = async (id) => {
    const fresh = await api.detail(id);
    if (fresh.error) return { status: 'failed', error: fresh.error };
    const stored = await db.saveMovie(fresh.raw);
    return stored.error ? { status: 'failed', error: stored.error } : { status: 'saved' };
  };

  // Recorre las páginas de la búsqueda en serie (una petición cada vez, amable con la cuota).
  // Salir de la vista detiene la importación.
  const submitImport = async (form) => {
    const params = Object.fromEntries(new FormData(form));
    const pages = core.importPages(params.pages);
    const nav = state.nav;
    const stillHere = () => nav === state.nav;
    const progress = { log: [], status: 'Buscando…', done: false, error: null };
    const show = (changes) => {
      Object.assign(progress, changes);
      if (stillHere()) fill('import-progress', views.importProgress(progress));
    };

    const button = form.querySelector('button');
    button.disabled = true;
    show({});
    for (let page = 1; page <= pages; page += 1) {
      show({ status: `Página ${page} de ${pages}: buscando en OMDb…` });
      const found = await api.search({ title: params.title, year: params.year, page });
      if (found.error) { show({ error: found.error }); break; }
      const known = await db.existingIds(found.data.items.map((movie) => movie.id));
      if (known.error) { show({ error: known.error }); break; }

      for (const movie of found.data.items) {
        if (!stillHere()) return;
        show({ status: `Página ${page} de ${pages}: ${movie.title}` });
        const outcome = known.data.includes(movie.id) ? { status: 'existing' } : await importOne(movie.id);
        progress.log.push({ ...movie, ...outcome });
      }
      if (page >= found.data.pages) break; // no hay más resultados
    }
    show({ status: progress.error ? 'Importación detenida' : 'Importación terminada', done: true });
    button.disabled = false;
  };

  const rate = (value) => {
    if (core.isValidRating(value)) saveAndRefresh(db.addRating(currentId(), value), 'rating-errors');
  };

  // ---------- eventos (delegados) ----------
  const SUBMITS = {
    'search-form': submitSearch, 'catalog-form': submitCatalog, 'import-form': submitImport, 'comment-form': submitComment,
  };

  root.addEventListener('submit', (event) => {
    const handler = SUBMITS[event.target.id];
    if (!handler) return;
    event.preventDefault();
    handler(event.target);
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rate]');
    if (button) rate(Number(button.dataset.rate));
  });

  // Pósters rotos -> placeholder ('error' no burbujea, por eso se captura).
  root.addEventListener('error', (event) => {
    if (event.target.matches('img.poster')) event.target.src = views.PLACEHOLDER;
  }, true);

  window.addEventListener('hashchange', route);
  route();
})(window.App = window.App || {});
