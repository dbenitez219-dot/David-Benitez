'use strict';
/* Sincronización con Supabase.
   - Los datos viven en la tabla `records` (collection, id, data) y se copian a este dispositivo (funciona sin internet).
   - Cada cambio se sube solo; los cambios del otro dispositivo llegan en tiempo real.
   - El stock NO se guarda: se calcula sumando los movimientos (así dos personas no se pisan). */
const LOCAL_KEY = 'cristalauto.v2';
const Sync = (() => {
  const CFG = window.SB_CONFIG || null;
  const ALL = ['cfg', 'products', 'moves', 'services', 'clients', 'sales', 'expenses', 'leads', 'appts', 'suppliers', 'campaigns', 'cashdays', 'quotes'];
  let sb = null, shadow = {}, timer = null, retry = null, busy = false, started = false, status = 'local', detail = '', email = '';
  const listeners = [];
  const st = (s, d = '') => { status = s; detail = d; listeners.forEach(f => f(s, d)); };
  const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
    : JSON.stringify(v === undefined ? null : v);
  const rows = col => col === 'cfg' ? [{ id: 'main', ...db.cfg }] : db[col];
  const ser = (col, r) => canon(col === 'products' ? { ...r, stock: undefined } : r);

  function loadLocal() {
    try { const d = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (d && d.db) { shadow = d.shadow || {}; return d.db; } } catch (e) { }
    return null;
  }
  function persist() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ db, shadow })); } catch (e) { } }
  function diff() {
    const up = [], del = [];
    for (const col of ALL) {
      const sh = (shadow[col] ||= {}), seen = new Set();
      for (const r of rows(col)) { seen.add(r.id); const s = ser(col, r); if (sh[r.id] !== s) up.push({ col, id: r.id, s }); }
      for (const id of Object.keys(sh)) if (!seen.has(id)) del.push({ col, id });
    }
    return { up, del };
  }
  const pending = () => { const d = diff(); return d.up.length + d.del.length; };

  async function push() {
    if (!sb || !started || busy) return;
    busy = true; st('sync');
    try {
      const { up, del } = diff();
      for (let i = 0; i < up.length; i += 200) {
        const chunk = up.slice(i, i + 200);
        const { error } = await sb.from('records').upsert(chunk.map(x => ({ collection: x.col, id: x.id, data: JSON.parse(x.s) })), { onConflict: 'collection,id' });
        if (error) throw error;
        chunk.forEach(x => shadow[x.col][x.id] = x.s);
      }
      const byCol = {}; del.forEach(x => (byCol[x.col] ||= []).push(x.id));
      for (const [col, ids] of Object.entries(byCol)) {
        for (let i = 0; i < ids.length; i += 100) {
          const part = ids.slice(i, i + 100);
          const { error } = await sb.from('records').delete().eq('collection', col).in('id', part);
          if (error) throw error;
          part.forEach(id => delete shadow[col][id]);
        }
      }
      persist(); clearTimeout(retry); retry = null;
      if (pending()) { schedule(); } else st('ok');
    } catch (e) { st('err', e.message || String(e)); scheduleRetry(); }
    finally { busy = false; }
  }
  const schedule = () => { if (!sb || !started) return; clearTimeout(timer); timer = setTimeout(push, 700); };
  const scheduleRetry = () => { if (!retry) retry = setTimeout(() => { retry = null; push(); }, 20000); };
  function save() { persist(); if (started) { st(pending() ? 'pend' : status === 'err' ? 'err' : 'ok', detail); schedule(); } }
  async function flush() { clearTimeout(timer); let n = 0; while (pending() && n++ < 3) await push(); return !pending(); }

  /* Mezcla una fila remota con la local sin pisar cambios locales todavía no subidos */
  function mergeRow(col, id, data) {
    const sh = (shadow[col] ||= {});
    if (col === 'cfg') {
      const dirty = sh.main !== undefined && ser('cfg', { id: 'main', ...db.cfg }) !== sh.main;
      if (dirty && data) return;
      if (data) { const { id: _i, ...c } = data; db.cfg = normalizarCfg(c); sh.main = ser('cfg', { id: 'main', ...db.cfg }); }
      return;
    }
    const arr = db[col], k = arr.findIndex(r => r.id === id), l = k >= 0 ? arr[k] : null;
    if (data === null) { // borrado en el otro dispositivo
      if (l && sh[id] !== undefined && ser(col, l) === sh[id]) arr.splice(k, 1);
      if (!l || ser(col, l) === sh[id]) delete sh[id];
      return;
    }
    if (l) {
      const dirty = sh[id] !== undefined && ser(col, l) !== sh[id];
      if (dirty) return;
      arr[k] = data;
    } else {
      if (sh[id] !== undefined) return; // lo borré yo y todavía no se subió
      arr.push(data);
    }
    sh[id] = ser(col, data);
  }

  async function pull() {
    if (!sb) return false;
    try {
      let all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('records').select('collection,id,data').in('collection', ALL).range(from, from + 999);
        if (error) throw error;
        all = all.concat(data); if (data.length < 1000) break;
      }
      const remote = {}; for (const r of all) (remote[r.collection] ||= new Map()).set(r.id, r.data);
      for (const col of ALL) {
        const rm = remote[col] || new Map();
        for (const [id, data] of rm) mergeRow(col, id, data);
        if (col === 'cfg') continue;
        for (const r of [...db[col]]) if (!rm.has(r.id)) mergeRow(col, r.id, null); // borrado en el otro dispositivo (si no tengo cambios propios)
      }
      recalc(); persist(); return true;
    } catch (e) { st('err', e.message || String(e)); return false; }
  }

  function onChange(p) {
    const rec = p.new && p.new.collection ? p.new : p.old; if (!rec || !ALL.includes(rec.collection)) return;
    mergeRow(rec.collection, rec.id, p.eventType === 'DELETE' ? null : p.new.data);
    recalc(); persist(); if (typeof refreshUI === 'function') refreshUI();
  }

  async function init() {
    if (!CFG || !window.supabase) return { ok: false, reason: 'nolib' };
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    try { const { data } = await sb.auth.getSession(); if (data.session) email = data.session.user.email; return { ok: !!data.session }; }
    catch (e) { return { ok: false, reason: 'error' }; }
  }
  async function signIn(mail, pass) {
    const { data, error } = await sb.auth.signInWithPassword({ email: mail, password: pass });
    if (error) throw new Error(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos' : error.message);
    email = data.user.email;
  }
  async function signOut() { started = false; try { await sb.auth.signOut(); } catch (e) { } localStorage.removeItem(LOCAL_KEY); location.reload(); }

  async function start() {
    started = true; st('sync');
    const ok = await pull(); if (ok) await push(); else st('err', detail || 'Sin conexión');
    sb.channel('records-live').on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, onChange).subscribe();
    window.addEventListener('online', () => { pull().then(push); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pull().then(() => { if (typeof refreshUI === 'function') refreshUI(); push(); }); });
    setInterval(() => { if (pending()) push(); }, 30000);
    setInterval(() => { if (!document.hidden) pull().then(() => { if (typeof refreshUI === 'function') refreshUI(); }); }, 120000);
    return ok;
  }

  /* ---- Función del servidor (correos, avisos) ---- */
  async function call(action, body = {}) {
    const { data } = await sb.auth.getSession(); if (!data.session) throw new Error('Sesión vencida');
    const r = await fetch(CFG.url + '/functions/v1/cristalauto', { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify({ action, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error || j.message || j.msg || 'Error') + ' (código ' + r.status + ')');
    return j;
  }
  async function notifySale(id) {
    try { await flush(); await call('sale', { id }); }
    catch (e) { const q = JSON.parse(localStorage.getItem('cristalauto.notifq') || '[]'); if (!q.includes(id)) q.push(id); localStorage.setItem('cristalauto.notifq', JSON.stringify(q)); }
  }
  async function retryNotifs() {
    const q = JSON.parse(localStorage.getItem('cristalauto.notifq') || '[]'); if (!q.length || !started) return;
    const rest = []; for (const id of q) { try { await flush(); await call('sale', { id }); } catch (e) { rest.push(id); } }
    localStorage.setItem('cristalauto.notifq', JSON.stringify(rest));
  }
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function pushActive() { if (!pushSupported()) return false; try { const reg = await navigator.serviceWorker.ready; return !!(await reg.pushManager.getSubscription()) && Notification.permission === 'granted'; } catch (e) { return false; } }
  async function enablePush() {
    if (!pushSupported()) throw new Error('Este navegador no permite avisos. En iPhone: abrí la app desde el ícono de la pantalla de inicio (iOS 16.4 o más).');
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permiso de notificaciones denegado');
    const reg = await navigator.serviceWorker.ready, { key } = await call('vapid');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    const id = 'p' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint)))).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
    const { error } = await sb.from('records').upsert({ collection: 'push_subs', id, data: { ...sub.toJSON(), ua: navigator.userAgent.slice(0, 120) } }, { onConflict: 'collection,id' });
    if (error) throw error;
  }

  return { loadLocal, init, signIn, signOut, start, save, schedule, flush, pull, push, call, notifySale, retryNotifs, enablePush, pushActive, pushSupported,
    onStatus: f => listeners.push(f), get status() { return status; }, get detail() { return detail; }, get email() { return email; }, pending, get enabled() { return !!sb; } };
})();
