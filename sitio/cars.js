/* Ilustraciones de autos (vectoriales, con relieve y reflejos).
   Los degradados (#cb, #cg, ...) están definidos una sola vez en index.html.
   Cars.side(tipo, resaltar)  -> vista lateral:  resaltar = 'lateral' | 'fijo' | 'polar' | ''
   Cars.front(resaltar)       -> vista frontal:  resaltar = 'parabrisas' | 'faros' | 'pulida' | ''
   Cars.rear(resaltar)        -> vista trasera:  resaltar = 'luneta' | ''                         */
window.Cars = (function () {
  'use strict';

  const glass = (d, on, tint) =>
    `<path d="${d}" fill="${on ? 'url(#cgh)' : tint ? '#0b1118' : 'url(#cg)'}" stroke="${on ? '#fff' : '#5c6674'}" stroke-width="${on ? 1.6 : 1}"/>` +
    (on || tint ? '' : `<path d="${d}" fill="url(#cgl)" opacity=".55"/>`);

  function wheel(cx, cy, r) {
    const rim = r * 0.62;
    let spokes = '';
    for (let i = 0; i < 5; i++) {
      spokes += `<path d="M${cx} ${cy - rim * 0.18}L${cx - rim * 0.17} ${cy - rim * 0.95}Q${cx} ${cy - rim * 1.02} ${cx + rim * 0.17} ${cy - rim * 0.95}Z" fill="#aab0ba" stroke="#6d7480" stroke-width=".6" transform="rotate(${i * 72} ${cx} ${cy})"/>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#15161a"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="none" stroke="#2c2e35" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${rim}" fill="url(#crim)" stroke="#6d7480" stroke-width="1"/>
      <circle cx="${cx}" cy="${cy}" r="${rim * 0.86}" fill="#23252b"/>${spokes}
      <circle cx="${cx}" cy="${cy}" r="${rim * 0.2}" fill="#d9dde3" stroke="#6d7480" stroke-width=".6"/>`;
  }

  /* ---------- Vista lateral ---------- */
  const SIDE = {
    sedan: {
      body: 'M16 112L14 94Q14 86 24 84L98 76L142 47Q148 43 156 42L244 40Q254 40 260 45L300 76L358 84Q384 88 386 100L386 112Z',
      fijo: ['M104 74L136 53L146 52L146 74Z', 'M248 47L253 48L264 58L248 58Z'],
      lat: ['M152 74L152 51L198 50L198 74Z', 'M204 74L204 50L244 48Q250 48 254 52L290 74Z'],
      seams: [150, 201, 298], handles: [182, 266], mirror: 'M292 66L312 68L309 77L291 75Z',
      wheels: [[92, 114, 27], [308, 114, 27]], roof: 'M150 43L246 41'
    },
    hatch: {
      body: 'M16 112L14 96Q14 88 22 86L40 84L108 50Q114 46 122 45L244 40Q254 40 260 45L300 76L358 84Q384 88 386 100L386 112Z',
      fijo: ['M116 72L128 55L146 53L146 72Z', 'M248 47L253 48L264 58L248 58Z'],
      lat: ['M152 72L152 52L198 50L198 72Z', 'M204 74L204 50L244 48Q250 48 254 52L290 74Z'],
      seams: [150, 201, 298], handles: [182, 266], mirror: 'M292 66L312 68L309 77L291 75Z',
      wheels: [[92, 114, 27], [308, 114, 27]], roof: 'M130 46L246 41'
    },
    suv: {
      body: 'M16 114L14 92Q14 82 24 80L30 40Q32 32 42 32L252 30Q262 30 268 36L304 76L356 84Q384 88 386 102L386 114Z',
      fijo: ['M44 74L46 43L92 42L92 74Z', 'M250 38L256 38L270 52L250 52Z'],
      lat: ['M98 74L98 42L158 41L158 74Z', 'M164 74L164 41L246 40Q252 40 256 44L292 74Z'],
      seams: [96, 162, 298], handles: [142, 270], mirror: 'M292 66L312 68L309 77L291 75Z',
      wheels: [[94, 116, 29], [308, 116, 29]], roof: 'M44 33L250 31'
    },
    pickup: {
      body: 'M16 114L14 84Q14 76 22 76L134 76L138 50Q140 44 148 43L242 40Q252 40 258 45L298 76L358 84Q384 88 386 102L386 114Z',
      fijo: ['M146 72L146 52L168 51L168 72Z'],
      lat: ['M174 72L174 51L242 48Q248 48 252 52L286 72Z'],
      seams: [172, 296], handles: [258], mirror: 'M290 66L310 68L307 77L289 75Z',
      wheels: [[96, 116, 29], [310, 116, 29]], roof: 'M150 44L244 41', bed: true
    },
    van: {
      body: 'M16 114L14 40Q14 28 26 28L252 26Q262 26 268 32L304 76L358 84Q384 88 386 102L386 114Z',
      fijo: ['M30 62L30 42L72 42L72 62Z'],
      lat: ['M120 66L120 42L180 42L180 66Z', 'M236 72L236 38L254 36Q258 36 262 40L292 72Z'],
      seams: [100, 204, 232], handles: [190, 218], mirror: 'M292 62L312 64L309 74L291 72Z',
      wheels: [[94, 116, 29], [308, 116, 29]], roof: 'M30 29L252 27'
    }
  };

  function side(tipo, hl) {
    const c = SIDE[tipo] || SIDE.sedan;
    const tint = hl === 'polar';
    const gl = (arr, key) => arr.map(d => glass(d, hl === key, tint)).join('');
    const arches = c.wheels.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="#0f1013"/>`).join('');
    const whs = c.wheels.map(([x, y, r]) => wheel(x, y, r)).join('');
    const seams = c.seams.map(x => `<path d="M${x} 76V108" stroke="#8b919b" stroke-width="1" opacity=".8"/>`).join('');
    const handles = c.handles.map(x => `<rect x="${x}" y="82" width="16" height="3.5" rx="1.7" fill="#7c828d"/>`).join('');
    return `<svg class="car car-side" viewBox="0 0 400 165" role="img" aria-hidden="true">
      <ellipse cx="200" cy="145" rx="178" ry="8" fill="url(#csh)"/>
      <g transform="translate(0 112) scale(.96 1.2) translate(-8 -112)">
        <path d="${c.body}" fill="url(#cb)" stroke="#858b96" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="${c.body}" fill="url(#cs)" opacity=".5"/>
      </g>
      ${arches}
      <g transform="translate(0 112) scale(.96 1.2) translate(-8 -112)">
        ${gl(c.fijo, 'fijo')}${gl(c.lat, 'lateral')}
        ${seams}${handles}
        <path d="${c.mirror}" fill="#e3e6eb" stroke="#858b96" stroke-width="1"/>
        <path d="M28 90Q200 84 372 92" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.4"/>
        <path d="M26 104L370 104" stroke="#6d7480" stroke-opacity=".35" stroke-width="1"/>
        <path d="${c.roof}" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>
        <path d="M356 84Q382 88 384 97L352 97Z" fill="url(#chl)" stroke="#858b96" stroke-width=".8"/>
        <path d="M14 88L26 85L28 98L14 98Z" fill="#c4111b" stroke="#7a0a10" stroke-width=".8"/>
      </g>
      ${whs}
    </svg>`;
  }

  /* ---------- Vista frontal ---------- */
  function front(hl) {
    const ws = hl === 'parabrisas', fa = hl === 'faros', pu = hl === 'pulida';
    const lamp = (mirror) => `<g${mirror ? ' transform="translate(300 0) scale(-1 1)"' : ''}>
      <path d="M48 128Q68 118 100 126L96 142Q66 146 50 142Z" fill="${fa ? '#fff3b0' : 'url(#chl)'}" stroke="${fa ? '#ff3b2f' : '#7c828d'}" stroke-width="${fa ? 2 : 1}"/>
      <path d="M54 134Q74 128 94 134" stroke="${fa ? '#ff9b00' : '#fff'}" stroke-width="2" stroke-linecap="round" fill="none"/></g>`;
    return `<svg class="car car-front" viewBox="0 0 300 200" role="img" aria-hidden="true">
      <ellipse cx="150" cy="188" rx="120" ry="8" fill="url(#csh)"/>
      <rect x="54" y="150" width="28" height="34" rx="5" fill="#111214"/><rect x="218" y="150" width="28" height="34" rx="5" fill="#111214"/>
      <path d="M66 100L90 36Q94 28 106 28H194Q206 28 210 36L234 100Z" fill="url(#cb)" stroke="#858b96" stroke-width="1.2"/>
      <path d="M80 96L100 44Q103 38 112 38H188Q197 38 200 44L220 96Z" fill="${ws ? 'url(#cgh)' : 'url(#cg)'}" stroke="${ws ? '#fff' : '#5c6674'}" stroke-width="${ws ? 2 : 1.2}"/>
      ${ws ? '' : '<path d="M80 96L100 44Q103 38 112 38H188Q197 38 200 44L220 96Z" fill="url(#cgl)" opacity=".5"/>'}
      ${pu ? '<path d="M200 56l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#fff"/><path d="M104 74l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff" opacity=".8"/>' : ''}
      <path d="M92 90L146 78M154 78L208 90" stroke="#0e0f12" stroke-width="3" stroke-linecap="round"/>
      <path d="M44 148Q50 112 62 100H238Q250 112 256 148Z" fill="url(#chd)" stroke="#858b96" stroke-width="1.2"/>
      <path d="M62 100Q42 98 38 112Q44 122 64 116Z" fill="#e3e6eb" stroke="#858b96"/><path d="M238 100Q258 98 262 112Q256 122 236 116Z" fill="#e3e6eb" stroke="#858b96"/>
      ${lamp(false)}${lamp(true)}
      <path d="M44 148H256V176Q256 186 246 186H54Q44 186 44 176Z" fill="url(#cb)" stroke="#858b96" stroke-width="1.2"/>
      <path d="M112 154H188Q194 154 194 160V172Q194 178 188 178H112Q106 178 106 172V160Q106 154 112 154Z" fill="#1c2027" stroke="#6d7480"/>
      <path d="M108 163H192M108 170H192" stroke="#3a4049"/>
      <circle cx="150" cy="144" r="6" fill="#d9dde3" stroke="#6d7480"/><circle cx="150" cy="144" r="2.4" fill="#c4111b"/>
    </svg>`;
  }

  /* ---------- Vista trasera ---------- */
  function rear(hl) {
    const lu = hl === 'luneta';
    return `<svg class="car car-rear" viewBox="0 0 300 200" role="img" aria-hidden="true">
      <ellipse cx="150" cy="188" rx="120" ry="8" fill="url(#csh)"/>
      <rect x="54" y="150" width="28" height="34" rx="5" fill="#111214"/><rect x="218" y="150" width="28" height="34" rx="5" fill="#111214"/>
      <path d="M66 98L90 38Q94 30 106 30H194Q206 30 210 38L234 98Z" fill="url(#cb)" stroke="#858b96" stroke-width="1.2"/>
      <path d="M82 94L102 52Q105 46 114 46H186Q195 46 198 52L218 94Z" fill="${lu ? 'url(#cgh)' : 'url(#cg)'}" stroke="${lu ? '#fff' : '#5c6674'}" stroke-width="${lu ? 2 : 1.2}"/>
      ${lu ? '' : '<path d="M82 94L102 52Q105 46 114 46H186Q195 46 198 52L218 94Z" fill="url(#cgl)" opacity=".5"/>'}
      <path d="M96 86H204M100 74H200" stroke="${lu ? '#fff' : '#8fa9c2'}" stroke-opacity=".55" stroke-width="1"/>
      <path d="M44 142Q50 112 62 98H238Q250 112 256 142Z" fill="url(#chd)" stroke="#858b96" stroke-width="1.2"/>
      <path d="M62 98Q42 96 38 110Q44 120 64 114Z" fill="#e3e6eb" stroke="#858b96"/><path d="M238 98Q258 96 262 110Q256 120 236 114Z" fill="#e3e6eb" stroke="#858b96"/>
      <path d="M46 120Q70 110 106 118L102 136Q70 140 48 136Z" fill="url(#ctl)" stroke="#7a0a10"/><g transform="translate(300 0) scale(-1 1)"><path d="M46 120Q70 110 106 118L102 136Q70 140 48 136Z" fill="url(#ctl)" stroke="#7a0a10"/></g>
      <path d="M44 142H256V176Q256 186 246 186H54Q44 186 44 176Z" fill="url(#cb)" stroke="#858b96" stroke-width="1.2"/>
      <rect x="116" y="148" width="68" height="22" rx="3" fill="#f7f8fa" stroke="#6d7480"/><path d="M122 159H178" stroke="#9aa1ac" stroke-width="2"/>
      <path d="M112 126H188" stroke="#7c828d" stroke-width="1.5"/>
    </svg>`;
  }

  return { side, front, rear };
})();
