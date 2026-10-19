/* Base de datos propia de películas, comentarios y calificaciones.
   Dos implementaciones con la misma interfaz (todo devuelve Promise<{ data, error }>):
   - Supabase (API REST de PostgREST), compartida por todos los usuarios.
   - Local (localStorage), si Supabase no está configurado. */
(function (App) {
  'use strict';

  const ok = (data) => ({ data, error: null });

  // ---------- Supabase ----------
  App.createSupabaseDb = ({ url, anonKey }, fetchFn) => {
    const { core } = App;
    const base = `${url.replace(/\/+$/, '')}/rest/v1/`;
    const eq = (value) => `eq.${encodeURIComponent(value)}`;

    const request = (path, { method = 'GET', body, prefer } = {}) => fetchFn(base + path, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    });

    const rows = (path) => request(path).then((response) => response.json());
    const insert = (table, body, prefer = 'return=minimal') => request(table, { method: 'POST', body, prefer });

    // Cualquier fallo (red, permisos, tabla inexistente) -> { data: null, error }.
    const safe = (promise) => promise.then(ok)
      .catch(() => core.failure('No se pudo acceder a la base de datos (Supabase).'));

    const readRecord = (id) => Promise.all([
      rows(`comments?select=author,body,created_at&imdb_id=${eq(id)}&order=created_at.desc`),
      rows(`ratings?select=value&imdb_id=${eq(id)}`),
    ]).then(([comments, ratings]) => ({
      comments: comments.map((c) => ({ author: c.author, text: c.body, date: c.created_at })),
      ratings: ratings.map((r) => r.value),
    }));

    return {
      name: 'Supabase',

      getMovie: (id) => safe(rows(`movies?select=omdb&imdb_id=${eq(id)}`)
        .then((found) => (found.length ? core.parseDetail(found[0].omdb).data : null))),

      // Si ya existe no se toca (ON CONFLICT DO NOTHING): solo requiere permiso de inserción.
      saveMovie: (json) => safe(insert('movies', core.movieRow(json), 'resolution=ignore-duplicates,return=minimal')
        .then(() => true)),

      // Cuáles de estos ids ya están guardados (una sola consulta).
      existingIds: (ids) => (ids.length
        ? safe(rows(`movies?select=imdb_id&imdb_id=in.(${ids.map(encodeURIComponent).join(',')})`)
          .then((found) => found.map((row) => row.imdb_id)))
        : Promise.resolve(ok([]))),

      listMovies: ({ title, page }) => {
        const { from, to } = core.pageRange(page);
        const q = String(title || '').trim();
        const filter = q ? `&title=ilike.${encodeURIComponent(`*${q}*`)}` : '';
        const path = `movies?select=imdb_id,title,year,poster&order=created_at.desc${filter}&limit=${to - from + 1}&offset=${from}`;
        // count=exact: el total llega en la cabecera Content-Range.
        return safe(request(path, { prefer: 'count=exact' }).then((response) => response.json()
          .then((found) => core.toPage(found.map(core.rowToSummary), core.parseTotal(response.headers.get('Content-Range'))))));
      },

      readRecord: (id) => safe(readRecord(id)),

      addComment: (id, comment) => safe(insert('comments', { imdb_id: id, author: comment.author, body: comment.text })
        .then(() => readRecord(id))),

      addRating: (id, value) => safe(insert('ratings', { imdb_id: id, value })
        .then(() => readRecord(id))),
    };
  };

  // ---------- Local (localStorage) ----------
  App.createLocalDb = (storage, catalogKey = 'omdb-catalog') => {
    const { core } = App;
    const store = App.createStore(storage);

    // { imdbID: fila } en orden de inserción.
    const readCatalog = () => {
      try {
        return JSON.parse(storage.getItem(catalogKey)) || {};
      } catch (_) {
        return {};
      }
    };

    const saveMovie = (json) => {
      const catalog = readCatalog();
      if (!catalog[json.imdbID]) {
        catalog[json.imdbID] = core.movieRow(json);
        storage.setItem(catalogKey, JSON.stringify(catalog));
      }
      return true;
    };

    const getMovie = (id) => {
      const row = readCatalog()[id];
      return row ? core.parseDetail(row.omdb).data : null;
    };

    const run = (fn) => Promise.resolve().then(fn).then(ok);

    return {
      name: 'local (este navegador)',
      getMovie: (id) => run(() => getMovie(id)),
      saveMovie: (json) => run(() => saveMovie(json)),
      existingIds: (ids) => run(() => { const catalog = readCatalog(); return ids.filter((id) => catalog[id]); }),
      listMovies: (params) => run(() => core.filterCatalog(Object.values(readCatalog()).reverse(), params)),
      readRecord: (id) => run(() => store.read(id)),
      addComment: (id, comment) => run(() => store.update(id, (record) => core.addComment(record, comment))),
      addRating: (id, value) => run(() => store.update(id, (record) => core.addRating(record, value))),
    };
  };
})(window.App = window.App || {});
