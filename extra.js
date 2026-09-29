'use strict';
/* Agenda de colocaciones: citas por día, límite diario, avisos por WhatsApp y paso a "Completar y cobrar". */
let ag = { date: hoyISO() };
const agendaDe = date => db.appts.filter(a => a.date === date && a.status !== 'cancelado').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
const diaTxt = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
const citaWA = a => `Hola ${a.clientName}! Te confirmamos tu colocación en ${db.cfg.empresa.nombre} el ${diaTxt(a.date)} a las ${a.time}.${a.domicilio ? ' Vamos a tu domicilio' + (a.address ? ' (' + a.address + ')' : '') + '.' : ''} ¡Te esperamos!`;
const mapsLink = t => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t);

function vAgenda() {
  const L = agendaDe(ag.date), n = L.length, { capMin, capMax } = db.cfg;
  const cls = n >= capMax ? 'bad' : n < capMin ? '' : 'ok';
  const semana = [...Array(7)].map((_, i) => addDays(hoyISO(), i));
  const cancel = db.appts.filter(a => a.date === ag.date && a.status === 'cancelado');
  view.innerHTML = `
  <div class="card"><div class="row"><button class="btn sec" id="a_prev" style="flex:0 0 52px">◀</button><div><input type="date" id="a_d" value="${ag.date}"></div><button class="btn sec" id="a_next" style="flex:0 0 52px">▶</button>
      <button class="btn sec" id="a_hoy" style="flex:0 0 70px">Hoy</button><button class="btn sec" id="a_man" style="flex:0 0 80px">Mañana</button></div>
    <h3 style="text-transform:capitalize">${diaTxt(ag.date)}</h3>
    <div class="grid" style="margin:0"><div class="kpi ${cls}"><b>${n} de ${capMax}</b><span>colocaciones${n >= capMax ? ' · DÍA COMPLETO' : n < capMin ? ` · pocas (lo normal es ${capMin}–${capMax})` : ''}</span></div></div>
    <button class="btn block" id="a_new">+ Agendar colocación</button></div>
  <div class="card"><h2>Próximos 7 días</h2><div class="row">${semana.map(d => { const c = agendaDe(d).length; return `<button class="btn ${d === ag.date ? '' : 'sec'} sm" data-d="${d}" style="flex:1 1 70px">${d.slice(8)}/${d.slice(5, 7)}<br>${c}</button>`; }).join('')}</div></div>
  <div class="card"><h2>Agenda del día</h2>${L.length ? L.map(a => `<div style="border-top:1px solid var(--bd);padding:10px 0">
    <div><b style="font-size:18px">${esc(a.time)}</b> · <b>${esc(a.clientName)}</b> ${a.domicilio ? '<span class="tag warn">🚗 domicilio</span>' : ''} ${a.status === 'hecho' ? '<span class="tag ok">Hecho</span>' : ''}</div>
    <div class="mut">${esc(a.vehicle)}${a.tech ? ' · ' + esc(a.tech) : ''}${a.phone ? ' · ' + esc(a.phone) : ''}</div>
    ${a.items.length ? `<div class="mut">${a.items.map(i => esc(i.name)).join(' · ')}</div>` : ''}
    ${a.address ? `<div><a href="${mapsLink(a.address)}" target="_blank" rel="noopener">📍 ${esc(a.address)}</a></div>` : ''}${a.note ? `<div class="mut">📝 ${esc(a.note)}</div>` : ''}
    <div class="row" style="margin-top:6px">${a.status === 'agendado' ? `<button class="btn ok sm" data-done="${a.id}">Completar y cobrar</button>` : `<button class="btn sec sm" data-sale="${a.saleId}">Ver venta</button>`}
      ${waLink(a.phone) ? `<a class="btn sm" href="${waLink(a.phone, citaWA(a))}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">WhatsApp</a>` : ''}
      <button class="btn sec sm" data-ed="${a.id}">Editar</button>${a.status === 'agendado' ? `<button class="btn sec sm" data-cx="${a.id}">Cancelar</button>` : ''}</div></div>`).join('') : '<p class="mut">No hay colocaciones agendadas este día.</p>'}
    ${cancel.length ? `<p class="mut">Canceladas: ${cancel.map(a => esc(a.time + ' ' + a.clientName)).join(', ')}</p>` : ''}</div>`;
  const go = d => { ag.date = d || hoyISO(); vAgenda(); };
  $('#a_d').onchange = e => go(e.target.value); $('#a_prev').onclick = () => go(addDays(ag.date, -1)); $('#a_next').onclick = () => go(addDays(ag.date, 1));
  $('#a_hoy').onclick = () => go(hoyISO()); $('#a_man').onclick = () => go(addDays(hoyISO(), 1)); $('#a_new').onclick = () => formCita();
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => go(b.dataset.d));
  document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formCita(b.dataset.ed));
  document.querySelectorAll('[data-done]').forEach(b => b.onclick = () => completarCita(db.appts.find(a => a.id === b.dataset.done)));
  document.querySelectorAll('[data-sale]').forEach(b => b.onclick = () => verVenta(b.dataset.sale));
  document.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => { if (confirm('¿Cancelar esta colocación?')) { db.appts.find(a => a.id === b.dataset.cx).status = 'cancelado'; guardar(); vAgenda(); } });
}
function completarCita(a) {
  cart = { ...nuevoCart(), kind: a.items.some(i => i.type === 'prod') ? 'colocado' : 'servicio', clientName: a.clientName, phone: a.phone, vehicle: a.vehicle, tech: a.tech, items: a.items.map(i => ({ ...i })), apptId: a.id, note: a.note || '' };
  tab = 'ventas'; render();
}
function formCita(id) {
  const a = id ? db.appts.find(x => x.id === id) : { date: ag.date, time: '09:00', clientName: '', phone: '', vehicle: '', domicilio: false, address: '', tech: '', items: [], note: '', status: 'agendado' };
  const items = a.items.map(i => ({ ...i }));
  modal(`<h2>${id ? 'Editar' : 'Agendar'} colocación</h2>
    <div class="row"><div><label>Fecha</label><input type="date" id="a_fecha" value="${a.date}"></div><div><label>Hora</label><input type="time" id="a_hora" value="${a.time}"></div></div>
    <div id="a_cap" class="mut"></div>
    <div class="row"><div><label>Cliente</label><input id="a_cli" list="a_clis" autocomplete="off" value="${esc(a.clientName)}"><datalist id="a_clis">${db.clients.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist></div><div><label>Teléfono / WhatsApp</label><input id="a_tel" inputmode="tel" value="${esc(a.phone)}"></div></div>
    <label>Vehículo / chapa</label><input id="a_veh" value="${esc(a.vehicle)}" placeholder="Toyota Vitz 2008 · ABC123">
    <label style="display:flex;gap:8px;align-items:center;color:inherit;font-size:16px"><input type="checkbox" id="a_dom" style="width:22px;min-height:22px" ${a.domicilio ? 'checked' : ''}> Trabajo a domicilio</label>
    <div id="a_addrw" ${a.domicilio ? '' : 'hidden'}><label>Dirección (o link de Google Maps)</label><input id="a_addr" value="${esc(a.address)}"></div>
    <label>Colocador</label><select id="a_tech"><option value="">—</option>${opts(db.cfg.staff, a.tech)}</select>
    <label>Vidrio de stock (código o modelo)</label><input id="a_q" autocomplete="off" placeholder="Buscar…"><div id="a_res" class="sugs"></div>
    <label>Servicio</label><select id="a_srv"><option value="">— elegir —</option>${db.services.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
    <div id="a_items" class="mut"></div>
    <label>Nota</label><input id="a_note" value="${esc(a.note)}">
    <div class="row" style="margin-top:12px"><button class="btn" id="ok">Guardar</button><button class="btn sec" id="no">Cerrar</button>${id ? '<button class="btn bad" id="del">Borrar</button>' : ''}</div>`);
  const pintar = () => { $('#a_items').innerHTML = items.length ? items.map((i, k) => `${esc(i.name)} <a href="#" data-r="${k}">✕</a>`).join('<br>') : 'Sin vidrio ni servicio elegido (podés agregarlo después al cobrar).';
    document.querySelectorAll('#a_items [data-r]').forEach(x => x.onclick = e => { e.preventDefault(); items.splice(x.dataset.r, 1); pintar(); }); };
  const cap = () => { const d = $('#a_fecha').value, n = agendaDe(d).filter(x => x.id !== id).length + 1;
    $('#a_cap').innerHTML = `Ese día tendrías <b>${n}</b> colocaciones (máximo ${db.cfg.capMax}).${n > db.cfg.capMax ? ' <b style="color:var(--bad)">⚠ Pasás el límite.</b>' : ''}`; };
  $('#a_fecha').onchange = cap; cap(); pintar();
  $('#a_dom').onchange = e => $('#a_addrw').hidden = !e.target.checked;
  $('#a_cli').onchange = e => { const c = db.clients.find(x => norm(x.name) === norm(e.target.value)); if (c && c.phone && !$('#a_tel').value) $('#a_tel').value = c.phone; };
  picker($('#a_q'), $('#a_res'), p => { items.push({ type: 'prod', id: p.id, name: p.code + ' — ' + p.name, qty: 1, unit: p.colocado || 0, cost: p.compra || 0 }); pintar(); });
  $('#a_srv').onchange = e => { const s = db.services.find(x => x.id === e.target.value); if (s) { items.push({ type: 'srv', id: s.id, name: s.name, qty: 1, unit: s.price, cost: 0 }); pintar(); } e.target.value = ''; };
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => {
    const d = { date: $('#a_fecha').value, time: $('#a_hora').value, clientName: $('#a_cli').value.trim(), phone: $('#a_tel').value.trim(), vehicle: $('#a_veh').value.trim(), domicilio: $('#a_dom').checked,
      address: $('#a_dom').checked ? $('#a_addr').value.trim() : '', tech: $('#a_tech').value, items, note: $('#a_note').value.trim() };
    if (!d.date || !d.time) return toast('Elegí fecha y hora'); if (!d.clientName) return toast('Falta el nombre del cliente');
    const otros = agendaDe(d.date).filter(x => x.id !== id);
    if (otros.length >= db.cfg.capMax && !confirm(`Ese día ya hay ${otros.length} colocaciones (máximo ${db.cfg.capMax}). ¿Agendar igual?`)) return;
    if (otros.filter(x => x.time === d.time).length >= db.cfg.staff.length && !confirm(`A las ${d.time} ya hay ${otros.filter(x => x.time === d.time).length} trabajos y tenés ${db.cfg.staff.length} colocadores. ¿Agendar igual?`)) return;
    if (id) Object.assign(a, d); else db.appts.push({ id: uid(), status: 'agendado', saleId: '', ...d });
    if (d.clientName && !db.clients.some(c => norm(c.name) === norm(d.clientName))) db.clients.push({ id: uid(), name: d.clientName, type: 'particular', ruc: '', phone: d.phone, note: '' });
    ag.date = d.date; guardar(); cerrar(); render(); toast('Colocación agendada');
  };
  if (id) $('#del').onclick = () => { if (confirm('¿Borrar esta cita?')) { db.appts = db.appts.filter(x => x.id !== id); guardar(); cerrar(); render(); } };
}
