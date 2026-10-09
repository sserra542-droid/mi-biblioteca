/* Mi biblioteca — aplicación web conectada a Supabase (base de datos + cuentas de usuario). */
(function(){
  'use strict';
  window.BIBLIOTECA_APP = true;
  const $ = id => document.getElementById(id);
  const cfg = window.BIBLIOTECA_CONFIG || {};

  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}) });
  }

  const sinConfig = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /TU-PROYECTO|TU-CLAVE/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY);
  /* MODO DE PRUEBA: si config.js no tiene los datos de Supabase, la app funciona igual y guarda
     los libros en este navegador. Al completar config.js pasa sola a usar la base de datos online. */
  const LOCAL = sinConfig;
  if(!LOCAL && !window.supabase){
    const m = $('config-falta'); m.hidden = false;
    m.querySelector('p:last-child').textContent = 'No se pudo cargar la aplicación. Revisá tu conexión a Internet y volvé a abrirla.';
    return;
  }
  const sb = LOCAL ? null : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const ESTADOS = ['leido','leyendo','quiero_leer'];
  const TEXTOS = {
    leido:{ uno:'libro leído', varios:'libros leídos', agregar:'+ Agregar libro leído', vacio:'Tus estantes esperan el primer libro',
      ayuda:'Agregá un libro y completá su ficha: portada, calificación, fechas y tu reseña.' },
    leyendo:{ uno:'libro en lectura', varios:'libros en lectura', agregar:'+ Agregar lectura en curso', vacio:'No estás leyendo nada por ahora',
      ayuda:'Agregá el libro que tenés empezado, o pasá uno desde «Quiero leer» cuando lo empieces.' },
    quiero_leer:{ uno:'libro por leer', varios:'libros por leer', agregar:'+ Agregar a Quiero leer', vacio:'Tu lista de próximas lecturas está vacía',
      ayuda:'Guardá acá los libros que te interesan. Cuando empieces o termines uno, pasa a la otra sección con todos sus datos.' }
  };
  const CAMPOS = ['tipo_serie','serie','genero','fecha_inicio','fecha_fin','paginas','resena'];

  let usuario = null, libros = [], cargado = false, borrando = null;
  let vista = ESTADOS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'leido';
  let edit = { id:null, rating:0, portada:'', archivo:null, original:'' };

  /* ---------- Sesión: registro, ingreso y recuperación de contraseña ---------- */
  let modo = 'ingresar', recuperando = false, sesionActual = null;
  const MODOS = {
    ingresar:  { titulo:'Ingresá a tu biblioteca', boton:'Ingresar' },
    crear:     { titulo:'Creá tu cuenta', boton:'Crear cuenta' },
    recuperar: { titulo:'Te enviamos un enlace para elegir una contraseña nueva', boton:'Enviar enlace' },
    nueva:     { titulo:'Elegí tu nueva contraseña', boton:'Guardar contraseña' }
  };
  function mensajeAcceso(txt, ok){ const m = $('a-mensaje'); m.textContent = txt || ''; m.hidden = !txt; m.className = ok ? 'ok' : 'error' }
  function ponerModo(m, conservarMensaje){
    modo = m;
    $('a-titulo').textContent = MODOS[m].titulo; $('a-enviar').textContent = MODOS[m].boton;
    $('a-campo-usuario').hidden = m !== 'crear';
    $('a-campo-correo').hidden = m === 'nueva';
    $('a-campo-clave').hidden = m === 'recuperar';
    $('a-clave-rotulo').textContent = m === 'nueva' ? 'Nueva contraseña' : 'Contraseña';
    $('a-clave').autocomplete = (m === 'crear' || m === 'nueva') ? 'new-password' : 'current-password';
    $('a-clave').value = '';
    $('a-ir-crear').hidden = $('a-ir-recuperar').hidden = m !== 'ingresar';
    $('a-ir-ingresar').hidden = m === 'ingresar' || m === 'nueva';
    if(!conservarMensaje) mensajeAcceso('');
  }
  function mostrarSegunSesion(sesion){
    sesionActual = sesion;
    const u = sesion ? sesion.user : null;
    const cambio = (u && u.id) !== (usuario && usuario.id);
    usuario = u;
    const dentro = !!u && !recuperando;
    $('acceso').hidden = dentro; $('app').hidden = !dentro;
    if(u){
      const nombre = u.user_metadata && u.user_metadata.usuario;   // el correo no se muestra en pantalla
      $('cuenta-correo').textContent = nombre ? '¡Hola, ' + nombre + '!' : '¡Hola!';
      if(cambio) setTimeout(cargar, 0);
    } else { libros = []; cargado = false }
  }
  if(LOCAL) mostrarSegunSesion({ user:{ id:'local', email:'' } });
  else {
    sb.auth.onAuthStateChange((ev, sesion)=>{
      if(ev === 'PASSWORD_RECOVERY'){ recuperando = true; ponerModo('nueva') }
      mostrarSegunSesion(sesion);
    });
    sb.auth.getSession().then(r=>mostrarSegunSesion(r.data ? r.data.session : null));
  }

  function traducir(e){
    const t = (e && e.message) || '';
    if(/Invalid login credentials/i.test(t)) return 'El correo o la contraseña no coinciden.';
    if(/Email not confirmed/i.test(t)) return 'Falta confirmar tu correo. Abrí el mensaje que te enviamos y tocá el enlace.';
    if(/already registered/i.test(t)) return 'Ese correo ya tiene una cuenta. Ingresá con tu contraseña o recuperala.';
    if(/Database error saving new user/i.test(t)) return 'Ese nombre de usuario ya está en uso. Elegí otro.';
    if(/at least 6/i.test(t)) return 'La contraseña debe tener al menos 6 caracteres.';
    if(/different from the old/i.test(t)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
    if(/rate limit|security purposes/i.test(t)) return 'Pediste varios correos seguidos. Esperá unos minutos y probá de nuevo.';
    if(/valid(ate)? email|invalid.*email/i.test(t)) return 'Ese correo electrónico no es válido.';
    if(/fetch|network/i.test(t)) return 'No hay conexión a Internet. Probá de nuevo cuando vuelva.';
    return 'No se pudo completar: ' + t;
  }
  /* Los enlaces de los correos solo pueden volver a la app cuando está publicada (http/https). */
  const volverA = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined;
  async function enviarAcceso(){
    const email = $('a-correo').value.trim(), password = $('a-clave').value, nombre = $('a-usuario').value.trim();
    const correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if(modo === 'crear' && !/^[A-Za-z0-9_.]{3,20}$/.test(nombre)){ mensajeAcceso('El nombre de usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.'); return }
    if(modo !== 'nueva' && !correoOk){ mensajeAcceso('Escribí un correo electrónico válido.'); return }
    if(modo !== 'recuperar' && password.length < 6){ mensajeAcceso('La contraseña debe tener al menos 6 caracteres.'); return }
    mensajeAcceso(''); $('a-enviar').disabled = true;
    try{
      if(modo === 'ingresar'){
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if(error) throw error;
      } else if(modo === 'crear'){
        const libre = await sb.rpc('usuario_disponible', { nombre });
        if(libre.error) throw libre.error;
        if(libre.data === false){ mensajeAcceso('Ese nombre de usuario ya está en uso. Elegí otro.') }
        else {
          const { data, error } = await sb.auth.signUp({ email, password, options:{ data:{ usuario:nombre }, emailRedirectTo:volverA } });
          if(error) throw error;
          if(data.user && data.user.identities && data.user.identities.length === 0) mensajeAcceso('Ese correo ya tiene una cuenta. Ingresá con tu contraseña o recuperala.');
          else if(!data.session){ ponerModo('ingresar', true); mensajeAcceso('Cuenta creada. Te enviamos un correo a ' + email + ': tocá el enlace para confirmarla y después ingresá.', true) }
        }
      } else if(modo === 'recuperar'){
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo:volverA });
        if(error) throw error;
        ponerModo('ingresar', true); mensajeAcceso('Si ese correo tiene una cuenta, en unos minutos te llega un enlace para elegir una contraseña nueva.', true);
      } else {
        const { error } = await sb.auth.updateUser({ password });
        if(error) throw error;
        recuperando = false; ponerModo('ingresar'); mostrarSegunSesion(sesionActual);
      }
    }catch(e){ mensajeAcceso(traducir(e)) }
    $('a-enviar').disabled = false;
  }
  $('form-acceso').addEventListener('submit', e=>{ e.preventDefault(); enviarAcceso() });
  $('a-ir-crear').addEventListener('click', ()=>ponerModo('crear'));
  $('a-ir-recuperar').addEventListener('click', ()=>ponerModo('recuperar'));
  $('a-ir-ingresar').addEventListener('click', ()=>ponerModo('ingresar'));
  $('salir').addEventListener('click', ()=>{ sb.auth.signOut() });

  /* ---------- Datos ---------- */
  const claveCache = () => 'biblioteca-cache-' + (usuario ? usuario.id : '');
  function leerCache(){ try{ return JSON.parse(localStorage.getItem(claveCache()) || 'null') }catch(e){ return null } }
  function guardarCache(){ try{ localStorage.setItem(claveCache(), JSON.stringify(libros)) }catch(e){} }
  function pie(txt){ $('pie').textContent = txt || '' }

  async function cargar(){
    if(!usuario) return;
    if(LOCAL){ libros = leerCache() || []; cargado = true; pintar(); return }
    const copia = leerCache();
    if(copia){ libros = copia; cargado = true; }
    pintar();
    const { data, error } = await sb.from('libros').select('*');
    if(error){
      cargado = true;
      pie(copia ? 'Sin conexión: estás viendo los libros guardados la última vez. Para hacer cambios necesitás Internet.' : 'No se pudo abrir tu biblioteca. Revisá tu conexión y recargá la página.');
    } else { libros = data || []; cargado = true; guardarCache(); pie('') }
    pintar();
  }
  window.addEventListener('online', ()=>{ if(usuario) cargar() });

  function nuevoId(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) }
  async function guardarLibro(id, fila){
    if(LOCAL){
      const copia = libros.slice(), i = copia.findIndex(l=>l.id===id);
      const d = i >= 0 ? Object.assign({}, copia[i], fila) : Object.assign({ id:nuevoId(), fecha_agregado:new Date().toISOString(), estado:'quiero_leer' }, fila);
      if(i >= 0) copia[i] = d; else copia.push(d);
      localStorage.setItem(claveCache(), JSON.stringify(copia));   // si no hay espacio, falla acá y no se pierde nada
      libros = copia; pintar(); return d;
    }
    const q = id ? sb.from('libros').update(fila).eq('id', id) : sb.from('libros').insert(fila);
    const { data, error } = await q.select().single();
    if(error) throw error;
    const i = libros.findIndex(l=>l.id===data.id);
    if(i >= 0) libros[i] = data; else libros.push(data);
    guardarCache(); pintar();
    return data;
  }
  async function borrarLibro(l){
    if(LOCAL){ libros = libros.filter(x=>x.id!==l.id); guardarCache(); pintar(); return }
    const { error } = await sb.from('libros').delete().eq('id', l.id);
    if(error) throw error;
    borrarImagen(l.portada_url);
    libros = libros.filter(x=>x.id!==l.id); guardarCache(); pintar();
  }
  /* Las portadas subidas viven en el bucket «portadas», dentro de una carpeta con el id del usuario. */
  function rutaPropia(url){
    const marca = '/storage/v1/object/public/portadas/';
    const i = (url || '').indexOf(marca);
    if(i < 0 || !url.startsWith(cfg.SUPABASE_URL)) return null;
    return decodeURIComponent(url.slice(i + marca.length));
  }
  function borrarImagen(url){ const r = rutaPropia(url); if(r) sb.storage.from('portadas').remove([r]).catch(()=>{}) }
  async function subirImagen(blob){
    if(LOCAL) return new Promise((ok, mal)=>{ const fr = new FileReader(); fr.onload = ()=>ok(fr.result); fr.onerror = mal; fr.readAsDataURL(blob) });
    const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const ruta = usuario.id + '/' + id + '.jpg';
    const { error } = await sb.storage.from('portadas').upload(ruta, blob, { contentType:'image/jpeg', cacheControl:'31536000' });
    if(error) throw error;
    return sb.storage.from('portadas').getPublicUrl(ruta).data.publicUrl;
  }

  /* ---------- Piezas ---------- */
  function el(tag, cls, txt){ const e = document.createElement(tag); if(cls) e.className = cls; if(txt != null) e.textContent = txt; return e }
  function tela(cont, titulo, autor){
    cont.textContent = '';
    let h = 0; for(const c of (titulo || '')) h = (h*31 + c.charCodeAt(0)) >>> 0;
    const t = el('div','tela'); t.style.background = 'var(--tela' + (h%5+1) + ')';
    t.appendChild(el('b', null, titulo || 'Título')); t.appendChild(el('i', null, autor || 'Autor'));
    cont.appendChild(t);
  }
  function tapa(cont, titulo, autor, portada){
    if(!portada){ tela(cont, titulo, autor); return }
    cont.textContent = '';
    const im = el('img'); im.alt = 'Portada de ' + (titulo || 'libro'); im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
    im.addEventListener('error', ()=>tela(cont, titulo, autor));
    im.src = portada; cont.appendChild(im);
  }
  function estrellas(cont, valor, alElegir, nombre){
    cont.textContent = '';
    for(let n = 1; n <= 5; n++){
      const b = el('button', n <= valor ? 'on' : '', '★'); b.type = 'button';
      b.setAttribute('role','radio'); b.setAttribute('aria-checked', String(n === valor));
      b.setAttribute('aria-label', n + (n === 1 ? ' estrella' : ' estrellas') + (nombre ? ' para ' + nombre : ''));
      b.addEventListener('click', ()=>alElegir(n));
      cont.appendChild(b);
    }
  }
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cmp = (a, b) => (a || '').localeCompare(b || '', 'es', { sensitivity:'base' });
  function hoy(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') }
  function fallo(){ pie(navigator.onLine === false ? 'Sin conexión: el cambio no se guardó. Probá de nuevo cuando vuelva Internet.' : 'No se pudo guardar el cambio. Probá de nuevo.') }

  /* ---------- Pintar ---------- */
  function irA(v){ vista = v; borrando = null; try{ history.replaceState(null, '', '#' + v) }catch(e){} pintar() }
  function cambiarEstado(l, cambios, destino, abrirFicha){
    guardarLibro(l.id, cambios).then(d=>{ pie(''); irA(destino); if(abrirFicha) abrir(d) }).catch(fallo);
  }
  function pintar(){
    const T = TEXTOS[vista], cuenta = {};
    ESTADOS.forEach(e=>{ cuenta[e] = libros.filter(l=>l.estado===e).length });
    ESTADOS.forEach(e=>{ $('n-' + e).textContent = cargado ? cuenta[e] : ''; $('tab-' + e).setAttribute('aria-pressed', String(e === vista)) });
    const n = cuenta[vista], esLeido = vista === 'leido';
    $('campo-filtro').hidden = !esLeido; $('btn-agregar').textContent = T.agregar;

    const cont = $('contador'); cont.textContent = '';
    if(!cargado) cont.textContent = 'Abriendo los estantes…';
    else { cont.appendChild(el('strong', null, String(n))); cont.appendChild(document.createTextNode(n === 1 ? T.uno : T.varios)) }

    const q = norm($('buscar').value.trim()), f = esLeido ? Number($('filtro').value) : 0;
    const orden = (!esLeido && /mejor|peor/.test($('orden').value)) ? 'titulo' : $('orden').value;
    const lista = libros.filter(l=>{
      if(l.estado !== vista) return false;
      if(q && !norm(l.titulo).includes(q) && !norm(l.autor).includes(q)) return false;
      const r = l.calificacion || 0;
      if(f > 0 && r < f) return false;
      if(f < 0 && r > -f) return false;
      return true;
    });
    lista.sort({
      reciente:(a,b)=>cmp(b.fecha_agregado, a.fecha_agregado),
      titulo:(a,b)=>cmp(a.titulo, b.titulo),
      autor:(a,b)=>cmp(a.autor, b.autor) || cmp(a.titulo, b.titulo),
      mejor:(a,b)=>(b.calificacion||0) - (a.calificacion||0) || cmp(a.titulo, b.titulo),
      peor:(a,b)=>(a.calificacion||0) - (b.calificacion||0) || cmp(a.titulo, b.titulo)
    }[orden]);

    const est = $('estante'), aviso = $('aviso'); est.textContent = ''; aviso.textContent = '';
    aviso.hidden = lista.length > 0 || !cargado;
    if(cargado && !lista.length){
      if(!n){
        const fz = el('div','fantasmas'); fz.setAttribute('aria-hidden','true'); for(let k = 0; k < 5; k++) fz.appendChild(el('i')); aviso.appendChild(fz);
        aviso.appendChild(el('h2', null, T.vacio)); aviso.appendChild(el('p', null, T.ayuda));
        const b = el('button','boton principal', T.agregar); b.type = 'button'; b.addEventListener('click', ()=>abrir()); aviso.appendChild(b);
      } else {
        aviso.appendChild(el('h2', null, 'Ningún libro coincide'));
        aviso.appendChild(el('p', null, 'Probá con otra búsqueda o cambiá el filtro de calificación.'));
        const b = el('button','boton','Ver todos'); b.type = 'button';
        b.addEventListener('click', ()=>{ $('buscar').value = ''; $('filtro').value = '0'; pintar() }); aviso.appendChild(b);
      }
    }
    for(const l of lista){
      const art = el('article','libro');
      const zona = el('div','tapa-zona'), tp = el('div','tapa'); tapa(tp, l.titulo, l.autor, l.portada_url);
      tp.style.cursor = 'pointer'; tp.addEventListener('click', ()=>abrir(l)); zona.appendChild(tp);
      const fi = el('div','ficha');
      fi.appendChild(el('h2', null, l.titulo)); fi.appendChild(el('p','autor', l.autor));
      if(esLeido){
        const es = el('div','estrellas'); es.setAttribute('role','radiogroup'); es.setAttribute('aria-label','Calificación de ' + l.titulo);
        estrellas(es, l.calificacion || 0, v=>{ if(v !== l.calificacion) guardarLibro(l.id, { calificacion:v }).then(()=>pie('')).catch(fallo) }, l.titulo);
        fi.appendChild(es);
      } else if(vista === 'leyendo'){
        const b = el('button','boton marcar','✓ Marcar como leído'); b.type = 'button';
        b.addEventListener('click', ()=>cambiarEstado(l, { estado:'leido', fecha_fin:l.fecha_fin || hoy() }, 'leido', true)); fi.appendChild(b);
      } else {
        const b = el('button','boton marcar','Empezar a leer'); b.type = 'button';
        b.addEventListener('click', ()=>cambiarEstado(l, { estado:'leyendo', fecha_inicio:l.fecha_inicio || hoy() }, 'leyendo', false)); fi.appendChild(b);
        const c = el('button','enlace','Ya lo leí'); c.type = 'button'; c.style.alignSelf = 'flex-start';
        c.addEventListener('click', ()=>cambiarEstado(l, { estado:'leido', fecha_fin:l.fecha_fin || hoy() }, 'leido', true)); fi.appendChild(c);
      }
      const ac = el('div','acciones');
      if(borrando === l.id){
        ac.appendChild(el('span', null, '¿Quitar este libro?'));
        const si = el('button','enlace peligro','Sí, quitar'); si.type = 'button';
        si.addEventListener('click', ()=>{ borrando = null; borrarLibro(l).then(()=>pie('')).catch(()=>{ fallo(); pintar() }) });
        const no = el('button','enlace','No'); no.type = 'button'; no.addEventListener('click', ()=>{ borrando = null; pintar() });
        ac.appendChild(si); ac.appendChild(no);
      } else {
        const ed = el('button','enlace','Abrir ficha'); ed.type = 'button'; ed.setAttribute('aria-label','Abrir la ficha de ' + l.titulo); ed.addEventListener('click', ()=>abrir(l));
        const qu = el('button','enlace','Quitar'); qu.type = 'button'; qu.setAttribute('aria-label','Quitar ' + l.titulo); qu.addEventListener('click', ()=>{ borrando = l.id; pintar() });
        ac.appendChild(ed); ac.appendChild(qu);
      }
      fi.appendChild(ac); art.appendChild(zona); art.appendChild(fi); est.appendChild(art);
    }
  }

  /* ---------- Ficha ---------- */
  function previa(){
    tapa($('previa'), $('f-titulo').value.trim(), $('f-autor').value.trim(), edit.portada);
    $('quitar-portada').hidden = !edit.portada;
  }
  function pintarEstrellasForm(){ estrellas($('f-estrellas'), edit.rating, v=>{ edit.rating = v; pintarEstrellasForm() }) }
  function ajustarEstado(){
    const e = $('f-estado').value; $('form').dataset.estado = e;
    $('dlg-titulo').textContent = e === 'leido' ? 'Reseña del libro' : (e === 'leyendo' ? 'Leyendo' : 'Quiero leer');
  }
  function soltarArchivo(){ if(edit.archivo && edit.portada.startsWith('blob:')) URL.revokeObjectURL(edit.portada); edit.archivo = null }
  function abrir(l){
    edit = { id:l ? l.id : null, rating:l ? (l.calificacion || 0) : 0, portada:l ? (l.portada_url || '') : '', archivo:null, original:l ? (l.portada_url || '') : '' };
    $('f-titulo').value = l ? l.titulo : ''; $('f-autor').value = l ? l.autor : '';
    $('f-estado').value = l ? l.estado : vista;
    { // si el libro trae un género que no está en la lista, se agrega para no perderlo
      const sel = $('f-genero'), val = l && l.genero;
      sel.querySelectorAll('option[data-extra]').forEach(o=>o.remove());
      if(val && ![...sel.options].some(o=>o.value === val)){ const o = el('option', null, val); o.dataset.extra = '1'; sel.appendChild(o) }
    }
    CAMPOS.forEach(c=>{ $('f-' + c).value = l && l[c] != null ? l[c] : '' });
    document.querySelectorAll('input[name=formato]').forEach(r=>{ r.checked = !!l && l.formato === r.value });
    $('f-portada').value = ''; $('f-portada-url').value = (rutaPropia(edit.portada) || /^(data|blob):/.test(edit.portada)) ? '' : edit.portada;
    $('guardar').textContent = l ? 'Guardar cambios' : 'Guardar libro'; $('guardar').disabled = false;
    $('f-error').hidden = true;
    $('busqueda').hidden = !!l; $('b-texto').value = ''; $('b-resultados').textContent = '';
    $('b-estado').textContent = 'Los datos y las portadas vienen del catálogo abierto Open Library.';
    ajustarEstado(); ajustarSerie(); pintarEstrellasForm(); previa();
    const d = $('dlg'); if(d.showModal) d.showModal(); else d.setAttribute('open','');
    if(!l) $('b-texto').focus();
  }
  function cerrar(){ soltarArchivo(); const d = $('dlg'); if(d.close) d.close(); else d.removeAttribute('open') }
  function error(msg){ const e = $('f-error'); e.textContent = msg; e.hidden = false }

  function cargarImagen(archivo){
    if(!archivo || !/^image\//.test(archivo.type)){ error('Ese archivo no es una imagen. Elegí un JPG o PNG de la portada.'); return }
    const url = URL.createObjectURL(archivo), im = new Image();
    im.onload = ()=>{
      const k = Math.min(1, 600/im.width, 900/im.height);
      const c = document.createElement('canvas'); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b=>{
        if(!b){ error('No se pudo preparar esa imagen. Probá con otra.'); return }
        soltarArchivo(); edit.archivo = b; edit.portada = URL.createObjectURL(b);
        $('f-portada-url').value = ''; $('f-error').hidden = true; previa();
      }, 'image/jpeg', .85);
    };
    im.onerror = ()=>{ URL.revokeObjectURL(url); error('No se pudo leer esa imagen. Probá con otro archivo.') };
    im.src = url;
  }

  /* Búsqueda de datos y portada en Open Library (catálogo abierto, sin clave). */
  let buscando = false;
  async function buscarDatos(){
    const q = $('b-texto').value.trim(), est = $('b-estado'), res = $('b-resultados');
    if(!q || buscando) return;
    buscando = true; $('b-buscar').disabled = true; res.textContent = ''; est.textContent = 'Buscando…';
    try{
      const r = await fetch('https://openlibrary.org/search.json?limit=6&fields=title,author_name,cover_i,number_of_pages_median,first_publish_year&q=' + encodeURIComponent(q));
      if(!r.ok) throw new Error('http');
      const docs = ((await r.json()).docs || []).filter(d=>d && d.title);
      if(!docs.length) est.textContent = 'No encontré ese libro. Probá con otro texto o cargá los datos a mano.';
      else {
        est.textContent = 'Elegí la edición. Después podés corregir cualquier dato.';
        for(const d of docs){
          const autor = (d.author_name || [])[0] || '', img = d.cover_i ? 'https://covers.openlibrary.org/b/id/' + d.cover_i : '';
          const b = el('button'); b.type = 'button';
          if(img){ const m = el('img'); m.src = img + '-S.jpg'; m.alt = ''; m.loading = 'lazy'; b.appendChild(m) }
          const tx = el('span'); tx.appendChild(el('b', null, d.title));
          tx.appendChild(el('small', null, [autor, d.first_publish_year, img ? '' : 'sin portada'].filter(Boolean).join(' · ')));
          b.appendChild(tx);
          b.addEventListener('click', ()=>{
            $('f-titulo').value = String(d.title).slice(0, 200); $('f-autor').value = autor.slice(0, 150);
            if(d.number_of_pages_median > 0) $('f-paginas').value = d.number_of_pages_median;
            if(img){ soltarArchivo(); edit.portada = img + '-L.jpg'; $('f-portada-url').value = edit.portada }
            res.textContent = ''; est.textContent = img ? 'Datos y portada completados.' : 'Datos completados. Este libro no tiene portada en el catálogo: podés subir una.';
            previa();
          });
          res.appendChild(b);
        }
      }
    }catch(e){ est.textContent = 'No se pudo buscar ahora. Revisá tu conexión o cargá los datos a mano.' }
    buscando = false; $('b-buscar').disabled = false;
  }

  /* ---------- Eventos ---------- */
  $('btn-agregar').addEventListener('click', ()=>abrir());
  $('cancelar').addEventListener('click', cerrar);
  $('dlg').addEventListener('cancel', soltarArchivo);
  ESTADOS.forEach(e=>$('tab-' + e).addEventListener('click', ()=>irA(e)));
  $('f-estado').addEventListener('change', ajustarEstado);
  function ajustarSerie(){ $('renglon-serie').hidden = !$('f-tipo_serie').value }
  $('f-tipo_serie').addEventListener('change', ajustarSerie);
  $('f-titulo').addEventListener('input', previa); $('f-autor').addEventListener('input', previa);
  $('elegir-portada').addEventListener('click', ()=>$('f-portada').click());
  $('previa').addEventListener('click', ()=>$('f-portada').click());
  $('f-portada').addEventListener('change', e=>cargarImagen(e.target.files[0]));
  $('f-portada-url').addEventListener('change', ()=>{
    const u = $('f-portada-url').value.trim();
    if(u && !/^https:\/\//i.test(u)){ error('El enlace de la portada tiene que empezar con https://'); return }
    soltarArchivo(); edit.portada = u; $('f-error').hidden = true; previa();
  });
  $('quitar-portada').addEventListener('click', ()=>{ soltarArchivo(); edit.portada = ''; $('f-portada').value = ''; $('f-portada-url').value = ''; previa() });
  $('dlg').addEventListener('paste', e=>{
    const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i=>i.type.startsWith('image/'));
    if(it){ e.preventDefault(); cargarImagen(it.getAsFile()) }
  });
  $('b-buscar').addEventListener('click', buscarDatos);
  $('b-texto').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); buscarDatos() } });

  $('form').addEventListener('submit', async e=>{
    e.preventDefault();
    const titulo = $('f-titulo').value.trim(), autor = $('f-autor').value.trim(), estado = $('f-estado').value;
    if(!titulo){ error('Escribí el título del libro.'); $('f-titulo').focus(); return }
    if(!autor){ error('Escribí el nombre del autor.'); $('f-autor').focus(); return }
    $('guardar').disabled = true;
    try{
      let portada = edit.portada;
      if(edit.archivo) portada = await subirImagen(edit.archivo);
      const v = c => $('f-' + c).value.trim() || null;
      const fmt = document.querySelector('input[name=formato]:checked');
      const fila = {
        titulo, autor, estado, portada_url: portada || null,
        calificacion: estado === 'leido' && edit.rating ? edit.rating : null,
        tipo_serie: v('tipo_serie'), serie: v('tipo_serie') ? v('serie') : null, genero: v('genero'), fecha_inicio: v('fecha_inicio'),
        fecha_fin: estado === 'leido' ? (v('fecha_fin') || (edit.id ? null : hoy())) : null,
        paginas: Number($('f-paginas').value) > 0 ? Math.round(Number($('f-paginas').value)) : null,
        formato: fmt ? fmt.value : null, resena: v('resena')
      };
      await guardarLibro(edit.id, fila);
      if(edit.original && edit.original !== portada) borrarImagen(edit.original);
      pie(''); if(estado !== vista) irA(estado);
      cerrar();
    }catch(err){
      error(LOCAL ? 'No se pudo guardar: el navegador se quedó sin espacio. Usá portadas buscadas o por enlace en lugar de imágenes subidas.' : navigator.onLine === false ? 'Sin conexión: no se pudo guardar. Probá de nuevo cuando vuelva Internet.' : 'No se pudo guardar el libro. Probá de nuevo en un momento.');
    }
    $('guardar').disabled = false;
  });

  ['input','change'].forEach(ev=>$('buscar').addEventListener(ev, pintar));
  $('orden').addEventListener('change', ()=>{ try{ localStorage.setItem('biblioteca-orden', $('orden').value) }catch(e){} pintar() });
  $('filtro').addEventListener('change', pintar);
  try{ const o = localStorage.getItem('biblioteca-orden'); if(o) $('orden').value = o }catch(e){}
  if(!$('orden').value) $('orden').value = 'reciente';
  if(LOCAL) $('salir').parentNode.textContent = 'Modo de prueba: tus libros se guardan solo en este navegador.';
})();
