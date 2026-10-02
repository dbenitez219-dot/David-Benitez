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
    $('#resenas').innerHTML = C.resenas.map(r => {
      const n = Math.max(0, Math.min(5, r.estrellas || 5));
      return `<blockquote class="rev"><div class="stars" aria-label="${n} de 5 estrellas">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</div><p>${r.texto}</p><cite>${r.nombre}</cite></blockquote>`;
    }).join('');
    $('#opiniones').hidden = false;
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
  const VIDRIOS = [
    { id: 'parabrisas', t: 'Parabrisas delantero', vista: 'frente', img: () => Cars.front('parabrisas') },
    { id: 'luneta', t: 'Luneta', s: 'Vidrio trasero', vista: 'atras', img: () => Cars.rear('luneta') },
    { id: 'lateral', t: 'Vidrio lateral', s: 'Puertas', vista: 'lado', img: k => Cars.side(k, 'lateral') },
    { id: 'fijo', t: 'Vidrios fijos', s: 'Laterales y traseros', vista: 'lado', img: k => Cars.side(k, 'fijo') },
  ];
  const POSICIONES = ['Delantero izquierdo', 'Delantero derecho', 'Trasero izquierdo', 'Trasero derecho'];
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
    prev.innerHTML = Cars.side(kDe(tipo), '');
    if (dir.length > 1) hayFoto(dir, 'lado').then(u => {
      if (u && ultimaVista === clave) { prev.innerHTML = fotoHTML(u, 'lado', dir); prev.classList.add('foto'); prev.classList.remove('vacio'); }
    });
  }

  const etiqueta = v => {
    const c = v.id === 'parabrisas' ? codigos('parabrisas') : v.id === 'luneta' ? codigos('luneta') : [];
    return c.length ? `<small class="cod">Código ${c.join(' o ')}</small>` : (v.s ? `<small>${v.s}</small>` : '');
  };

  /* Tarjetas de vidrio con las fotos de ese vehículo */
  let vidriosPara = '';
  function pintarVidrios() {
    const dir = carpeta(), tipo = val('tipo');
    const clave = dir + '|' + tipo + '|' + anioNum();
    $('#vehResumen').textContent = [nombreAuto(), val('anio')].filter(Boolean).join(' ') + (tipo ? ' · ' + tipo : '');
    if (clave === vidriosPara) return;
    vidriosPara = clave;
    const marcados = new Set(checked('vidrio'));
    const k = kDe(tipo);
    $('#vidrios').innerHTML = VIDRIOS.map(v =>
      `<label class="opt"><input type="checkbox" name="vidrio" value="${v.id}"${marcados.has(v.id) ? ' checked' : ''}>
         <span class="ico" data-v="${v.id}">${v.img(k)}</span><span class="lbl">${v.t}${etiqueta(v)}</span></label>`).join('');
    if (dir.length > 1) VIDRIOS.forEach(v => hayFoto(dir, v.vista).then(u => {
      const box = $(`.ico[data-v="${v.id}"]`);
      if (u && box && vidriosPara === clave) { box.innerHTML = fotoHTML(u, v.id, dir); box.classList.add('foto'); }
    }));
  }
  $('#posChips').innerHTML = POSICIONES.map(p =>
    `<label class="chip"><input type="checkbox" name="pos" value="${p}">${p}</label>`).join('');

  function armar() {
    const tipo = val('tipo');
    const nombreV = Object.fromEntries(VIDRIOS.map(v => [v.id, v.t]));
    const vid = checked('vidrio').map(id => {
      if (id !== 'lateral') return nombreV[id];
      const p = checked('pos');
      return 'Vidrio lateral' + (p.length ? ' (' + p.join(', ').toLowerCase() + ')' : '');
    });
    const auto = [marca(), modelo(), val('anio')].filter(Boolean).join(' ');
    const l = ['Hola CristalAuto, quiero solicitar una cotización.', ''];
    l.push('• Vehículo: ' + (auto || '—') + (tipo ? ' (' + tipo + ')' : ''));
    l.push('• Vidrio: ' + (vid.length ? vid.join('; ') : '—'));
    const cp = checked('vidrio').includes('parabrisas') ? codigos('parabrisas') : [], cl = checked('vidrio').includes('luneta') ? codigos('luneta') : [];
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
    if (n === 2 && !checked('vidrio').length) f.push('elegí al menos un vidrio');
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
    if (n === 2) pintarVidrios();
    refrescar();
  }

  function refrescar() {
    $('#posiciones').hidden = !checked('vidrio').includes('lateral');
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
