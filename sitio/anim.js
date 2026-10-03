(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Marcas: dos filas de tarjetas que se mueven en sentidos opuestos */
  const marcas = [...new Set((window.CATALOGO || []).flatMap(f => f.veh.map(v => v[0])))];
  const logo = m => (window.LOGOS || {})[m] ? `<img src="img/marcas/${window.LOGOS[m]}.svg" alt="" loading="lazy">` : '';
  const tile = m => `<span class="tile"><span class="ti">${logo(m)}<b>${m}</b></span></span>`;
  const fila = arr => { const s = arr.map(tile).join(''); return s + s + s + s; };
  const mitad = Math.ceil(marcas.length / 2);
  $('#tilesA').innerHTML = fila(marcas.slice(0, mitad));
  $('#tilesB').innerHTML = fila(marcas.slice(mitad));

  /* Aparecer al hacer scroll */
  const targets = $$('.sec-head, #cotizador, .svc, .steps li, .why-list li, .info li, .map, .contact .cta, .gallery figure, .badges, .g-head, .rev-wrap');
  targets.forEach((el, i) => {
    el.classList.add('reveal');
    const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : 0;
    el.style.setProperty('--d', Math.min(sib, 6) * 0.08 + 's');
  });
  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
      // al terminar, se quita la animación para no interferir con los efectos al pasar el mouse
      setTimeout(() => e.target.classList.remove('reveal', 'in'), 1300);
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(el => io.observe(el));
  }

  /* Barra de progreso, encabezado, sección activa y línea de pasos */
  const bar = $('.progress'), top = $('.top'), steps = $('.steps'), items = $$('.steps li');
  const links = $$('.menu a');
  const secs = links.map(a => $(a.getAttribute('href')));
  function onScroll() {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    top.classList.toggle('scrolled', y > 20);
    const mid = innerHeight * 0.45;
    let act = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= mid) act = i; });
    links.forEach((a, i) => a.classList.toggle('on', i === act));
    const r = steps.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (innerHeight * 0.7 - r.top) / Math.max(r.height, 1)));
    steps.style.setProperty('--p', p.toFixed(3));
    items.forEach((li, i) => li.classList.toggle('on', p >= i / items.length + 0.02));
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
})();

/* Los botones flotantes se esconden mientras se completa el cotizador */
(function () {
  const sec = document.querySelector('#cotizar');
  if (!sec || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(es => es.forEach(e => document.body.classList.toggle('en-form', e.isIntersecting)),
    { threshold: 0.35 }).observe(sec);
})();

/* Brillo que sigue al mouse en las tarjetas y leve inclinación 3D del parabrisas */
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.svc');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
  const art = document.querySelector('#heroArt');
  const hero = document.querySelector('.hero');
  if (!art || !hero) return;
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    art.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
    art.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
  });
  hero.addEventListener('pointerleave', () => { art.style.setProperty('--ry', '0deg'); art.style.setProperty('--rx', '0deg'); });
})();
