-- Base de datos de CineBusca. Ejecutar una vez en Supabase: SQL Editor → New query → pegar → Run.
-- Se puede volver a ejecutar sin romper nada.

-- Películas: la respuesta completa de OMDb (omdb) + columnas para listar y filtrar.
create table if not exists public.movies (
  imdb_id    text primary key,
  title      text not null,
  year       text,
  poster     text,
  omdb       jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  imdb_id    text not null references public.movies (imdb_id) on delete cascade,
  author     text not null check (char_length(author) between 1 and 40),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id         bigint generated always as identity primary key,
  imdb_id    text not null references public.movies (imdb_id) on delete cascade,
  value      smallint not null check (value between 1 and 5),
  created_at timestamptz not null default now()
);

create index if not exists comments_imdb_id_idx on public.comments (imdb_id);
create index if not exists ratings_imdb_id_idx  on public.ratings (imdb_id);
create index if not exists movies_created_at_idx on public.movies (created_at desc);

-- Permisos: cualquiera puede leer y añadir; nadie puede editar ni borrar desde la web.
grant select, insert on public.movies, public.comments, public.ratings to anon, authenticated;

alter table public.movies   enable row level security;
alter table public.comments enable row level security;
alter table public.ratings  enable row level security;

drop policy if exists "leer movies" on public.movies;
drop policy if exists "crear movies" on public.movies;
drop policy if exists "leer comments" on public.comments;
drop policy if exists "crear comments" on public.comments;
drop policy if exists "leer ratings" on public.ratings;
drop policy if exists "crear ratings" on public.ratings;

create policy "leer movies"    on public.movies   for select to anon, authenticated using (true);
create policy "crear movies"   on public.movies   for insert to anon, authenticated with check (true);
create policy "leer comments"  on public.comments for select to anon, authenticated using (true);
create policy "crear comments" on public.comments for insert to anon, authenticated with check (true);
create policy "leer ratings"   on public.ratings  for select to anon, authenticated using (true);
create policy "crear ratings"  on public.ratings  for insert to anon, authenticated with check (true);
