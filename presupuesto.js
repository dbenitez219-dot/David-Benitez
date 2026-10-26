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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaHora = ms => { const d = new Date(ms); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()} - ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

async function armarPDF(q) {
  if (!window.jspdf) throw new Error('No se cargó el generador de PDF. Recargá la app.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 18, R = W - M, e = db.cfg.empresa, logo = await cargarLogo();
  const ts = q.ts || Date.now(), exp = ts + validezDias() * 86400000;
  doc.setTextColor(40); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(fechaHora(ts), R, 14, { align: 'right' });
  // Logo + datos de la empresa
  if (logo) { const w = 22, h = w * logo.h / logo.w; doc.addImage(logo.data, 'PNG', M, 30 - h / 2, w, h); }
  let y = 26; doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(e.nombre || '', M + 27, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  [e.direccion, [e.tel, e.email, e.ruc].filter(Boolean).join('   ·   ')].filter(Boolean).forEach(l => { y += 6; doc.text(l, M + 27, y); });
  y = 49; doc.setDrawColor(215); doc.line(M, y, R, y); y += 10;
  const fila = (label, valor, bold = true) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(label, M, y);
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(25);
    const ls = doc.splitTextToSize(String(valor), 115); doc.text(ls, R, y, { align: 'right' }); y += Math.max(1, ls.length) * 5 + 4; };
  fila('Cotización N°', numPres(q.n)); fila('Nombre del cliente', q.clientName || 'Sin nombre');
  if (q.phone) fila('Teléfono', q.phone, false); if (q.vehicle) fila('Vehículo', q.vehicle);
  fila('Fecha de expiración', fechaHora(exp)); if (q.vendedor) fila('Vendedor', q.vendedor);
  const concepto = q.concepto || (q.formato === 'detalle' ? '' : (q.items || []).map(i => i.name).join(' + '));
  if (concepto) fila(q.formato === 'detalle' ? 'Aclaración' : 'Concepto de la cotización', concepto);
  y -= 2; doc.setDrawColor(215); doc.line(M, y, R, y); y += 4;
  // Detallado: tabla con precios
  if (q.formato === 'detalle' && (q.items || []).length) {
    const X = { d: M + 2, c: 130, p: 160, s: R - 2 };
    const cab = () => { doc.setFillColor(238); doc.rect(M, y, R - M, 8, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(25); y += 5.5; doc.text('Detalle', X.d, y);
      doc.text('Cant.', X.c, y, { align: 'right' }); doc.text('Precio unit.', X.p, y, { align: 'right' }); doc.text('Subtotal', X.s, y, { align: 'right' }); y += 6; };
    cab();
    for (const i of q.items) {
      const ls = doc.splitTextToSize(i.name || '', 95), h = ls.length * 4.6 + 3; if (y + h > 262) { doc.addPage(); y = 20; cab(); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(ls, X.d, y); doc.text(fmt(i.qty), X.c, y, { align: 'right' }); doc.text(fmt(i.unit), X.p, y, { align: 'right' }); doc.text(fmt(i.qty * i.unit), X.s, y, { align: 'right' });
      y += h; doc.setDrawColor(232); doc.line(M, y - 3, R, y - 3);
    }
    const t = saleTotals({ items: q.items, pct: q.pct });
    if (t.d) { doc.setFontSize(9); doc.text('Subtotal  ' + gs(t.sub), R, y + 2, { align: 'right' }); doc.text('Descuento ' + q.pct + '%  -' + gs(t.d), R, y + 8, { align: 'right' }); y += 12; }
  }
  if (y > 250) { doc.addPage(); y = 20; }
  y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(25); doc.text('Total:', M, y); doc.text(gs(q.total), R, y, { align: 'right' });
  y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120); doc.text('IVA 10% incluido: ' + gs(q.total / 11), R, y, { align: 'right' }); y += 10;
  // Condiciones
  const cond = (db.cfg.condiciones || COND0).split('\n').map(x => x.trim()).filter(Boolean);
  doc.setFontSize(9); doc.setTextColor(60); doc.setFont('helvetica', 'bold'); doc.text('Condiciones', M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  for (const c of cond) { const ls = doc.splitTextToSize('• ' + c, R - M); if (y + ls.length * 4.3 > 275) { doc.addPage(); y = 20; } doc.text(ls, M, y); y += ls.length * 4.3 + 1; }
  if (q.note) { y += 2; doc.setFont('helvetica', 'italic'); doc.text(doc.splitTextToSize('Nota: ' + q.note, R - M), M, y); }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110);
  doc.text(doc.splitTextToSize('Este documento es una cotización formal y está sujeto a cambios. Para más información, por favor contáctenos. Gracias por considerar nuestros servicios. Estamos aquí para ayudarle.', R - M - 10), W / 2, 284, { align: 'center' });
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
