-- OPCIONAL — Colección compartida.
-- Por defecto (esquema.sql) cada cuenta tiene su propia biblioteca privada.
-- Ejecutá este archivo DESPUÉS de esquema.sql solo si querés que todas las personas
-- con cuenta vean y editen UNA MISMA colección de libros.
-- Para volver a bibliotecas privadas, ejecutá de nuevo esquema.sql.

drop policy if exists "ver mis libros"      on public.libros;
drop policy if exists "editar mis libros"   on public.libros;
drop policy if exists "borrar mis libros"   on public.libros;
drop policy if exists "ver todos los libros"    on public.libros;
drop policy if exists "editar todos los libros" on public.libros;
drop policy if exists "borrar todos los libros" on public.libros;

create policy "ver todos los libros"    on public.libros for select to authenticated using (true);
create policy "editar todos los libros" on public.libros for update to authenticated using (true) with check (true);
create policy "borrar todos los libros" on public.libros for delete to authenticated using (true);
-- Agregar sigue igual: cada libro queda anotado con la cuenta que lo cargó (user_id).
