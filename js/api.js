/* Cliente OMDb. fetch se inyecta para poder probarlo sin red. */
(function (App) {
  'use strict';

  App.createApi = (config, fetchFn) => {
    const { core } = App;

    const get = (params, parse) => fetchFn(core.buildUrl(config, params))
      .then((response) => response.json())
      .then(parse)
      .catch(() => core.failure('No se pudo conectar con OMDb. Revisa tu conexión.'));

    return {
      search: (params) => get(core.searchParams(params), core.parseSearch),
      // raw: la respuesta original de OMDb, que es lo que se guarda en el catálogo.
      detail: (id) => get(core.detailParams(id), (json) => ({ ...core.parseDetail(json), raw: json })),
    };
  };
})(window.App = window.App || {});
