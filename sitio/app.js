(function () {
  'use strict';
  const C = window.SITE;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const waUrl = text => 'https://wa.me/' + C.whatsapp + (text ? '?text=' + encodeURIComponent(text) : '');

  /* ---------- Datos fijos en la página ---------- */
  $$('[data-tel]').forEach(a => {
    a.href = 'tel:' + C.telefonoLink;
    if (a.closest('.info')) a.textContent = C.telefonoVisible;
  });
  $$('[data-wa]').forEach(a => { a.href = waUrl('Hola CristalAuto, quiero consultar por un vidrio para mi vehículo.'); });
  $('#dir').textContent = C.direccion;
  $('#anio').textContent = new Date().getFullYear();
  const q = encodeURIComponent(C.mapaQuery);
  $('#mapa').src = 'https://www.google.com/maps?q=' + q + '&hl=es&output=embed';
  $('#maplink').href = 'https://www.google.com/maps/search/?api=1&query=' + q;
  const nombres = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
  $('#redes').innerHTML = Object.entries(C.redes || {})
    .filter(([, url]) => url)
    .map(([k, url]) => `<a href="${url}" target="_blank" rel="noopener">${nombres[k] || k}</a>`).join('');
  $('#redesPie').innerHTML = $('#redes').innerHTML;

  /* Fotos reales, galería y opiniones: aparecen cuando están en config.js */
  if (C.fotos && C.fotos.hero) {
    const hero = $('.hero');
    hero.style.setProperty('--foto', `url("${C.fotos.hero}")`);
    hero.classList.add('has-photo');
  }
  if (C.galeria && C.galeria.length) {
    $('#galeria').innerHTML = C.galeria.map(g => `<figure><img src="${g.src}" alt="${g.alt || ''}" loading="lazy"></figure>`).join('');
    $('#trabajos').hidden = false;
  }
  if (C.resenas && C.resenas.length) {
    const G = C.google || {};
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const estrellas = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    const color = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 55% 42%)`; };
    $('#resenas').innerHTML = C.resenas.map(r => {
      const n = Math.max(0, Math.min(5, Math.round(r.estrellas || 5)));
      const nombre = esc(r.nombre || 'Cliente');
      return `<article class="rev"><header><span class="av" style="background:${color(nombre)}">${nombre.trim().charAt(0).toUpperCase()}</span>
        <div><strong>${nombre}</strong>${r.fecha ? `<small>${esc(r.fecha)}</small>` : ''}</div></header>
        <div class="stars" role="img" aria-label="${n} de 5 estrellas">${estrellas(n)}</div><p>${esc(r.texto)}</p></article>`;
    }).join('');
    if (G.calificacion) {
      const nota = String(G.calificacion).replace('.', ',');
      $('#gHead').innerHTML = `<div class="g-score"><b>${nota}</b><div><span class="stars" aria-hidden="true">${estrellas(Math.round(G.calificacion))}</span>
        <small>${G.total ? `Basado en ${esc(G.total)} reseñas` : 'Calificación'} en Google Maps</small></div></div>` +
        (G.enlace ? `<a class="btn btn-ghost" href="${esc(G.enlace)}" target="_blank" rel="noopener">Ver todas en Google Maps</a>` : '');
    } else if (G.enlace) {
      $('#gHead').innerHTML = `<small class="g-src">Reseñas de clientes en Google Maps</small><a class="btn btn-ghost" href="${esc(G.enlace)}" target="_blank" rel="noopener">Ver todas en Google Maps</a>`;
    }
    const tr = $('#resenas');
    const paso = () => Math.max(260, tr.clientWidth * 0.8);
    $('#revPrev').addEventListener('click', () => tr.scrollBy({ left: -paso(), behavior: 'smooth' }));
    $('#revNext').addEventListener('click', () => tr.scrollBy({ left: paso(), behavior: 'smooth' }));
    $('#opiniones').hidden = false;
    $('#menuOpiniones').hidden = false;
  }

  /* Menú del celular */
  const burger = $('#burger'), menu = $('#menu');
  const cerrar = () => { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); };
  burger.addEventListener('click', () => {
    const abrir = !menu.classList.contains('open');
    menu.classList.toggle('open', abrir);
    burger.setAttribute('aria-expanded', String(abrir));
  });
  $$('#menu a').forEach(a => a.addEventListener('click', cerrar));

  /* ---------- Abierto / cerrado (hora de Paraguay) ---------- */
  function estado() {
    const el = $('#estado');
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date());
    const get = t => p.find(x => x.type === t).value;
    const dia = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    const min = (+get('hour') % 24) * 60 + +get('minute');
    const h = C.horarios[dia];
    const abierto = h && min >= h[0] && min < h[1];
    el.className = 'eyebrow ' + (abierto ? 'open' : 'closed');
    el.textContent = abierto ? 'Abierto ahora · San Lorenzo' : 'Cerrado ahora · escribinos y te respondemos al abrir';
    const bd = $('#badgeEstado');
    bd.textContent = abierto ? 'Abierto ahora' : 'Cerrado ahora';
    bd.className = 'badge ' + (abierto ? 'badge-ok' : 'badge-no');
  }
  estado();
  setInterval(estado, 60000);

  /* ---------- Cotizador por pasos ---------- */
  const TIPOS = [
    { id: 'Sedán', k: 'sedan' },
    { id: 'Hatchback', k: 'hatch' },
    { id: 'SUV / Camioneta', k: 'suv' },
    { id: 'Camioneta pick-up', k: 'pickup' },
    { id: 'Furgón / utilitario', k: 'van' },
    { id: 'Monovolumen / familiar', k: 'suv' },
  ];
  const kDe = id => (TIPOS.find(t => t.id === id) || { k: 'sedan' }).k;
  /* Catálogo del inventario (ver catalogo.js): una fila por vehículo cubierto por cada vidrio */
  const FLAT = [];
  (window.CATALOGO || []).forEach(f => f.veh.forEach(([marca, modelo, carr]) =>
    FLAT.push({ cod: f.cod, tipo: f.tipo, desde: f.desde, hasta: f.hasta || 9999, marca, modelo, carr })));
  const alfa = (a, b) => a.localeCompare(b, 'es');
  const unicos = arr => [...new Set(arr)];

  const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const form = $('#cotizador');
  const btn = $('#enviar'), err = $('#err'), sigue = $('#sigue'), atras = $('#atras');
  const val = n => form.elements[n].value.trim();
  const checked = n => $$(`input[name="${n}"]:checked`, form).map(i => i.value);
  const marca = () => val('marca') === '__otra' ? val('marcaOtra') : val('marca');
  const modelo = () => (val('modelo') && val('modelo') !== '__otro') ? val('modelo') : val('modeloOtro');
  const carpeta = () => slug(marca() + ' ' + modelo());
  let paso = 1;

  /* Fotos reales: se usan si existen en img/autos/<marca-modelo>/ (ver catalogo.js) */
  const cache = {};
  const hayFoto = (dir, vista) => {
    const u = `img/autos/${dir}/${vista}.jpg`;
    return cache[u] || (cache[u] = new Promise(res => { const i = new Image(); i.onload = () => res(u); i.onerror = () => res(null); i.src = u; }));
  };
  const logoMarca = m => (window.LOGOS || {})[m] ? `<img src="img/marcas/${window.LOGOS[m]}.svg" alt="">` : '';
  const nombreAuto = () => [marca(), modelo()].filter(Boolean).join(' ');
  function fotoHTML(u, claveVidrio, dir) {
    const poly = (window.HIGHLIGHT[dir] || {})[claveVidrio];
    const polys = poly ? (Array.isArray(poly[0][0]) ? poly : [poly]) : [];
    const sv = polys.length ? `<svg class="foto-hl" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${polys.map(p => `<polygon points="${p.map(q => q.join(',')).join(' ')}"/>`).join('')}</svg>` : '';
    return `<img src="${u}" alt="${nombreAuto()}" loading="lazy">${sv}`;
  }

  /* Año, marca, modelo y carrocería: se filtran según el inventario */
  const anioNum = () => +val('anio') || 0;
  const delAnio = () => FLAT.filter(f => !anioNum() || (anioNum() >= f.desde && anioNum() <= f.hasta));
  const anioMax = new Date().getFullYear() + 1;
  $('#fAnio').innerHTML = '<option value="">Elegí el año</option>' +
    Array.from({ length: anioMax - 1979 }, (_, i) => `<option>${anioMax - i}</option>`).join('');
  $('#fTipo').innerHTML = '<option value="">Elegí la carrocería</option>' + TIPOS.map(t => `<option value="${t.id}">${t.id}</option>`).join('');

  function cargarMarcas() {
    const sel = $('#fMarca'), actual = sel.value;
    const lista = unicos(delAnio().map(f => f.marca)).sort(alfa);
    sel.innerHTML = '<option value="">Elegí la marca</option>' + lista.map(m => `<option>${m}</option>`).join('') +
      '<option value="__otra">Mi marca no está en la lista</option>';
    sel.value = (lista.includes(actual) || actual === '__otra') ? actual : '';
    cargarModelos();
  }
  function cargarModelos() {
    const m = val('marca'), sel = $('#fModelo'), otro = $('#fModeloOtro'), actual = sel.value;
    const lista = unicos(delAnio().filter(f => f.marca === m).map(f => f.modelo)).sort(alfa);
    if (m && m !== '__otra') {
      sel.innerHTML = '<option value="">Elegí el modelo</option>' + lista.map(x => `<option>${x}</option>`).join('') +
        '<option value="__otro">Mi modelo no está en la lista</option>';
      sel.value = (lista.includes(actual) || actual === '__otro') ? actual : '';
      sel.hidden = false;
    } else {
      sel.innerHTML = ''; sel.hidden = true;
    }
    if (sel.hidden) otro.hidden = false; else if (sel.value !== '__otro') { otro.hidden = true; otro.value = ''; }
  }
  /* Códigos de vidrio que sirven para el auto elegido */
  const codigos = tipo => {
    if (!anioNum() || !val('marca') || val('marca') === '__otra' || !val('modelo') || val('modelo') === '__otro') return [];
    return unicos(delAnio().filter(f => f.tipo === tipo && f.marca === val('marca') && f.modelo === val('modelo')).map(f => f.cod));
  };
  cargarMarcas();

  /* Vista previa del vehículo (foto real si existe, si no un dibujo) */
  let ultimaVista = '';
  function verAuto() {
    const tipo = val('tipo'), dir = carpeta();
    const clave = dir + '|' + tipo;
    if (clave === ultimaVista) return;
    ultimaVista = clave;
    const prev = $('#vehPrev');
    prev.classList.remove('foto');
    prev.classList.toggle('vacio', !tipo);
    const insignia = marca() && modelo() ? `<span class="veh-badge">${logoMarca(marca())}<b>${nombreAuto()}</b></span>` : '';
    const AL = window.AUTO_LINEA || {};
    const imagen = (!tipo || (AL.tipos || []).includes(kDe(tipo))) && AL.izq;
    prev.classList.toggle('linea', !!imagen);
    prev.classList.remove('foto');
    prev.innerHTML = (imagen ? `<img src="${AL.izq.src}" alt="">` : Cars.side(kDe(tipo), '')) + insignia;
    if (dir.length > 1) hayFoto(dir, 'lado').then(u => {
      if (u && ultimaVista === clave) { prev.innerHTML = fotoHTML(u, 'lado', dir) + insignia; prev.classList.add('foto'); prev.classList.remove('vacio'); }
    });
  }

  /* ---------- Selector: se toca el vidrio sobre el auto ---------- */
  const sel = new Set();          // 'parabrisas', 'luneta', 'puerta-del:izq', 'fijo-tra:der', ...
  let vista = 'lado', lado = 'izq', enfocar = null;   // el dibujo muestra el lado del conductor (izquierdo)
  const orden = c => ['parabrisas', 'luneta', 'puerta-del', 'puerta-tra', 'fijo-del', 'fijo-tra'].indexOf(c.split(':')[0]) * 3 + (c.endsWith(':izq') ? 0 : 1);
  const claveDe = z => (z === 'parabrisas' || z === 'luneta') ? z : z + ':' + lado;

  /* Imagen en línea del auto con los vidrios tocables encima (ver catalogo.js -> AUTO_LINEA) */
  function imagenPicker(v, activos, k) {
    const AL = window.AUTO_LINEA || {};
    if (!(AL.tipos || []).includes(k)) return null;
    const cfg = AL[v === 'lado' ? lado : v];
    if (!cfg) return null;
    const polys = Object.entries(cfg.zonas).map(([z, p]) =>
      `<polygon class="z${activos.has(z) ? ' on' : ''}" data-z="${z}" tabindex="0" role="button" aria-pressed="${activos.has(z)}" aria-label="${Cars.nombre(z)}" points="${p.map(q => q.join(',')).join(' ')}"/>`).join('');
    return `<div class="foto-picker"><img src="${cfg.src}" alt="" draggable="false"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${polys}</svg></div>`;
  }

  function pintarLista() {
    const l = $('#selLista');
    if (!sel.size) { l.innerHTML = '<span class="sel-vacio">Todavía no elegiste ningún vidrio.</span>'; return; }
    l.innerHTML = [...sel].sort((a, b) => orden(a) - orden(b)).map(c => {
      const cod = c === 'parabrisas' || c === 'luneta' ? codigos(c) : [];
      return `<span class="sel-chip">${Cars.nombre(c)}${cod.length ? ` <em>· código ${cod.join(' o ')}</em>` : ''}
        <button type="button" data-q="${c}" aria-label="Quitar ${Cars.nombre(c)}">×</button></span>`;
    }).join('');
  }
  function pintarPicker() {
    const tipo = val('tipo'), k = kDe(tipo);
    $('#vehResumen').innerHTML = logoMarca(marca()) + [nombreAuto(), val('anio')].filter(Boolean).join(' ') + (tipo ? ' · ' + tipo : '');
    const deLado = new Set([...sel].filter(c => c.endsWith(':' + lado)).map(c => c.split(':')[0]));
    const o = { sel: vista === 'lado' ? deLado : sel };
    const img = imagenPicker(vista, o.sel, k);
    $('#picker').innerHTML = img || (vista === 'frente' ? Cars.front('', o) : vista === 'atras' ? Cars.rear('', o) : Cars.side(k, '', o));
    $('#picker').classList.toggle('con-foto', !!img);
    $('#picker').classList.toggle('espejo', !img && vista === 'lado' && lado !== 'izq');
    $('#ladoBox').hidden = vista !== 'lado';
    $$('.vista').forEach(b => b.classList.toggle('on', b.dataset.v === vista));
    $$('.lado').forEach(b => b.classList.toggle('on', b.dataset.l === lado));
    pintarLista();
    if (enfocar) { const el = $(`#picker [data-z="${enfocar}"]`); if (el) el.focus(); enfocar = null; }
  }
  function alternar(z) {
    const c = claveDe(z);
    sel.has(c) ? sel.delete(c) : sel.add(c);
    enfocar = z;
    pintarPicker(); refrescar();
  }
  $('#picker').addEventListener('click', e => { const t = e.target.closest('[data-z]'); if (t) alternar(t.dataset.z); });
  $('#picker').addEventListener('keydown', e => {
    const t = e.target.closest('[data-z]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alternar(t.dataset.z); }
  });
  $('#selLista').addEventListener('click', e => {
    const q = e.target.closest('[data-q]'); if (!q) return;
    sel.delete(q.dataset.q); pintarPicker(); refrescar();
  });
  $$('.vista').forEach(b => b.addEventListener('click', () => { vista = b.dataset.v; pintarPicker(); }));
  $$('.lado').forEach(b => b.addEventListener('click', () => { lado = b.dataset.l; pintarPicker(); }));

  function armar() {
    const tipo = val('tipo');
    const vid = [...sel].sort((a, b) => orden(a) - orden(b)).map(c => Cars.nombre(c));
    const auto = [marca(), modelo(), val('anio')].filter(Boolean).join(' ');
    const l = ['Hola CristalAuto, quiero solicitar una cotización.', ''];
    l.push('• Vehículo: ' + (auto || '—') + (tipo ? ' (' + tipo + ')' : ''));
    l.push('• Vidrio: ' + (vid.length ? vid.join('; ') : '—'));
    const cp = sel.has('parabrisas') ? codigos('parabrisas') : [], cl = sel.has('luneta') ? codigos('luneta') : [];
    if (cp.length) l.push('• Código del parabrisas: ' + cp.join(' o '));
    if (cl.length) l.push('• Código de la luneta: ' + cl.join(' o '));
    if (form.elements.domicilio.checked) l.push('• Quiero el servicio a domicilio' + (val('zona') ? ' en ' + val('zona') : ''));
    if (val('nota')) l.push('• Detalle: ' + val('nota'));
    if (val('nombre')) l.push('', 'Mi nombre: ' + val('nombre'));
    return l.join('\n');
  }

  /* Qué falta en cada paso */
  function faltan(n) {
    const f = [];
    if (n === 1) {
      if (!val('anio')) f.push('el año');
      if (!marca()) f.push('la marca');
      if (!modelo()) f.push('el modelo');
      if (!val('tipo')) f.push('el tipo de carrocería');
    }
    if (n === 2 && !sel.size) f.push('tocá al menos un vidrio del auto');
    return f;
  }

  function mostrar(n) {
    paso = n;
    $$('.pane', form).forEach(p => { p.hidden = +p.dataset.step !== n; });
    $$('#stepper li').forEach((li, i) => {
      li.classList.toggle('done', i + 1 < n);
      li.classList.toggle('cur', i + 1 === n);
    });
    atras.style.visibility = n === 1 ? 'hidden' : 'visible';
    sigue.hidden = n === 4;
    sigue.textContent = n === 3 ? 'Ver resumen' : 'Siguiente';
    if (n === 2) pintarPicker();
    refrescar();
  }

  function refrescar() {
    $('#otraMarca').hidden = val('marca') !== '__otra';
    $('#fModeloOtro').hidden = !$('#fModelo').hidden && val('modelo') !== '__otro';
    const av = $('#codAviso'), cp = codigos('parabrisas');
    av.hidden = !(anioNum() && val('marca') && val('modelo'));
    if (!av.hidden) {
      const propio = val('marca') === '__otra' || val('modelo') === '__otro';
      av.className = 'cod-aviso ' + (cp.length ? 'ok' : 'no');
      av.textContent = cp.length ? 'Código de tu parabrisas: ' + cp.join(' o ') + '. Te confirmamos precio y disponibilidad por WhatsApp.'
        : (propio ? 'Sin problema: lo consultamos con tus datos por WhatsApp.' : 'Este modelo no figura en nuestra lista, pero consultanos igual y lo revisamos.');
    }
    verAuto();
    $('#zonaBox').hidden = !form.elements.domicilio.checked;
    const msg = armar();
    $('#preview').textContent = msg;
    btn.href = waUrl(msg);
    sigue.disabled = faltan(paso).length > 0;
    err.hidden = true;
  }

  function ir(n) {
    mostrar(n);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  form.addEventListener('input', refrescar);
  form.addEventListener('change', e => {
    if (e.target.id === 'fAnio') cargarMarcas();
    if (e.target.id === 'fMarca') cargarModelos();
    if (e.target.id === 'fModelo') {
      const f = delAnio().find(x => x.marca === val('marca') && x.modelo === val('modelo'));
      if (f) form.elements.tipo.value = f.carr;
    }
    refrescar();
  });
  form.addEventListener('submit', e => e.preventDefault());
  sigue.addEventListener('click', () => {
    const f = faltan(paso);
    if (f.length) { err.hidden = false; err.textContent = 'Falta: ' + f.join(', ') + '.'; return; }
    ir(paso + 1);
  });
  atras.addEventListener('click', () => ir(paso - 1));
  mostrar(1);

  /* ---------- Servicios ---------- */
  const SERVICIOS = [
    ['parabrisas', 'Parabrisas delantero', 'Cambio e instalación de parabrisas para tu vehículo.', () => Cars.front('parabrisas')],
    ['luneta', 'Lunetas', 'Cambio del vidrio trasero.', () => Cars.rear('luneta')],
    ['lateral', 'Vidrios laterales', 'Puertas delanteras y traseras.', () => Cars.side('sedan', 'lateral')],
    ['fijo', 'Vidrios fijos', 'Los vidrios fijos laterales y traseros.', () => Cars.side('hatch', 'fijo')],
    ['polar', 'Polarizado', 'Más privacidad y menos calor dentro del vehículo.', () => Cars.side('suv', 'polar')],
    ['pulida', 'Pulida de vidrios', 'Recuperamos la transparencia de tus vidrios.', () => Cars.front('pulida')],
    ['faro', 'Pulida de faros', 'Faros opacos o amarillentos, como nuevos.', () => Cars.front('faros')],
  ];
  $('#servicios-lista').innerHTML = SERVICIOS.map(([k, t, d, img], i) => {
    const link = ['polar', 'pulida', 'faro'].includes(k)
      ? waUrl(`Hola CristalAuto, quiero consultar por ${t.toLowerCase()}.`) : '#cotizar';
    const ext = link[0] === 'h' ? ' target="_blank" rel="noopener"' : '';
    return `<article class="svc${i === 0 ? ' big' : ''}">
      <div class="svc-top"><div class="svc-car">${img()}</div><span class="svc-n">0${i + 1}</span></div>
      <div><h3>${t}</h3><p>${d}</p><a href="${link}"${ext}>Pedir cotización</a></div></article>`;
  }).join('');
})();
