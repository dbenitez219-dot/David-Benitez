'use strict';
/* Asistente: escribís (o dictás con el micrófono del teclado) y te deja todo listo para CONFIRMAR.
   Nada se guarda sin tu "Confirmar". A la IA se le manda solo un resumen de lo necesario (ver contextoAsistente). */
const asi = { msgs: [], acts: [], busy: false, draft: '' };

function cajaEsperada(date) {
  const cd = db.cashdays.find(c => c.date === date);
  const ef = db.sales.flatMap(s => s.pays).filter(p => p.date === date && p.method === 'Efectivo').reduce((a, p) => a + p.amount, 0);
  const gEf = db.expenses.filter(g => g.date === date && g.via !== 'Itaú').reduce((a, g) => a + g.amount, 0);
  return (cd ? cd.open : 0) + ef - gEf;
}

/* Solo lo necesario para esta consulta: productos/clientes que se parecen a lo escrito, servicios, y el resumen del día */
function contextoAsistente(texto) {
  const hoy = hoyISO(), words = [...new Set(norm(texto).split(' ').filter(w => w.length >= 3))];
  const hit = t => words.some(w => t.includes(w));
  let prods = db.products.filter(p => hit(norm(p.code + ' ' + p.name))).slice(0, 40);
  if (!prods.length) prods = db.products.filter(p => p.stock > 0).slice(0, 15);
  const clis = db.clients.filter(c => hit(norm(c.name))).slice(0, 15);
  const nombres = new Set(clis.map(c => c.id));
  const deudas = db.sales.filter(s => saldoOf(s) > 0).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const ventasHoy = db.sales.filter(s => s.date === hoy), cd = db.cashdays.find(c => c.date === hoy);
  return {
    hoy, dia_semana: new Date(hoy + 'T12:00:00').toLocaleDateString('es', { weekday: 'long' }),
    colocadores: db.cfg.staff, categorias_gasto: GASTOS,
    servicios: db.services.map(s => ({ id: s.id, nombre: s.name, precio: s.price })),
    productos: prods.map(p => ({ id: p.id, codigo: p.code, nombre: p.name, stock: p.stock, precio_mayorista: p.mayorista, precio_colocado: p.colocado || null })),
    clientes: clis.map(c => ({ nombre: c.name, tipo: c.type, tel: c.phone })),
    deudas: deudas.filter(s => nombres.has(s.clientId) || deudas.length <= 20).slice(0, 20).map(s => ({ cliente: s.clientName, venta: s.n, saldo: saldoOf(s), vence: s.due })),
    total_por_cobrar: deudas.reduce((a, s) => a + saldoOf(s), 0),
    ventas_hoy: { cantidad: ventasHoy.length, total: ventasHoy.reduce((a, s) => a + s.total, 0), cobrado: db.sales.flatMap(s => s.pays).filter(p => p.date === hoy).reduce((a, p) => a + p.amount, 0) },
    gastos_hoy: db.expenses.filter(g => g.date === hoy).reduce((a, g) => a + g.amount, 0),
    caja_hoy: !cd ? 'sin abrir' : cd.closed ? 'cerrada' : { abierta_con: cd.open, efectivo_esperado: cajaEsperada(hoy) },
    agenda: [hoy, addDays(hoy, 1), addDays(hoy, 2)].flatMap(d => agendaDe(d).map(a => ({ fecha: d, hora: a.time, cliente: a.clientName, vehiculo: a.vehicle, estado: a.status }))),
    stock_bajo: db.products.filter(p => p.stock <= p.min).slice(0, 10).map(p => ({ codigo: p.code, stock: p.stock })),
    consultas_pendientes: db.leads.filter(l => !['ganado', 'perdido'].includes(l.status)).length,
  };
}

/* ---- Ejecutores: cada uno valida y lanza Error con un mensaje claro si algo no cierra ---- */
const num = v => Number(v) || 0;
const EJEC = {
  venta(a) {
    if (!(a.lineas || []).length) throw new Error('La venta no tiene productos ni servicios');
    const kind = a.tipo_venta || 'colocado', items = [];
    for (const l of a.lineas) {
      const qty = num(l.cantidad) || 1;
      if (l.kind === 'producto') { const p = prod(l.id); if (!p) throw new Error('No encontré ese vidrio en el stock'); const unit = num(l.precio_unitario) || (kind === 'mayorista' ? p.mayorista : p.colocado) || 0;
        items.push({ type: 'prod', id: p.id, name: p.code + ' — ' + p.name, qty, unit, cost: p.compra || 0 }); }
      else if (l.kind === 'servicio') { const s = db.services.find(x => x.id === l.id); if (!s) throw new Error('No encontré ese servicio'); items.push({ type: 'srv', id: s.id, name: s.name, qty, unit: num(l.precio_unitario) || s.price, cost: 0 }); }
      else items.push({ type: 'ext', name: String(l.nombre || '').trim(), qty, unit: num(l.precio_unitario), cost: num(l.costo), supplierId: '', via: 'Efectivo' });
    }
    const c = { ...nuevoCart(), kind, clientName: a.cliente || '', phone: a.telefono || '', vehicle: a.vehiculo || '', tech: db.cfg.staff.includes(a.colocador) ? a.colocador : '', items, pct: num(a.descuento_pct),
      date: a.fecha || hoyISO(), pay: a.pago === 'credito' ? 'credito' : 'contado', method: METODOS.includes(a.metodo) ? a.metodo : 'Efectivo', abono: num(a.abono), due: a.vence || addDays(hoyISO(), 30), note: a.nota || '' };
    const s = guardarVenta(c, true); return `Venta #${s.n} registrada · ${gs(s.total)}`;
  },
  gasto(a) {
    const m = num(a.monto); if (m <= 0) throw new Error('Falta el monto del gasto');
    const cat = GASTOS.includes(a.categoria) ? a.categoria : 'Otros';
    db.expenses.push({ id: uid(), date: a.fecha || hoyISO(), cat, desc: a.detalle || '', amount: m, via: VIAS.includes(a.via) ? a.via : cat === 'Publicidad' ? 'Itaú' : 'Efectivo', supplierId: '', campaignId: '' });
    guardar(); return `Gasto registrado · ${cat} · ${gs(m)}`;
  },
  cobro(a) {
    let m = num(a.monto); if (m <= 0) throw new Error('Falta el monto del cobro');
    const pend = db.sales.filter(s => saldoOf(s) > 0 && norm(s.clientName) === norm(a.cliente || '')).sort((x, y) => x.date.localeCompare(y.date));
    if (!pend.length) throw new Error('No encontré deudas de ese cliente');
    if (m > pend.reduce((t, s) => t + saldoOf(s), 0)) throw new Error('El monto supera lo que debe el cliente');
    const metodo = METODOS.includes(a.metodo) ? a.metodo : 'Efectivo';
    for (const s of pend) { if (m <= 0) break; const x = Math.min(m, saldoOf(s)); s.pays.push({ id: uid(), date: a.fecha || hoyISO(), amount: x, method: metodo }); m -= x; }
    guardar(); return `Cobro registrado · ${gs(num(a.monto))} de ${a.cliente}`;
  },
  abrir_caja(a) {
    const d = a.fecha || hoyISO(); if (db.cashdays.some(c => c.date === d)) throw new Error('La caja de ese día ya está abierta');
    db.cashdays.push({ id: 'cd-' + d, date: d, open: num(a.monto_inicial), openedAt: Date.now(), closed: false }); guardar(); return `Caja abierta con ${gs(num(a.monto_inicial))}`;
  },
  cerrar_caja(a) {
    const d = a.fecha || hoyISO(), cd = db.cashdays.find(c => c.date === d);
    if (!cd) throw new Error('La caja de ese día no está abierta'); if (cd.closed) throw new Error('La caja ya está cerrada');
    if (a.efectivo_contado === undefined || a.efectivo_contado === null) throw new Error('Falta el efectivo contado');
    const exp = cajaEsperada(d), cnt = num(a.efectivo_contado);
    Object.assign(cd, { closed: true, closedAt: Date.now(), counted: cnt, expected: exp, note: a.nota || '' }); guardar();
    return `Caja cerrada · esperado ${gs(exp)} · contado ${gs(cnt)} · diferencia ${gs(cnt - exp)}`;
  },
  agendar(a) {
    if (!a.fecha || !a.hora || !a.cliente) throw new Error('Falta fecha, hora o cliente');
    const items = [];
    const p = a.producto_id && prod(a.producto_id); if (a.producto_id && !p) throw new Error('No encontré ese vidrio');
    if (p) items.push({ type: 'prod', id: p.id, name: p.code + ' — ' + p.name, qty: 1, unit: p.colocado || 0, cost: p.compra || 0 });
    for (const id of a.servicio_ids || []) { const s = db.services.find(x => x.id === id); if (!s) throw new Error('No encontré ese servicio'); items.push({ type: 'srv', id: s.id, name: s.name, qty: 1, unit: s.price, cost: 0 }); }
    db.appts.push({ id: uid(), status: 'agendado', saleId: '', date: a.fecha, time: a.hora, clientName: a.cliente, phone: a.telefono || '', vehicle: a.vehiculo || '', domicilio: !!a.domicilio, address: a.direccion || '', tech: db.cfg.staff.includes(a.colocador) ? a.colocador : '', items, note: a.nota || '' });
    if (!db.clients.some(c => norm(c.name) === norm(a.cliente))) db.clients.push({ id: uid(), name: a.cliente, type: 'particular', ruc: '', phone: a.telefono || '', note: '' });
    guardar(); const n = agendaDe(a.fecha).length; return `Agendado ${dmy(a.fecha)} ${a.hora} · ${a.cliente} (${n} ese día)`;
  },
  consulta(a) {
    db.leads.push({ id: uid(), date: hoyISO(), ts: Date.now(), name: a.nombre || a.cliente || 'Sin nombre', phone: a.telefono || '', source: FUENTES.includes(a.origen) ? a.origen : 'Otro', campaignId: '', interest: a.necesita || a.nota || '', status: 'nuevo', follow: a.seguimiento || '', note: '' });
    guardar(); return 'Consulta guardada';
  },
  entrada_stock(a) {
    const p = prod(a.producto_id); if (!p) throw new Error('No encontré ese vidrio'); const q = num(a.cantidad); if (q <= 0) throw new Error('Falta la cantidad');
    mover(p.id, 'in', q, a.contenedor ? 'Contenedor ' + a.contenedor : 'Entrada (asistente)', a.fecha); guardar(); return `Entraron ${fmt(q)} de ${p.code} · stock ${fmt(p.stock)}`;
  },
};

const TITULO = { venta: '🧾 Venta', gasto: '💸 Gasto', cobro: '💰 Cobro', abrir_caja: '🟢 Abrir caja', cerrar_caja: '🔒 Cerrar caja', agendar: '📅 Agendar', consulta: '💬 Consulta', entrada_stock: '📦 Entrada de stock' };
function detalleAccion(a) {
  const L = [];
  if (a.cliente) L.push('Cliente: ' + esc(a.cliente)); if (a.vehiculo) L.push('Vehículo: ' + esc(a.vehiculo));
  for (const l of a.lineas || []) {
    const nombre = l.kind === 'producto' ? (prod(l.id) ? prod(l.id).code + ' ' + prod(l.id).name : '⚠ vidrio no encontrado') : l.kind === 'servicio' ? ((db.services.find(s => s.id === l.id) || {}).name || '⚠ servicio no encontrado') : (l.nombre || 'Vidrio de proveedor');
    L.push(`${esc(nombre)} × ${fmt(l.cantidad || 1)}${l.precio_unitario ? ' · ' + gs(l.precio_unitario) : ''}${l.costo ? ' · costo ' + gs(l.costo) : ''}`);
  }
  if (a.descuento_pct) L.push('Descuento ' + a.descuento_pct + '%');
  if (a.tipo === 'venta') L.push(a.pago === 'credito' ? `A crédito${a.abono ? ', abona ' + gs(a.abono) : ''}${a.vence ? ', vence ' + dmy(a.vence) : ''}` : 'Contado · ' + esc(a.metodo || 'Efectivo'));
  if (a.monto) L.push(gs(a.monto) + (a.metodo ? ' · ' + esc(a.metodo) : '') + (a.via ? ' · ' + esc(a.via) : '') + (a.categoria ? ' · ' + esc(a.categoria) : ''));
  if (a.monto_inicial !== undefined && a.tipo === 'abrir_caja') L.push('Empieza con ' + gs(a.monto_inicial));
  if (a.efectivo_contado !== undefined) L.push('Efectivo contado ' + gs(a.efectivo_contado));
  if (a.fecha && a.fecha !== hoyISO()) L.push('Fecha ' + dmy(a.fecha)); if (a.hora) L.push('Hora ' + esc(a.hora));
  if (a.detalle) L.push(esc(a.detalle)); if (a.nota) L.push(esc(a.nota));
  return L.length ? '<ul>' + L.map(x => `<li>${x}</li>`).join('') + '</ul>' : '';
}

function vAsistente() {
  const quick = ['Resumen del día', '¿Qué tengo agendado mañana?', '¿Quién me debe?', 'Abrir caja'];
  view.innerHTML = `<div class="card"><h2>🤖 Asistente</h2>
    <p class="mut">Escribí o dictá con el 🎤 del teclado. Yo lo dejo listo y vos <b>confirmás</b> antes de que se guarde.</p>
    <div class="chat" id="as_chat"></div>
    <textarea id="as_txt" placeholder="Ej: vendí un parabrisas Vitz 2008 a Juan, 900 mil, efectivo" ${asi.busy ? 'disabled' : ''}>${esc(asi.draft)}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="as_send" ${asi.busy ? 'disabled' : ''}>${asi.busy ? 'Pensando…' : 'Enviar'}</button><button class="btn sec" id="as_clr" style="flex:0 0 110px">Limpiar</button></div>
    <div class="row" style="margin-top:8px">${quick.map(q => `<button class="btn sec sm" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
  pintarChat();
  $('#as_txt').oninput = e => asi.draft = e.target.value;
  $('#as_send').onclick = () => enviarAsistente($('#as_txt').value);
  $('#as_clr').onclick = () => { asi.msgs = []; asi.acts = []; asi.draft = ''; vAsistente(); };
  document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => enviarAsistente(b.dataset.q));
}
function pintarChat() {
  const box = $('#as_chat'); if (!box) return;
  box.innerHTML = asi.msgs.map((m, i) => `<div class="msg ${m.rol === 'user' ? 'u' : 'a'}">${esc(m.texto)}</div>` +
    (m.acciones || []).map(k => { const st = asi.acts[k]; if (!st) return ''; return `<div class="act ${st.estado === 'ok' ? 'hecho' : st.estado === 'error' ? 'error' : ''}"><b>${TITULO[st.a.tipo] || esc(st.a.tipo)}</b> · ${esc(st.a.resumen || '')}${detalleAccion(st.a)}
      ${st.estado === 'ok' ? `<div>✅ ${esc(st.msg)}</div>` : st.estado === 'no' ? '<div class="mut">Descartado</div>' : `${st.estado === 'error' ? `<div style="color:var(--bad)">⚠ ${esc(st.msg)}</div>` : ''}<div class="row"><button class="btn ok sm" data-ok="${k}">Confirmar</button><button class="btn sec sm" data-no="${k}">Descartar</button></div>`}</div>`; }).join('')).join('');
  box.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => confirmarAccion(+b.dataset.ok));
  box.querySelectorAll('[data-no]').forEach(b => b.onclick = () => { asi.acts[+b.dataset.no].estado = 'no'; pintarChat(); });
  box.lastElementChild && box.lastElementChild.scrollIntoView({ block: 'nearest' });
}
function confirmarAccion(k) {
  const st = asi.acts[k]; if (!st || st.estado === 'ok') return;
  try { const f = EJEC[st.a.tipo]; if (!f) throw new Error('No sé hacer esa acción'); st.msg = f(st.a); st.estado = 'ok'; toast(st.msg); }
  catch (e) { st.estado = 'error'; st.msg = e.message; }
  pintarChat();
}
async function enviarAsistente(texto) {
  texto = String(texto || '').trim(); if (!texto || asi.busy) return;
  const historial = asi.msgs.slice(-8).map(m => ({ rol: m.rol, texto: m.texto }));
  asi.msgs.push({ rol: 'user', texto }); asi.draft = ''; asi.busy = true; vAsistente();
  try {
    const r = await Sync.call('preguntar', { mensaje: texto, historial, contexto: contextoAsistente(texto) }, (window.SB_CONFIG || {}).fnAsistente || 'asistente');
    const ids = (r.acciones || []).map(a => asi.acts.push({ a, estado: 'pend', msg: '' }) - 1);
    asi.msgs.push({ rol: 'assistant', texto: r.respuesta || (ids.length ? 'Te lo dejo listo para confirmar:' : 'No entendí, ¿me lo repetís?'), acciones: ids });
  } catch (e) {
    asi.msgs.push({ rol: 'assistant', texto: 'No pude responder: ' + e.message });
  }
  asi.busy = false; if (tab === 'asistente') vAsistente();
}
