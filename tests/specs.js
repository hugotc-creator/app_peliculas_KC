/* Especificaciones de core, store, api y views. */
(function (App) {
  'use strict';

  const { core, views } = App;
  const config = { apiKey: 'KEY', baseUrl: 'https://www.omdbapi.com/' };

  const fakeStorage = () => {
    const map = new Map();
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
  };
  const fakeResponse = (json, { status = 200, headers = {} } = {}) => ({
    ok: status < 400, status, json: () => Promise.resolve(json), headers: { get: (name) => headers[name] || null },
  });
  const fakeFetch = (json) => () => Promise.resolve(fakeResponse(json));

  // Simula Supabase: routes = { 'GET movies': respuesta, ... }; sin ruta -> 201 vacío. Anota cada petición.
  const fakeSupabase = (routes = {}) => {
    const calls = [];
    const fetchFn = (url, options) => {
      const path = url.replace('https://x.supabase.co/rest/v1/', '');
      calls.push({ path, method: options.method, headers: options.headers, body: options.body && JSON.parse(options.body) });
      return Promise.resolve(routes[`${options.method} ${path.split('?')[0]}`] || fakeResponse(null, { status: 201 }));
    };
    return { calls, db: App.createSupabaseDb({ url: 'https://x.supabase.co/', anonKey: 'ANON' }, fetchFn) };
  };

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

  test('api.detail incluye la respuesta original para guardarla', async () => {
    const result = await App.createApi(config, fakeFetch(DETAIL_OK)).detail('tt1');
    assert.equal(result.raw, DETAIL_OK);
  });

  // ---------- catálogo (core) ----------
  test('movieRow guarda OMDb completo y columnas limpias', () => {
    assert.equal(core.movieRow(SEARCH_OK.Search[0]),
      { imdb_id: 'tt1', title: 'Matrix', year: '1999', poster: null, omdb: SEARCH_OK.Search[0] });
  });

  test('filterCatalog filtra sin distinguir mayúsculas y pagina de 10 en 10', () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ imdb_id: `tt${i}`, title: i % 2 ? `Star ${i}` : `Otra ${i}`, year: '2000', poster: null }));
    const page2 = core.filterCatalog(rows, { title: ' STAR ', page: '2' });
    assert.equal([page2.total, page2.pages, page2.items.length], [11, 2, 1]);
    assert.equal(page2.items[0], { id: 'tt21', title: 'Star 21', year: '2000', poster: null });
    assert.equal(core.filterCatalog(rows, {}).total, 23);
  });

  test('parseTotal lee Content-Range', () => {
    assert.equal([core.parseTotal('0-9/57'), core.parseTotal('*/0'), core.parseTotal(null)], [57, 0, 0]);
  });

  // ---------- base local ----------
  test('db local: guarda una vez, lista lo más reciente primero y filtra', async () => {
    const db = App.createLocalDb(fakeStorage());
    assert.equal((await db.getMovie('tt1')).data, null);
    await db.saveMovie(DETAIL_OK);
    await db.saveMovie({ ...DETAIL_OK, imdbID: 'tt2', Title: 'Alien' });
    await db.saveMovie({ ...DETAIL_OK, Title: 'Duplicada' }); // ya existe: no se toca
    assert.equal((await db.getMovie('tt1')).data.title, 'Matrix');
    assert.equal((await db.listMovies({})).data.items.map((m) => m.title), ['Alien', 'Matrix']);
    assert.equal((await db.listMovies({ title: 'mat' })).data.total, 1);
  });

  test('db local: comentarios y votos', async () => {
    const db = App.createLocalDb(fakeStorage());
    await db.addRating('tt1', 4);
    const { data } = await db.addComment('tt1', { author: 'Ana', text: 'hola', date: 'd' });
    assert.equal(data, { comments: [{ author: 'Ana', text: 'hola', date: 'd' }], ratings: [4] });
  });

  // ---------- Supabase ----------
  test('supabase: getMovie consulta por imdb_id con la anon key y parsea', async () => {
    const { db, calls } = fakeSupabase({ 'GET movies': fakeResponse([{ omdb: DETAIL_OK }]) });
    const { data } = await db.getMovie('tt1');
    assert.equal(data.title, 'Matrix');
    assert.equal(calls[0].path, 'movies?select=omdb&imdb_id=eq.tt1');
    assert.equal([calls[0].headers.apikey, calls[0].headers.Authorization], ['ANON', 'Bearer ANON']);
  });

  test('supabase: getMovie sin resultados -> null', async () => {
    const { db } = fakeSupabase({ 'GET movies': fakeResponse([]) });
    assert.equal(await db.getMovie('tt9'), { data: null, error: null });
  });

  test('supabase: saveMovie inserta ignorando duplicados', async () => {
    const { db, calls } = fakeSupabase();
    assert.equal((await db.saveMovie(DETAIL_OK)).data, true);
    assert.equal([calls[0].method, calls[0].path, calls[0].body.imdb_id], ['POST', 'movies', 'tt1']);
    assert.ok(calls[0].headers.Prefer.includes('resolution=ignore-duplicates'));
  });

  test('supabase: listMovies filtra, pagina y lee el total', async () => {
    const { db, calls } = fakeSupabase({
      'GET movies': fakeResponse([{ imdb_id: 'tt1', title: 'Matrix', year: '1999', poster: null }], { headers: { 'Content-Range': '10-10/11' } }),
    });
    const { data } = await db.listMovies({ title: 'star wars', page: '2' });
    assert.equal([data.total, data.pages, data.items[0].id], [11, 2, 'tt1']);
    assert.ok(calls[0].path.includes('title=ilike.*star%20wars*') && calls[0].path.includes('limit=10&offset=10'), calls[0].path);
    assert.equal(calls[0].headers.Prefer, 'count=exact');
  });

  test('supabase: addComment inserta y devuelve el registro actualizado', async () => {
    const { db, calls } = fakeSupabase({
      'GET comments': fakeResponse([{ author: 'Ana', body: 'hola', created_at: 'd' }]),
      'GET ratings': fakeResponse([{ value: 5 }, { value: 2 }]),
    });
    const { data } = await db.addComment('tt1', { author: 'Ana', text: 'hola' });
    assert.equal(calls[0].body, { imdb_id: 'tt1', author: 'Ana', body: 'hola' });
    assert.equal(data, { comments: [{ author: 'Ana', text: 'hola', date: 'd' }], ratings: [5, 2] });
  });

  test('supabase: error HTTP o de red -> { data: null, error }', async () => {
    const { db } = fakeSupabase({ 'POST ratings': fakeResponse({}, { status: 401 }) });
    const result = await db.addRating('tt1', 3);
    assert.equal(result.data, null);
    assert.ok(result.error.includes('base de datos'));
    const offline = App.createSupabaseDb({ url: 'https://x', anonKey: 'k' }, () => Promise.reject(new Error('x')));
    assert.ok((await offline.readRecord('tt1')).error);
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

  test('views.catalogResults: vacío, sin coincidencias y paginación del catálogo', () => {
    const empty = { data: { items: [], total: 0, pages: 0 }, error: null };
    assert.ok(views.catalogResults(empty, {}).includes('catálogo está vacío'));
    assert.ok(views.catalogResults(empty, { title: 'x' }).includes('Ninguna película'));
    const many = { data: { items: [], total: 30, pages: 3 }, error: null };
    assert.ok(views.catalogResults(many, { page: '1' }).includes('#/catalog?page=2'));
  });

  // ---------- importación ----------
  test('importPages solo acepta las opciones permitidas', () => {
    assert.equal(['3', 10, '7', undefined, '-1'].map(core.importPages), [3, 10, 1, 1, 1]);
  });

  test('tallyImport cuenta por estado', () => {
    assert.equal(core.tallyImport([{ status: 'saved' }, { status: 'existing' }, { status: 'saved' }, { status: 'failed' }]),
      { saved: 2, existing: 1, failed: 1 });
    assert.equal(core.tallyImport([]), { saved: 0, existing: 0, failed: 0 });
  });

  test('db local: existingIds', async () => {
    const db = App.createLocalDb(fakeStorage());
    await db.saveMovie(DETAIL_OK);
    assert.equal((await db.existingIds(['tt1', 'tt2'])).data, ['tt1']);
  });

  test('supabase: existingIds hace una sola consulta in.(...) y no consulta si no hay ids', async () => {
    const { db, calls } = fakeSupabase({ 'GET movies': fakeResponse([{ imdb_id: 'tt1' }]) });
    assert.equal((await db.existingIds(['tt1', 'tt2'])).data, ['tt1']);
    assert.equal(calls[0].path, 'movies?select=imdb_id&imdb_id=in.(tt1,tt2)');
    assert.equal((await db.existingIds([])).data, []);
    assert.equal(calls.length, 1);
  });

  test('views.results de búsqueda ofrece importar con el mismo título y año', () => {
    const html = views.results(core.parseSearch(SEARCH_OK), { title: 'star wars', year: '1977', page: '2' });
    assert.ok(html.includes('#/import?title=star%20wars&amp;year=1977'), html);
    assert.ok(!views.results(core.parseSearch(SEARCH_OK), {}, core.catalogHash).includes('#/import'));
  });

  test('views.importProgress muestra contadores, enlaces y escapa', () => {
    const html = views.importProgress({
      log: [{ id: 'tt1', title: '<b>X</b>', year: '1999', status: 'saved' }, { id: 'tt2', title: 'Y', year: '2000', status: 'existing' }],
      status: 'Importación terminada', done: true, error: null,
    });
    assert.ok(html.includes('1 nueva(s) · 1 ya estaban · 0 con error'));
    assert.ok(html.includes('#/movie/tt1') && html.includes('#/catalog'));
    assert.ok(!html.includes('<b>X</b>'));
  });

  test('views.comments escapa el contenido', () => {
    const html = views.comments([{ author: '<b>', text: '<i>hola</i>', date: '2026-01-01T00:00:00.000Z' }]);
    assert.ok(html.includes('&lt;i&gt;hola&lt;/i&gt;') && !html.includes('<b>'));
  });
})(window.App);
