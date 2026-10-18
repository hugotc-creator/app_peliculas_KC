/* Persistencia de comentarios y calificaciones. El storage se inyecta (localStorage o uno falso en tests). */
(function (App) {
  'use strict';

  App.createStore = (storage, prefix = 'omdb:') => {
    const key = (id) => prefix + id;

    // JSON.parse(null) -> null y el spread lo ignora: un registro nuevo no es un caso especial.
    const read = (id) => {
      try {
        return { ...App.core.emptyRecord(), ...JSON.parse(storage.getItem(key(id))) };
      } catch (_) {
        return App.core.emptyRecord(); // datos corruptos
      }
    };

    // Se escribe aplicando una transformación pura al registro actual.
    const update = (id, transform) => {
      const next = transform(read(id));
      storage.setItem(key(id), JSON.stringify(next));
      return next;
    };

    return { read, update };
  };
})(window.App = window.App || {});
