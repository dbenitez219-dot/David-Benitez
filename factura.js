'use strict';
/* Factura electrónica directa a la DNIT (SIFEN). La firma y el envío los hace la función netlify/functions/sifen.js;
   acá están el botón Emitir, la factura impresa (KuDE), el PDF para compartir y la anulación. */
const FE_URL = '/.netlify/functions/sifen';
const feAmb = () => db.cfg.feAmbiente === 'prod' ? 'prod' : 'test';
const feNext = () => Math.max(1, Math.floor((db.cfg.feNext || {})[feAmb()] || 1));
const feEmitida = s => !!(s.inv && s.inv.type === 'electronica' && s.inv.cdc && s.inv.qr);
const cdc4 = c => String(c || '').replace(/(\d{4})(?=\d)/g, '$1 ');

async function feCall(action, body = {}) {
  const r = await fetch(FE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await Sync.token() }, body: JSON.stringify({ action, ...body }) });
  const j = await r.json().catch(() => ({ ok: false, error: 'El servidor no respondió (código ' + r.status + '). ¿Ya se publicó la función de factura?' }));
  if (r.status >= 400 && !j.estado) throw new Error(j.error || 'Error ' + r.status);
  return j;
}

/* ---------- Emitir ---------- */
function feEmitir(s) {
  const cl = cli(s.clientId) || {}, amb = feAmb();
  modal(`<h2>Emitir factura electrónica · Venta #${s.n}</h2>
    ${amb === 'test' ? '<div class="banner">Modo de <b>pruebas</b>: la factura va a la DNIT pero no tiene validez.</div>' : ''}
    <label>Cliente (nombre o razón social)</label><input id="f_n" value="${esc(s.clientName || cl.name || '')}">
    <div class="row"><div><label>RUC (con guion) o C.I.</label><input id="f_r" value="${esc(cl.ruc || '')}" placeholder="80012345-6 · vacío = sin nombre"></div>
      <div style="flex:0 0 auto;align-self:end"><button class="btn sec" id="f_b">Buscar en DNIT</button></div></div>
    <label>Correo del cliente (opcional)</label><input id="f_e" type="email" value="${esc(cl.email || '')}">
    <p class="mut">Número: <b>${esc(db.cfg.feEst || '001')}-${esc(db.cfg.fePunto || '001')}-${String(feNext()).padStart(7, '0')}</b> · Total: <b>${gs(s.total)}</b> · ${s.pay === 'credito' ? 'Crédito' : 'Contado'}</p>
    <div class="row" style="margin-top:12px"><button class="btn ok" id="f_ok">Emitir factura</button><button class="btn sec" id="f_no">Volver</button></div>`);
  $('#f_no').onclick = () => formFactura(s);
  $('#f_b').onclick = () => feBuscarRuc($('#f_r'), $('#f_n'));
  $('#f_ok').onclick = async () => {
    const btn = $('#f_ok'); btn.disabled = true; btn.textContent = 'Enviando a la DNIT…';
    const cliente = { nombre: $('#f_n').value.trim(), ruc: $('#f_r').value.trim(), email: $('#f_e').value.trim(), telefono: cl.phone || s.phone || '' };
    if (cl.id) { Object.assign(cl, { ruc: cliente.ruc, email: cliente.email }); }
    try {
      const r = await feCall('emitir', { numero: feNext(), cliente, venta: { date: s.date, due: s.due, pay: s.pay, pays: s.pays, total: s.total, vehicle: s.vehicle, items: s.items } });
      if (!r.ok) { feResultado(s, r); return; }
      s.inv = { type: 'electronica', no: r.numero, cdc: r.cdc, fecha: r.fecha, qr: r.qrPng, qrUrl: r.qrUrl, ambiente: r.ambiente, timbrado: r.timbrado, timbradoDesde: r.timbradoDesde,
        total: r.total, items: r.items, cliente };
      db.cfg.feNext = { ...(db.cfg.feNext || {}), [r.ambiente]: feNext() + 1 };
      guardar(); toast('Factura aprobada por la DNIT'); formFactura(s);
    } catch (er) { feResultado(s, { error: er.message }); }
  };
}
function feResultado(s, r) {
  const det = (r.mensajes || []).map(m => `<li>${esc(m)}</li>`).join('');
  modal(`<h2>La DNIT no aprobó la factura</h2>${r.estado ? `<p>Estado: <b>${esc(r.estado)}</b></p>` : ''}${det ? `<ul>${det}</ul>` : ''}${r.error ? `<p style="word-break:break-word"><b>${esc(r.error)}</b></p>` : ''}
    <p class="mut">No se emitió nada. Sacale una captura a este mensaje y pasásela a Claude.</p><div class="row"><button class="btn" id="f_re">Volver a intentar</button><button class="btn sec" id="f_no">Cerrar</button></div>`);
  $('#f_re').onclick = () => feEmitir(s); $('#f_no').onclick = () => formFactura(s);
}
async function feBuscarRuc(inRuc, inNombre) {
  const v = inRuc.value.trim(); if (!v) return toast('Escribí el RUC');
  try { const r = await feCall('ruc', { ruc: v }); if (r.ok) { inNombre.value = r.nombre; toast('Encontrado: ' + r.nombre); } else toast(r.mensaje || r.error || 'RUC no encontrado'); }
  catch (er) { toast(er.message); }
}

/* ---------- Anular ---------- */
function feAnular(s) {
  modal(`<h2>Anular factura ${esc(s.inv.no)}</h2><p class="mut">Se avisa a la DNIT que esta factura queda sin efecto. Se puede hacer dentro de las 48 horas de emitida.</p>
    <label>Motivo</label><input id="a_m" value="Error en la factura">
    <div class="row" style="margin-top:12px"><button class="btn bad" id="a_ok">Anular en la DNIT</button><button class="btn sec" id="a_no">Volver</button></div>`);
  $('#a_no').onclick = () => formFactura(s);
  $('#a_ok').onclick = async () => {
    const btn = $('#a_ok'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await feCall('cancelar', { cdc: s.inv.cdc, motivo: $('#a_m').value.trim() });
      if (!r.ok) { toast('La DNIT no aceptó la anulación'); feResultado(s, r); return; }
      s.inv = { ...s.inv, anulada: hoyISO() }; guardar(); toast('Factura anulada'); formFactura(s);
    } catch (er) { feResultado(s, { error: er.message }); }
  };
}

/* ---------- Factura impresa (KuDE) ---------- */
function feFilas(s) {
  return (s.inv.items || []).map(i => ({ d: i.descripcion, q: i.cantidad, p: i.precioUnitario, desc: i.descuento, t: i.cantidad * (i.precioUnitario - i.descuento) }));
}
function feImprimir(s) {
  const e = db.cfg.empresa, f = s.inv, c = f.cliente || {}, filas = feFilas(s), total = f.total || s.total;
  const w = window.open('', '_blank'); if (!w) return toast('Permití las ventanas emergentes para imprimir');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Factura ${esc(f.no)}</title><style>body{font:13px sans-serif;max-width:760px;margin:16px auto;color:#111}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:5px;text-align:left}.r{text-align:right}.s{font-size:11px;color:#444}.box{border:1px solid #111;padding:8px;border-radius:6px}.g{display:flex;gap:10px}.g>div{flex:1}h1{margin:0;font-size:18px}.pr{color:#b00;font-weight:bold;text-align:center;border:2px solid #b00;padding:4px;margin-bottom:8px}</style>
  ${f.ambiente === 'test' ? '<div class="pr">DOCUMENTO DE PRUEBA · SIN VALOR COMERCIAL NI FISCAL</div>' : ''}
  <div class="g"><div class="box"><img src="${location.origin}/icons/logo.png" style="height:60px;background:#000;border-radius:6px;float:left;margin-right:8px"><h1>${esc(e.nombre || 'CristalAuto Parabrisas')}</h1>
    <div class="s">CRISTALAUTO E.A.S. UNIPERSONAL<br>${esc(e.direccion || 'Nicanor Ríos 480, Barcequillo, San Lorenzo')}<br>${e.tel ? 'Tel. ' + esc(e.tel) : ''} ${e.email ? '· ' + esc(e.email) : ''}</div></div>
    <div class="box"><b>RUC 80139512-7</b><br>Timbrado N° ${esc(f.timbrado)}<br>Inicio de vigencia: ${dmy(f.timbradoDesde)}<br><b style="font-size:15px">FACTURA ELECTRÓNICA</b><br><b>N° ${esc(f.no)}</b></div></div>
  <div class="box" style="margin-top:8px">Fecha de emisión: <b>${dmy(f.fecha.slice(0, 10))} ${f.fecha.slice(11, 16)}</b> · Condición: <b>${s.pay === 'credito' ? 'Crédito' : 'Contado'}</b> · Moneda: Guaraní<br>
    Cliente: <b>${esc(c.nombre || 'Sin Nombre')}</b> · ${c.ruc ? (/-/.test(c.ruc) ? 'RUC ' : 'C.I. ') + esc(c.ruc) : 'Sin documento'}${c.email ? ' · ' + esc(c.email) : ''}${s.vehicle ? '<br>Vehículo: ' + esc(s.vehicle) : ''}</div>
  <table style="margin-top:8px"><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio unit.</th><th class="r">Descuento</th><th class="r">Valor venta 10%</th></tr>
  ${filas.map(i => `<tr><td>${esc(i.d)}</td><td class="r">${fmt(i.q)}</td><td class="r">${gs(i.p)}</td><td class="r">${i.desc ? gs(i.desc * i.q) : '—'}</td><td class="r">${gs(i.t)}</td></tr>`).join('')}
  <tr><td colspan="4"><b>TOTAL A PAGAR</b></td><td class="r"><b>${gs(total)}</b></td></tr>
  <tr><td colspan="4">Liquidación del IVA (10%)</td><td class="r">${gs(total / 11)}</td></tr></table>
  ${f.anulada ? '<div class="pr" style="margin-top:8px">FACTURA ANULADA</div>' : ''}
  <div class="g" style="margin-top:10px;align-items:center"><div style="flex:0 0 140px"><img src="${f.qr}" style="width:130px"></div>
    <div class="s">Consulte la validez de esta Factura Electrónica con el número de CDC impreso abajo en: https://ekuatia.set.gov.py/consultas/<br><b style="font-size:13px;color:#111">CDC: ${cdc4(f.cdc)}</b><br>
    ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML).<br>Si su documento electrónico presenta algún error, podrá solicitar la modificación dentro de las 72 horas siguientes de la emisión de este comprobante.</div></div>
  <script>onload=()=>print()<\/script>`);
  w.document.close();
}
async function fePDF(s) {
  if (!window.jspdf) throw new Error('No se cargó el generador de PDF. Recargá la app.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 14, R = 196, e = db.cfg.empresa, f = s.inv, c = f.cliente || {}, total = f.total || s.total;
  let y = 16;
  if (f.ambiente === 'test') { doc.setTextColor(180, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('DOCUMENTO DE PRUEBA · SIN VALOR COMERCIAL NI FISCAL', 105, 10, { align: 'center' }); doc.setTextColor(20); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(e.nombre || 'CristalAuto Parabrisas', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  ['CRISTALAUTO E.A.S. UNIPERSONAL', e.direccion || 'Nicanor Ríos 480, Barcequillo, San Lorenzo', [e.tel && 'Tel. ' + e.tel, e.email].filter(Boolean).join(' · ')].filter(Boolean).forEach(l => { y += 5; doc.text(l, M, y); });
  doc.setFont('helvetica', 'bold'); doc.text('RUC 80139512-7', R, 16, { align: 'right' }); doc.setFont('helvetica', 'normal');
  doc.text('Timbrado N° ' + f.timbrado, R, 21, { align: 'right' }); doc.text('Inicio de vigencia: ' + dmy(f.timbradoDesde), R, 26, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('FACTURA ELECTRÓNICA', R, 32, { align: 'right' }); doc.text('N° ' + f.no, R, 38, { align: 'right' });
  y = 46; doc.setDrawColor(180); doc.line(M, y, R, y); y += 6; doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de emisión: ${dmy(f.fecha.slice(0, 10))} ${f.fecha.slice(11, 16)}   ·   Condición: ${s.pay === 'credito' ? 'Crédito' : 'Contado'}   ·   Moneda: Guaraní`, M, y); y += 5;
  doc.text(`Cliente: ${c.nombre || 'Sin Nombre'}   ·   ${c.ruc ? (/-/.test(c.ruc) ? 'RUC ' : 'C.I. ') + c.ruc : 'Sin documento'}`, M, y); y += 5;
  if (s.vehicle) { doc.text('Vehículo: ' + s.vehicle, M, y); y += 5; }
  y += 3; doc.setFont('helvetica', 'bold'); doc.text('Descripción', M, y); doc.text('Cant.', 120, y, { align: 'right' }); doc.text('Precio unit.', 148, y, { align: 'right' }); doc.text('Valor venta 10%', R, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); y += 2; doc.line(M, y, R, y);
  feFilas(s).forEach(i => { const ln = doc.splitTextToSize(i.d, 92); y += 5; doc.text(ln, M, y); doc.text(fmt(i.q), 120, y, { align: 'right' }); doc.text(gs(i.p), 148, y, { align: 'right' }); doc.text(gs(i.t), R, y, { align: 'right' });
    if (i.desc) { y += 4; doc.setFontSize(8); doc.text('Descuento ' + gs(i.desc * i.q), M + 4, y); doc.setFontSize(9); } y += (ln.length - 1) * 4; });
  y += 3; doc.line(M, y, R, y); y += 6; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('TOTAL A PAGAR', M, y); doc.text(gs(total), R, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); y += 5; doc.text('Liquidación del IVA (10%)', M, y); doc.text(gs(total / 11), R, y, { align: 'right' });
  if (f.anulada) { y += 8; doc.setTextColor(180, 0, 0); doc.setFont('helvetica', 'bold'); doc.text('FACTURA ANULADA', 105, y, { align: 'center' }); doc.setTextColor(20); doc.setFont('helvetica', 'normal'); }
  y += 10; doc.addImage(f.qr, 'PNG', M, y, 34, 34);
  const leyenda = ['Consulte la validez de esta Factura Electrónica con el número de CDC impreso abajo en:', 'https://ekuatia.set.gov.py/consultas/', '', 'CDC: ' + cdc4(f.cdc), '',
    'ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML).', 'Si su documento electrónico presenta algún error, podrá solicitar la', 'modificación dentro de las 72 horas siguientes de la emisión de este comprobante.'];
  doc.setFontSize(8); leyenda.forEach((l, k) => { if (l.startsWith('CDC')) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); } doc.text(l, M + 40, y + 4 + k * 4); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); });
  return doc;
}
async function feCompartir(s) {
  try {
    const doc = await fePDF(s), cl = cli(s.clientId) || {};
    const r = await compartirPDF(doc, `Factura ${s.inv.no}.pdf`, `Hola${s.clientName ? ' ' + s.clientName : ''}! Te enviamos tu factura electrónica N° ${s.inv.no} de ${db.cfg.empresa.nombre || 'CristalAuto Parabrisas'}.`, cl.phone || s.phone);
    if (r === 'descargado') toast('PDF descargado: adjuntalo en WhatsApp o en el correo');
  } catch (er) { toast(er.message); }
}

/* ---------- Ajustes ---------- */
function feCardAjustes() {
  return `<div class="card"><h2>🧾 Factura electrónica (DNIT)</h2>
    <p class="mut">Modo: <b>${feAmb() === 'prod' ? 'facturas reales' : 'pruebas (sin validez)'}</b> · próximo número: <b>${String(feNext()).padStart(7, '0')}</b> · estado del servidor: <b id="fe_st">sin revisar</b></p>
    <div class="row"><div><label>Modo</label><select id="fe_amb">${optsKV([['test', 'Pruebas'], ['prod', 'Facturas reales']], feAmb())}</select></div><div><label>Próximo número de factura</label><input id="fe_nx" inputmode="numeric" value="${feNext()}"></div></div>
    <p class="mut">El modo tiene que ser el mismo que está cargado en Netlify (SIFEN_AMBIENTE).</p>
    <div class="row"><button class="btn sec" id="fe_chk">Revisar conexión</button><button class="btn" id="fe_ok">Guardar</button></div></div>`;
}
function feBindAjustes() {
  if (!$('#fe_ok')) return;
  $('#fe_ok').onclick = () => needBoss(() => { const amb = $('#fe_amb').value === 'prod' ? 'prod' : 'test';
    db.cfg.feAmbiente = amb; db.cfg.feNext = { ...(db.cfg.feNext || {}), [amb]: Math.max(1, numGs($('#fe_nx').value) || 1) }; guardar(); toast('Guardado'); vAjustes(); });
  $('#fe_amb').onchange = () => { $('#fe_nx').value = Math.max(1, Math.floor((db.cfg.feNext || {})[$('#fe_amb').value] || 1)); };
  $('#fe_chk').onclick = async () => {
    const el = $('#fe_st'); el.textContent = 'revisando…';
    try {
      const r = await feCall('estado');
      const partes = [r.ok ? '✅ listo' : '⚠️ falta configurar', 'modo ' + (r.ambiente === 'prod' ? 'facturas reales' : 'pruebas')];
      if (r.falta && r.falta.length) partes.push('falta: ' + r.falta.join(', '));
      if (r.cert) partes.push(r.cert.error || 'certificado vence ' + new Date(r.cert.vence).toLocaleDateString('es-PY'));
      if (r.ambiente !== feAmb()) partes.push('⚠️ el modo de la app no coincide con Netlify');
      el.textContent = partes.join(' · ');
    } catch (er) { el.textContent = '❌ ' + er.message; }
  };
}
