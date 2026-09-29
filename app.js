'use strict';
/* CristalAuto Parabrisas — ventas, agenda, stock, caja, clientes, consultas y campañas.
   Los datos se sincronizan con Supabase (ver sync.js) y también quedan guardados en este dispositivo. */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const isoOf = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const hoyISO = () => isoOf(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const dmy = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const gs = n => 'Gs. ' + Math.round(n || 0).toLocaleString('es-PY');
const fmt = n => (Math.round((n || 0) * 100) / 100).toLocaleString('es-PY');
/* Acepta 160776, "160.776", "Gs 160.776", "1.234,50" */
function numGs(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}

/* ---------- Constantes ---------- */
const SERVICIOS = [
  ['Reinstalación de parabrisas (auto)', 250000], ['Reinstalación de parabrisas (camioneta)', 300000],
  ['Pulida de vidrio automotriz', 300000], ['Pulida de faros', 0],
  ['Polarizado nanocarbón – parabrisas delantero', 250000], ['Polarizado nanocerámico – parabrisas delantero', 300000],
  ['Polarizado – laterales y luneta', 0],
];
const COLS = ['products', 'moves', 'services', 'clients', 'sales', 'expenses', 'leads', 'appts', 'suppliers', 'campaigns', 'cashdays', 'quotes'];
const FUENTES = ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Llamada', 'Recomendación', 'Llegó al local', 'Otro'];
const ESTADOS = { nuevo: 'Nuevo', cotizado: 'Cotizado', agendado: 'Agendado', ganado: 'Ganado ✔', perdido: 'Perdido' };
const GASTOS = ['Publicidad', 'Sueldos', 'Herramientas', 'Compra a proveedor', 'Alquiler y servicios', 'Insumos', 'Combustible', 'Otros'];
const METODOS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'];
const VIAS = ['Efectivo', 'Itaú'];
const PLATAFORMAS = ['Meta (Facebook/Instagram)', 'TikTok', 'Google', 'Otro'];
const CFG0 = () => ({ empresa: { nombre: 'CristalAuto Parabrisas', ruc: '', direccion: '', tel: '', timbrado: '', vigencia: '' },
  staff: ['Jefe', 'Colocador 2', 'Colocador 3', 'Colocador 4'], pin: '', minDefault: 50, capMin: 4, capMax: 12, seeded: false });
const normalizarCfg = c => { const b = CFG0(); return { ...b, ...(c || {}), empresa: { ...b.empresa, ...((c || {}).empresa || {}) } }; };

/* ---------- Datos ---------- */
let db = normalizar(Sync.loadLocal() || {});
function normalizar(d) {
  d.cfg = normalizarCfg(d.cfg);
  for (const k of COLS) if (!Array.isArray(d[k])) d[k] = [];
  return d;
}
/* El stock siempre se calcula desde los movimientos */
function recalc() {
  const m = {};
  for (const v of db.moves) m[v.pid] = (m[v.pid] || 0) + (v.type === 'out' ? -v.qty : v.qty);
  for (const p of db.products) p.stock = Math.round((m[p.id] || 0) * 1000) / 1000;
}
function guardar() { recalc(); Sync.save(); }
recalc();
const prod = id => db.products.find(p => p.id === id);
const cli = id => db.clients.find(c => c.id === id);
const sup = id => db.suppliers.find(s => s.id === id);
const camp = id => db.campaigns.find(c => c.id === id);
function seedSiHaceFalta() {
  if (db.cfg.seeded || db.services.length) return;
  db.services = SERVICIOS.map(([name, price]) => ({ id: uid(), name, price })); db.cfg.seeded = true; guardar();
}

/* ---------- Jefe / PIN ---------- */
let bossOk = false;
const boss = () => !db.cfg.pin || bossOk;
function needBoss(fn) {
  if (boss()) return fn();
  const p = prompt('PIN del jefe:');
  if (p === db.cfg.pin) { bossOk = true; fn(); } else if (p !== null) toast('PIN incorrecto');
}
function lockUI() { const b = $('#lock'); b.hidden = !db.cfg.pin; b.textContent = bossOk ? '🔓 Jefe' : '🔒 Bloqueado'; }
$('#lock').onclick = () => { if (bossOk) { bossOk = false; render(); } else needBoss(() => render()); };

/* ---------- UI ---------- */
let tab = 'resumen';
const view = $('#view');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function cerrar() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrar(); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; render(); });
$('#hoy').textContent = new Date().toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
const VIEWS = { resumen: () => vResumen(), ventas: () => vVentas(), agenda: () => vAgenda(), stock: () => vStock(), clientes: () => vClientes(), caja: () => vCaja(), consultas: () => vConsultas(), ajustes: () => vAjustes() };
function render(keepScroll) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const y = window.scrollY; lockUI(); VIEWS[tab](); window.scrollTo(0, keepScroll ? y : 0);
}
/* Actualiza la pantalla cuando llegan cambios del otro dispositivo, sin molestar si estás escribiendo */
let refT;
function refreshUI() {
  clearTimeout(refT); refT = setTimeout(() => {
    if (!$('#modal').hidden) return;
    const a = document.activeElement;
    if (a && view.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { if (tab === 'ventas') listaVentas(); return; }
    render(true);
  }, 300);
}
const tabla = (cols, rows, numCols = []) => `<div class="tablewrap"><table><thead><tr>${cols.map((c, i) => `<th class="${numCols.includes(i) ? 'n' : ''}${c[0] === '~' ? ' hm' : ''}">${c.replace(/^~/, '')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
const opts = (arr, sel) => arr.map(a => `<option ${a === sel ? 'selected' : ''}>${esc(a)}</option>`).join('');
const optsKV = (list, sel, empty) => (empty ? `<option value="">${esc(empty)}</option>` : '') + list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');

/* Buscador de vidrios por código o por modelo (todas las palabras deben aparecer) */
function buscar(q, limit = 8) {
  const w = norm(q).split(' ').filter(Boolean); if (!w.length) return [];
  return db.products.filter(p => { const t = norm(p.code + ' ' + p.name); return w.every(x => t.includes(x)); }).slice(0, limit);
}
function picker(inp, res, onPick) {
  inp.oninput = () => {
    res.innerHTML = buscar(inp.value).map(p => `<button type="button" class="sug" data-id="${p.id}"><b>${esc(p.code)}</b> ${esc(p.name)}<span class="mut"> · stock ${fmt(p.stock)}</span></button>`).join('');
  };
  res.onclick = e => { const b = e.target.closest('[data-id]'); if (!b) return; res.innerHTML = ''; inp.value = ''; onPick(prod(b.dataset.id)); };
}
const waNum = t => { let d = String(t || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '595' + d.slice(1); return d; };
const waLink = (t, text) => { const n = waNum(t); return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : ''; };

/* ---------- Stock (movimientos) ---------- */
function mover(pid, type, qty, note, date, ref) {
  const p = prod(pid); if (!p) return;
  p.stock = Math.round((p.stock + (type === 'out' ? -qty : qty)) * 1000) / 1000;
  db.moves.push({ id: uid(), date: date || hoyISO(), ts: Date.now(), pid, type, qty, note: note || '', ref: ref || '' });
}
const stockDot = p => `<span class="dot ${p.stock <= 0 ? 'r' : p.stock <= p.min ? 'o' : 'g'}"></span>`;

/* ---------- Ventas: cálculo ---------- */
const costOf = i => (i.type === 'prod' || i.type === 'ext') ? i.qty * (i.cost || 0) : 0;
const saleTotals = s => { const sub = s.items.reduce((a, i) => a + i.qty * i.unit, 0); const d = Math.round(sub * (s.pct || 0) / 100);
  return { sub, d, total: sub - d, cost: s.items.reduce((a, i) => a + costOf(i), 0) }; };
const paidOf = s => s.pays.reduce((a, p) => a + p.amount, 0);
const saldoOf = s => s.total - paidOf(s);
const hoyVencida = s => saldoOf(s) > 0 && s.due && s.due < hoyISO();

/* ================= INICIO ================= */
function vResumen() {
  const hoy = hoyISO(), mes = hoy.slice(0, 7);
  const S = db.sales, ventasHoy = S.filter(s => s.date === hoy), ventasMes = S.filter(s => s.date.startsWith(mes));
  const cobrosHoy = S.flatMap(s => s.pays).filter(p => p.date === hoy).reduce((a, p) => a + p.amount, 0);
  const gastosHoy = db.expenses.filter(g => g.date === hoy).reduce((a, g) => a + g.amount, 0);
  const pend = S.filter(s => saldoOf(s) > 0);
  const porCobrar = pend.reduce((a, s) => a + saldoOf(s), 0), vencido = pend.filter(hoyVencida).reduce((a, s) => a + saldoOf(s), 0);
  const prox = pend.filter(s => s.due && s.due <= addDays(hoy, 5)).sort((a, b) => a.due.localeCompare(b.due));
  const bajos = db.products.filter(p => p.stock <= p.min).sort((a, b) => a.stock - b.stock);
  const seguir = db.leads.filter(l => !['ganado', 'perdido'].includes(l.status) && l.follow && l.follow <= hoy);
  const citasHoy = agendaDe(hoy), citasMan = agendaDe(addDays(hoy, 1)), cd = db.cashdays.find(c => c.date === hoy);
  const totMes = ventasMes.reduce((a, s) => a + s.total, 0), gananciaMes = ventasMes.reduce((a, s) => a + s.total - s.cost, 0);
  const gastosMes = db.expenses.filter(g => g.date.startsWith(mes) && !g.inCost).reduce((a, g) => a + g.amount, 0);
  const dias = [...Array(7)].map((_, i) => addDays(hoy, i - 6));
  const serie = dias.map(d => ({ d, v: S.filter(s => s.date === d).reduce((a, s) => a + s.total, 0) }));
  const max = Math.max(1, ...serie.map(x => x.v));
  view.innerHTML = `
  ${!db.products.length ? '<div class="banner">Todavía no cargaste tu inventario. Andá a <b>Ajustes → Importar Excel</b> y subí tu planilla de stock.</div>' : ''}
  ${!cd || cd.closed ? `<div class="banner">${!cd ? '💵 La caja de hoy todavía no está abierta.' : '💵 La caja de hoy ya está cerrada.'} <a href="#" id="go_caja">Ir a Caja</a></div>` : ''}
  <div class="grid">
    <div class="kpi"><b>${gs(ventasHoy.reduce((a, s) => a + s.total, 0))}</b><span>Ventas de hoy (${ventasHoy.length})</span></div>
    <div class="kpi ok"><b>${gs(cobrosHoy)}</b><span>Cobrado hoy</span></div>
    <div class="kpi"><b>${gs(gastosHoy)}</b><span>Gastos de hoy</span></div>
    <div class="kpi"><b>${citasHoy.length}</b><span>Colocaciones hoy · mañana ${citasMan.length}</span></div>
    <div class="kpi ${vencido ? 'bad' : ''}"><b>${gs(porCobrar)}</b><span>Por cobrar${vencido ? ' · vencido ' + gs(vencido) : ''}</span></div>
    <div class="kpi ${bajos.length ? 'bad' : ''}"><b>${bajos.length}</b><span>Stock bajo</span></div>
  </div>
  <div class="card"><h2>📅 Agenda de hoy</h2>${citasHoy.length ? tabla(['Hora', 'Cliente', 'Vehículo', 'Colocador'], citasHoy.map(a => `<tr class="click" data-ag="${a.id}"><td><b>${esc(a.time)}</b></td><td>${esc(a.clientName)}${a.domicilio ? ' 🚗' : ''}</td><td class="wrap">${esc(a.vehicle)}</td><td>${esc(a.tech)}</td></tr>`).join('')) : '<p class="mut">No hay colocaciones agendadas para hoy.</p>'}</div>
  <div class="card"><h2>Este mes</h2><div class="grid" style="margin:0">
    <div class="kpi"><b>${gs(totMes)}</b><span>Ventas (${ventasMes.length})</span></div>
    ${boss() ? `<div class="kpi"><b>${gs(gananciaMes)}</b><span>Ganancia bruta</span></div>
    <div class="kpi"><b>${gs(gastosMes)}</b><span>Gastos</span></div>
    <div class="kpi ${gananciaMes - gastosMes < 0 ? 'bad' : 'ok'}"><b>${gs(gananciaMes - gastosMes)}</b><span>Resultado</span></div>` : '<div class="kpi"><b>🔒</b><span>Ganancias solo para el jefe</span></div>'}
  </div></div>
  <div class="card"><h2>Ventas de los últimos 7 días</h2>
    <svg viewBox="0 0 350 120" width="100%" role="img" aria-label="Ventas por día">${serie.map((x, i) => { const h = x.v / max * 80, bx = 12 + i * 47;
    return `<rect x="${bx}" y="${90 - h}" width="30" height="${h}" rx="4" fill="#2b6cb0"/><text x="${bx + 15}" y="106" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">${x.d.slice(8)}/${x.d.slice(5, 7)}</text>`; }).join('')}</svg></div>
  <div class="card"><h2>💳 Créditos por vencer (5 días) o vencidos</h2>${prox.length ? tabla(['Cliente', 'Vence', 'Saldo', ''], prox.map(s => `<tr class="click" data-v="${s.id}"><td>${esc(s.clientName)}</td><td>${hoyVencida(s) ? '<span class="tag bad">' + dmy(s.due) + '</span>' : dmy(s.due)}</td><td class="n">${gs(saldoOf(s))}</td><td>${waLink((cli(s.clientId) || {}).phone) ? `<a class="btn sm" href="${waLink((cli(s.clientId) || {}).phone, `Hola ${s.clientName}, te escribimos de CristalAuto Parabrisas. Te recordamos que tu cuenta de ${gs(saldoOf(s))} vence el ${dmy(s.due)}. ¡Gracias!`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td></tr>`).join(''), [2]) : '<p class="mut">Sin créditos por vencer.</p>'}</div>
  <div class="card"><h2>⏰ Seguimiento de consultas de hoy</h2>${seguir.length ? tabla(['Cliente', 'Interés', 'Origen', ''], seguir.map(l => `<tr><td>${esc(l.name)}</td><td class="wrap">${esc(l.interest)}</td><td>${esc(l.source)}</td><td>${waLink(l.phone) ? `<a class="btn sm" href="${waLink(l.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td></tr>`).join('')) : '<p class="mut">Nada pendiente 👌</p>'}</div>
  <div class="card"><h2>⚠️ Stock para reponer</h2>${bajos.length ? tabla(['Código', 'Descripción', 'Stock'], bajos.slice(0, 15).map(p => `<tr><td>${esc(p.code)}</td><td class="wrap">${esc(p.name)}</td><td class="n">${stockDot(p)}${fmt(p.stock)}</td></tr>`).join(''), [2]) + (bajos.length > 15 ? `<p class="mut">…y ${bajos.length - 15} más en Stock.</p>` : '') : '<p class="mut">Todo con stock suficiente.</p>'}</div>`;
  document.querySelectorAll('#view [data-v]').forEach(r => r.onclick = () => verVenta(r.dataset.v));
  document.querySelectorAll('#view [data-ag]').forEach(r => r.onclick = () => { tab = 'agenda'; ag.date = hoy; render(); });
  const gc = $('#go_caja'); if (gc) gc.onclick = e => { e.preventDefault(); tab = 'caja'; cj.date = hoy; render(); };
}

/* ================= VENTAS y COTIZACIONES ================= */
let cart = nuevoCart();
function nuevoCart() { return { mode: 'venta', kind: 'colocado', clientName: '', phone: '', ctype: 'particular', vehicle: '', tech: '', items: [], pct: 0, date: hoyISO(), pay: 'contado', method: 'Efectivo', abono: 0, due: addDays(hoyISO(), 30), invType: '', invNo: '', note: '', apptId: '', leadId: '' }; }
let vf = { from: hoyISO(), to: hoyISO() };
function vVentas() {
  const cot = cart.mode === 'cotiz';
  const abiertas = db.leads.filter(l => !['ganado', 'perdido'].includes(l.status));
  view.innerHTML = `
  <div class="card"><h2>${cot ? 'Nueva cotización' : 'Nueva venta'}</h2>
    <div class="seg" id="m_seg"><button data-m="venta">🧾 Venta</button><button data-m="cotiz">📝 Cotización (enviar por WhatsApp)</button></div>
    ${cart.apptId ? '<div class="banner">Viene de una cita de la agenda: completá los precios y registrá el cobro.</div>' : ''}
    <div class="seg" id="k_seg">${[['colocado', '🔧 Cambio / colocado'], ['mayorista', '📦 Mayorista'], ['servicio', '✨ Servicio']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
    <div class="row"><div><label>Cliente</label><input id="v_cli" list="clis" placeholder="Cliente ocasional" autocomplete="off" value="${esc(cart.clientName)}"></div>
      <div><label>Teléfono / WhatsApp</label><input id="v_tel" inputmode="tel" value="${esc(cart.phone)}"></div></div>
    <datalist id="clis">${db.clients.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <div class="row"><div><label>Tipo (si es cliente nuevo)</label><select id="v_ctype">${optsKV([['particular', 'Particular'], ['taller', 'Taller'], ['empresa', 'Empresa / flota']], cart.ctype)}</select></div>
      <div><label>Colocador</label><select id="v_tech"><option value="">—</option>${opts(db.cfg.staff, cart.tech)}</select></div></div>
    <label>Vehículo / chapa</label><input id="v_veh" placeholder="Toyota Vitz 2008 · ABC123" value="${esc(cart.vehicle)}">
    <label>Buscar vidrio en stock (código o modelo del vehículo)</label><input id="v_q" placeholder="Ej: vitz 2005  ·  hilux  ·  NCP10" autocomplete="off"><div id="v_res" class="sugs"></div>
    <div class="row"><div><label>Agregar servicio</label><select id="v_srv"><option value="">— elegir servicio —</option>${db.services.map(s => `<option value="${s.id}">${esc(s.name)}${s.price ? ' · ' + gs(s.price) : ''}</option>`).join('')}</select></div>
      <div><label>&nbsp;</label><button class="btn sec" id="v_ext" style="width:100%">＋ Vidrio de proveedor (no está en stock)</button></div></div>
    <div id="v_items"></div>
    <div class="row"><div><label>Descuento %</label><input id="v_pct" inputmode="decimal" value="${cart.pct || ''}" placeholder="0"></div>
      <div><label>Fecha</label><input type="date" id="v_date" value="${cart.date}"></div></div>
    <div id="v_tot"></div>
    ${cot ? '' : `<label>Pago</label>
    <div class="seg" id="p_seg"><button data-p="contado">Contado</button><button data-p="credito">A crédito</button></div>
    <div class="row"><div><label>Forma de pago</label><select id="v_method">${opts(METODOS, cart.method)}</select></div>
      <div id="v_cred" class="row" style="flex:2 1 280px"><div><label>Abona ahora</label><input id="v_abono" inputmode="numeric" value="${cart.abono || ''}" placeholder="0"></div>
      <div><label>Vence (máx. 1 mes)</label><input type="date" id="v_due" value="${cart.due}"></div></div></div>
    <div class="row"><div><label>Factura</label><select id="v_inv"><option value="">Aún sin factura</option><option value="fisica" ${cart.invType === 'fisica' ? 'selected' : ''}>Física (talonario)</option><option value="electronica" ${cart.invType === 'electronica' ? 'selected' : ''}>Electrónica</option></select></div>
      <div><label>N° de factura</label><input id="v_invno" placeholder="001-001-0000000" value="${esc(cart.invNo)}"></div></div>
    <label>¿Viene de una consulta? (para medir la publicidad)</label><select id="v_lead"><option value="">— no / no sé —</option>${abiertas.map(l => `<option value="${l.id}" ${l.id === cart.leadId ? 'selected' : ''}>${esc(l.name)} · ${esc(l.interest)} · ${esc(l.source)}</option>`).join('')}</select>`}
    <label>Nota</label><input id="v_note" value="${esc(cart.note)}">
    <button class="btn block ${cot ? '' : 'ok'}" id="v_save">${cot ? 'Guardar y enviar por WhatsApp' : 'Registrar venta'}</button>
  </div>
  <div class="card"><h2>Ventas registradas</h2>
    <div class="row"><div><label>Desde</label><input type="date" id="f_from" value="${vf.from}"></div><div><label>Hasta</label><input type="date" id="f_to" value="${vf.to}"></div>
      <div><button class="btn sec" id="f_mes">Este mes</button></div></div>
    <div id="v_list"></div></div>
  <div class="card"><h2>Cotizaciones recientes</h2><div id="q_list"></div></div>`;
  const seg = () => { document.querySelectorAll('#m_seg button').forEach(b => b.classList.toggle('on', b.dataset.m === cart.mode));
    document.querySelectorAll('#k_seg button').forEach(b => b.classList.toggle('on', b.dataset.k === cart.kind));
    if (!cot) { document.querySelectorAll('#p_seg button').forEach(b => b.classList.toggle('on', b.dataset.p === cart.pay)); $('#v_cred').style.display = cart.pay === 'credito' ? '' : 'none'; } };
  $('#m_seg').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.m !== cart.mode) { cart.mode = b.dataset.m; vVentas(); } };
  $('#k_seg').onclick = e => { const b = e.target.closest('button'); if (b) { cart.kind = b.dataset.k; seg(); } };
  if (!cot) $('#p_seg').onclick = e => { const b = e.target.closest('button'); if (b) { cart.pay = b.dataset.p; seg(); } };
  const bind = (id, key, conv = v => v) => { const el = $(id); if (el) el.oninput = e => { cart[key] = conv(e.target.value); if (key === 'pct') totales(); }; };
  bind('#v_cli', 'clientName'); bind('#v_tel', 'phone'); bind('#v_ctype', 'ctype'); bind('#v_veh', 'vehicle'); bind('#v_tech', 'tech'); bind('#v_pct', 'pct', numGs); bind('#v_date', 'date');
  bind('#v_method', 'method'); bind('#v_abono', 'abono', numGs); bind('#v_due', 'due'); bind('#v_inv', 'invType'); bind('#v_invno', 'invNo'); bind('#v_note', 'note'); bind('#v_lead', 'leadId');
  $('#v_cli').onchange = e => { const c = db.clients.find(x => norm(x.name) === norm(e.target.value)); if (c) { if (c.phone && !cart.phone) { cart.phone = c.phone; $('#v_tel').value = c.phone; } cart.ctype = c.type; $('#v_ctype').value = c.type; } };
  picker($('#v_q'), $('#v_res'), p => {
    const price = cart.kind === 'mayorista' ? p.mayorista : (p.colocado || 0);
    cart.items.push({ type: 'prod', id: p.id, name: p.code + ' — ' + p.name, qty: 1, unit: price, cost: p.compra || 0 }); items();
  });
  $('#v_srv').onchange = e => { const s = db.services.find(x => x.id === e.target.value); if (s) { cart.items.push({ type: 'srv', id: s.id, name: s.name, qty: 1, unit: s.price, cost: 0 }); items(); } e.target.value = ''; };
  $('#v_ext').onclick = () => { cart.items.push({ type: 'ext', name: '', qty: 1, unit: 0, cost: 0, supplierId: '', via: 'Efectivo' }); items(); };
  $('#v_save').onclick = cot ? guardarCotizacion : guardarVenta;
  const lista = () => { vf.from = $('#f_from').value; vf.to = $('#f_to').value; listaVentas(); };
  $('#f_from').onchange = lista; $('#f_to').onchange = lista;
  $('#f_mes').onclick = () => { vf = { from: hoyISO().slice(0, 8) + '01', to: hoyISO() }; vVentas(); };
  seg(); items(); listaVentas(); listaCotiz();
}
function items() {
  const c = cart;
  $('#v_items').innerHTML = c.items.length ? `<div class="tablewrap"><table><thead><tr><th>Detalle</th><th class="n">Cant.</th><th class="n">Precio unit.</th><th></th></tr></thead><tbody>${c.items.map((i, k) => `<tr>
    <td class="wrap">${i.type === 'ext' ? `<input data-n="${k}" value="${esc(i.name)}" placeholder="Ej: Parabrisas Mercedes Sprinter 2015">
      <div class="row" style="margin-top:6px"><select data-sup="${k}"><option value="">Proveedor…</option>${db.suppliers.map(s => `<option value="${s.id}" ${s.id === i.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <input data-cost="${k}" inputmode="numeric" placeholder="Costo unit." value="${i.cost || ''}"><select data-via="${k}">${opts(VIAS, i.via)}</select></div><span class="mut">Lo que pagaste al proveedor y desde dónde</span>` : esc(i.name)}
      ${i.unit ? '' : '<br><span class="mut">⚠ cargá el precio</span>'}</td>
    <td class="n"><input class="qty" data-q="${k}" inputmode="decimal" value="${i.qty}"></td>
    <td class="n"><input class="unit ${i.unit ? '' : 'miss'}" data-u="${k}" inputmode="numeric" value="${i.unit || ''}" placeholder="0"></td>
    <td><button class="btn sec sm" data-x="${k}">✕</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Buscá un vidrio, agregá un servicio o un vidrio de proveedor.</p>';
  const on = (sel, key, fn) => document.querySelectorAll(sel).forEach(el => el.oninput = () => { fn(c.items[el.dataset[key]], el); totales(); });
  on('[data-q]', 'q', (i, el) => i.qty = numGs(el.value));
  on('[data-u]', 'u', (i, el) => { i.unit = numGs(el.value); el.classList.toggle('miss', !i.unit); });
  on('[data-n]', 'n', (i, el) => i.name = el.value); on('[data-cost]', 'cost', (i, el) => i.cost = numGs(el.value));
  on('[data-sup]', 'sup', (i, el) => i.supplierId = el.value); on('[data-via]', 'via', (i, el) => i.via = el.value);
  document.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { c.items.splice(b.dataset.x, 1); items(); });
  totales();
}
function totales() {
  const t = saleTotals(cart), g = t.total - t.cost;
  $('#v_tot').innerHTML = cart.items.length ? `<div class="totbox"><div><span>Subtotal</span><span>${gs(t.sub)}</span></div>${t.d ? `<div><span>Descuento ${cart.pct}%</span><span>−${gs(t.d)}</span></div>` : ''}
    <div class="big"><span>TOTAL</span><span>${gs(t.total)}</span></div><div class="mut"><span>IVA 10% incluido</span><span>${gs(t.total / 11)}</span></div>
    ${boss() && t.cost ? `<div class="mut"><span>Costo de vidrios</span><span>${gs(t.cost)}</span></div><div class="mut"><span>Ganancia bruta</span><span>${gs(g)} (${t.total ? Math.round(g / t.total * 100) : 0}%)</span></div>` : ''}</div>` : '';
}
function validarCart() {
  const c = cart; if (!c.items.length) { toast('Agregá al menos un producto o servicio'); return false; }
  if (c.items.some(i => !i.unit || !i.qty)) { toast('Hay líneas sin precio o cantidad'); return false; }
  if (c.items.some(i => i.type === 'ext' && !i.name.trim())) { toast('Poné el nombre del vidrio de proveedor'); return false; }
  return true;
}
function clienteDe(c) {
  const name = c.clientName.trim(); let client = name ? db.clients.find(x => norm(x.name) === norm(name)) : null;
  if (name && !client) { client = { id: uid(), name, type: c.ctype, ruc: '', phone: c.phone.trim(), note: '' }; db.clients.push(client); }
  else if (client && c.phone.trim() && !client.phone) client.phone = c.phone.trim();
  return client;
}
function guardarVenta() {
  const c = cart; if (!validarCart()) return;
  const t = saleTotals(c), name = c.clientName.trim();
  if (c.pay === 'credito' && !name) return toast('Para vender a crédito indicá el cliente');
  if (c.pay === 'credito' && c.abono > t.total) return toast('El abono no puede superar el total');
  for (const i of c.items.filter(i => i.type === 'prod')) { const p = prod(i.id);
    if (p && i.qty > p.stock && !confirm(`Solo hay ${fmt(p.stock)} de ${p.code}. ¿Vender ${fmt(i.qty)} igualmente?`)) return; }
  const client = clienteDe(c);
  const n = Math.max(0, ...db.sales.map(x => x.n || 0)) + 1;
  const s = { id: uid(), n, date: c.date || hoyISO(), ts: Date.now(), kind: c.kind, clientId: client ? client.id : '', clientName: name || 'Cliente ocasional', vehicle: c.vehicle.trim(), tech: c.tech,
    items: c.items.map(i => ({ ...i, name: i.name.trim() })), pct: c.pct || 0, total: t.total, cost: t.cost, pay: c.pay, due: c.pay === 'credito' ? c.due : '', pays: [],
    inv: { type: c.invType, no: c.invNo.trim(), cdc: '' }, note: c.note.trim(), apptId: c.apptId, leadId: c.leadId };
  const inicial = c.pay === 'credito' ? c.abono : t.total;
  if (inicial > 0) s.pays.push({ id: uid(), date: s.date, amount: inicial, method: c.method });
  for (const i of s.items) {
    if (i.type === 'prod') { mover(i.id, 'out', i.qty, `Venta #${n} · ${s.clientName}`, s.date, s.id);
      const p = prod(i.id); if (p && c.kind === 'colocado' && i.unit) p.colocado = i.unit; } // recuerda el último precio colocado
    if (i.type === 'ext' && i.cost > 0) db.expenses.push({ id: uid(), date: s.date, cat: 'Compra a proveedor', desc: `${i.name} · venta #${n}`, amount: i.qty * i.cost, via: i.via || 'Efectivo', supplierId: i.supplierId || '', saleId: s.id, inCost: true });
  }
  if (c.apptId) { const a = db.appts.find(x => x.id === c.apptId); if (a) { a.status = 'hecho'; a.saleId = s.id; } }
  if (c.leadId) { const l = db.leads.find(x => x.id === c.leadId); if (l) { l.status = 'ganado'; l.saleId = s.id; l.follow = ''; } }
  db.sales.push(s); guardar(); Sync.notifySale(s.id);
  cart = nuevoCart(); vf = { from: s.date, to: s.date };
  toast(`Venta #${n} registrada · ${gs(s.total)}`); vVentas(); verVenta(s.id);
}
function cotizTexto(q) {
  const e = db.cfg.empresa;
  return `Hola${q.clientName ? ' ' + q.clientName : ''}! Te paso la cotización de ${e.nombre}:\n${q.vehicle ? 'Vehículo: ' + q.vehicle + '\n' : ''}\n` +
    q.items.map(i => `• ${i.name}${i.qty !== 1 ? ' x' + fmt(i.qty) : ''}: ${gs(i.qty * i.unit)}`).join('\n') +
    `${q.pct ? `\nDescuento ${q.pct}%` : ''}\n*TOTAL: ${gs(q.total)}* (IVA incluido)\nVálida por 3 días. ¿Querés que te agendemos la colocación?`;
}
function guardarCotizacion() {
  const c = cart; if (!validarCart()) return; const t = saleTotals(c), client = clienteDe(c);
  const n = Math.max(0, ...db.quotes.map(x => x.n || 0)) + 1;
  const q = { id: uid(), n, date: c.date || hoyISO(), ts: Date.now(), kind: c.kind, clientId: client ? client.id : '', clientName: c.clientName.trim(), phone: c.phone.trim(), vehicle: c.vehicle.trim(),
    items: c.items.map(i => ({ ...i, name: i.name.trim() })), pct: c.pct || 0, total: t.total, cost: t.cost, status: 'enviada', note: c.note.trim() };
  db.quotes.push(q); guardar();
  const link = waLink(q.phone, cotizTexto(q));
  cart = nuevoCart(); vVentas();
  if (link) { window.open(link, '_blank'); toast(`Cotización #${n} guardada`); } else toast(`Cotización #${n} guardada (sin teléfono para WhatsApp)`);
}
function listaCotiz() {
  const L = db.quotes.slice().sort((a, b) => b.ts - a.ts).slice(0, 15);
  $('#q_list').innerHTML = L.length ? tabla(['N°', 'Cliente', 'Total', 'Estado', ''], L.map(q => `<tr><td>#${q.n}<br><span class="mut">${dmy(q.date)}</span></td><td class="wrap">${esc(q.clientName || 'Sin nombre')}<br><span class="mut">${esc(q.vehicle)}</span></td><td class="n">${gs(q.total)}</td>
    <td><select data-qs="${q.id}" style="min-height:34px">${optsKV([['enviada', 'Enviada'], ['aceptada', 'Aceptada'], ['rechazada', 'Rechazada']], q.status)}</select></td>
    <td>${waLink(q.phone) ? `<a class="btn sm" href="${waLink(q.phone, cotizTexto(q))}" target="_blank" rel="noopener">WhatsApp</a> ` : ''}<button class="btn sec sm" data-qc="${q.id}">→ Venta</button> <button class="btn sec sm" data-qd="${q.id}">✕</button></td></tr>`).join(''), [2]) : '<p class="mut">Todavía no hiciste cotizaciones.</p>';
  document.querySelectorAll('[data-qs]').forEach(s => s.onchange = () => { db.quotes.find(q => q.id === s.dataset.qs).status = s.value; guardar(); });
  document.querySelectorAll('[data-qd]').forEach(b => b.onclick = () => { if (confirm('¿Borrar cotización?')) { db.quotes = db.quotes.filter(q => q.id !== b.dataset.qd); guardar(); listaCotiz(); } });
  document.querySelectorAll('[data-qc]').forEach(b => b.onclick = () => { const q = db.quotes.find(x => x.id === b.dataset.qc);
    cart = { ...nuevoCart(), kind: q.kind || 'colocado', clientName: q.clientName, phone: q.phone, vehicle: q.vehicle, items: q.items.map(i => ({ ...i })), pct: q.pct }; q.status = 'aceptada'; guardar(); vVentas(); window.scrollTo(0, 0); });
}
function listaVentas() {
  const L = db.sales.filter(s => (!vf.from || s.date >= vf.from) && (!vf.to || s.date <= vf.to)).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  const tot = L.reduce((a, s) => a + s.total, 0);
  $('#v_list').innerHTML = (L.length ? tabla(['~N°', 'Fecha', 'Cliente', '~Detalle', 'Total', '~Estado'], L.map(s => { const d = saldoOf(s);
    return `<tr class="click" data-v="${s.id}"><td class="hm">#${s.n}</td><td>${dmy(s.date)}</td><td class="wrap">${esc(s.clientName)}<br><span class="mut">${esc(s.items[0].name.slice(0, 32))}</span></td><td class="wrap hm">${esc(s.items[0].name)}${s.items.length > 1 ? ` +${s.items.length - 1}` : ''}</td>
    <td class="n">${gs(s.total)}<span class="only-m"><br>${d > 0 ? `<span class="tag ${hoyVencida(s) ? 'bad' : 'warn'}">Debe</span>` : '<span class="tag ok">Pagado</span>'}</span></td><td class="hm">${d > 0 ? `<span class="tag ${hoyVencida(s) ? 'bad' : 'warn'}">Debe ${gs(d)}</span>` : '<span class="tag ok">Pagado</span>'}</td></tr>`; }).join(''), [4]) : '<p class="mut">Sin ventas en este período.</p>')
    + `<p class="mut">${L.length} ventas · total ${gs(tot)}</p>`;
  document.querySelectorAll('#v_list [data-v]').forEach(r => r.onclick = () => verVenta(r.dataset.v));
}
function verVenta(id) {
  const s = db.sales.find(x => x.id === id); if (!s) return; const t = saleTotals(s), saldo = saldoOf(s);
  modal(`<h2>Venta #${s.n} · ${dmy(s.date)}</h2>
    <p><b>${esc(s.clientName)}</b>${s.vehicle ? ' · ' + esc(s.vehicle) : ''}${s.tech ? '<br><span class="mut">Colocó: ' + esc(s.tech) + '</span>' : ''}</p>
    ${tabla(['Detalle', 'Cant.', 'Total'], s.items.map(i => `<tr><td class="wrap">${esc(i.name)}${i.type === 'ext' ? ' <span class="tag">proveedor</span>' : ''}</td><td class="n">${fmt(i.qty)}</td><td class="n">${gs(i.qty * i.unit)}</td></tr>`).join(''), [1, 2])}
    <div class="totbox">${s.pct ? `<div><span>Descuento ${s.pct}%</span><span>−${gs(t.d)}</span></div>` : ''}<div class="big"><span>TOTAL</span><span>${gs(s.total)}</span></div>
      <div class="mut"><span>Cobrado</span><span>${gs(paidOf(s))}</span></div>${saldo > 0 ? `<div class="mut"><span>Saldo${s.due ? ' (vence ' + dmy(s.due) + ')' : ''}</span><span><b>${gs(saldo)}</b></span></div>` : ''}
      ${boss() && s.cost ? `<div class="mut"><span>Ganancia bruta</span><span>${gs(s.total - s.cost)}</span></div>` : ''}</div>
    ${s.pays.length ? `<h3>Pagos</h3>${s.pays.map(p => `<div class="mut">${dmy(p.date)} · ${esc(p.method)} · ${gs(p.amount)}</div>`).join('')}` : ''}
    <p class="mut">Factura: ${s.inv.type ? (s.inv.type === 'fisica' ? 'Física' : 'Electrónica') + (s.inv.no ? ' N° ' + esc(s.inv.no) : ' (sin número)') : 'aún sin factura'}${s.note ? '<br>Nota: ' + esc(s.note) : ''}</p>
    <div class="row" style="margin-top:10px">${saldo > 0 ? '<button class="btn ok" id="m_cobrar">Cobrar</button>' : ''}<button class="btn" id="m_fac">Factura</button><button class="btn sec" id="m_print">Imprimir</button>
      <button class="btn sec" id="m_close">Cerrar</button><button class="btn bad" id="m_del">Anular</button></div>`);
  $('#m_close').onclick = cerrar; $('#m_print').onclick = () => imprimir(s);
  $('#m_fac').onclick = () => formFactura(s); if (saldo > 0) $('#m_cobrar').onclick = () => formCobro(s);
  $('#m_del').onclick = () => needBoss(() => {
    if (!confirm(`¿Anular la venta #${s.n}? Se devuelve el stock y se borran sus cobros y compras a proveedor.`)) return;
    db.moves = db.moves.filter(m => m.ref !== s.id); db.expenses = db.expenses.filter(g => g.saleId !== s.id); db.sales = db.sales.filter(x => x.id !== s.id);
    const a = db.appts.find(x => x.saleId === s.id); if (a) { a.status = 'agendado'; a.saleId = ''; }
    guardar(); cerrar(); render(); toast('Venta anulada'); });
}
function formCobro(s) {
  modal(`<h2>Cobrar · ${esc(s.clientName)}</h2><p class="mut">Venta #${s.n} · saldo ${gs(saldoOf(s))}</p>
    <label>Monto</label><input id="c_m" inputmode="numeric" value="${saldoOf(s)}"><label>Forma de pago</label><select id="c_f">${opts(METODOS)}</select>
    <label>Fecha</label><input type="date" id="c_d" value="${hoyISO()}">
    <div class="row" style="margin-top:12px"><button class="btn ok" id="c_ok">Registrar cobro</button><button class="btn sec" id="c_no">Cancelar</button></div>`);
  $('#c_no').onclick = () => verVenta(s.id);
  $('#c_ok').onclick = () => { const m = numGs($('#c_m').value); if (m <= 0 || m > saldoOf(s)) return toast('Monto inválido');
    s.pays.push({ id: uid(), date: $('#c_d').value || hoyISO(), amount: m, method: $('#c_f').value }); guardar(); toast('Cobro registrado'); render(); verVenta(s.id); };
}
function formFactura(s) {
  modal(`<h2>Factura · Venta #${s.n}</h2>
    <label>Tipo</label><select id="i_t"><option value="">Sin factura</option><option value="fisica" ${s.inv.type === 'fisica' ? 'selected' : ''}>Física (talonario)</option><option value="electronica" ${s.inv.type === 'electronica' ? 'selected' : ''}>Electrónica</option></select>
    <label>Número de factura</label><input id="i_n" value="${esc(s.inv.no)}" placeholder="001-001-0000000">
    <label>CDC (solo factura electrónica)</label><input id="i_c" value="${esc(s.inv.cdc)}">
    <div class="banner" style="margin-top:12px">La app <b>todavía no envía facturas a la DNIT (SIFEN)</b>. Podés registrar el número y el CDC emitidos, e imprimir el comprobante. Para emitir desde acá hace falta habilitarse como facturador electrónico y conectar un facturador autorizado.</div>
    <div class="row"><button class="btn" id="i_ok">Guardar</button><button class="btn sec" id="i_json">Descargar datos (JSON)</button><button class="btn sec" id="i_no">Volver</button></div>`);
  $('#i_no').onclick = () => verVenta(s.id);
  $('#i_ok').onclick = () => { s.inv = { type: $('#i_t').value, no: $('#i_n').value.trim(), cdc: $('#i_c').value.trim() }; guardar(); toast('Factura guardada'); verVenta(s.id); };
  $('#i_json').onclick = () => { const cl = cli(s.clientId) || {}; bajar(`venta-${s.n}.json`, JSON.stringify({ emisor: db.cfg.empresa, receptor: { nombre: s.clientName, ruc: cl.ruc || '' }, fecha: s.date, moneda: 'PYG', condicion: s.pay === 'credito' ? 'Crédito' : 'Contado',
    items: s.items.map(i => ({ descripcion: i.name, cantidad: i.qty, precioUnitario: i.unit, iva: 10 })), descuentoPorcentaje: s.pct, total: s.total, ivaIncluido10: Math.round(s.total / 11) }, null, 2), 'application/json'); };
}
function imprimir(s) {
  const e = db.cfg.empresa, cl = cli(s.clientId) || {}, t = saleTotals(s);
  const w = window.open('', '_blank'); if (!w) return toast('Permití las ventanas emergentes para imprimir');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Venta ${s.n}</title><style>body{font:14px sans-serif;max-width:720px;margin:20px auto}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}.r{text-align:right}h1{margin:0}.s{color:#555;font-size:12px}</style>
  <h1>${esc(e.nombre)}</h1><div class="s">${esc(e.direccion)} ${e.tel ? '· Tel. ' + esc(e.tel) : ''}<br>${e.ruc ? 'RUC ' + esc(e.ruc) : ''} ${e.timbrado ? '· Timbrado ' + esc(e.timbrado) + (e.vigencia ? ' vigente hasta ' + esc(e.vigencia) : '') : ''}</div><hr>
  <h2>${s.inv.no ? 'Factura N° ' + esc(s.inv.no) : 'Comprobante de venta N° ' + s.n}</h2>
  <p>Fecha: ${dmy(s.date)} · Condición: ${s.pay === 'credito' ? 'Crédito' + (s.due ? ' (vence ' + dmy(s.due) + ')' : '') : 'Contado'}<br>Cliente: <b>${esc(s.clientName)}</b> ${cl.ruc ? '· RUC ' + esc(cl.ruc) : ''}<br>${s.vehicle ? 'Vehículo: ' + esc(s.vehicle) : ''}</p>
  <table><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td class="r">${fmt(i.qty)}</td><td class="r">${gs(i.unit)}</td><td class="r">${gs(i.qty * i.unit)}</td></tr>`).join('')}</table>
  <p class="r">${s.pct ? 'Descuento ' + s.pct + '%: −' + gs(t.d) + '<br>' : ''}<b style="font-size:18px">TOTAL ${gs(s.total)}</b><br>IVA 10% incluido: ${gs(s.total / 11)}</p>
  ${s.inv.no ? '' : '<p class="s">Documento sin validez tributaria. La factura legal se emite por talonario o factura electrónica.</p>'}<script>onload=()=>print()<\/script>`);
  w.document.close();
}

/* ================= STOCK ================= */
let sf = { q: '', bajo: '' };
function vStock() {
  const valorCompra = db.products.reduce((a, p) => a + Math.max(0, p.stock) * (p.compra || 0), 0);
  view.innerHTML = `<div class="grid"><div class="kpi"><b>${db.products.length}</b><span>Modelos de vidrio</span></div><div class="kpi"><b>${fmt(db.products.reduce((a, p) => a + p.stock, 0))}</b><span>Unidades</span></div>
    ${boss() ? `<div class="kpi"><b>${gs(valorCompra)}</b><span>Valor a precio de compra</span></div>` : ''}<div class="kpi ${db.products.some(p => p.stock <= p.min) ? 'bad' : ''}"><b>${db.products.filter(p => p.stock <= p.min).length}</b><span>Para reponer</span></div></div>
  <div class="card"><div class="row"><div style="flex:2 1 220px"><input id="s_q" type="search" placeholder="Buscar código o modelo…" value="${esc(sf.q)}"></div>
    <select id="s_b"><option value="">Todos</option><option value="1" ${sf.bajo ? 'selected' : ''}>Solo stock bajo</option></select>
    <button class="btn" id="s_in">+ Entrada / conteo</button><button class="btn sec" id="s_new">Nuevo modelo</button></div></div>
  <div class="card" id="s_list"></div>`;
  $('#s_q').oninput = e => { sf.q = e.target.value; listaStock(); }; $('#s_b').onchange = e => { sf.bajo = e.target.value; listaStock(); };
  $('#s_in').onclick = () => formMov(); $('#s_new').onclick = () => formProducto(); listaStock();
}
function listaStock() {
  const w = norm(sf.q).split(' ').filter(Boolean);
  const L = db.products.filter(p => (!w.length || w.every(x => norm(p.code + ' ' + p.name).includes(x))) && (!sf.bajo || p.stock <= p.min)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const B = boss();
  $('#s_list').innerHTML = (L.length ? tabla(['Modelo', 'Stock', ...(B ? ['~Compra'] : []), 'Mayorista', '~Colocado', ...(B ? ['~Margen'] : [])],
    L.slice(0, 300).map(p => `<tr class="click" data-e="${p.id}"><td class="wrap"><b>${esc(p.code)}</b><br><span class="mut">${esc(p.name)}</span></td><td class="n">${stockDot(p)}${fmt(p.stock)}</td>
    ${B ? `<td class="n hm">${gs(p.compra)}</td>` : ''}<td class="n">${gs(p.mayorista)}</td><td class="n hm">${p.colocado ? gs(p.colocado) : '<span class="mut">—</span>'}</td>
    ${B ? `<td class="n hm">${p.mayorista && p.compra ? Math.round((p.mayorista - p.compra) / p.mayorista * 100) + '%' : ''}</td>` : ''}</tr>`).join(''), B ? [1, 2, 3, 4, 5] : [1, 2, 3]) : '<p class="mut">Sin resultados.</p>')
    + `<p class="mut">${Math.min(L.length, 300)} de ${L.length} · toca un modelo para ver/editar todos los precios · 🟢 suficiente 🟠 bajo 🔴 sin stock</p>`;
  document.querySelectorAll('#s_list [data-e]').forEach(r => r.onclick = () => formProducto(r.dataset.e));
}
function formProducto(id) {
  const p = id ? prod(id) : { code: '', name: '', stock: 0, min: db.cfg.minDefault, compra: 0, mayorista: 0, colocado: 0, contenedor: '' };
  const B = boss();
  modal(`<h2>${id ? 'Editar' : 'Nuevo'} modelo</h2>
    <label>Código</label><input id="f_code" value="${esc(p.code)}"><label>Descripción (marca, modelo, años)</label><input id="f_name" value="${esc(p.name)}">
    <div class="row">${id ? '' : `<div><label>Stock inicial</label><input id="f_stock" inputmode="numeric" value="${p.stock}"></div>`}<div><label>Stock mínimo (alerta)</label><input id="f_min" inputmode="numeric" value="${p.min}"></div><div><label>Contenedor</label><input id="f_cont" value="${esc(p.contenedor)}"></div></div>
    <div class="row">${B ? `<div><label>Precio de compra</label><input id="f_compra" inputmode="numeric" value="${p.compra || ''}"></div>` : ''}<div><label>Precio mayorista</label><input id="f_may" inputmode="numeric" value="${p.mayorista || ''}"></div><div><label>Precio colocado</label><input id="f_col" inputmode="numeric" value="${p.colocado || ''}" placeholder="opcional"></div></div>
    <p class="mut">El precio colocado se recuerda solo con la última venta, y siempre lo podés cambiar al vender.</p>
    <div class="row" style="margin-top:12px"><button class="btn" id="ok">Guardar</button><button class="btn sec" id="no">Cancelar</button>${id ? '<button class="btn bad" id="del">Eliminar</button>' : ''}</div>`);
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => {
    const code = $('#f_code').value.trim(), name = $('#f_name').value.trim(); if (!name) return toast('Falta la descripción');
    if (code && db.products.some(x => norm(x.code) === norm(code) && x.id !== id)) return toast('Ya existe ese código');
    const d = { code, name, min: numGs($('#f_min').value), contenedor: $('#f_cont').value.trim(), mayorista: numGs($('#f_may').value), colocado: numGs($('#f_col').value) };
    if (B) d.compra = numGs($('#f_compra').value);
    if (id) Object.assign(p, d);
    else { const np = { id: uid(), stock: 0, compra: 0, ...d }; db.products.push(np); const s = numGs($('#f_stock').value); if (s) mover(np.id, 'in', s, 'Stock inicial'); }
    guardar(); cerrar(); render(); toast('Guardado');
  };
  if (id) $('#del').onclick = () => needBoss(() => { if (!confirm(`¿Eliminar "${p.code}"?`)) return; db.products = db.products.filter(x => x.id !== id); db.moves = db.moves.filter(m => m.pid !== id); guardar(); cerrar(); render(); });
}
function formMov() {
  let sel = null;
  modal(`<h2>Entrada / conteo de stock</h2>
    <div class="seg" id="m_seg"><button data-t="in" class="on">Entrada (llegó mercadería)</button><button data-t="adj">Conteo</button><button data-t="out">Salida / rotura</button></div>
    <label>Modelo (código o vehículo)</label><input id="m_q" autocomplete="off" placeholder="Buscar…"><div id="m_res" class="sugs"></div><div id="m_sel" class="mut"></div>
    <label id="m_lbl">Cantidad que entró</label><input id="m_qty" inputmode="numeric">
    <div class="row"><div><label>Contenedor / origen</label><input id="m_cont" placeholder="Ej: 5to contenedor"></div>${boss() ? '<div><label>Nuevo precio de compra (opcional)</label><input id="m_cost" inputmode="numeric"></div>' : ''}</div>
    <label>Fecha</label><input type="date" id="m_date" value="${hoyISO()}"><label>Nota</label><input id="m_note">
    <div class="row" style="margin-top:12px"><button class="btn" id="ok">Registrar</button><button class="btn sec" id="no">Cerrar</button></div>`);
  let type = 'in';
  $('#m_seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; document.querySelectorAll('#m_seg button').forEach(x => x.classList.toggle('on', x === b));
    $('#m_lbl').textContent = type === 'in' ? 'Cantidad que entró' : type === 'adj' ? 'Conteo real (lo que hay ahora)' : 'Cantidad que sale'; };
  picker($('#m_q'), $('#m_res'), p => { sel = p; $('#m_sel').innerHTML = `<b>${esc(p.code)}</b> ${esc(p.name)} · stock actual <b>${fmt(p.stock)}</b>`; });
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => {
    if (!sel) return toast('Elegí un modelo de la lista'); const raw = $('#m_qty').value.trim(); let q = numGs(raw);
    if (raw === '' || q < 0 || (type !== 'adj' && q <= 0)) return toast('Cantidad inválida');
    const date = $('#m_date').value || hoyISO(), note = $('#m_note').value.trim();
    if (type === 'adj') { q = q - sel.stock; if (!q) return toast('El conteo coincide con el stock'); mover(sel.id, 'adj', q, note || 'Conteo de inventario', date); }
    else mover(sel.id, type, q, note, date);
    if (type === 'in') { const c = $('#m_cont').value.trim(); if (c) sel.contenedor = c; const nc = $('#m_cost') ? numGs($('#m_cost').value) : 0; if (nc > 0) sel.compra = nc; }
    guardar(); toast(`${sel.code}: stock ${fmt(sel.stock)}`); sel = null; $('#m_sel').textContent = ''; $('#m_qty').value = ''; $('#m_q').focus(); listaStock();
  };
}

/* ================= CLIENTES ================= */
function vClientes() {
  const pend = db.sales.filter(s => saldoOf(s) > 0).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const deuda = c => db.sales.filter(s => s.clientId === c.id).reduce((a, s) => a + saldoOf(s), 0);
  const TT = { particular: 'Particular', taller: 'Taller', empresa: 'Empresa' };
  view.innerHTML = `<div class="card"><h2>💳 Cuentas por cobrar · ${gs(pend.reduce((a, s) => a + saldoOf(s), 0))}</h2>
    ${pend.length ? tabla(['Cliente', 'Venta', 'Vence', 'Saldo'], pend.map(s => `<tr class="click" data-v="${s.id}"><td>${esc(s.clientName)}</td><td>#${s.n}</td><td>${s.due ? (hoyVencida(s) ? '<span class="tag bad">' + dmy(s.due) + '</span>' : dmy(s.due)) : '—'}</td><td class="n">${gs(saldoOf(s))}</td></tr>`).join(''), [3]) : '<p class="mut">No hay deudas pendientes.</p>'}</div>
  <div class="card"><div class="row"><div style="flex:2 1 220px"><input id="c_q" type="search" placeholder="Buscar cliente…"></div><button class="btn" id="c_new">+ Nuevo cliente</button></div><div id="c_list"></div></div>`;
  const lista = () => { const q = norm($('#c_q').value); const L = db.clients.filter(c => !q || norm(c.name + ' ' + c.ruc + ' ' + c.phone).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    $('#c_list').innerHTML = L.length ? tabla(['Cliente', 'Tipo', 'Teléfono', 'RUC', 'Ventas', 'Deuda'], L.map(c => `<tr class="click" data-c="${c.id}"><td>${esc(c.name)}</td><td>${TT[c.type] || ''}</td><td>${esc(c.phone)}</td><td>${esc(c.ruc)}</td><td class="n">${db.sales.filter(s => s.clientId === c.id).length}</td><td class="n">${deuda(c) ? '<b>' + gs(deuda(c)) + '</b>' : '—'}</td></tr>`).join(''), [4, 5]) : '<p class="mut">Los clientes se crean solos al vender, o con “Nuevo cliente”.</p>';
    document.querySelectorAll('[data-c]').forEach(r => r.onclick = () => formCliente(r.dataset.c)); };
  $('#c_q').oninput = lista; $('#c_new').onclick = () => formCliente(); lista();
  document.querySelectorAll('#view [data-v]').forEach(r => r.onclick = () => verVenta(r.dataset.v));
}
function formCliente(id) {
  const c = id ? cli(id) : { name: '', type: 'particular', ruc: '', phone: '', note: '' };
  modal(`<h2>${id ? 'Cliente' : 'Nuevo cliente'}</h2><label>Nombre / razón social</label><input id="k_n" value="${esc(c.name)}">
    <div class="row"><div><label>Tipo</label><select id="k_t">${optsKV([['particular', 'Particular'], ['taller', 'Taller'], ['empresa', 'Empresa / flota']], c.type)}</select></div><div><label>RUC / C.I.</label><input id="k_r" value="${esc(c.ruc)}"></div></div>
    <label>Teléfono / WhatsApp</label><input id="k_p" value="${esc(c.phone)}"><label>Nota</label><input id="k_o" value="${esc(c.note)}">
    ${id ? `<h3>Historial</h3>${db.sales.filter(s => s.clientId === id).slice(-8).reverse().map(s => `<div class="mut">#${s.n} · ${dmy(s.date)} · ${gs(s.total)}${saldoOf(s) > 0 ? ' · debe ' + gs(saldoOf(s)) : ''}</div>`).join('') || '<div class="mut">Sin compras.</div>'}` : ''}
    <div class="row" style="margin-top:12px"><button class="btn" id="ok">Guardar</button>${waLink(c.phone) ? `<a class="btn sec" href="${waLink(c.phone)}" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">WhatsApp</a>` : ''}<button class="btn sec" id="no">Cancelar</button>${id ? '<button class="btn bad" id="del">Eliminar</button>' : ''}</div>`);
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => { const name = $('#k_n').value.trim(); if (!name) return toast('Falta el nombre');
    const d = { name, type: $('#k_t').value, ruc: $('#k_r').value.trim(), phone: $('#k_p').value.trim(), note: $('#k_o').value.trim() };
    if (id) { Object.assign(c, d); db.sales.filter(s => s.clientId === id).forEach(s => s.clientName = name); } else db.clients.push({ id: uid(), ...d });
    guardar(); cerrar(); render(); };
  if (id) $('#del').onclick = () => { if (db.sales.some(s => s.clientId === id)) return toast('Tiene ventas: no se puede eliminar'); if (confirm('¿Eliminar cliente?')) { db.clients = db.clients.filter(x => x.id !== id); guardar(); cerrar(); render(); } };
}

/* ================= CAJA ================= */
let cj = { date: hoyISO(), month: hoyISO().slice(0, 7) };
const horaDe = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
function vCaja() {
  const cobros = db.sales.flatMap(s => s.pays.map(p => ({ ...p, s }))).filter(p => p.date === cj.date);
  const gastos = db.expenses.filter(g => g.date === cj.date);
  const cd = db.cashdays.find(c => c.date === cj.date);
  const ef = cobros.filter(p => p.method === 'Efectivo').reduce((a, p) => a + p.amount, 0), tr = cobros.filter(p => p.method === 'Transferencia').reduce((a, p) => a + p.amount, 0);
  const otros = cobros.reduce((a, p) => a + p.amount, 0) - ef - tr;
  const gEf = gastos.filter(g => g.via !== 'Itaú').reduce((a, g) => a + g.amount, 0), gIt = gastos.filter(g => g.via === 'Itaú').reduce((a, g) => a + g.amount, 0);
  const esperado = (cd ? cd.open : 0) + ef - gEf;
  const kpis = `<div class="grid" style="margin-top:10px"><div class="kpi ok"><b>${gs(ef)}</b><span>Cobrado en efectivo</span></div><div class="kpi ok"><b>${gs(tr)}</b><span>Transferencias (Itaú)</span></div>${otros ? `<div class="kpi"><b>${gs(otros)}</b><span>Tarjeta / cheque</span></div>` : ''}
    <div class="kpi"><b>${gs(gEf)}</b><span>Gastos en efectivo</span></div><div class="kpi"><b>${gs(gIt)}</b><span>Gastos pagados con Itaú</span></div><div class="kpi"><b>${gs(esperado)}</b><span>Efectivo que debería haber en caja</span></div></div>`;
  view.innerHTML = `<div class="card"><div class="row"><div><label>Día</label><input type="date" id="j_d" value="${cj.date}"></div></div>
    ${!cd ? `<h3>Caja sin abrir</h3><div class="row"><div><label>Efectivo con el que empieza el día</label><input id="j_open" inputmode="numeric" placeholder="0"></div><div><button class="btn ok" id="j_abrir" style="width:100%">Abrir caja</button></div></div>${kpis}`
    : !cd.closed ? `<h3>🟢 Caja abierta desde las ${horaDe(cd.openedAt)} · inicio ${gs(cd.open)}</h3>${kpis}
      <h3>Cerrar caja</h3><div class="row"><div><label>Efectivo contado ahora</label><input id="j_cnt" inputmode="numeric"></div><div><label>Nota (opcional)</label><input id="j_note"></div></div><button class="btn block" id="j_cerrar">Cerrar caja</button>`
    : `<h3>🔒 Caja cerrada a las ${horaDe(cd.closedAt)}</h3>${kpis}<div class="totbox"><div><span>Esperado en efectivo</span><span>${gs(cd.expected)}</span></div><div><span>Contado</span><span>${gs(cd.counted)}</span></div>
      <div class="big"><span>Diferencia</span><span>${cd.counted - cd.expected === 0 ? '✔ ' : ''}${gs(cd.counted - cd.expected)}</span></div>${cd.note ? `<div class="mut">${esc(cd.note)}</div>` : ''}</div>
      <p class="mut">Las transferencias (${gs(tr)}) compará con el extracto del Itaú.</p><button class="btn sec" id="j_reabrir" style="margin-top:8px">Reabrir caja</button>`}
    <h3>Cobros</h3>${cobros.length ? tabla(['Venta', 'Cliente', 'Forma', 'Monto'], cobros.map(p => `<tr class="click" data-v="${p.s.id}"><td>#${p.s.n}</td><td>${esc(p.s.clientName)}</td><td>${esc(p.method)}</td><td class="n">${gs(p.amount)}</td></tr>`).join(''), [3]) : '<p class="mut">—</p>'}
    <h3>Gastos</h3>${gastos.length ? tabla(['Categoría', 'Detalle', 'Desde', 'Monto', ''], gastos.map(g => `<tr><td>${esc(g.cat)}</td><td class="wrap">${esc(g.desc)}${g.supplierId && sup(g.supplierId) ? ' · ' + esc(sup(g.supplierId).name) : ''}${g.campaignId && camp(g.campaignId) ? ' · ' + esc(camp(g.campaignId).name) : ''}</td><td>${esc(g.via || 'Efectivo')}</td><td class="n">${gs(g.amount)}</td><td>${g.saleId ? '' : `<button class="btn sec sm" data-g="${g.id}">✕</button>`}</td></tr>`).join(''), [3]) : '<p class="mut">—</p>'}</div>
  <div class="card"><h2>Registrar gasto</h2><div class="row"><div><label>Categoría</label><select id="g_c">${opts(GASTOS)}</select></div><div><label>Monto</label><input id="g_m" inputmode="numeric"></div><div><label>Pagado desde</label><select id="g_v">${opts(VIAS)}</select></div></div>
    <div class="row"><div id="g_sw" hidden><label>Proveedor</label><select id="g_s"><option value="">—</option>${db.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div id="g_cw"><label>Campaña de publicidad</label><select id="g_cp"><option value="">—</option>${db.campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div></div>
    <label>Detalle</label><input id="g_d" placeholder="Ej: pauta Meta septiembre, sueldo Juan, vidrio Mercedes…"><button class="btn block" id="g_add">Agregar gasto</button></div>
  <div id="j_mes"></div>`;
  $('#j_d').onchange = e => { cj.date = e.target.value || hoyISO(); vCaja(); };
  if ($('#j_abrir')) $('#j_abrir').onclick = () => { db.cashdays.push({ id: 'cd-' + cj.date, date: cj.date, open: numGs($('#j_open').value), openedAt: Date.now(), closed: false }); guardar(); vCaja(); toast('Caja abierta'); };
  if ($('#j_cerrar')) $('#j_cerrar').onclick = () => { const raw = $('#j_cnt').value.trim(); if (raw === '') return toast('Ingresá el efectivo contado');
    Object.assign(cd, { closed: true, closedAt: Date.now(), counted: numGs(raw), expected: esperado, note: $('#j_note').value.trim() }); guardar(); vCaja(); toast('Caja cerrada'); };
  if ($('#j_reabrir')) $('#j_reabrir').onclick = () => needBoss(() => { cd.closed = false; guardar(); vCaja(); });
  const cat = () => { const c = $('#g_c').value; $('#g_sw').hidden = c !== 'Compra a proveedor'; $('#g_cw').hidden = c !== 'Publicidad'; $('#g_v').value = c === 'Publicidad' ? 'Itaú' : 'Efectivo'; };
  $('#g_c').onchange = cat; cat();
  $('#g_add').onclick = () => { const m = numGs($('#g_m').value); if (m <= 0) return toast('Ingresá el monto'); const c = $('#g_c').value;
    db.expenses.push({ id: uid(), date: cj.date, cat: c, desc: $('#g_d').value.trim(), amount: m, via: $('#g_v').value, supplierId: c === 'Compra a proveedor' ? $('#g_s').value : '', campaignId: c === 'Publicidad' ? $('#g_cp').value : '' });
    guardar(); vCaja(); toast('Gasto registrado'); };
  document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { if (confirm('¿Borrar este gasto?')) { db.expenses = db.expenses.filter(g => g.id !== b.dataset.g); guardar(); vCaja(); } });
  document.querySelectorAll('#view [data-v]').forEach(r => r.onclick = () => verVenta(r.dataset.v));
  resumenMes();
}
function resumenMes() {
  const m = cj.month, V = db.sales.filter(s => s.date.startsWith(m)), G = db.expenses.filter(g => g.date.startsWith(m) && !g.inCost);
  const tv = V.reduce((a, s) => a + s.total, 0), gan = V.reduce((a, s) => a + s.total - s.cost, 0), tg = G.reduce((a, g) => a + g.amount, 0);
  const cobrado = db.sales.flatMap(s => s.pays).filter(p => p.date.startsWith(m)).reduce((a, p) => a + p.amount, 0);
  const cat = {}; G.forEach(g => cat[g.cat] = (cat[g.cat] || 0) + g.amount);
  const tec = {}; V.forEach(s => { const k = s.tech || 'Sin asignar'; tec[k] = (tec[k] || 0) + 1; });
  $('#j_mes').innerHTML = `<div class="card"><h2>Resumen del mes</h2><input type="month" id="j_m" value="${m}" style="max-width:200px">
    <div class="grid" style="margin-top:10px"><div class="kpi"><b>${gs(tv)}</b><span>Ventas (${V.length})</span></div><div class="kpi ok"><b>${gs(cobrado)}</b><span>Cobrado</span></div><div class="kpi"><b>${gs(tg)}</b><span>Gastos</span></div>
    ${boss() ? `<div class="kpi"><b>${gs(gan)}</b><span>Ganancia bruta</span></div><div class="kpi ${gan - tg < 0 ? 'bad' : 'ok'}"><b>${gs(gan - tg)}</b><span>Resultado (ganancia − gastos)</span></div>` : ''}</div>
    ${Object.keys(cat).length ? `<h3>Gastos por categoría</h3>${Object.entries(cat).map(([k, v]) => `<div class="mut">${esc(k)}: ${gs(v)}</div>`).join('')}` : ''}
    <h3>Trabajos por colocador</h3>${Object.entries(tec).map(([k, v]) => `<div class="mut">${esc(k)}: ${v}</div>`).join('') || '<div class="mut">—</div>'}
    <p class="mut">Ganancia bruta = precio de venta − costo de los vidrios (de stock o de proveedor). Las compras a proveedor ligadas a una venta ya están en ese costo, por eso no se suman otra vez a los gastos.</p></div>`;
  $('#j_m').onchange = e => { cj.month = e.target.value || hoyISO().slice(0, 7); resumenMes(); };
}

/* ================= CONSULTAS y CAMPAÑAS ================= */
let lf = { estado: 'abiertas' };
function vConsultas() {
  const hoy = hoyISO(), mes = hoy.slice(0, 7);
  const porFuente = FUENTES.map(f => { const L = db.leads.filter(l => l.source === f && l.date.startsWith(mes)); return { f, n: L.length, g: L.filter(l => l.status === 'ganado').length }; }).filter(x => x.n);
  view.innerHTML = `<div class="card"><h2>Nueva consulta</h2>
    <div class="row"><div><label>Nombre</label><input id="l_n"></div><div><label>Teléfono / WhatsApp</label><input id="l_p" inputmode="tel"></div></div>
    <div class="row"><div><label>¿Por dónde llegó?</label><select id="l_s">${opts(FUENTES)}</select></div><div><label>Campaña (si vino de publicidad)</label><select id="l_c"><option value="">—</option>${db.campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div></div>
    <div class="row"><div><label>Seguimiento el</label><input type="date" id="l_f" value="${addDays(hoy, 1)}"></div></div>
    <label>Qué necesita (vehículo / servicio)</label><input id="l_i" placeholder="Parabrisas Vitz 2008, polarizado…"><button class="btn block" id="l_add">Guardar consulta</button></div>
  <div class="card"><h2>📣 Campañas de publicidad</h2><div id="cp_list"></div><button class="btn sec" id="cp_new" style="margin-top:8px">+ Nueva campaña</button>
    <p class="mut">Cargá cada pauta de Meta o TikTok como campaña, registrá su gasto en Caja (categoría Publicidad) y marcá de qué campaña viene cada consulta. Al vender, elegí la consulta de origen y la app calcula cuánto ganaste con cada campaña.</p></div>
  <div class="card"><h2>Este mes por origen</h2>${porFuente.length ? tabla(['Origen', 'Consultas', 'Ganadas', 'Conversión'], porFuente.map(x => `<tr><td>${esc(x.f)}</td><td class="n">${x.n}</td><td class="n">${x.g}</td><td class="n">${Math.round(x.g / x.n * 100)}%</td></tr>`).join(''), [1, 2, 3]) : '<p class="mut">Aún no hay consultas este mes.</p>'}</div>
  <div class="card"><div class="row"><h2 style="flex:2">Consultas</h2><select id="l_e"><option value="abiertas" ${lf.estado === 'abiertas' ? 'selected' : ''}>Abiertas</option><option value="todas" ${lf.estado === 'todas' ? 'selected' : ''}>Todas</option></select></div><div id="l_list"></div></div>`;
  $('#l_add').onclick = () => { const name = $('#l_n').value.trim(), i = $('#l_i').value.trim(); if (!name && !i) return toast('Poné un nombre o lo que necesita');
    db.leads.push({ id: uid(), date: hoy, ts: Date.now(), name: name || 'Sin nombre', phone: $('#l_p').value.trim(), source: $('#l_s').value, campaignId: $('#l_c').value, interest: i, status: 'nuevo', follow: $('#l_f').value, note: '' }); guardar(); vConsultas(); toast('Consulta guardada'); };
  $('#l_e').onchange = e => { lf.estado = e.target.value; listaLeads(); };
  $('#cp_new').onclick = () => formCampana();
  listaLeads(); listaCampanas();
}
function campStats(c) {
  const gasto = db.expenses.filter(g => g.campaignId === c.id).reduce((a, g) => a + g.amount, 0);
  const L = db.leads.filter(l => l.campaignId === c.id), G = L.filter(l => l.status === 'ganado');
  const V = G.map(l => db.sales.find(s => s.id === l.saleId)).filter(Boolean);
  const ventas = V.reduce((a, s) => a + s.total, 0), gan = V.reduce((a, s) => a + s.total - s.cost, 0);
  return { gasto, n: L.length, g: G.length, ventas, gan, neto: gan - gasto, cpl: L.length ? gasto / L.length : 0 };
}
function listaCampanas() {
  const C = db.campaigns.slice().sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  $('#cp_list').innerHTML = C.length ? tabla(['Campaña', 'Gasto', 'Consultas', 'Ganadas', 'Ventas', 'Ganancia − gasto', ''], C.map(c => { const s = campStats(c);
    return `<tr><td class="wrap"><b>${esc(c.name)}</b><br><span class="mut">${esc(c.platform)}</span></td><td class="n">${gs(s.gasto)}</td><td class="n">${s.n}${s.n && s.gasto ? `<br><span class="mut">${gs(s.cpl)} c/u</span>` : ''}</td><td class="n">${s.g}</td><td class="n">${gs(s.ventas)}</td>
    <td class="n"><b style="color:var(${s.neto >= 0 ? '--ok' : '--bad'})">${gs(s.neto)}</b></td><td><button class="btn sec sm" data-cp="${c.id}">Editar</button></td></tr>`; }).join(''), [1, 2, 3, 4, 5]) : '<p class="mut">Todavía no creaste campañas.</p>';
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => formCampana(b.dataset.cp));
}
function formCampana(id) {
  const c = id ? camp(id) : { name: '', platform: PLATAFORMAS[0], start: hoyISO(), note: '' };
  modal(`<h2>${id ? 'Editar' : 'Nueva'} campaña</h2><label>Nombre</label><input id="cp_n" value="${esc(c.name)}" placeholder="Ej: Parabrisas Toyota septiembre">
    <div class="row"><div><label>Plataforma</label><select id="cp_p">${opts(PLATAFORMAS, c.platform)}</select></div><div><label>Inicio</label><input type="date" id="cp_s" value="${c.start || ''}"></div></div>
    <label>Nota</label><input id="cp_o" value="${esc(c.note)}">
    <div class="row" style="margin-top:12px"><button class="btn" id="ok">Guardar</button><button class="btn sec" id="no">Cancelar</button>${id ? '<button class="btn bad" id="del">Eliminar</button>' : ''}</div>`);
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => { const name = $('#cp_n').value.trim(); if (!name) return toast('Falta el nombre'); const d = { name, platform: $('#cp_p').value, start: $('#cp_s').value, note: $('#cp_o').value.trim() };
    if (id) Object.assign(c, d); else db.campaigns.push({ id: uid(), ...d }); guardar(); cerrar(); render(); };
  if (id) $('#del').onclick = () => { if (confirm('¿Eliminar campaña? Sus gastos y consultas quedan sin campaña.')) { db.expenses.forEach(g => { if (g.campaignId === id) g.campaignId = ''; }); db.leads.forEach(l => { if (l.campaignId === id) l.campaignId = ''; }); db.campaigns = db.campaigns.filter(x => x.id !== id); guardar(); cerrar(); render(); } };
}
function listaLeads() {
  const L = db.leads.filter(l => lf.estado === 'todas' || !['ganado', 'perdido'].includes(l.status)).sort((a, b) => (a.follow || '9').localeCompare(b.follow || '9'));
  $('#l_list').innerHTML = L.length ? tabla(['Cliente', 'Necesita', 'Origen', 'Seguir', 'Estado', ''], L.slice(0, 200).map(l => `<tr><td>${esc(l.name)}</td><td class="wrap">${esc(l.interest)}</td><td>${esc(l.source)}${l.campaignId && camp(l.campaignId) ? `<br><span class="mut">${esc(camp(l.campaignId).name)}</span>` : ''}</td>
    <td>${l.follow && l.follow <= hoyISO() && !['ganado', 'perdido'].includes(l.status) ? '<span class="tag bad">' + dmy(l.follow) + '</span>' : dmy(l.follow)}</td>
    <td><select data-s="${l.id}" style="min-height:34px">${optsKV(Object.entries(ESTADOS), l.status)}</select></td>
    <td>${waLink(l.phone) ? `<a class="btn sm" href="${waLink(l.phone)}" target="_blank" rel="noopener">WhatsApp</a> ` : ''}<button class="btn sec sm" data-d="${l.id}">✕</button></td></tr>`).join('')) : '<p class="mut">Sin consultas abiertas.</p>';
  document.querySelectorAll('[data-s]').forEach(s => s.onchange = () => { const l = db.leads.find(x => x.id === s.dataset.s); l.status = s.value; if (['ganado', 'perdido'].includes(l.status)) l.follow = ''; guardar(); vConsultas(); });
  document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('¿Borrar consulta?')) { db.leads = db.leads.filter(l => l.id !== b.dataset.d); guardar(); vConsultas(); } });
}

/* ================= AJUSTES ================= */
function vAjustes() {
  const e = db.cfg.empresa;
  view.innerHTML = `
  <div class="card"><h2>☁️ Cuenta y sincronización</h2><p class="mut">${Sync.enabled ? `Sesión: <b>${esc(Sync.email)}</b> · estado: <b id="sy_st"></b>` : 'Modo sin conexión a la nube.'}</p>
    <div class="row"><button class="btn sec" id="sy_now">Sincronizar ahora</button><button class="btn sec" id="sy_out">Cerrar sesión</button></div></div>
  <div class="card"><h2>🔔 Avisos</h2><p class="mut">Correos a cristalauto95@gmail.com: por cada venta, resumen a las 20:00, y a las 07:30 créditos que vencen en 5 días y stock bajo. Además, aviso 1 hora antes de cada colocación agendada.<br><b>Notificaciones en este dispositivo:</b> <span id="pu_st">…</span></p>
    <div class="row"><button class="btn" id="pu_on">Activar avisos en este dispositivo</button><button class="btn sec" id="pu_test">Enviar aviso de prueba</button></div>
    <p class="mut">En iPhone: primero tocá Compartir → “Agregar a pantalla de inicio”, abrí la app desde ese ícono y recién ahí activá los avisos.</p></div>
  <div class="card"><h2>🏢 Empresa (para el comprobante)</h2>
    <label>Nombre</label><input id="e_n" value="${esc(e.nombre)}"><div class="row"><div><label>RUC</label><input id="e_r" value="${esc(e.ruc)}"></div><div><label>Teléfono</label><input id="e_t" value="${esc(e.tel)}"></div></div>
    <label>Dirección</label><input id="e_d" value="${esc(e.direccion)}"><div class="row"><div><label>N° de timbrado</label><input id="e_ti" value="${esc(e.timbrado)}"></div><div><label>Vigencia</label><input id="e_v" value="${esc(e.vigencia)}" placeholder="dd/mm/aaaa"></div></div>
    <label>Colocadores (uno por línea)</label><textarea id="e_s" rows="4">${esc(db.cfg.staff.join('\n'))}</textarea>
    <div class="row"><div><label>Stock mínimo por defecto</label><input id="e_m" inputmode="numeric" value="${db.cfg.minDefault}"></div><div><label>Colocaciones por día: mínimo</label><input id="e_cmin" inputmode="numeric" value="${db.cfg.capMin}"></div><div><label>máximo</label><input id="e_cmax" inputmode="numeric" value="${db.cfg.capMax}"></div></div>
    <button class="btn block" id="e_ok">Guardar</button></div>
  <div class="card"><h2>🏭 Proveedores de vidrio</h2>${db.suppliers.length ? db.suppliers.map(s => `<div class="row" style="margin-bottom:6px"><div style="flex:3 1 160px">${esc(s.name)} <span class="mut">${esc(s.phone)}</span></div><div style="flex:0 0 90px"><button class="btn sec sm" data-sp="${s.id}">Editar</button></div></div>`).join('') : '<p class="mut">Sin proveedores todavía.</p>'}
    <button class="btn sec" id="sp_new">+ Agregar proveedor</button></div>
  <div class="card"><h2>✨ Servicios y precios</h2><p class="mut">Editá el precio de cada servicio. En la venta siempre podés cambiarlo.</p>
    ${db.services.map(s => `<div class="row" style="margin-bottom:6px"><div style="flex:3 1 200px"><input data-sn="${s.id}" value="${esc(s.name)}"></div><div><input data-spr="${s.id}" inputmode="numeric" value="${s.price || ''}" placeholder="Precio"></div><div style="flex:0 0 50px"><button class="btn sec sm" data-sd="${s.id}">✕</button></div></div>`).join('')}
    <button class="btn sec" id="sv_add">+ Agregar servicio</button></div>
  <div class="card"><h2>📥 Importar inventario (Excel o CSV)</h2>
    <p class="mut">Sube tu planilla (.xlsx). Toma <b>CODIGO</b>, <b>DESCRIPCION</b>, el stock (<b>STOCK ACTUAL</b> o ENTRADAS − SALIDAS), <b>PRECIO COSTO</b> (compra) y <b>COSTO UNITARIO</b> (mayorista). Podés elegir qué hojas importar. Si un código ya existe, se actualiza.</p>
    <button class="btn" id="imp">Elegir archivo</button><input type="file" id="file" accept=".xlsx,.xls,.csv,text/csv" hidden></div>
  <div class="card"><h2>🔐 PIN del jefe</h2><p class="mut">Con PIN, las ganancias, costos y acciones sensibles (anular ventas, borrar) quedan bloqueadas hasta ingresarlo. ${db.cfg.pin ? 'PIN activo.' : 'Sin PIN: todos ven todo.'}</p>
    <div class="row"><input id="pin" type="password" inputmode="numeric" placeholder="Nuevo PIN (vacío = sin PIN)" autocomplete="off"><button class="btn" id="pin_ok">Guardar PIN</button></div></div>
  <div class="card"><h2>📤 Exportar</h2><div class="row"><button class="btn sec" id="x_inv">Inventario (CSV)</button><button class="btn sec" id="x_ven">Ventas (CSV)</button><button class="btn sec" id="x_cli">Clientes (CSV)</button></div></div>
  <div class="card"><h2>💾 Copia de seguridad</h2>
    <p class="mut">Los datos ya se guardan en la nube. Igual podés bajar una copia por las dudas.</p>
    <div class="row"><button class="btn" id="bk">Descargar respaldo</button><button class="btn sec" id="rs">Restaurar respaldo</button></div><input type="file" id="rfile" accept=".json,application/json" hidden></div>`;
  const stTxt = { ok: '✅ al día', sync: '🔄 sincronizando…', pend: '⏳ cambios por subir', err: '⚠️ sin conexión / error', local: 'sin nube' };
  const pintar = () => { const el = $('#sy_st'); if (el) el.textContent = (stTxt[Sync.status] || Sync.status) + (Sync.detail && Sync.status === 'err' ? ' (' + Sync.detail + ')' : ''); }; pintar();
  if ($('#sy_now')) { $('#sy_now').onclick = async () => { await Sync.pull(); await Sync.push(); pintar(); render(true); toast('Sincronizado'); }; $('#sy_out').onclick = () => { if (confirm('¿Cerrar sesión en este dispositivo?')) Sync.signOut(); }; }
  Sync.pushActive().then(a => { const el = $('#pu_st'); if (el) el.textContent = a ? '✅ activadas' : 'no activadas'; });
  $('#pu_on').onclick = async () => { try { await Sync.enablePush(); toast('Avisos activados'); vAjustes(); } catch (er) { toast(er.message || 'No se pudo activar'); } };
  $('#pu_test').onclick = async () => { try { await Sync.call('test'); toast('Aviso de prueba enviado (revisá el correo y el teléfono)'); } catch (er) { toast('No se pudo: ' + er.message); } };
  $('#e_ok').onclick = () => { Object.assign(db.cfg.empresa, { nombre: $('#e_n').value.trim(), ruc: $('#e_r').value.trim(), tel: $('#e_t').value.trim(), direccion: $('#e_d').value.trim(), timbrado: $('#e_ti').value.trim(), vigencia: $('#e_v').value.trim() });
    db.cfg.staff = $('#e_s').value.split('\n').map(x => x.trim()).filter(Boolean); db.cfg.minDefault = numGs($('#e_m').value) || 50; db.cfg.capMin = numGs($('#e_cmin').value) || 4; db.cfg.capMax = numGs($('#e_cmax').value) || 12; guardar(); toast('Guardado'); };
  document.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => formProveedor(b.dataset.sp)); $('#sp_new').onclick = () => formProveedor();
  document.querySelectorAll('[data-sn]').forEach(i => i.onchange = () => { db.services.find(s => s.id === i.dataset.sn).name = i.value.trim(); guardar(); });
  document.querySelectorAll('[data-spr]').forEach(i => i.onchange = () => { db.services.find(s => s.id === i.dataset.spr).price = numGs(i.value); guardar(); toast('Precio guardado'); });
  document.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { if (confirm('¿Quitar servicio?')) { db.services = db.services.filter(s => s.id !== b.dataset.sd); guardar(); vAjustes(); } });
  $('#sv_add').onclick = () => { db.services.push({ id: uid(), name: 'Nuevo servicio', price: 0 }); guardar(); vAjustes(); };
  $('#imp').onclick = () => $('#file').click(); $('#file').onchange = async ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importarArchivo(f); };
  $('#pin_ok').onclick = () => { const v = $('#pin').value.trim(); if (db.cfg.pin && !bossOk) return toast('Desbloqueá primero con el PIN actual'); db.cfg.pin = v; bossOk = !!v; guardar(); render(); toast(v ? 'PIN guardado' : 'PIN quitado'); };
  const CS = 'codigo,descripcion,contenedor,stock,minimo,compra,mayorista,colocado';
  $('#x_inv').onclick = () => needBoss(() => bajar(`inventario-${hoyISO()}.csv`, csv([CS.split(','), ...db.products.map(p => [p.code, p.name, p.contenedor, p.stock, p.min, p.compra, p.mayorista, p.colocado])]), 'text/csv'));
  $('#x_ven').onclick = () => bajar(`ventas-${hoyISO()}.csv`, csv([['n', 'fecha', 'cliente', 'tipo', 'detalle', 'total', 'cobrado', 'saldo', 'factura'], ...db.sales.map(s => [s.n, s.date, s.clientName, s.kind, s.items.map(i => i.qty + 'x ' + i.name).join(' | '), s.total, paidOf(s), saldoOf(s), s.inv.no])]), 'text/csv');
  $('#x_cli').onclick = () => bajar(`clientes-${hoyISO()}.csv`, csv([['nombre', 'tipo', 'ruc', 'telefono'], ...db.clients.map(c => [c.name, c.type, c.ruc, c.phone])]), 'text/csv');
  $('#bk').onclick = () => needBoss(() => bajar(`respaldo-cristalauto-${hoyISO()}.json`, JSON.stringify(db), 'application/json'));
  $('#rs').onclick = () => $('#rfile').click();
  $('#rfile').onchange = async ev => { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.products) || !Array.isArray(d.moves)) throw 0;
      if (!confirm(`Esto reemplaza TODOS los datos actuales (también en la nube) por el respaldo (${d.products.length} productos, ${(d.sales || []).length} ventas). ¿Continuar?`)) return;
      needBoss(() => { db = normalizar(d); guardar(); render(); toast('Respaldo restaurado'); }); } catch (err) { toast('Archivo de respaldo inválido'); } };
}
function formProveedor(id) {
  const s = id ? sup(id) : { name: '', phone: '', note: '' };
  modal(`<h2>${id ? 'Editar' : 'Nuevo'} proveedor</h2><label>Nombre</label><input id="p_n" value="${esc(s.name)}"><label>Teléfono</label><input id="p_t" value="${esc(s.phone)}"><label>Nota</label><input id="p_o" value="${esc(s.note)}">
    <div class="row" style="margin-top:12px"><button class="btn" id="ok">Guardar</button><button class="btn sec" id="no">Cancelar</button>${id ? '<button class="btn bad" id="del">Eliminar</button>' : ''}</div>`);
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => { const name = $('#p_n').value.trim(); if (!name) return toast('Falta el nombre'); const d = { name, phone: $('#p_t').value.trim(), note: $('#p_o').value.trim() };
    if (id) Object.assign(s, d); else db.suppliers.push({ id: uid(), ...d }); guardar(); cerrar(); render(true); };
  if (id) $('#del').onclick = () => { if (confirm('¿Eliminar proveedor?')) { db.suppliers = db.suppliers.filter(x => x.id !== id); guardar(); cerrar(); render(true); } };
}
function csv(rows) { return '﻿' + rows.map(r => r.map(c => { c = String(c ?? ''); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',')).join('\r\n'); }
function bajar(nombre, txt, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: tipo + ';charset=utf-8' })); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function parseCSV(t) {
  t = t.replace(/^﻿/, ''); const first = t.split(/\r?\n/)[0]; const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
    else c += ch; }
  r.push(c); if (r.some(x => x.trim())) rows.push(r); return rows;
}

/* ---------- Importación de inventario ---------- */
function parseTabla(rows, hoja) {
  const hi = rows.findIndex((r, i) => i < 60 && r.some(c => ['codigo', 'code', 'sku'].includes(norm(c)))); if (hi < 0) return [];
  const H = rows[hi].map(norm), f = (...n) => H.findIndex(h => n.includes(h));
  const c = { code: f('codigo', 'code', 'sku'), name: f('descripcion', 'nombre', 'producto'), ent: f('entradas'), sal: f('salidas'), stock: f('stock actual', 'stock', 'existencia'),
    compra: f('precio costo', 'costo compra', 'compra'), may: f('costo unitario', 'precio mayorista', 'mayorista'), col: f('precio colocado', 'colocado'), min: f('minimo', 'stock minimo'), cont: f('contenedor') };
  if (c.name < 0) return [];
  const out = new Map();
  for (const r of rows.slice(hi + 1)) {
    const code = String(r[c.code] ?? '').trim(), name = String(r[c.name] ?? '').trim(); if (!code || !name) continue;
    let stock = null;
    if (c.stock >= 0 && String(r[c.stock] ?? '').trim() !== '') stock = numGs(r[c.stock]);
    else if (c.ent >= 0 && String(r[c.ent] ?? '').trim() !== '') stock = numGs(r[c.ent]) - (c.sal >= 0 ? numGs(r[c.sal]) : 0);
    out.set(norm(code), { code, name, stock, compra: c.compra >= 0 ? numGs(r[c.compra]) : 0, may: c.may >= 0 ? numGs(r[c.may]) : 0, col: c.col >= 0 ? numGs(r[c.col]) : 0,
      min: c.min >= 0 && String(r[c.min] ?? '').trim() !== '' ? numGs(r[c.min]) : null, cont: c.cont >= 0 ? String(r[c.cont] ?? '').trim() : hoja });
  }
  return [...out.values()];
}
async function importarArchivo(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    if (!window.XLSX) return toast('No cargó el lector de Excel. Guardá la planilla como CSV e importala.');
    let wb; try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); } catch (e) { return toast('No pude leer ese Excel'); }
    const H = wb.SheetNames.map(n => ({ n, items: parseTabla(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }), n) })).filter(h => h.items.length);
    if (!H.length) return toast('No encontré las columnas CODIGO y DESCRIPCION');
    const def = H.find(h => /stock/i.test(h.n)) || H[H.length - 1];
    modal(`<h2>¿Qué hojas importar?</h2><p class="mut">Si un mismo código está en varias hojas, gana la última marcada. Tip: importá solo la más actualizada.</p>
      ${H.map((h, i) => `<label style="display:flex;gap:8px;align-items:center;color:inherit;font-size:16px"><input type="checkbox" data-h="${i}" style="width:22px;min-height:22px" ${h === def ? 'checked' : ''}> ${esc(h.n)} <span class="mut">(${h.items.length} modelos)</span></label>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn" id="ok">Importar</button><button class="btn sec" id="no">Cancelar</button></div>`);
    $('#no').onclick = cerrar;
    $('#ok').onclick = () => { const sel = [...document.querySelectorAll('[data-h]')].filter(x => x.checked).map(x => H[x.dataset.h]); if (!sel.length) return toast('Marcá al menos una hoja');
      cerrar(); aplicarImport(sel.flatMap(h => h.items.map(i => ({ ...i, cont: i.cont || h.n })))); };
  } else {
    const items = parseTabla(parseCSV(await file.text()), 'CSV'); if (!items.length) return toast('No encontré las columnas codigo y descripcion');
    aplicarImport(items);
  }
}
function aplicarImport(items) {
  let nuevos = 0, act = 0;
  for (const it of items) {
    let p = db.products.find(x => norm(x.code) === norm(it.code));
    if (p) { act++; p.name = it.name; if (it.compra > 0) p.compra = it.compra; if (it.may > 0) p.mayorista = it.may; if (it.col > 0) p.colocado = it.col; if (it.min !== null) p.min = it.min; if (it.cont) p.contenedor = it.cont;
      if (it.stock !== null && it.stock !== p.stock) mover(p.id, 'adj', it.stock - p.stock, 'Importación', hoyISO()); }
    else { nuevos++; p = { id: uid(), code: it.code, name: it.name, stock: 0, min: it.min ?? db.cfg.minDefault, compra: it.compra, mayorista: it.may, colocado: it.col, contenedor: it.cont }; db.products.push(p);
      if (it.stock) mover(p.id, 'in', it.stock, 'Stock inicial (importación)', hoyISO()); }
  }
  guardar(); tab = 'stock'; render(); toast(`Importado: ${nuevos} nuevos, ${act} actualizados`);
}
