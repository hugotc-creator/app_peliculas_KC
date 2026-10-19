/* Configuración. Consigue una API key gratuita en https://www.omdbapi.com/apikey.aspx */
(function (App) {
  'use strict';

  App.config = {
    apiKey: '8812e20', // solo la key, no la URL completa
    baseUrl: 'https://www.omdbapi.com/',
    // Base de datos propia en Supabase (Project Settings → API). La anon key es pública por diseño:
    // los permisos los controlan las políticas de supabase/schema.sql.
    // Si se dejan vacíos, se usa una base local en el navegador.
    supabase: {
      url: 'https://dboosrnxhkygwnrberte.supabase.co', // sin /rest/v1
      // Solo la clave "anon public" (empieza por eyJ...). Nunca la secret / service_role.
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib29zcm54aGt5Z3ducmJlcnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTQ5NDksImV4cCI6MjEwNzkzMDk0OX0.rGnI4sCx-PcboISWst73mIiQCxAhzzBF0loKpjnpxv8',
    },
  };
})(window.App = window.App || {});
