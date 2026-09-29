-- CristalAuto · PASO 3: programador de avisos (correo y notificaciones).
-- Ejecutar DESPUÉS de haber publicado la función "cristalauto" (ver GUIA-PASO-A-PASO.md).
-- Pegar TODO este texto en Supabase → SQL Editor → New query → Run.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Clave secreta que usa el programador para llamar a la función (se genera sola)
insert into public.app_secrets (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Cada 5 minutos la función revisa: resumen de las 20:00, aviso de las 07:30 y recordatorios de colocaciones (1 hora antes).
-- La hora la decide la función con el horario de Paraguay, por eso acá corre siempre igual.
do $$
begin
  perform cron.unschedule('cristalauto-avisos');
exception when others then null;
end $$;

select cron.schedule(
  'cristalauto-avisos',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://nmvlnyxgfhveleeewklg.supabase.co/functions/v1/cristalauto',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')
      ),
      body := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 25000
    );
  $job$
);
