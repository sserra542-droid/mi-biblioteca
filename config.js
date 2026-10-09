/* Datos de conexión con tu proyecto de Supabase.
   Los dos valores están en Supabase → Project Settings → API (o "API Keys").

   IMPORTANTE:
   - Acá va SOLO la clave pública ("anon" / "publishable"). Está pensada para estar en el navegador:
     la seguridad la dan las reglas de la base de datos (esquema.sql), que dejan a cada cuenta ver solo sus libros.
   - NUNCA pegues acá la clave "service_role" / "secret": esa da acceso total y no debe salir de Supabase. */
window.BIBLIOTECA_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-CLAVE-PUBLICA"
};
