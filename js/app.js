/* Composición: une rutas, API, store y vistas. Aquí (y solo aquí) viven los efectos. */
(function (App) {
  'use strict';

  const { core, views, config } = App;
  const root = document.getElementById('app');
  const api = App.createApi(config, (url) => fetch(url));
  const store = App.createStore(window.localStorage);
  const state = { nav: 0, lastSearch: '#/search' };

  const render = (html) => { root.innerHTML = html; };
  const fill = (id, html) => { document.getElementById(id).innerHTML = html; };
  const currentId = () => core.parseRoute(location.hash).id;

  // ---------- vistas ----------
  const showSearch = async ({ params }, stillHere) => {
    state.lastSearch = location.hash || '#/search';
    render(views.searchPage(params));
    if (!params.title) return;
    fill('results', views.loading());
    const result = await api.search(params);
    if (stillHere()) fill('results', views.results(result, params));
  };

  const showMovie = async ({ id }, stillHere) => {
    render(views.loading());
    const result = await api.detail(id);
    if (!stillHere()) return;
    render(result.error
      ? views.errorPage(result.error, state.lastSearch)
      : views.detailPage(result.data, core.summarize(store.read(id)), state.lastSearch));
  };

  const VIEWS = { search: showSearch, movie: showMovie };

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

  const submitSearch = (form) => {
    location.hash = core.searchHash({ ...Object.fromEntries(new FormData(form)), page: 1 });
  };

  const submitComment = (form) => {
    const comment = core.makeComment(Object.fromEntries(new FormData(form)), new Date());
    const errors = core.validateComment(comment);
    fill('comment-errors', errors.map(core.escapeHtml).join('<br>'));
    if (errors.length) return;
    form.reset();
    refreshCommunity(store.update(currentId(), (record) => core.addComment(record, comment)));
  };

  const rate = (value) => {
    if (!core.isValidRating(value)) return;
    refreshCommunity(store.update(currentId(), (record) => core.addRating(record, value)));
  };

  // ---------- eventos (delegados) ----------
  const SUBMITS = { 'search-form': submitSearch, 'comment-form': submitComment };

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
