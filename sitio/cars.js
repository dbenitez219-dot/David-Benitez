/* Autos genéricos en estilo línea (sin marca ni modelo). Dibujo propio.
   Cars.side(tipo, resaltar, o)  -> vista de costado (el auto mira a la izquierda: se ve el lado del conductor)
   Cars.front(resaltar, o)       -> vista de frente
   Cars.rear(resaltar, o)        -> vista de atrás
   resaltar: 'lateral' | 'fijo' | 'polar' | 'parabrisas' | 'luneta' | 'faros' | 'pulida' | ''
   o = { sel: Set de vidrios elegidos }  -> los vidrios se pueden tocar (zonas con data-z)
   Cars.nombre('puerta-del:izq') -> "Vidrio de la puerta delantera izquierda"                 */
window.Cars = (function () {
  'use strict';

  const INK = '#0b0b0d', BODY = '#eceef1', GLASS = '#1f232a', RED = '#e0241b';

  /* Nombres de cada vidrio (etiquetas y mensaje de WhatsApp) */
  const ZONAS = {
    'parabrisas': ['Parabrisas delantero', ''],
    'luneta': ['Luneta (vidrio trasero)', ''],
    'puerta-del': ['Vidrio de la puerta delantera', 'f'],
    'puerta-tra': ['Vidrio de la puerta trasera', 'f'],
    'fijo-del': ['Vidrio fijo delantero', 'm'],
    'fijo-tra': ['Vidrio fijo trasero', 'm'],
  };
  const LADOS = { izq: ['izquierda', 'izquierdo'], der: ['derecha', 'derecho'] };
  const nombre = clave => {
    const [z, l] = clave.split(':');
    const [txt, g] = ZONAS[z] || [clave, ''];
    return l ? txt + ' ' + LADOS[l][g === 'm' ? 1 : 0] : txt;
  };

  const pts = a => a.map(p => p.join(',')).join(' ');

  /* Un vidrio. on = elegido (rojo), tint = polarizado (negro), z = zona tocable */
  function vidrio(poly, z, on, tint, o) {
    const attr = o && z ? ` class="z${on ? ' on' : ''}" data-z="${z}" tabindex="0" role="button" aria-pressed="${!!on}" aria-label="${(ZONAS[z] || [z])[0]}"` : '';
    const fill = on ? RED : tint ? '#050608' : GLASS;
    const stroke = on ? '#7a0a06' : INK;
    return `<polygon${attr} points="${pts(poly)}" fill="${fill}" stroke="${stroke}" stroke-width="${on ? 3 : 2.5}" stroke-linejoin="round"/>`;
  }
  /* Brillo fino sobre el vidrio (decorativo, no se toca) */
  function brillo(poly) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = x1 - x0, x = x0 + w * 0.28;
    return `<path d="M${x + 7} ${y0 + 4}L${x - 8} ${y1 - 4}" stroke="#fff" stroke-opacity=".28" stroke-width="2.4" stroke-linecap="round" pointer-events="none"/>`;
  }

  function rueda(cx, cy, r) {
    let rayos = '';
    for (let i = 0; i < 5; i++) rayos += `<path d="M${cx} ${cy}L${cx} ${cy - r * 0.6}" stroke="${INK}" stroke-width="${r * 0.11}" stroke-linecap="round" transform="rotate(${i * 72} ${cx} ${cy})"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b1c20" stroke="${INK}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.64}" fill="${BODY}" stroke="${INK}" stroke-width="2"/>${rayos}
      <circle cx="${cx}" cy="${cy}" r="${r * 0.16}" fill="${INK}"/>`;
  }

  /* ---------- Vista de costado ---------- */
  const SIDE = {
    sedan: {
      body: 'M44 150 L44 124 Q46 110 66 106 L142 96 Q168 92 188 80 L232 52 Q244 44 262 44 L368 44 Q392 46 406 62 L436 94 L512 102 Q548 106 554 124 L554 150 Z',
      z: {
        'fijo-del': [[192, 86], [218, 64], [226, 62], [226, 86]],
        'puerta-del': [[232, 86], [262, 53], [300, 52], [300, 86]],
        'puerta-tra': [[308, 86], [308, 52], [364, 52], [376, 86]],
        'fijo-tra': [[382, 86], [372, 53], [386, 55], [405, 68], [421, 86]],
      },
      seams: [[304, 88, 304, 148], [228, 90, 224, 148], [380, 88, 386, 140]], handles: [270, 336], mirror: [222, 244],
      ruedas: [[142, 148, 33], [456, 148, 33]], luz: [[52, 114, 100, 108, 112, 114, 58, 122]], cola: [540, 108, 554, 112, 554, 124, 538, 122],
    },
    hatch: {
      body: 'M44 150 L44 126 Q46 112 66 108 L136 98 Q166 94 186 80 L230 52 Q242 44 260 44 L380 44 Q404 46 420 60 L506 108 Q540 114 552 128 L552 150 Z',
      z: {
        'fijo-del': [[192, 86], [218, 64], [226, 62], [226, 86]],
        'puerta-del': [[232, 86], [262, 53], [300, 52], [300, 86]],
        'puerta-tra': [[308, 86], [308, 52], [364, 52], [378, 86]],
        'fijo-tra': [[384, 86], [374, 53], [398, 54], [434, 72], [462, 86]],
      },
      seams: [[304, 88, 304, 148], [228, 90, 224, 148], [382, 88, 388, 140]], handles: [270, 336], mirror: [222, 244],
      ruedas: [[142, 148, 33], [456, 148, 33]], luz: [[52, 116, 100, 110, 112, 116, 58, 124]], cola: [538, 114, 552, 120, 552, 132, 536, 128],
    },
    suv: {
      body: 'M44 152 L44 120 Q46 104 66 100 L140 92 Q160 90 176 76 L210 44 Q218 36 236 36 L470 36 Q490 38 500 50 L526 100 Q552 106 556 124 L556 152 Z',
      z: {
        'fijo-del': [[182, 78], [200, 54], [208, 52], [208, 78]],
        'puerta-del': [[214, 78], [229, 46], [300, 46], [300, 78]],
        'puerta-tra': [[308, 78], [308, 46], [392, 46], [392, 78]],
        'fijo-tra': [[400, 78], [400, 46], [470, 46], [481, 56], [500, 78]],
      },
      seams: [[304, 80, 304, 150], [214, 82, 210, 150], [396, 80, 396, 150]], handles: [268, 350], mirror: [208, 230],
      ruedas: [[142, 148, 35], [462, 148, 35]], luz: [[52, 112, 100, 106, 112, 112, 58, 120]], cola: [544, 108, 556, 112, 556, 126, 542, 124],
    },
    pickup: {
      body: 'M44 152 L44 120 Q46 106 66 102 L136 94 Q156 90 172 76 L206 48 Q214 40 232 40 L318 40 Q334 42 340 56 L346 104 L552 104 L556 112 L556 152 Z',
      z: {
        'fijo-del': [[178, 76], [196, 54], [204, 52], [204, 76]],
        'puerta-del': [[210, 76], [226, 48], [310, 47], [318, 76]],
        'fijo-tra': [[324, 76], [320, 50], [333, 52], [337, 76]],
      },
      seams: [[208, 80, 204, 150], [320, 80, 320, 150]], handles: [272], mirror: [202, 224], bed: true,
      ruedas: [[142, 148, 35], [466, 148, 35]], luz: [[52, 112, 100, 106, 112, 112, 58, 120]], cola: [546, 106, 556, 108, 556, 122, 544, 120],
    },
    van: {
      body: 'M44 152 L44 108 Q46 96 62 90 L112 78 Q126 52 150 34 Q158 28 176 28 L520 24 Q540 24 546 40 L556 120 L556 152 Z',
      z: {
        'puerta-del': [[132, 78], [156, 42], [238, 40], [238, 78]],
        'puerta-tra': [[262, 78], [262, 40], [330, 40], [330, 78]],
        'fijo-tra': [[420, 78], [420, 40], [470, 40], [476, 78]],
      },
      seams: [[246, 80, 246, 150], [338, 80, 338, 150], [412, 80, 412, 150]], handles: [200], mirror: [124, 146],
      ruedas: [[140, 148, 34], [458, 148, 34]], luz: [[52, 100, 98, 94, 108, 100, 58, 108]], cola: [544, 96, 556, 100, 556, 116, 542, 114],
    },
  };

  function side(tipo, hl, o) {
    const c = SIDE[tipo] || SIDE.sedan;
    const tint = hl === 'polar';
    const grupo = { 'puerta-del': 'lateral', 'puerta-tra': 'lateral', 'fijo-del': 'fijo', 'fijo-tra': 'fijo' };
    const vid = Object.entries(c.z).map(([z, poly]) => {
      const on = o ? o.sel.has(z) : hl === grupo[z];
      return vidrio(poly, z, on, tint, o) + (on || tint ? '' : brillo(poly));
    }).join('');
    const arcos = c.ruedas.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 9}" fill="${INK}"/>`).join('');
    const whs = c.ruedas.map(([x, y, r]) => rueda(x, y, r)).join('');
    const seams = c.seams.map(([a, b, d, e]) => `<path d="M${a} ${b}L${d} ${e}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`).join('');
    const hand = c.handles.map(x => `<rect x="${x}" y="${c.bed ? 98 : 96}" width="20" height="4.5" rx="2.2" fill="${BODY}" stroke="${INK}" stroke-width="1.6"/>`).join('');
    const [m0, m1] = c.mirror;
    const luz = c.luz.map(l => `<polygon points="${l[0]},${l[1]} ${l[2]},${l[3]} ${l[4]},${l[5]} ${l[6]},${l[7]}" fill="${INK}"/>`).join('');
    const bed = c.bed ? `<path d="M346 104L346 120L552 120" fill="none" stroke="${INK}" stroke-width="2"/><path d="M352 96L548 96" stroke="${INK}" stroke-width="2.4"/>` : '';
    const sy = { sedan: 1.3, hatch: 1.3, suv: 1.18, pickup: 1.25, van: 1.1 }[tipo] || 1.3;   // altura: proporciones reales
    return `<svg class="car car-side" viewBox="0 0 600 205" role="img" aria-hidden="true">
      <g transform="translate(0 150) scale(1 ${sy}) translate(0 -150)">
        <path d="${c.body}" fill="${BODY}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        ${bed}
        <path d="M62 112Q300 96 540 110" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".55"/>
        ${vid}${seams}${hand}
        <polygon points="${m0},84 ${m1},86 ${m1 - 2},96 ${m0 + 2},94" fill="${BODY}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        ${luz}<polygon points="${c.cola.join(' ')}" fill="${RED}" stroke="${INK}" stroke-width="1.6"/>
      </g>
      ${arcos}
      <path d="M92 150H500" stroke="${INK}" stroke-width="2.4"/>
      ${whs}
    </svg>`;
  }

  /* ---------- Vista de frente ---------- */
  function front(hl, o) {
    const on = hl === 'parabrisas' || !!(o && o.sel.has('parabrisas'));
    const fa = hl === 'faros', pu = hl === 'pulida';
    const ws = [[116, 118], [132, 66], [148, 48], [252, 48], [268, 66], [284, 118]];
    const luz = (esp) => `<g${esp ? ' transform="translate(400 0) scale(-1 1)"' : ''}>
      <path d="M70 150Q92 140 134 148L130 166Q96 172 72 168Z" fill="${fa ? '#fff3b0' : GLASS}" stroke="${fa ? RED : INK}" stroke-width="${fa ? 3 : 2.5}" stroke-linejoin="round"/>
      <circle cx="104" cy="157" r="7" fill="${BODY}" stroke="${INK}" stroke-width="2"/></g>`;
    return `<svg class="car car-front" viewBox="0 0 400 250" role="img" aria-hidden="true">
      <rect x="66" y="196" width="36" height="46" rx="8" fill="#1b1c20" stroke="${INK}" stroke-width="2.5"/><rect x="298" y="196" width="36" height="46" rx="8" fill="#1b1c20" stroke="${INK}" stroke-width="2.5"/>
      <path d="M96 124Q100 56 148 38L252 38Q300 56 304 124Z" fill="${BODY}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      ${vidrio(ws, 'parabrisas', on, hl === 'polar', o)}${on || hl === 'polar' ? '' : brillo(ws)}
      <path d="M58 168Q60 138 88 126L312 126Q340 138 342 168L342 206Q342 220 328 220L72 220Q58 220 58 206Z" fill="${BODY}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M130 128Q200 116 270 128M150 128L136 152M250 128L264 152" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>
      <rect x="60" y="112" width="36" height="20" rx="8" fill="${BODY}" stroke="${INK}" stroke-width="2.6"/><rect x="304" y="112" width="36" height="20" rx="8" fill="${BODY}" stroke="${INK}" stroke-width="2.6"/>
      ${luz(false)}${luz(true)}
      ${pu ? '<path d="M262 60l3.5 10 10 3.5-10 3.5-3.5 10-3.5-10-10-3.5 10-3.5z" fill="#fff" stroke="' + INK + '" stroke-width="1.4"/><path d="M138 82l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>' : ''}
      <rect x="152" y="160" width="96" height="26" rx="6" fill="${GLASS}" stroke="${INK}" stroke-width="2.4"/>
      <path d="M158 167H242M158 174H242M158 181H242" stroke="${BODY}" stroke-width="1.4" opacity=".55"/>
      <path d="M120 196H280L270 212H130Z" fill="${GLASS}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="92" cy="200" r="6" fill="${GLASS}" stroke="${INK}" stroke-width="2"/><circle cx="308" cy="200" r="6" fill="${GLASS}" stroke="${INK}" stroke-width="2"/>
    </svg>`;
  }

  /* ---------- Vista de atrás ---------- */
  function rear(hl, o) {
    const on = hl === 'luneta' || !!(o && o.sel.has('luneta'));
    const lu = [[112, 104], [132, 64], [146, 54], [254, 54], [268, 64], [288, 104]];
    const cola = (esp) => `<g${esp ? ' transform="translate(400 0) scale(-1 1)"' : ''}>
      <path d="M62 138Q92 128 138 138L134 160Q92 166 64 160Z" fill="${RED}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
    return `<svg class="car car-rear" viewBox="0 0 400 250" role="img" aria-hidden="true">
      <rect x="66" y="196" width="36" height="46" rx="8" fill="#1b1c20" stroke="${INK}" stroke-width="2.5"/><rect x="298" y="196" width="36" height="46" rx="8" fill="#1b1c20" stroke="${INK}" stroke-width="2.5"/>
      <path d="M92 122Q98 58 146 40L254 40Q302 58 308 122Z" fill="${BODY}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      ${vidrio(lu, 'luneta', on, hl === 'polar', o)}${on || hl === 'polar' ? '' : brillo(lu)}
      <path d="M58 170Q60 140 88 124L312 124Q340 140 342 170L342 206Q342 220 328 220L72 220Q58 220 58 206Z" fill="${BODY}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      <rect x="60" y="106" width="36" height="20" rx="8" fill="${BODY}" stroke="${INK}" stroke-width="2.6"/><rect x="304" y="106" width="36" height="20" rx="8" fill="${BODY}" stroke="${INK}" stroke-width="2.6"/>
      <path d="M118 130H282" stroke="${INK}" stroke-width="1.8" opacity=".7"/>
      ${cola(false)}${cola(true)}
      <rect x="160" y="150" width="80" height="24" rx="4" fill="#fff" stroke="${INK}" stroke-width="2.2"/><path d="M170 162H230" stroke="${INK}" stroke-width="2.2" opacity=".5"/>
      <path d="M100 190H300L290 212H110Z" fill="${GLASS}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    </svg>`;
  }

  return { side, front, rear, nombre };
})();
