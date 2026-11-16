-- VITARA · Etapa 1 · Núcleo: perfiles, salud, preferencias, pareja, consentimientos.
-- Ejecutar en Supabase (SQL Editor) o con `supabase db push`.
-- Seguridad: RLS activada en todas las tablas; las escrituras sensibles pasan por funciones.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── Utilidades ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────────────────── Perfil básico ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  birth_date date check (birth_date is null or (birth_date < current_date and birth_date > date '1900-01-01')),
  -- Sexo biológico: solo para fórmulas de estimación (metabolismo, agua). No limita la app.
  biological_sex text check (biological_sex in ('female','male','intersex','prefer_not_say')),
  gender_identity text check (gender_identity is null or char_length(gender_identity) <= 40),
  height_cm numeric(5,1) check (height_cm is null or height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 25 and 400),
  target_weight_kg numeric(5,1) check (target_weight_kg is null or target_weight_kg between 25 and 400),
  locale text not null default 'es',
  country text check (country is null or char_length(country) = 2),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Salud (sensible) ─────────────────────────
create table public.health_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  injuries text check (char_length(injuries) <= 1000),
  conditions text check (char_length(conditions) <= 1000),
  medications text check (char_length(medications) <= 1000),
  allergies text[] not null default '{}',
  dietary_restrictions text[] not null default '{}',
  health_consent_at timestamptz, -- consentimiento para tratar datos de salud
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Preferencias ─────────────────────────
create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goals text[] not null default '{}'
    check (goals <@ array['lose_fat','gain_muscle','glutes_legs','arms_back','endurance','fitness','maintain','habits']),
  activity_level text check (activity_level in ('sedentary','light','moderate','high','athlete')),
  training_experience text check (training_experience in ('none','beginner','intermediate','advanced')),
  training_place text check (training_place in ('home','gym','both')),
  equipment text[] not null default '{}',
  -- Días de entrenamiento: 1=lunes … 7=domingo. Por defecto lunes a viernes.
  training_days smallint[] not null default '{1,2,3,4,5}'
    check (training_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  session_minutes smallint check (session_minutes is null or session_minutes between 10 and 240),
  preferred_training_time time,
  favorite_foods text[] not null default '{}',
  -- Horarios de comida: {"breakfast":"08:00","lunch":"13:00","snack":"17:00","dinner":"21:00"}
  meal_times jsonb not null default '{"breakfast":"08:00","lunch":"13:00","snack":"17:00","dinner":"21:00"}',
  sleep_hours_target numeric(3,1) check (sleep_hours_target is null or sleep_hours_target between 3 and 14),
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Medidas (historial) ─────────────────────────
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 25 and 400),
  waist_cm numeric(5,1) check (waist_cm is null or waist_cm between 30 and 250),
  hip_cm numeric(5,1)   check (hip_cm   is null or hip_cm   between 30 and 250),
  chest_cm numeric(5,1) check (chest_cm is null or chest_cm between 30 and 250),
  arm_cm numeric(5,1)   check (arm_cm   is null or arm_cm   between 10 and 100),
  thigh_cm numeric(5,1) check (thigh_cm is null or thigh_cm between 20 and 150),
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);
create index on public.body_measurements (user_id, measured_at desc);

-- ───────────────────────── Pareja ─────────────────────────
create table public.couples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade, -- una persona, una pareja
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,         -- sha256 del código; el código en claro no se guarda
  expires_at timestamptz not null,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.couple_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index on public.couple_invite_attempts (user_id, attempted_at desc);

-- Consentimientos de compartición: apagado por defecto, por categoría.
create table public.sharing_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('workouts','weight','nutrition','water','sleep','streak','photos')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- ───────────────────────── Funciones auxiliares ─────────────────────────
create or replace function public.my_couple_id() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.couple_members where user_id = auth.uid() limit 1
$$;

-- ¿`owner` comparte `category` con el usuario actual? (para políticas de tablas futuras)
create or replace function public.partner_can_see(owner uuid, category text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.couple_members me
    join public.couple_members them on them.couple_id = me.couple_id and them.user_id = owner
    join public.sharing_consents sc on sc.user_id = owner and sc.category = partner_can_see.category and sc.enabled
    where me.user_id = auth.uid() and owner <> auth.uid()
  )
$$;

-- ───────────────────────── Alta automática de usuario ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60));
  insert into public.health_profiles (user_id) values (new.id);
  insert into public.preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger health_updated before update on public.health_profiles
  for each row execute function public.set_updated_at();
create trigger prefs_updated before update on public.preferences
  for each row execute function public.set_updated_at();
create trigger consents_updated before update on public.sharing_consents
  for each row execute function public.set_updated_at();

-- ───────────────────────── RPC: vinculación de pareja ─────────────────────────
-- Crea (si hace falta) la pareja del usuario y devuelve un código nuevo de 8 caracteres.
create or replace function public.create_couple_invite() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  members int;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  bytes bytea;
  i int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select couple_id into cid from public.couple_members where user_id = uid;
  if cid is null then
    insert into public.couples default values returning id into cid;
    insert into public.couple_members (couple_id, user_id) values (cid, uid);
  else
    select count(*) into members from public.couple_members where couple_id = cid;
    if members >= 2 then raise exception 'already_paired'; end if;
  end if;

  -- Invalida invitaciones anteriores sin usar.
  delete from public.couple_invites where couple_id = cid and used_at is null;

  bytes := gen_random_bytes(8);
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.couple_invites (couple_id, created_by, code_hash, expires_at)
  values (cid, uid, encode(digest(code, 'sha256'), 'hex'), now() + interval '48 hours');

  return code;
end $$;

-- Devuelve un estado en vez de lanzar error: así el intento fallido queda registrado
-- (un `raise` revertiría la transacción y el límite de intentos no funcionaría).
-- Estados: ok | invalid_code | own_code | already_paired | too_many_attempts
create or replace function public.redeem_couple_invite(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  inv public.couple_invites;
  members int;
  recent int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select count(*) into recent from public.couple_invite_attempts
   where user_id = uid and attempted_at > now() - interval '1 hour';
  if recent >= 5 then return 'too_many_attempts'; end if;
  insert into public.couple_invite_attempts (user_id) values (uid);

  if exists (select 1 from public.couple_members where user_id = uid) then
    return 'already_paired';
  end if;

  select * into inv from public.couple_invites
   where code_hash = encode(digest(upper(regexp_replace(coalesce(p_code,''), '\s|-', '', 'g')), 'sha256'), 'hex')
     and used_at is null and expires_at > now()
   for update;
  if not found then return 'invalid_code'; end if;
  if inv.created_by = uid then return 'own_code'; end if;

  select count(*) into members from public.couple_members where couple_id = inv.couple_id;
  if members >= 2 then return 'already_paired'; end if;

  insert into public.couple_members (couple_id, user_id) values (inv.couple_id, uid);
  update public.couple_invites set used_by = uid, used_at = now() where id = inv.id;
  delete from public.couple_invite_attempts where user_id = uid;
  return 'ok';
end $$;

create or replace function public.leave_couple() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select couple_id into cid from public.couple_members where user_id = uid;
  if cid is null then return; end if;
  delete from public.couple_members where user_id = uid;
  -- Al desvincular, se apagan los consentimientos del usuario.
  update public.sharing_consents set enabled = false where user_id = uid;
  if not exists (select 1 from public.couple_members where couple_id = cid) then
    delete from public.couples where id = cid;
  end if;
end $$;

-- Estado de la pareja visto por el usuario actual. Solo expone el nombre de la pareja.
create or replace function public.couple_status()
returns table (linked boolean, couple_id uuid, partner_id uuid, partner_name text)
language sql stable security definer set search_path = public as $$
  with mine as (select cm.couple_id from public.couple_members cm where cm.user_id = auth.uid())
  select
    exists (select 1 from public.couple_members x where x.couple_id = (select m.couple_id from mine m) and x.user_id <> auth.uid()),
    (select m.couple_id from mine m),
    p.user_id,
    pr.display_name
  from (select 1) d
  left join lateral (
    select cm.user_id from public.couple_members cm
     where cm.couple_id = (select m.couple_id from mine m) and cm.user_id <> auth.uid() limit 1
  ) p on true
  left join public.profiles pr on pr.id = p.user_id
$$;

-- ───────────────────────── Derechos del titular ─────────────────────────
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'health', (select to_jsonb(h) from public.health_profiles h where h.user_id = uid),
    'preferences', (select to_jsonb(x) from public.preferences x where x.user_id = uid),
    'measurements', coalesce((select jsonb_agg(to_jsonb(b) order by b.measured_at) from public.body_measurements b where b.user_id = uid), '[]'),
    'sharing_consents', coalesce((select jsonb_agg(to_jsonb(s)) from public.sharing_consents s where s.user_id = uid), '[]')
  );
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth, storage as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform public.leave_couple();
  delete from storage.objects where (storage.foldername(name))[1] = uid::text;
  delete from auth.users where id = uid; -- cascada a todas las tablas del usuario
end $$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles               enable row level security;
alter table public.health_profiles        enable row level security;
alter table public.preferences            enable row level security;
alter table public.body_measurements      enable row level security;
alter table public.couples                enable row level security;
alter table public.couple_members         enable row level security;
alter table public.couple_invites         enable row level security;
alter table public.couple_invite_attempts enable row level security;
alter table public.sharing_consents       enable row level security;

create policy profiles_own_select on public.profiles for select using (id = auth.uid());
create policy profiles_own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy health_own_select on public.health_profiles for select using (user_id = auth.uid());
create policy health_own_update on public.health_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy prefs_own_select on public.preferences for select using (user_id = auth.uid());
create policy prefs_own_update on public.preferences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy meas_own_all on public.body_measurements for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- La pareja y sus miembros son de solo lectura para el cliente; se modifican vía RPC.
create policy couples_member_select on public.couples for select using (id = public.my_couple_id());
create policy members_member_select on public.couple_members for select using (couple_id = public.my_couple_id());
-- couple_invites y couple_invite_attempts: sin políticas = inaccesibles desde el cliente.

create policy consents_own_all on public.sharing_consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Revocar privilegios innecesarios a anon; las RPC solo para usuarios autenticados.
revoke all on all tables in schema public from anon;
revoke execute on function public.create_couple_invite(), public.redeem_couple_invite(text),
  public.leave_couple(), public.couple_status(), public.export_my_data(), public.delete_my_account(),
  public.partner_can_see(uuid, text), public.my_couple_id() from public, anon;
grant execute on function public.create_couple_invite(), public.redeem_couple_invite(text),
  public.leave_couple(), public.couple_status(), public.export_my_data(), public.delete_my_account(),
  public.partner_can_see(uuid, text), public.my_couple_id() to authenticated;

-- ───────────────────────── Storage privado ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('progress-photos', 'progress-photos', false, 8388608, array['image/jpeg','image/png','image/webp']),
  ('meal-photos',     'meal-photos',     false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Cada usuario solo accede a la carpeta <su-uid>/…
create policy vitara_photos_select on storage.objects for select to authenticated
  using (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy vitara_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy vitara_photos_update on storage.objects for update to authenticated
  using (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy vitara_photos_delete on storage.objects for delete to authenticated
  using (bucket_id in ('progress-photos','meal-photos') and (storage.foldername(name))[1] = auth.uid()::text);
