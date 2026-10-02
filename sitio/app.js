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
  $('#mapa').src = 'https://www.google.com/maps?q=' + q + '&output=embed';
  $('#maplink').href = 'https://www.google.com/maps/search/?api=1&query=' + q;
  const nombres = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
  $('#redes').innerHTML = Object.entries(C.redes || {})
    .filter(([, url]) => url)
    .map(([k, url]) => `<a href="${url}" target="_blank" rel="noopener">${nombres[k] || k}</a>`).join('');

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
  }
  estado();
  setInterval(estado, 60000);

  /* ---------- Dibujos ---------- */
  const wheels = (a, b) => [a, b].map(x => `<circle class="wheel" cx="${x}" cy="39" r="8"/><circle class="rim" cx="${x}" cy="39" r="3"/>`).join('');
  const side = path => `<svg viewBox="0 0 120 50" aria-hidden="true"><path class="side" d="${path}"/>${wheels(28, 94)}</svg>`;

  const TIPOS = [
    { id: 'Sedán', t: 'Sedán', svg: side('M5 37V29q1-5 14-6l16-3 9-9q2-2 6-2h24q4 0 7 3l8 9 17 3q8 2 8 8v5z') },
    { id: 'Hatchback', t: 'Hatchback', svg: side('M5 37V28q1-5 14-6l14-3 8-9h38q4 0 6 4l6 11 12 2q8 2 8 8v2z') },
    { id: 'SUV', t: 'SUV', small: 'Crossover', svg: side('M5 37V25q1-5 9-6l4-9q1-2 4-2h62q4 0 6 3l7 9 11 3q8 2 8 7v7z') },
    { id: 'Camioneta pick-up', t: 'Pick-up', small: 'Camioneta', svg: side('M4 37V22h35V13q1-4 6-4h26q4 0 6 3l8 10 22 3q7 2 7 8v4z') },
    { id: 'Furgón / utilitario', t: 'Furgón', small: 'Utilitario', svg: side('M5 37V11q0-4 4-4h66q4 0 6 3l10 12 20 3q7 2 7 8v4z') },
  ];

  /* Vista desde arriba. hl = vidrios a resaltar */
  function plan(hl) {
    const g = k => 'g' + (hl.includes(k) ? ' hl' : '');
    return `<svg class="plan" viewBox="0 0 200 380" aria-hidden="true">
      <rect class="wheel" x="30" y="64" width="16" height="50" rx="6"/><rect class="wheel" x="154" y="64" width="16" height="50" rx="6"/>
      <rect class="wheel" x="30" y="268" width="16" height="50" rx="6"/><rect class="wheel" x="154" y="268" width="16" height="50" rx="6"/>
      <rect class="body" x="40" y="16" width="120" height="348" rx="48"/>
      <rect class="lamp" x="56" y="22" width="22" height="9" rx="4"/><rect class="lamp" x="122" y="22" width="22" height="9" rx="4"/>
      <rect class="tail" x="56" y="349" width="22" height="9" rx="4"/><rect class="tail" x="122" y="349" width="22" height="9" rx="4"/>
      <rect class="roof" x="58" y="172" width="84" height="76" rx="10"/>
      <path class="${g('parabrisas')}" d="M70 112h60l18 58H52z"/>
      <path class="${g('luneta')}" d="M52 250h96l-18 46H70z"/>
      <rect class="${g('lateral')}" x="32" y="176" width="13" height="34" rx="3"/><rect class="${g('lateral')}" x="32" y="214" width="13" height="32" rx="3"/>
      <rect class="${g('lateral')}" x="155" y="176" width="13" height="34" rx="3"/><rect class="${g('lateral')}" x="155" y="214" width="13" height="32" rx="3"/>
      <rect class="${g('fijo')}" x="32" y="250" width="13" height="20" rx="3"/><rect class="${g('fijo')}" x="155" y="250" width="13" height="20" rx="3"/>
      <rect class="${g('fijo')}" x="32" y="154" width="13" height="16" rx="3"/><rect class="${g('fijo')}" x="155" y="154" width="13" height="16" rx="3"/>
    </svg>`;
  }

  const VIDRIOS = [
    { id: 'parabrisas', t: 'Parabrisas delantero' },
    { id: 'luneta', t: 'Luneta (vidrio trasero)' },
    { id: 'lateral', t: 'Vidrio lateral' },
    { id: 'fijo', t: 'Vidrios fijos' },
  ];
  const POSICIONES = ['Delantero izquierdo', 'Delantero derecho', 'Trasero izquierdo', 'Trasero derecho'];
  const MARCAS = ['Toyota', 'Nissan', 'Honda', 'Hyundai', 'Kia', 'Suzuki', 'Mitsubishi', 'Mazda', 'Chevrolet', 'Ford', 'Volkswagen', 'Fiat', 'Renault', 'Peugeot', 'Citroën', 'Subaru', 'BMW', 'Mercedes-Benz', 'Audi', 'Jeep', 'Isuzu', 'Chery', 'JAC', 'Great Wall', 'Lexus', 'Daihatsu', 'SsangYong', 'Dodge', 'Mini', 'Volvo'];

  /* ---------- Cotizador por pasos ---------- */
  const form = $('#cotizador');
  $('#tipos').innerHTML = TIPOS.map(t =>
    `<label class="opt"><input type="radio" name="tipo" value="${t.id}">
       <span class="ico">${t.svg}</span><span>${t.t}${t.small ? `<br><small>${t.small}</small>` : ''}</span></label>`).join('');
  $('#vidrios').innerHTML = VIDRIOS.map(v =>
    `<label class="opt"><input type="checkbox" name="vidrio" value="${v.id}">
       <span class="ico">${plan([v.id])}</span><span>${v.t}</span></label>`).join('');
  $('#posChips').innerHTML = POSICIONES.map(p =>
    `<label class="chip"><input type="checkbox" name="pos" value="${p}">${p}</label>`).join('');
  const anioMax = new Date().getFullYear() + 1;
  $('#fAnio').innerHTML = '<option value="">Elegí el año</option>' +
    Array.from({ length: anioMax - 1979 }, (_, i) => `<option>${anioMax - i}</option>`).join('');
  $('#fMarca').innerHTML = '<option value="">Elegí la marca</option>' +
    MARCAS.map(m => `<option>${m}</option>`).join('') + '<option value="__otra">Otra marca…</option>';

  const btn = $('#enviar'), err = $('#err'), sigue = $('#sigue'), atras = $('#atras');
  const val = n => form.elements[n].value.trim();
  const checked = n => $$(`input[name="${n}"]:checked`, form).map(i => i.value);
  const marca = () => val('marca') === '__otra' ? val('marcaOtra') : val('marca');
  let paso = 1;

  function armar() {
    const tipo = checked('tipo')[0];
    const nombreV = Object.fromEntries(VIDRIOS.map(v => [v.id, v.t.replace(/ \(.*\)/, '')]));
    const vid = checked('vidrio').map(id => {
      if (id !== 'lateral') return nombreV[id];
      const p = checked('pos');
      return 'Vidrio lateral' + (p.length ? ' (' + p.join(', ').toLowerCase() + ')' : '');
    });
    const auto = [marca(), val('modelo'), val('anio')].filter(Boolean).join(' ');
    const l = ['Hola CristalAuto, quiero solicitar una cotización.', ''];
    l.push('• Vehículo: ' + (auto || '—') + (tipo ? ' (' + tipo + ')' : ''));
    l.push('• Vidrio: ' + (vid.length ? vid.join('; ') : '—'));
    if (form.elements.domicilio.checked) l.push('• Quiero el servicio a domicilio' + (val('zona') ? ' en ' + val('zona') : ''));
    if (val('nota')) l.push('• Detalle: ' + val('nota'));
    if (val('nombre')) l.push('', 'Mi nombre: ' + val('nombre'));
    return l.join('\n');
  }

  /* Qué falta en cada paso */
  function faltan(n) {
    const f = [];
    if (n === 1 && !checked('vidrio').length) f.push('elegí al menos un vidrio');
    if (n === 2) {
      if (!checked('tipo').length) f.push('el tipo de vehículo');
      if (!val('anio')) f.push('el año');
      if (!marca()) f.push('la marca');
      if (!val('modelo')) f.push('el modelo');
    }
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
    refrescar();
  }

  function refrescar() {
    $('#posiciones').hidden = !checked('vidrio').includes('lateral');
    $('#otraMarca').hidden = val('marca') !== '__otra';
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
  form.addEventListener('change', refrescar);
  form.addEventListener('submit', e => e.preventDefault());
  sigue.addEventListener('click', () => {
    const f = faltan(paso);
    if (f.length) { err.hidden = false; err.textContent = 'Falta: ' + f.join(', ') + '.'; return; }
    ir(paso + 1);
  });
  atras.addEventListener('click', () => ir(paso - 1));
  mostrar(1);

  /* ---------- Servicios ---------- */
  const ic = {
    parabrisas: '<path d="M4 17l3-9h10l3 9z"/><path d="M2 17h20"/>',
    luneta: '<path d="M4 8l3 9h10l3-9z"/><path d="M2 8h20"/>',
    lateral: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M5 12h14"/>',
    fijo: '<path d="M5 19V5l14 14z"/>',
    polar: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    pulida: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    faro: '<path d="M9 6a6 6 0 0 1 0 12 5 6 0 0 1 0-12z"/><path d="M15 8h6M15 12h6M15 16h6"/>',
  };
  const SERVICIOS = [
    ['parabrisas', 'Parabrisas delantero', 'Cambio e instalación de parabrisas para tu vehículo.'],
    ['luneta', 'Lunetas', 'Cambio del vidrio trasero.'],
    ['lateral', 'Vidrios laterales', 'Puertas delanteras y traseras.'],
    ['fijo', 'Vidrios fijos', 'Los vidrios fijos laterales y traseros.'],
    ['polar', 'Polarizado', 'Más privacidad y menos calor dentro del vehículo.'],
    ['pulida', 'Pulida de vidrios', 'Recuperamos la transparencia de tus vidrios.'],
    ['faro', 'Pulida de faros', 'Faros opacos o amarillentos, como nuevos.'],
  ];
  $('#servicios-lista').innerHTML = SERVICIOS.map(([k, t, d]) => {
    const link = ['polar', 'pulida', 'faro'].includes(k)
      ? waUrl(`Hola CristalAuto, quiero consultar por ${t.toLowerCase()}.`) : '#cotizar';
    return `<article class="svc"><div class="svc-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ic[k]}</svg></div>
      <div><h3>${t}</h3><p>${d}</p><a href="${link}"${link[0] === 'h' ? ' target="_blank" rel="noopener"' : ''}>Pedir cotización →</a></div></article>`;
  }).join('');
})();
