# Mi biblioteca — guía de publicación

Aplicación web instalable (PWA) para llevar tu diario de lectura, con tres secciones: **Leídos**, **Leyendo** y **Quiero leer**.

- **Frontend:** HTML, CSS y JavaScript sin compilación. Se publica subiendo la carpeta tal cual.
- **Base de datos y cuentas:** Supabase (PostgreSQL + registro e inicio de sesión).
- **Portadas:** se buscan en Open Library, se pegan como enlace o se suben como imagen.

## Dos formas de usarla

**Modo de prueba (sin configurar nada).** Mientras `config.js` tenga los valores de ejemplo, la app funciona completa y guarda los libros en el navegador donde se usa. Sirve para previsualizarla (doble clic en `index.html`) y para compartirla por enlace (Paso 3): cada persona que entra tiene su propia biblioteca en su propio navegador, sin cuentas y sin mezclarse con la de nadie. Límites: los libros no pasan de un dispositivo a otro, se pierden si se borran los datos del navegador, y conviene usar portadas buscadas o por enlace (las imágenes subidas ocupan el espacio del navegador).

**Con base de datos (Supabase).** Al completar `config.js` (Pasos 1 y 2) aparecen el registro y el inicio de sesión, y los libros se guardan online: los ves desde cualquier dispositivo. Los libros cargados en modo de prueba no se pasan solos a la base.

### Biblioteca propia o colección compartida

- **Cada persona su biblioteca (por defecto):** con `esquema.sql`, cada cuenta ve y modifica solo sus libros.
- **Una sola colección para todos:** ejecutá además `supabase/modo-compartido.sql`. Todas las cuentas ven y editan los mismos libros. Para volver atrás, ejecutá otra vez `esquema.sql`.

Para solo probar y compartir el enlace, podés saltar directo al **Paso 3**.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `estilos.css`, `app.js` | La aplicación |
| `config.js` | **El único archivo que tenés que editar**: URL y clave pública de Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lo que la hace instalable y usable sin conexión |
| `supabase/esquema.sql` | Crea la tabla, las reglas de privacidad y el espacio para portadas |

## Paso 1 — Crear la base de datos (Supabase)

1. Entrá a https://supabase.com, creá una cuenta gratuita y un proyecto nuevo ("New project"). Elegí una región cercana (por ejemplo São Paulo) y guardá la contraseña de la base que te pide.
2. En el menú del proyecto abrí **SQL Editor → New query**, pegá todo el contenido de `supabase/esquema.sql` y tocá **Run**. Debe terminar con "Success".
3. Abrí **Project Settings → API** (o "API Keys") y copiá dos valores:
   - **Project URL** (termina en `.supabase.co`)
   - La clave **anon / publishable** (la pública)

## Paso 2 — Conectar la app con la base

Abrí `config.js` con el Bloc de notas y reemplazá los dos valores de ejemplo por los tuyos:

```js
window.BIBLIOTECA_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJ... o sb_publishable_..."
};
```

**Seguridad de las claves**

- La clave *anon / publishable* está hecha para estar en el navegador, así que puede ir en este archivo. Lo que protege tus datos son las reglas del `esquema.sql` (Row Level Security): cada cuenta solo puede leer y modificar sus propios libros.
- La clave **service_role / secret** da acceso total. **No la pegues nunca** en `config.js` ni en ningún archivo de esta carpeta.
- Como no hay claves privadas, esta app no necesita variables de entorno.

## Paso 3 — Publicarla en Internet

La forma más simple, sin instalar nada:

1. Entrá a https://app.netlify.com/drop y creá una cuenta gratuita.
2. Arrastrá la carpeta `mi-biblioteca` completa a la página.
3. Netlify te da un enlace del tipo `https://nombre-al-azar.netlify.app`. Podés cambiar el nombre en *Site configuration → Change site name*.

Para actualizar la app más adelante, arrastrá de nuevo la carpeta en la sección *Deploys* del sitio. Cualquier servicio de sitios estáticos con HTTPS sirve igual (Vercel, Cloudflare Pages, GitHub Pages).

## Paso 4 — Decirle a Supabase cuál es tu enlace

En Supabase abrí **Authentication → URL Configuration**:

- En **Site URL** poné tu enlace de Netlify.
- En **Redirect URLs** agregá ese mismo enlace.

Así los correos de confirmación y de recuperación de contraseña vuelven a tu app.

## Paso 5 — Crear tu cuenta

1. Abrí tu enlace en Chrome y tocá **Crear una cuenta**.
2. Elegí un **nombre de usuario** (único, de 3 a 20 caracteres), tu **correo** y una **contraseña**. No se pide ningún otro dato.
3. Abrí el correo que te llega y tocá el enlace de confirmación. Después ingresá con tu correo y contraseña.

- La sesión queda iniciada en ese dispositivo hasta que toques "Cerrar sesión".
- Dentro de la app se muestra el nombre de usuario ("¡Hola, lector123!"), nunca el correo.
- **Olvidé mi contraseña** envía un enlace al correo; al abrirlo, la app pide la contraseña nueva. Funciona solo con la app publicada (Paso 3), no abriéndola desde el archivo.
- El servicio de correos incluido en el plan gratuito de Supabase admite pocos envíos por hora. Alcanza para probar con algunas personas.

Si querés que nadie más pueda registrarse: una vez creada tu cuenta, desactivá los registros nuevos en **Authentication → Sign In / Providers** (opción "Allow new users to sign up").

## Paso 6 — Instalarla en el celular

- **Android (Chrome):** abrí el enlace, tocá el menú ⋮ y elegí **Instalar aplicación** o **Agregar a la pantalla principal**.
- **iPhone (Safari):** abrí el enlace, tocá **Compartir** y elegí **Agregar a inicio**.
- **Computadora (Chrome):** tocá el ícono de instalar en la barra de direcciones.

## Cómo funciona sin conexión

Después de abrirla una vez con Internet, la app se abre sin conexión y muestra los libros y portadas que ya había cargado. Para agregar, editar o quitar libros hace falta conexión.

## Datos que guarda cada libro

Tabla `libros`: `id` (identificador único), `user_id` (dueño), `titulo`, `autor`, `portada_url`, `calificacion` (1 a 5), `estado` (`quiero_leer`, `leyendo`, `leido`), `fecha_agregado`, `fecha_inicio`, `fecha_fin`, y la ficha de reseña (`tipo_serie`, `serie`, `genero`, `paginas`, `formato`, `resena`).

## Cosas a tener en cuenta

- En el plan gratuito, Supabase puede pausar un proyecto que pasa varios días sin uso. Se reactiva desde el panel y los datos no se pierden.
- Si ya habías ejecutado `esquema.sql` antes de esta versión, ejecutalo de nuevo: agrega la tabla de nombres de usuario sin tocar tus libros.
- Si modificás archivos de la app, subí el número de `VERSION` en `sw.js` para que los dispositivos tomen la versión nueva.
