'use strict';
/* Stock Diario — datos guardados en el propio dispositivo (localStorage). */
const KEY = 'stockdiario.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('es');
const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const TIPOS = { in: 'Entrada', out: 'Salida', adj: 'Ajuste' };

/* ---------- Datos ---------- */
const EJEMPLO = [
  ['A001', 'Arroz 1 kg', 'Alimentos', 'un', 120, 30, 0.9, 1.5], ['A002', 'Azúcar 1 kg', 'Alimentos', 'un', 80, 25, 0.8, 1.3],
  ['A003', 'Aceite 900 ml', 'Alimentos', 'un', 60, 20, 2.1, 3.2], ['A004', 'Harina 1 kg', 'Alimentos', 'un', 90, 25, 0.7, 1.2],
  ['A005', 'Fideos 500 g', 'Alimentos', 'un', 150, 40, 0.6, 1.1], ['A006', 'Sal fina 500 g', 'Alimentos', 'un', 45, 15, 0.3, 0.7],
  ['B001', 'Agua 2 L', 'Bebidas', 'un', 200, 60, 0.5, 1.0], ['B002', 'Gaseosa 1.5 L', 'Bebidas', 'un', 96, 30, 1.2, 2.0],
  ['B003', 'Jugo 1 L', 'Bebidas', 'un', 48, 20, 1.0, 1.8], ['B004', 'Cerveza lata', 'Bebidas', 'un', 240, 72, 0.8, 1.5],
  ['L001', 'Detergente 750 ml', 'Limpieza', 'un', 40, 15, 1.5, 2.6], ['L002', 'Lavandina 1 L', 'Limpieza', 'un', 35, 12, 0.6, 1.2],
  ['L003', 'Papel higiénico x4', 'Limpieza', 'pack', 70, 25, 1.8, 3.0], ['L004', 'Jabón de tocador', 'Limpieza', 'un', 100, 30, 0.4, 0.9],
  ['H001', 'Pilas AA x4', 'Hogar', 'pack', 25, 10, 2.0, 3.5], ['H002', 'Lamparita LED', 'Hogar', 'un', 30, 10, 1.7, 3.0],
  ['H003', 'Bolsas residuo x10', 'Hogar', 'pack', 55, 20, 0.8, 1.6], ['O001', 'Cuaderno A4', 'Oficina', 'un', 60, 20, 1.2, 2.4],
  ['O002', 'Lapicera azul', 'Oficina', 'un', 8, 30, 0.2, 0.5], ['O003', 'Resma papel A4', 'Oficina', 'un', 12, 10, 3.5, 5.5],
];
let db = cargar();

function cargar() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.products) return d; } catch (e) { }
  const hoy = hoyISO();
  const products = EJEMPLO.map(([code, name, category, unit, stock, min, cost, price]) => ({ id: uid(), code, name, category, unit, stock, min, cost, price, ejemplo: true }));
  const moves = products.map(p => ({ id: uid(), date: hoy, ts: Date.now(), pid: p.id, type: 'in', qty: p.stock, note: 'Stock inicial' }));
  return { products, moves };
}
function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('⚠️ No se pudo guardar en este navegador'); }
}
const prod = id => db.products.find(p => p.id === id);
const delta = (t, q) => t === 'in' ? q : t === 'out' ? -q : q; // ajuste: q ya es la diferencia con signo

/* ---------- UI helpers ---------- */
let tab = 'resumen';
const view = $('#view');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2500); }
function modal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; }
function cerrar() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrar(); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; render(); });
$('#hoy').textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ({ resumen: vResumen, inventario: vInventario, carga: vCarga, historial: vHistorial, datos: vDatos })[tab]();
  window.scrollTo(0, 0);
}

/* ---------- Movimientos ---------- */
function mover(pid, type, qty, note, date) {
  const p = prod(pid); if (!p) return false;
  let d = qty;
  if (type === 'out' && qty > p.stock && !confirm(`Solo hay ${fmt(p.stock)} ${p.unit} de "${p.name}". ¿Registrar la salida de ${fmt(qty)} igualmente? (quedará en negativo)`)) return false;
  p.stock = Math.round((p.stock + delta(type, d)) * 1000) / 1000;
  db.moves.push({ id: uid(), date: date || hoyISO(), ts: Date.now(), pid, type, qty: d, note: note || '' });
  guardar(); return true;
}
function borrarMov(id) {
  const m = db.moves.find(x => x.id === id); if (!m) return;
  if (!confirm('¿Anular este movimiento? El stock vuelve a como estaba.')) return;
  const p = prod(m.pid); if (p) p.stock = Math.round((p.stock - delta(m.type, m.qty)) * 1000) / 1000;
  db.moves = db.moves.filter(x => x.id !== id); guardar(); render(); toast('Movimiento anulado');
}

/* ---------- Resumen ---------- */
function vResumen() {
  const P = db.products, hoy = hoyISO();
  const bajos = P.filter(p => p.stock <= p.min);
  const valor = P.reduce((s, p) => s + Math.max(0, p.stock) * p.cost, 0);
  const mh = db.moves.filter(m => m.date === hoy && m.type !== 'adj');
  const ent = mh.filter(m => m.type === 'in').reduce((s, m) => s + m.qty, 0);
  const sal = mh.filter(m => m.type === 'out').reduce((s, m) => s + m.qty, 0);
  // Últimos 7 días
  const dias = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); });
  const serie = dias.map(d => ({ d, e: sumDia(d, 'in'), s: sumDia(d, 'out') }));
  const max = Math.max(1, ...serie.flatMap(x => [x.e, x.s]));
  view.innerHTML = `
  <div class="grid">
    <div class="kpi"><b>${P.length}</b><span>Productos</span></div>
    <div class="kpi"><b>${fmt(P.reduce((s, p) => s + p.stock, 0))}</b><span>Unidades en stock</span></div>
    <div class="kpi"><b>${money(valor)}</b><span>Valor (a costo)</span></div>
    <div class="kpi ${bajos.length ? 'bad' : ''}"><b>${bajos.length}</b><span>Stock bajo</span></div>
    <div class="kpi"><b style="color:var(--ok)">+${fmt(ent)}</b><span>Entradas hoy</span></div>
    <div class="kpi"><b style="color:var(--bad)">−${fmt(sal)}</b><span>Salidas hoy</span></div>
  </div>
  <div class="card"><h2>Últimos 7 días</h2>
    <svg viewBox="0 0 350 130" width="100%" role="img" aria-label="Entradas y salidas de los últimos 7 días">
      ${serie.map((x, i) => {
    const bx = 10 + i * 48, h1 = x.e / max * 80, h2 = x.s / max * 80;
    return `<rect x="${bx}" y="${90 - h1}" width="16" height="${h1}" rx="3" fill="#16a34a"/><rect x="${bx + 18}" y="${90 - h2}" width="16" height="${h2}" rx="3" fill="#dc2626"/>
        <text x="${bx + 17}" y="108" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">${x.d.slice(8)}/${x.d.slice(5, 7)}</text>`;
  }).join('')}
    </svg>
    <span class="mut"><span style="color:#16a34a">■</span> Entradas &nbsp; <span style="color:#dc2626">■</span> Salidas</span>
  </div>
  <div class="card"><h2>⚠️ Reponer (stock ≤ mínimo)</h2>
    ${bajos.length ? tabla(['Código', 'Producto', 'Stock', 'Mínimo'], bajos.sort((a, b) => a.stock - b.stock).map(p => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td class="n" style="color:var(--bad);font-weight:700">${fmt(p.stock)}</td><td class="n">${fmt(p.min)}</td></tr>`).join(''), [2, 3]) : '<p class="mut">Todo en orden 👌</p>'}
  </div>`;
}
const sumDia = (d, t) => db.moves.filter(m => m.date === d && m.type === t).reduce((s, m) => s + m.qty, 0);
const tabla = (cols, rows, numCols = []) => `<div class="tablewrap"><table><thead><tr>${cols.map((c, i) => `<th class="${numCols.includes(i) ? 'n' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;

/* ---------- Inventario ---------- */
let filtro = { q: '', cat: '', bajo: false };
function vInventario() {
  const cats = [...new Set(db.products.map(p => p.category).filter(Boolean))].sort();
  view.innerHTML = `
  <div class="card">
    <div class="row">
      <input id="q" type="search" placeholder="Buscar código o nombre…" value="${esc(filtro.q)}">
      <select id="cat"><option value="">Todas las categorías</option>${cats.map(c => `<option ${c === filtro.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select id="bajo"><option value="">Todos</option><option value="1" ${filtro.bajo ? 'selected' : ''}>Solo stock bajo</option></select>
      <button class="btn" id="nuevo">+ Nuevo producto</button>
    </div>
  </div>
  <div class="card" id="lista"></div>`;
  $('#q').oninput = e => { filtro.q = e.target.value; lista(); };
  $('#cat').onchange = e => { filtro.cat = e.target.value; lista(); };
  $('#bajo').onchange = e => { filtro.bajo = !!e.target.value; lista(); };
  $('#nuevo').onclick = () => formProducto();
  lista();
}
function lista() {
  const q = filtro.q.toLowerCase();
  const L = db.products.filter(p => (!q || (p.code + ' ' + p.name).toLowerCase().includes(q)) && (!filtro.cat || p.category === filtro.cat) && (!filtro.bajo || p.stock <= p.min))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  $('#lista').innerHTML = (L.length ? tabla(['Código', 'Producto', 'Categoría', 'Stock', 'Mín.', 'Costo', 'Precio', ''],
    L.map(p => `<tr class="${p.stock <= p.min ? 'low' : ''}"><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td>
      <td class="n">${fmt(p.stock)} ${esc(p.unit)}</td><td class="n">${fmt(p.min)}</td><td class="n">${money(p.cost)}</td><td class="n">${money(p.price)}</td>
      <td><button class="btn sec sm" data-e="${p.id}">Editar</button></td></tr>`).join(''), [3, 4, 5, 6]) : '<p class="mut">Sin resultados.</p>') +
    `<p class="mut">${L.length} de ${db.products.length} productos</p>`;
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => formProducto(b.dataset.e));
}
function formProducto(id) {
  const p = id ? prod(id) : { code: '', name: '', category: '', unit: 'un', stock: 0, min: 0, cost: 0, price: 0 };
  modal(`<h2>${id ? 'Editar' : 'Nuevo'} producto</h2>
    <div class="row"><div><label>Código</label><input id="f_code" value="${esc(p.code)}"></div><div><label>Unidad</label><input id="f_unit" value="${esc(p.unit)}"></div></div>
    <label>Nombre</label><input id="f_name" value="${esc(p.name)}">
    <label>Categoría</label><input id="f_cat" list="cats" value="${esc(p.category)}"><datalist id="cats">${[...new Set(db.products.map(x => x.category))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row">${id ? '' : `<div><label>Stock inicial</label><input id="f_stock" inputmode="decimal" value="${p.stock}"></div>`}<div><label>Stock mínimo</label><input id="f_min" inputmode="decimal" value="${p.min}"></div></div>
    <div class="row"><div><label>Costo</label><input id="f_cost" inputmode="decimal" value="${p.cost}"></div><div><label>Precio venta</label><input id="f_price" inputmode="decimal" value="${p.price}"></div></div>
    <div class="row" style="margin-top:14px"><button class="btn" id="ok">Guardar</button><button class="btn sec" id="no">Cancelar</button>${id ? '<button class="btn bad" id="del">Eliminar</button>' : ''}</div>`);
  $('#no').onclick = cerrar;
  $('#ok').onclick = () => {
    const name = $('#f_name').value.trim(); if (!name) { toast('Falta el nombre'); return; }
    const code = $('#f_code').value.trim();
    if (code && db.products.some(x => x.code.toLowerCase() === code.toLowerCase() && x.id !== id)) { toast('Ya existe ese código'); return; }
    const d = { code, name, unit: $('#f_unit').value.trim() || 'un', category: $('#f_cat').value.trim(), min: num($('#f_min').value), cost: num($('#f_cost').value), price: num($('#f_price').value) };
    if (id) Object.assign(p, d, { ejemplo: false });
    else {
      const np = { id: uid(), ...d, stock: 0 }; db.products.push(np);
      const s = num($('#f_stock').value); if (s) { np.stock = s; db.moves.push({ id: uid(), date: hoyISO(), ts: Date.now(), pid: np.id, type: 'in', qty: s, note: 'Stock inicial' }); }
    }
    guardar(); cerrar(); render(); toast('Guardado');
  };
  if (id) $('#del').onclick = () => {
    if (!confirm(`¿Eliminar "${p.name}" y su historial?`)) return;
    db.products = db.products.filter(x => x.id !== id); db.moves = db.moves.filter(m => m.pid !== id); guardar(); cerrar(); render();
  };
}

/* ---------- Carga diaria ---------- */
let carga = { type: 'in', date: hoyISO() };
function vCarga() {
  view.innerHTML = `
  <div class="card"><h2>Registrar movimiento</h2>
    <div class="seg" id="seg">${Object.entries(TIPOS).map(([k, v]) => `<button data-t="${k}" class="${k === carga.type ? 'on' : ''}">${k === 'in' ? '⬇ ' : k === 'out' ? '⬆ ' : '✎ '}${v}</button>`).join('')}</div>
    <label>Fecha</label><input type="date" id="c_date" value="${carga.date}">
    <label>Producto (código o nombre)</label><input id="c_prod" list="plist" autocomplete="off" placeholder="Escribí para buscar…">
    <datalist id="plist">${db.products.map(p => `<option value="${esc(p.code ? p.code + ' — ' : '')}${esc(p.name)}">`).join('')}</datalist>
    <div id="c_info" class="mut" style="margin-top:4px"></div>
    <label id="c_lbl">Cantidad</label><input id="c_qty" inputmode="decimal" placeholder="0">
    <label>Nota (opcional)</label><input id="c_note" placeholder="Proveedor, cliente, motivo…">
    <button class="btn" id="c_add" style="width:100%;margin-top:12px">Agregar</button>
  </div>
  <div class="card"><h2>Movimientos del <span id="c_fecha"></span></h2><div id="c_list"></div></div>`;
  const ajustar = () => {
    $('#c_lbl').textContent = carga.type === 'adj' ? 'Conteo real (cantidad que hay ahora)' : 'Cantidad';
    document.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.t === carga.type));
  };
  $('#seg').onclick = e => { const b = e.target.closest('button'); if (b) { carga.type = b.dataset.t; ajustar(); } };
  $('#c_date').onchange = e => { carga.date = e.target.value || hoyISO(); listaDia(); };
  const buscar = () => {
    const v = $('#c_prod').value.trim().toLowerCase(); if (!v) return null;
    return db.products.find(p => ((p.code ? p.code + ' — ' : '') + p.name).toLowerCase() === v) || db.products.find(p => p.code && p.code.toLowerCase() === v) || db.products.find(p => p.name.toLowerCase() === v);
  };
  $('#c_prod').oninput = () => { const p = buscar(); $('#c_info').textContent = p ? `Stock actual: ${fmt(p.stock)} ${p.unit}` : ''; };
  $('#c_add').onclick = () => {
    const p = buscar(); if (!p) { toast('Elegí un producto de la lista'); return; }
    let q = num($('#c_qty').value);
    if (carga.type === 'adj') { if ($('#c_qty').value.trim() === '' || q < 0) { toast('Ingresá el conteo real'); return; } q = q - p.stock; if (!q) { toast('El conteo coincide con el stock'); return; } }
    else if (q <= 0) { toast('Ingresá una cantidad mayor a 0'); return; }
    if (mover(p.id, carga.type, q, $('#c_note').value.trim(), carga.date)) {
      toast(`${TIPOS[carga.type]}: ${p.name} → ${fmt(p.stock)} ${p.unit}`);
      $('#c_prod').value = ''; $('#c_qty').value = ''; $('#c_note').value = ''; $('#c_info').textContent = ''; $('#c_prod').focus(); listaDia();
    }
  };
  ajustar(); listaDia();
}
function listaDia() {
  $('#c_fecha').textContent = new Date(carga.date + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'long' });
  const M = db.moves.filter(m => m.date === carga.date).sort((a, b) => b.ts - a.ts);
  $('#c_list').innerHTML = M.length ? movTabla(M) : '<p class="mut">Todavía no cargaste nada este día.</p>';
  bindAnular();
}
function movTabla(M) {
  return tabla(['Fecha', 'Tipo', 'Producto', 'Cant.', 'Nota', ''], M.map(m => { const p = prod(m.pid);
    return `<tr><td>${m.date.slice(8)}/${m.date.slice(5, 7)}</td><td><span class="tag ${m.type}">${TIPOS[m.type]}</span></td><td>${esc(p ? p.name : '(eliminado)')}</td>
    <td class="n">${m.type === 'adj' && m.qty > 0 ? '+' : ''}${fmt(m.qty)}</td><td>${esc(m.note)}</td><td><button class="btn sec sm" data-a="${m.id}">Anular</button></td></tr>`; }).join(''), [3]);
}
function bindAnular() { document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => borrarMov(b.dataset.a)); }

/* ---------- Historial ---------- */
let hist = { from: '', to: '', type: '', q: '' };
function vHistorial() {
  view.innerHTML = `<div class="card"><div class="row">
    <div><label>Desde</label><input type="date" id="h_from" value="${hist.from}"></div><div><label>Hasta</label><input type="date" id="h_to" value="${hist.to}"></div>
    <div><label>Tipo</label><select id="h_type"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${hist.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Producto</label><input id="h_q" type="search" placeholder="Buscar…" value="${esc(hist.q)}"></div></div></div>
    <div class="card" id="h_list"></div>`;
  ['from', 'to', 'type', 'q'].forEach(k => $('#h_' + k).oninput = e => { hist[k] = e.target.value; hl(); });
  hl();
}
function hl() {
  const q = hist.q.toLowerCase();
  const M = db.moves.filter(m => (!hist.from || m.date >= hist.from) && (!hist.to || m.date <= hist.to) && (!hist.type || m.type === hist.type) &&
    (!q || (prod(m.pid)?.name + ' ' + prod(m.pid)?.code).toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  $('#h_list').innerHTML = (M.length ? movTabla(M.slice(0, 300)) : '<p class="mut">Sin movimientos.</p>') + (M.length > 300 ? `<p class="mut">Mostrando 300 de ${M.length}. Usá los filtros.</p>` : '');
  bindAnular();
}

/* ---------- Datos: importar / exportar / respaldo ---------- */
function vDatos() {
  const hayEj = db.products.some(p => p.ejemplo);
  view.innerHTML = `
  <div class="card"><h2>📥 Cargar tu stock real</h2>
    <p class="mut">La app trae productos de <b>ejemplo</b>. Para cargar los tuyos, importá un archivo CSV (se abre y se guarda desde Excel: <i>Guardar como → CSV</i>) con estas columnas en la primera fila:<br>
    <code>codigo, nombre, categoria, unidad, stock, minimo, costo, precio</code></p>
    <div class="row"><button class="btn sec" id="plantilla">Descargar plantilla CSV</button><button class="btn" id="imp">Importar CSV</button></div>
    <input type="file" id="file" accept=".csv,text/csv,.txt" hidden>
    <p class="mut">Si el código ya existe, se actualiza el producto y su stock queda igual al del archivo (se registra un ajuste).</p>
    ${hayEj ? '<button class="btn bad" id="bej" style="margin-top:6px">Borrar productos de ejemplo</button>' : ''}
  </div>
  <div class="card"><h2>📤 Exportar</h2><div class="row"><button class="btn sec" id="exp">Inventario (CSV)</button><button class="btn sec" id="expm">Movimientos (CSV)</button></div></div>
  <div class="card"><h2>💾 Respaldo y pasar datos entre dispositivos</h2>
    <p class="mut">Los datos viven en cada dispositivo. Para llevarlos de la computadora al iPhone (o al revés): <b>Descargar respaldo</b> → enviate el archivo (AirDrop, correo, WhatsApp) → <b>Restaurar respaldo</b> en el otro dispositivo. Hacelo también de vez en cuando como copia de seguridad.</p>
    <div class="row"><button class="btn" id="bk">Descargar respaldo</button><button class="btn sec" id="rs">Restaurar respaldo</button></div>
    <input type="file" id="rfile" accept=".json,application/json" hidden>
  </div>
  <div class="card"><h2>🗑 Empezar de cero</h2><button class="btn bad" id="reset">Borrar todo</button></div>`;
  $('#plantilla').onclick = () => bajar('plantilla-stock.csv', csv([['codigo', 'nombre', 'categoria', 'unidad', 'stock', 'minimo', 'costo', 'precio'], ['A001', 'Arroz 1 kg', 'Alimentos', 'un', 120, 30, 0.9, 1.5]]), 'text/csv');
  $('#imp').onclick = () => $('#file').click();
  $('#file').onchange = async e => { const f = e.target.files[0]; if (f) importarCSV(await f.text()); e.target.value = ''; };
  $('#exp').onclick = () => bajar(`inventario-${hoyISO()}.csv`, csv([['codigo', 'nombre', 'categoria', 'unidad', 'stock', 'minimo', 'costo', 'precio'], ...db.products.map(p => [p.code, p.name, p.category, p.unit, p.stock, p.min, p.cost, p.price])]), 'text/csv');
  $('#expm').onclick = () => bajar(`movimientos-${hoyISO()}.csv`, csv([['fecha', 'tipo', 'codigo', 'producto', 'cantidad', 'nota'], ...db.moves.slice().sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts).map(m => { const p = prod(m.pid) || {}; return [m.date, TIPOS[m.type], p.code, p.name, m.qty, m.note]; })]), 'text/csv');
  $('#bk').onclick = () => bajar(`respaldo-stock-${hoyISO()}.json`, JSON.stringify(db), 'application/json');
  $('#rs').onclick = () => $('#rfile').click();
  $('#rfile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.products) || !Array.isArray(d.moves)) throw 0;
      if (!confirm(`Esto reemplaza los datos actuales por el respaldo (${d.products.length} productos, ${d.moves.length} movimientos). ¿Continuar?`)) return;
      db = d; guardar(); render(); toast('Respaldo restaurado'); } catch (err) { toast('Archivo de respaldo inválido'); }
  };
  if (hayEj) $('#bej').onclick = () => { if (!confirm('¿Borrar los productos de ejemplo?')) return; const ids = new Set(db.products.filter(p => p.ejemplo).map(p => p.id));
    db.products = db.products.filter(p => !ids.has(p.id)); db.moves = db.moves.filter(m => !ids.has(m.pid)); guardar(); render(); toast('Ejemplos borrados'); };
  $('#reset').onclick = () => { if (confirm('¿Borrar TODOS los productos y movimientos? No se puede deshacer.') && confirm('Última confirmación: ¿seguro?')) { db = { products: [], moves: [] }; guardar(); render(); } };
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
function importarCSV(txt) {
  const rows = parseCSV(txt); if (rows.length < 2) { toast('El archivo está vacío'); return; }
  const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const h = rows[0].map(norm); const col = (...n) => h.findIndex(x => n.includes(x));
  const ix = { code: col('codigo', 'code', 'sku'), name: col('nombre', 'producto', 'name', 'descripcion'), cat: col('categoria', 'category', 'rubro'), unit: col('unidad', 'unit'),
    stock: col('stock', 'cantidad', 'existencia'), min: col('minimo', 'stock minimo', 'min'), cost: col('costo', 'cost'), price: col('precio', 'precio venta', 'price') };
  if (ix.name < 0) { toast('Falta la columna "nombre"'); return; }
  const g = (r, k) => ix[k] >= 0 ? (r[ix[k]] ?? '').trim() : '';
  let nuevos = 0, act = 0;
  // al importar datos reales se retiran los de ejemplo
  const ej = db.products.filter(p => p.ejemplo);
  if (ej.length && confirm('¿Quitar los productos de ejemplo antes de importar?')) { const ids = new Set(ej.map(p => p.id)); db.products = db.products.filter(p => !ids.has(p.id)); db.moves = db.moves.filter(m => !ids.has(m.pid)); }
  for (const r of rows.slice(1)) {
    const name = g(r, 'name'); if (!name) continue; const code = g(r, 'code');
    let p = code ? db.products.find(x => x.code.toLowerCase() === code.toLowerCase()) : db.products.find(x => x.name.toLowerCase() === name.toLowerCase());
    const hasStock = ix.stock >= 0 && g(r, 'stock') !== ''; const st = num(g(r, 'stock'));
    if (p) { act++; p.name = name; if (ix.cat >= 0) p.category = g(r, 'cat'); if (ix.unit >= 0 && g(r, 'unit')) p.unit = g(r, 'unit'); if (ix.min >= 0) p.min = num(g(r, 'min')); if (ix.cost >= 0) p.cost = num(g(r, 'cost')); if (ix.price >= 0) p.price = num(g(r, 'price'));
      if (hasStock && st !== p.stock) { db.moves.push({ id: uid(), date: hoyISO(), ts: Date.now(), pid: p.id, type: 'adj', qty: st - p.stock, note: 'Importación CSV' }); p.stock = st; } }
    else { nuevos++; p = { id: uid(), code, name, category: g(r, 'cat'), unit: g(r, 'unit') || 'un', stock: 0, min: num(g(r, 'min')), cost: num(g(r, 'cost')), price: num(g(r, 'price')) }; db.products.push(p);
      if (hasStock && st) { p.stock = st; db.moves.push({ id: uid(), date: hoyISO(), ts: Date.now(), pid: p.id, type: 'in', qty: st, note: 'Stock inicial (CSV)' }); } }
  }
  guardar(); render(); toast(`Importado: ${nuevos} nuevos, ${act} actualizados`);
}

/* ---------- Inicio ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
render();
