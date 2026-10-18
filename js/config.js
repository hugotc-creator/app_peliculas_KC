/* Configuración. Consigue una API key gratuita en https://www.omdbapi.com/apikey.aspx */
(function (App) {
  'use strict';

  App.config = {
    apiKey: '8812e20', // solo la key, no la URL completa
    baseUrl: 'https://www.omdbapi.com/',
  };
})(window.App = window.App || {});
