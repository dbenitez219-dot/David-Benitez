'use strict';
/* Cotización formal en PDF (con logo, datos de la empresa, número, validez y condiciones). Se comparte por WhatsApp. */
const COND0 = 'Precios en guaraníes, IVA 10% incluido.\nForma de pago: contado o según lo acordado.\nSujeto a disponibilidad de stock al momento de confirmar.';
const numPres = n => String(n).padStart(4, '0');
const validezDias = () => Math.max(1, Math.round(db.cfg.cotizDias || 3));

let logoCache = null;
function cargarLogo() {
  if (logoCache) return Promise.resolve(logoCache);
  return new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0); logoCache = { data: c.toDataURL('image/png'), w: im.naturalWidth, h: im.naturalHeight }; res(logoCache); };
    im.onerror = () => res(null); im.src = 'icons/logo.png'; });
}
const sinTildes = s => String(s ?? ''); // jsPDF (Helvetica) soporta acentos y ñ del español

async function armarPDF(q) {
  if (!window.jspdf) throw new Error('No se cargó el generador de PDF. Recargá la app.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 15, e = db.cfg.empresa, logo = await cargarLogo();
  // Encabezado negro con logo
  doc.setFillColor(0, 0, 0); doc.rect(0, 0, W, 40, 'F');
  if (logo) { const h = 34, w = Math.min(90, h * logo.w / logo.h); doc.addImage(logo.data, 'PNG', M - 4, 3, w, w * logo.h / logo.w); }
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('PRESUPUESTO', W - M, 19, { align: 'right' });
  doc.setFontSize(12); doc.text('N° ' + numPres(q.n), W - M, 27, { align: 'right' });
  doc.setTextColor(30); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = 50;
  doc.setFont('helvetica', 'bold'); doc.text(sinTildes(e.nombre || ''), M, y); doc.setFont('helvetica', 'normal');
  const emp = [e.ruc ? 'RUC: ' + e.ruc : '', e.direccion, e.tel ? 'Tel.: ' + e.tel : ''].filter(Boolean);
  emp.forEach(l => { y += 5; doc.text(sinTildes(l), M, y); });
  const venc = addDays(q.date, validezDias());
  doc.text('Fecha: ' + dmy(q.date), W - M, 50, { align: 'right' }); doc.text('Válido hasta: ' + dmy(venc), W - M, 55, { align: 'right' });
  y = Math.max(y, 55) + 9;
  doc.setDrawColor(200); doc.line(M, y - 4, W - M, y - 4);
  doc.setFont('helvetica', 'bold'); doc.text('Cliente', M, y); doc.setFont('helvetica', 'normal');
  doc.text(sinTildes(q.clientName || 'Sin nombre'), M + 22, y);
  if (q.phone) { y += 5; doc.text(sinTildes('Tel.: ' + q.phone), M + 22, y); }
  if (q.vehicle) { y += 5; doc.setFont('helvetica', 'bold'); doc.text('Vehículo', M, y); doc.setFont('helvetica', 'normal'); doc.text(sinTildes(q.vehicle), M + 22, y); }
  y += 10;
  // Tabla
  const X = { d: M + 2, c: 128, p: 160, s: W - M - 2 };
  const cabecera = () => { doc.setFillColor(235); doc.rect(M, y - 5, W - 2 * M, 8, 'F'); doc.setFont('helvetica', 'bold'); doc.text('Detalle', X.d, y);
    doc.text('Cant.', X.c, y, { align: 'right' }); doc.text('Precio unit.', X.p, y, { align: 'right' }); doc.text('Subtotal', X.s, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 8; };
  cabecera();
  for (const i of q.items) {
    const lines = doc.splitTextToSize(sinTildes(i.name || ''), 90), h = lines.length * 5 + 2;
    if (y + h > 255) { doc.addPage(); y = 20; cabecera(); }
    doc.text(lines, X.d, y); doc.text(fmt(i.qty), X.c, y, { align: 'right' }); doc.text(gs(i.unit).replace('Gs. ', ''), X.p, y, { align: 'right' }); doc.text(gs(i.qty * i.unit).replace('Gs. ', ''), X.s, y, { align: 'right' });
    y += h; doc.setDrawColor(230); doc.line(M, y - 3, W - M, y - 3);
  }
  const t = saleTotals({ items: q.items, pct: q.pct });
  if (y > 235) { doc.addPage(); y = 20; }
  y += 3; const fila = (a, b, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 13 : 10); doc.text(a, X.p, y, { align: 'right' }); doc.text(b, X.s, y, { align: 'right' }); y += bold ? 8 : 6; };
  if (t.d) { fila('Subtotal', gs(t.sub)); fila('Descuento ' + q.pct + '%', '-' + gs(t.d)); }
  fila('TOTAL', gs(t.total), true); doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(110); doc.text('IVA 10% incluido: ' + gs(t.total / 11), X.s, y - 2, { align: 'right' }); doc.setTextColor(30); y += 6;
  // Condiciones
  const cond = (db.cfg.condiciones || COND0).split('\n').map(x => x.trim()).filter(Boolean);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); if (y > 245) { doc.addPage(); y = 20; } doc.text('Condiciones', M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const c of cond) { const ls = doc.splitTextToSize('• ' + sinTildes(c), W - 2 * M); if (y + ls.length * 4.5 > 280) { doc.addPage(); y = 20; } doc.text(ls, M, y); y += ls.length * 4.5 + 1; }
  if (q.note) { y += 2; doc.setFont('helvetica', 'italic'); doc.text(doc.splitTextToSize('Nota: ' + sinTildes(q.note), W - 2 * M), M, y); }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text('Este presupuesto es válido por ' + validezDias() + ' días y no constituye factura.', W / 2, 289, { align: 'center' });
  return doc;
}

/* Comparte el PDF (en el iPhone abre la hoja de compartir → WhatsApp). Si no se puede, lo descarga. */
async function compartirPresupuesto(q) {
  const nombre = `Presupuesto-${numPres(q.n)}-${(q.clientName || 'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_')}.pdf`;
  const msg = `Hola${q.clientName ? ' ' + q.clientName : ''}! Te paso el presupuesto N° ${numPres(q.n)} de ${db.cfg.empresa.nombre} por ${gs(q.total)}. Válido por ${validezDias()} días.`;
  try {
    const doc = await armarPDF(q), blob = doc.output('blob'), file = new File([blob], nombre, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: msg, title: nombre }); return 'compartido'; } catch (er) { if (er && er.name === 'AbortError') return 'cancelado'; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const link = waLink(q.phone, msg); if (link) window.open(link, '_blank');
    return 'descargado';
  } catch (er) { toast('No se pudo crear el PDF: ' + er.message); return 'error'; }
}
