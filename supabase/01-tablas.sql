-- CristalAuto · PASO 1: tablas y seguridad.
-- Pegar TODO este texto en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin problemas.

-- Todos los datos de la app viven en esta tabla (una fila por venta, cliente, producto, etc.)
create table if not exists public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists records_collection_idx on public.records (collection);

-- Seguridad: solo pueden leer y escribir las personas con sesión iniciada CON UN CORREO DE ESTA LISTA.
-- Aunque alguien lograra crear otra cuenta en el proyecto, no vería nada.
-- Para agregar a otra persona en el futuro: agregar su correo dentro de los paréntesis y volver a ejecutar este archivo.
alter table public.records enable row level security;
drop policy if exists "usuarios con sesion" on public.records;
drop policy if exists "solo correos autorizados" on public.records;
create policy "solo correos autorizados" on public.records
  for all to authenticated
  using ((auth.jwt() ->> 'email') in ('cristalauto95@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('cristalauto95@gmail.com'));

-- Claves internas del servidor (clave de avisos push, clave del programador). Nadie con sesión puede leerla.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

-- Registro de avisos ya enviados (para no repetirlos)
create table if not exists public.notif_log (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.notif_log enable row level security;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records
  for each row execute function public.touch_updated_at();

-- Tiempo real: que lo que carga uno aparezca al instante en el otro dispositivo
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;
