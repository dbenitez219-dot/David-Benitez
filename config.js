/* Conexión a Supabase. La clave "publishable" es pública por diseño: la seguridad la da el inicio de sesión y las reglas (RLS) de la base. */
window.SB_CONFIG = {
  url: 'https://nmvlnyxgfhveleeewklg.supabase.co',
  key: 'sb_publishable_malo3Q2XwfqBH1GCGOc9uw_XIWStLQa',
  fn: 'CRISTALAUTO', // nombre exacto de la función de avisos en Supabase (importan las mayúsculas)
  fnSifen: 'sifen', // función de la factura electrónica (si no la encuentra, prueba también SIFEN)
  fnAsistente: 'ASISTENTE', // nombre exacto de la función del asistente en Supabase (importan las mayúsculas)
};
