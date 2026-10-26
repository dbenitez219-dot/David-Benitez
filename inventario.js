'use strict';
/* Inventario físico guiado: contás vidrio por vidrio, ves las diferencias y ajustás el stock con un toque.
   El conteo queda guardado en este dispositivo mientras lo hacés (podés seguir otro día). */
const CONTEO_KEY = 'cristalauto.conteo';
let cnt = { counts: {}, q: '', f: 'todos', lim: 60 };
const leerConteo = () => { try { const d = JSON.parse(localStorage.getItem(CONTEO_KEY)); if (d && d.counts) return d; } catch (e) { } return { fecha: hoyISO(), counts: {} }; };
const guardarConteo = () => { try { localStorage.setItem(CONTEO_KEY, JSON.stringify({ fecha: cnt.fecha, counts: cnt.counts })); } catch (e) { } };

function vConteo() {
  const prev = leerConteo(); cnt.counts = prev.counts; cnt.fecha = prev.fecha;
  view.innerHTML = `<div class="card"><div class="row"><h2 style="flex:1;margin:0">📋 Inventario físico</h2><button class="btn sec sm" id="c_back" style="flex:0 0 auto">← Stock</button></div>
    <p class="mut">Buscá cada vidrio, escribí cuántos hay <b>realmente</b> en el depósito y listo. Al final ves las diferencias y ajustás. Lo que no cuentes queda como está.</p>
    <div id="c_prog" class="kpi" style="margin:8px 0"></div>
    <div class="row"><div style="flex:2 1 200px"><input id="c_q" type="search" placeholder="Buscar código o modelo…" value="${esc(cnt.q)}"></div>
      <select id="c_f"><option value="todos">Todos</option><option value="sin">Sin contar</option><option value="dif">Con diferencia</option></select></div>
    <div class="row" style="margin-top:8px"><button class="btn ok" id="c_fin">Ver diferencias y ajustar</button><button class="btn sec" id="c_rst">Empezar de cero</button></div></div>
  <div class="card" id="c_list"></div>`;
  $('#c_f').value = cnt.f;
  $('#c_back').onclick = () => vStock();
  $('#c_q').oninput = e => { cnt.q = e.target.value; cnt.lim = 60; listaConteo(); };
  $('#c_f').onchange = e => { cnt.f = e.target.value; cnt.lim = 60; listaConteo(); };
  $('#c_fin').onclick = resumenConteo;
  $('#c_rst').onclick = () => { if (confirm('¿Borrar todo lo contado hasta ahora? (el stock no se toca)')) { cnt.counts = {}; guardarConteo(); vConteo(); } };
  listaConteo();
}
function progresoConteo() {
  const n = Object.keys(cnt.counts).filter(id => prod(id)).length, dif = Object.entries(cnt.counts).filter(([id, v]) => prod(id) && v !== prod(id).stock).length;
  $('#c_prog').innerHTML = `<b>${n} de ${db.products.length}</b><span>vidrios contados · ${dif} con diferencia</span>`;
}
function listaConteo() {
  const w = norm(cnt.q).split(' ').filter(Boolean);
  let L = db.products.filter(p => !w.length || w.every(x => norm(p.code + ' ' + p.name).includes(x)));
  if (cnt.f === 'sin') L = L.filter(p => cnt.counts[p.id] === undefined);
  if (cnt.f === 'dif') L = L.filter(p => cnt.counts[p.id] !== undefined && cnt.counts[p.id] !== p.stock);
  L.sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  const fila = p => { const v = cnt.counts[p.id], d = v === undefined ? null : v - p.stock;
    return `<div class="cnt-row" data-r="${p.id}"><div class="cnt-n"><b>${esc(p.code)}</b><br><span class="mut">${esc(p.name)}</span></div><div class="cnt-s"><span class="mut">Sistema</span><br><b>${fmt(p.stock)}</b></div>
      <div class="cnt-i"><input data-c="${p.id}" inputmode="decimal" placeholder="—" value="${v === undefined ? '' : v}"><span class="cnt-d ${d === null ? '' : d === 0 ? 'ok' : 'bad'}" id="d_${p.id}">${d === null ? '' : d === 0 ? '✔' : (d > 0 ? '+' : '') + fmt(d)}</span></div></div>`; };
  $('#c_list').innerHTML = (L.length ? L.slice(0, cnt.lim).map(fila).join('') : '<p class="mut">No hay vidrios con ese filtro.</p>') +
    (L.length > cnt.lim ? `<button class="btn sec block" id="c_more">Ver más (${L.length - cnt.lim} restantes)</button>` : '');
  document.querySelectorAll('#c_list [data-c]').forEach(inp => inp.oninput = () => {
    const p = prod(inp.dataset.c), raw = inp.value.trim(), el = $('#d_' + p.id);
    if (raw === '') delete cnt.counts[p.id]; else cnt.counts[p.id] = numGs(raw);
    const v = cnt.counts[p.id], d = v === undefined ? null : v - p.stock;
    el.className = 'cnt-d ' + (d === null ? '' : d === 0 ? 'ok' : 'bad'); el.textContent = d === null ? '' : d === 0 ? '✔' : (d > 0 ? '+' : '') + fmt(d);
    guardarConteo(); progresoConteo(); });
  if ($('#c_more')) $('#c_more').onclick = () => { cnt.lim += 60; listaConteo(); };
  progresoConteo();
}
function resumenConteo() {
  const D = Object.entries(cnt.counts).map(([id, v]) => ({ p: prod(id), v })).filter(x => x.p && x.v !== x.p.stock).sort((a, b) => a.p.code.localeCompare(b.p.code, 'es', { numeric: true }));
  const sobra = D.filter(x => x.v > x.p.stock).reduce((a, x) => a + (x.v - x.p.stock) * (x.p.compra || 0), 0), falta = D.filter(x => x.v < x.p.stock).reduce((a, x) => a + (x.p.stock - x.v) * (x.p.compra || 0), 0);
  if (!D.length) return toast(Object.keys(cnt.counts).length ? 'Todo lo contado coincide con el sistema ✔' : 'Todavía no contaste ningún vidrio');
  modal(`<h2>Diferencias del conteo</h2><p class="mut">${D.length} vidrios con diferencia${boss() ? ` · faltan ${gs(falta)} · sobran ${gs(sobra)} (a precio de compra)` : ''}</p>
    <div style="max-height:46vh;overflow:auto">${tabla(['Vidrio', 'Sistema', 'Contado', 'Dif.'], D.map(x => `<tr><td class="wrap"><b>${esc(x.p.code)}</b><br><span class="mut">${esc(x.p.name)}</span></td><td class="n">${fmt(x.p.stock)}</td><td class="n">${fmt(x.v)}</td><td class="n"><span class="tag ${x.v < x.p.stock ? 'bad' : 'ok'}">${x.v > x.p.stock ? '+' : ''}${fmt(x.v - x.p.stock)}</span></td></tr>`).join(''), [1, 2, 3])}</div>
    <p class="mut">Al ajustar, el stock del sistema queda igual a lo que contaste. Queda registrado como "Inventario físico" en los movimientos.</p>
    <div class="row" style="margin-top:12px"><button class="btn ok" id="i_ok">Ajustar stock</button><button class="btn sec" id="i_csv">Descargar CSV</button><button class="btn sec" id="i_no">Seguir contando</button></div>`);
  $('#i_no').onclick = cerrar;
  $('#i_csv').onclick = () => { const rows = [['Codigo', 'Descripcion', 'Sistema', 'Contado', 'Diferencia'], ...D.map(x => [x.p.code, x.p.name, x.p.stock, x.v, x.v - x.p.stock])];
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n'), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'diferencias-inventario-' + hoyISO() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); };
  $('#i_ok').onclick = () => needBoss(() => {
    const nota = 'Inventario físico ' + dmy(hoyISO());
    for (const x of D) mover(x.p.id, x.v > x.p.stock ? 'in' : 'out', Math.abs(x.v - x.p.stock), nota);
    guardar(); cnt.counts = {}; guardarConteo(); cerrar(); toast(D.length + ' vidrios ajustados'); vStock();
  });
}
