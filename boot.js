'use strict';
/* Arranque: inicio de sesión, sincronización y pantalla inicial. */
(function () {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });

  const syncBtn = $('#sync');
  const ICON = { ok: '☁️✓', sync: '🔄', pend: '⏳', err: '⚠️', local: '' };
  Sync.onStatus((s, d) => { syncBtn.hidden = s === 'local'; syncBtn.textContent = ICON[s] || ''; syncBtn.title = d || ''; });
  syncBtn.onclick = async () => { await Sync.pull(); await Sync.push(); refreshUI(); toast(Sync.status === 'ok' ? 'Todo sincronizado' : 'Pendiente de sincronizar'); };

  function pantallaLogin(msg) {
    const el = $('#login'); el.hidden = false;
    el.innerHTML = `<form class="card" id="lf"><h1 style="margin:0 0 4px">🚗 CristalAuto</h1><p class="mut">Ingresá con tu correo y contraseña.</p>
      <label>Correo</label><input id="lg_mail" type="email" autocomplete="username" value="cristalauto95@gmail.com" required>
      <label>Contraseña</label><input id="lg_pass" type="password" autocomplete="current-password" required>
      <div id="lg_err" class="mut" style="color:var(--bad);min-height:20px">${msg || ''}</div>
      <button class="btn block" type="submit">Entrar</button></form>`;
    $('#lf').onsubmit = async e => {
      e.preventDefault(); const b = $('#lf button'); b.disabled = true; b.textContent = 'Entrando…';
      try { await Sync.signIn($('#lg_mail').value.trim(), $('#lg_pass').value); el.hidden = true; el.innerHTML = ''; await iniciar(); }
      catch (er) { $('#lg_err').textContent = er.message || 'No se pudo entrar'; b.disabled = false; b.textContent = 'Entrar'; }
    };
  }

  async function iniciar() {
    render();                       // muestra lo guardado en el dispositivo enseguida
    await Sync.start();             // baja lo nuevo, sube lo pendiente y queda escuchando cambios
    seedSiHaceFalta(); recalc(); render(true);
    Sync.retryNotifs();
  }

  (async () => {
    if (!window.SB_CONFIG || !window.supabase) { $('#view').innerHTML = '<div class="banner">No se pudo cargar la conexión a la nube. Revisá tu internet.</div>'; render(); return; }
    const r = await Sync.init();
    if (!r.ok) return pantallaLogin();
    await iniciar();
  })();
})();
