// Prueba de carga sencilla (sin dependencias): N usuarios simultáneos durante T segundos sobre cada URL.
//   BASE_URL=http://localhost:3100 CONCURRENCY=20 SECONDS=10 [COOKIE='zentra_session=...'] node scripts/loadtest.mjs /login /api/health /dashboard
// Los números dependen de la máquina: úsala para comparar antes/después de un cambio y en TU servidor, no como garantía.
const BASE = process.env.BASE_URL ?? "http://localhost:3100", C = Number(process.env.CONCURRENCY ?? 20), S = Number(process.env.SECONDS ?? 10);
const headers = process.env.COOKIE ? { cookie: process.env.COOKIE } : {};
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
for (const path of process.argv.slice(2)) {
  const lat = []; let errors = 0; const end = Date.now() + S * 1000; const t0 = Date.now();
  await Promise.all(Array.from({ length: C }, async () => {
    while (Date.now() < end) {
      const s = performance.now();
      try { const r = await fetch(BASE + path, { headers, redirect: "manual" }); await r.arrayBuffer(); if (r.status >= 500 || r.status === 0) errors++; } catch { errors++; }
      lat.push(performance.now() - s);
    }
  }));
  lat.sort((a, b) => a - b);
  console.log(`${path.padEnd(16)} ${String(lat.length).padStart(6)} peticiones · ${(lat.length / ((Date.now() - t0) / 1000)).toFixed(0).padStart(4)} req/s · p50 ${pct(lat, 50).toFixed(0)} ms · p95 ${pct(lat, 95).toFixed(0)} ms · p99 ${pct(lat, 99).toFixed(0)} ms · errores ${errors}`);
}
