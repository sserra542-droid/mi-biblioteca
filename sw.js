/* Service worker: guarda la aplicación y las portadas para poder abrirla sin conexión.
   Si cambiás archivos de la app, subí el número de versión para que los celulares se actualicen. */
const VERSION = 'biblioteca-v1';
const BASE = [
  './', 'index.html', 'estilos.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Datos y sesión: siempre por red (la app guarda su propia copia para leer sin conexión).
  const esSupabase = url.hostname.endsWith('.supabase.co');
  const esPortadaPropia = esSupabase && url.pathname.includes('/storage/v1/object/public/');
  if ((esSupabase && !esPortadaPropia) || url.hostname === 'openlibrary.org') return;

  if (url.origin === self.location.origin) {
    // Archivos de la app: primero la red (para recibir actualizaciones), si no hay, la copia guardada.
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Tipografías, librería y portadas: primero la copia guardada, si no existe se descarga y se guarda.
  e.respondWith(
    caches.match(req).then(guardada => guardada || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
      return res;
    }))
  );
});
