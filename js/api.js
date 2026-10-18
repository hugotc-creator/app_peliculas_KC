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
      detail: (id) => get(core.detailParams(id), core.parseDetail),
    };
  };
})(window.App = window.App || {});
