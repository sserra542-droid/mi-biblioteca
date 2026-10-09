-- Mi biblioteca — base de datos.
-- Pegá TODO este archivo en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.

-- 1) Tabla de libros -------------------------------------------------------
create table if not exists public.libros (
  id             uuid primary key default gen_random_uuid(),            -- identificador único
  user_id        uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,          -- dueño del libro
  titulo         text not null,
  autor          text not null,
  portada_url    text,                                                  -- enlace a la portada
  calificacion   smallint check (calificacion between 1 and 5),         -- estrellas (solo leídos)
  estado         text not null default 'quiero_leer'
                 check (estado in ('quiero_leer', 'leyendo', 'leido')),
  fecha_agregado timestamptz not null default now(),
  fecha_inicio   date,
  fecha_fin      date,                                                  -- fin de la lectura
  -- ficha de reseña
  tipo_serie     text check (tipo_serie in ('bilogia', 'trilogia', 'tetralogia', 'saga')),  -- vacío = libro único
  serie          text,                                                  -- nombre de la saga
  genero         text,
  paginas        integer check (paginas > 0),
  formato        text check (formato in ('papel', 'digital', 'audio')),
  resena         text
);

-- Por si la tabla ya existía de una versión anterior:
alter table public.libros add column if not exists tipo_serie text
  check (tipo_serie in ('bilogia', 'trilogia', 'tetralogia', 'saga'));

create index if not exists libros_user_id_idx on public.libros (user_id);

-- 2) Privacidad: cada cuenta ve y modifica solo sus propios libros ---------
alter table public.libros enable row level security;

drop policy if exists "ver mis libros"      on public.libros;
drop policy if exists "agregar mis libros"  on public.libros;
drop policy if exists "editar mis libros"   on public.libros;
drop policy if exists "borrar mis libros"   on public.libros;
drop policy if exists "ver todos los libros"    on public.libros;
drop policy if exists "editar todos los libros" on public.libros;
drop policy if exists "borrar todos los libros" on public.libros;

create policy "ver mis libros"     on public.libros for select to authenticated using (auth.uid() = user_id);
create policy "agregar mis libros" on public.libros for insert to authenticated with check (auth.uid() = user_id);
create policy "editar mis libros"  on public.libros for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "borrar mis libros"  on public.libros for delete to authenticated using (auth.uid() = user_id);

-- 3) Portadas subidas desde la app ----------------------------------------
-- Bucket público de solo lectura (las portadas no son datos privados); cada cuenta
-- solo puede subir o borrar dentro de su propia carpeta, hasta 2 MB por imagen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portadas', 'portadas', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subir mis portadas"  on storage.objects;
drop policy if exists "borrar mis portadas" on storage.objects;

create policy "subir mis portadas" on storage.objects for insert to authenticated
  with check (bucket_id = 'portadas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar mis portadas" on storage.objects for delete to authenticated
  using (bucket_id = 'portadas' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) Perfiles: nombre de usuario único ------------------------------------
-- El nombre se elige al crear la cuenta. Es independiente del correo, que no se muestra en la app.
create table if not exists public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  usuario text not null check (usuario ~ '^[A-Za-z0-9_.]{3,20}$'),
  creado  timestamptz not null default now()
);
-- Único sin distinguir mayúsculas: "Lector123" y "lector123" cuentan como el mismo.
create unique index if not exists perfiles_usuario_unico on public.perfiles (lower(usuario));

alter table public.perfiles enable row level security;
drop policy if exists "ver mi perfil" on public.perfiles;
create policy "ver mi perfil" on public.perfiles for select to authenticated using (auth.uid() = id);

-- Al registrarse una cuenta se crea su perfil. Si el nombre ya existe, el registro se rechaza.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data ->> 'usuario' is not null then
    insert into public.perfiles (id, usuario) values (new.id, new.raw_user_meta_data ->> 'usuario');
  end if;
  return new;
end;
$$;
revoke all on function public.crear_perfil() from public, anon, authenticated;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- Permite avisar "ese nombre ya está en uso" antes de crear la cuenta, sin exponer la tabla.
create or replace function public.usuario_disponible(nombre text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.perfiles where lower(usuario) = lower(nombre));
$$;
revoke all on function public.usuario_disponible(text) from public;
grant execute on function public.usuario_disponible(text) to anon, authenticated;
