/* Especificaciones de core, store, api y views. */
(function (App) {
  'use strict';

  const { core, views } = App;
  const config = { apiKey: 'KEY', baseUrl: 'https://www.omdbapi.com/' };

  const fakeStorage = () => {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
  };
  const fakeFetch = (json) => () => Promise.resolve({ json: () => Promise.resolve(json) });

  const SEARCH_OK = {
    Response: 'True',
    totalResults: '23',
    Search: [{ imdbID: 'tt1', Title: 'Matrix', Year: '1999', Poster: 'N/A' }],
  };
  const DETAIL_OK = {
    Response: 'True', imdbID: 'tt1', Title: 'Matrix', Year: '1999', Poster: 'http://x/p.jpg',
    Plot: 'Neo...', Director: 'Wachowski', Writer: 'N/A', Genre: 'Sci-Fi',
  };

  // ---------- utilidades ----------
  test('toQuery omite vacíos y codifica', () => {
    assert.equal(core.toQuery({ s: 'star wars', y: '', page: 2, z: null }), 's=star%20wars&page=2');
  });

  test('escapeHtml neutraliza HTML', () => {
    assert.equal(core.escapeHtml('<img onerror="x">&\''), '&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;');
    assert.equal(core.escapeHtml(undefined), '');
  });

  // ---------- OMDb ----------
  test('buildUrl de búsqueda incluye apikey, título, año, página y tipo', () => {
    const url = core.buildUrl(config, core.searchParams({ title: 'Matrix', year: '1999' }));
    assert.equal(url, 'https://www.omdbapi.com/?apikey=KEY&s=Matrix&y=1999&page=1&type=movie');
  });

  test('buildUrl de detalle pide plot completo', () => {
    assert.equal(core.buildUrl(config, core.detailParams('tt1')), 'https://www.omdbapi.com/?apikey=KEY&i=tt1&plot=full');
  });

  test('parseSearch normaliza resultados y calcula páginas', () => {
    assert.equal(core.parseSearch(SEARCH_OK), {
      data: { items: [{ id: 'tt1', title: 'Matrix', year: '1999', poster: null }], total: 23, pages: 3 },
      error: null,
    });
  });

  test('parseSearch traduce errores de OMDb', () => {
    assert.equal(core.parseSearch({ Response: 'False', Error: 'Movie not found!' }),
      { data: null, error: 'No se encontraron películas.' });
  });

  test('parseSearch tolera respuestas vacías o errores desconocidos', () => {
    assert.equal(core.parseSearch(null).error, 'Error desconocido.');
    assert.equal(core.parseSearch({ Response: 'False', Error: 'Otro' }).error, 'Otro');
  });

  test('parseDetail descarta N/A y conserva el orden de campos', () => {
    const { data } = core.parseDetail(DETAIL_OK);
    assert.equal(data.poster, 'http://x/p.jpg');
    assert.equal(data.plot, 'Neo...');
    assert.equal(data.fields.map((f) => f.label), ['Año', 'Género', 'Director']);
  });

  // ---------- calificaciones ----------
  test('average', () => {
    assert.equal(core.average([]), 0);
    assert.equal(core.average([1, 2, 3, 4]), 2.5);
  });

  test('starKinds redondea a medias estrellas', () => {
    assert.equal(core.starKinds(0), ['empty', 'empty', 'empty', 'empty', 'empty']);
    assert.equal(core.starKinds(2.5), ['full', 'full', 'half', 'empty', 'empty']);
    assert.equal(core.starKinds(3.2), ['full', 'full', 'full', 'empty', 'empty']);
    assert.equal(core.starKinds(3.3), ['full', 'full', 'full', 'half', 'empty']);
    assert.equal(core.starKinds(5), ['full', 'full', 'full', 'full', 'full']);
  });

  test('isValidRating solo acepta enteros 1..5', () => {
    assert.equal([0, 1, 3, 5, 6, 2.5, NaN].map(core.isValidRating), [false, true, true, true, false, false, false]);
  });

  // ---------- comentarios ----------
  test('makeComment recorta y pone autor por defecto', () => {
    const now = new Date('2026-01-02T03:04:05.000Z');
    assert.equal(core.makeComment({ author: '  ', text: ' hola ' }, now),
      { author: 'Anónimo', text: 'hola', date: '2026-01-02T03:04:05.000Z' });
  });

  test('validateComment', () => {
    const now = new Date();
    assert.equal(core.validateComment(core.makeComment({ text: 'ok' }, now)), []);
    assert.equal(core.validateComment(core.makeComment({ text: '   ' }, now)).length, 1);
    assert.equal(core.validateComment(core.makeComment({ text: 'x'.repeat(501), author: 'y'.repeat(41) }, now)).length, 2);
  });

  test('addComment y addRating son inmutables; comentario nuevo primero', () => {
    const empty = core.emptyRecord();
    const r = core.addRating(core.addComment(core.addComment(empty, { text: 'a' }), { text: 'b' }), 4);
    assert.equal(empty, { comments: [], ratings: [] });
    assert.equal(r.comments.map((c) => c.text), ['b', 'a']);
    assert.equal(core.summarize(r).average, 4);
    assert.equal(core.summarize(r).count, 1);
  });

  // ---------- rutas ----------
  test('parseRoute', () => {
    assert.equal(core.parseRoute(''), { view: 'search', id: '', params: {} });
    assert.equal(core.parseRoute('#/movie/tt123'), { view: 'movie', id: 'tt123', params: {} });
    assert.equal(core.parseRoute('#/search?title=star%20wars&year=1977&page=2'),
      { view: 'search', id: '', params: { title: 'star wars', year: '1977', page: '2' } });
  });

  test('searchHash y parseRoute son inversas', () => {
    const params = { title: 'El señor & los anillos', year: '2001', page: '3' };
    assert.equal(core.parseRoute(core.searchHash(params)).params, params);
    assert.equal(core.parseRoute(core.movieHash('tt 1/2')).id, 'tt 1/2');
  });

  // ---------- store ----------
  test('store: registro nuevo vacío, update persiste', () => {
    const store = App.createStore(fakeStorage());
    assert.equal(store.read('tt1'), { comments: [], ratings: [] });
    store.update('tt1', (r) => core.addRating(r, 5));
    store.update('tt1', (r) => core.addRating(r, 3));
    assert.equal(store.read('tt1').ratings, [5, 3]);
    assert.equal(store.read('tt2').ratings, []);
  });

  test('store: datos corruptos o incompletos no rompen', () => {
    const storage = fakeStorage();
    const store = App.createStore(storage);
    storage.setItem('omdb:bad', '{no json');
    storage.setItem('omdb:old', '{"ratings":[2]}');
    assert.equal(store.read('bad'), { comments: [], ratings: [] });
    assert.equal(store.read('old'), { comments: [], ratings: [2] });
  });

  // ---------- api ----------
  test('api.search usa la URL correcta y parsea', async () => {
    let requested = '';
    const api = App.createApi(config, (url) => { requested = url; return fakeFetch(SEARCH_OK)(); });
    const result = await api.search({ title: 'Matrix', page: '2' });
    assert.ok(requested.includes('s=Matrix') && requested.includes('page=2'), requested);
    assert.equal(result.data.total, 23);
  });

  test('api.detail parsea', async () => {
    const result = await App.createApi(config, fakeFetch(DETAIL_OK)).detail('tt1');
    assert.equal(result.data.title, 'Matrix');
  });

  test('api: fallo de red -> { data: null, error }', async () => {
    const result = await App.createApi(config, () => Promise.reject(new Error('offline'))).search({ title: 'x' });
    assert.equal(result.data, null);
    assert.ok(result.error.includes('No se pudo conectar'));
  });

  // ---------- views ----------
  test('views.stars pinta 5 estrellas', () => {
    const html = views.stars(2.5);
    assert.equal((html.match(/class="star /g) || []).length, 5);
    assert.ok(html.includes('2.5 de 5'));
  });

  test('views.results escapa títulos y usa placeholder sin póster', () => {
    const html = views.results(core.parseSearch({
      Response: 'True', totalResults: '1',
      Search: [{ imdbID: 'tt9', Title: '<script>x</script>', Year: '2000', Poster: 'N/A' }],
    }), { title: 'x' });
    assert.ok(!html.includes('<script>'), 'no debe inyectar HTML');
    assert.ok(html.includes('data:image/svg+xml'), 'placeholder');
    assert.ok(html.includes('#/movie/tt9'));
  });

  test('views.results muestra el error', () => {
    assert.ok(views.results(core.failure('Movie not found!'), {}).includes('No se encontraron películas.'));
  });

  test('views.comments escapa el contenido', () => {
    const html = views.comments([{ author: '<b>', text: '<i>hola</i>', date: '2026-01-01T00:00:00.000Z' }]);
    assert.ok(html.includes('&lt;i&gt;hola&lt;/i&gt;') && !html.includes('<b>'));
  });
})(window.App);
