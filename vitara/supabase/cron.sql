-- Programa el envío de recordatorios cada minuto. Ejecutar UNA vez en el SQL Editor de Supabase,
-- reemplazando los dos valores marcados. Requiere las extensiones pg_cron y pg_net (Database → Extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'vitara-send-reminders', '* * * * *',
  $$ select net.http_post(
       url := 'https://TU-PROYECTO.supabase.co/functions/v1/send-reminders',   -- ← tu URL
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','TU_CRON_SECRET'),  -- ← el mismo valor que el secret CRON_SECRET
       body := '{}'::jsonb) $$
);
