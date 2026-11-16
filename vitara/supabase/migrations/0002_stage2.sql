-- VITARA · Etapa 2: entrenador, nutricionista, comidas con foto, agua, suplementos, recordatorios.
-- Requiere 0001_core.sql.

-- ───────────────────────── Catálogo de ejercicios (solo lectura) ─────────────────────────
create table public.exercises (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('strength','cardio','mobility','core')),
  muscle text not null,
  equipment text[] not null default '{}',   -- equipamiento requerido (vacío = sin equipo)
  level text not null check (level in ('beginner','intermediate','advanced')),
  unit text not null default 'reps' check (unit in ('reps','seconds','minutes')),
  instructions text[] not null,
  tips text,
  media_url text                            -- imagen/video demostrativo (pendiente de cargar)
);
alter table public.exercises enable row level security;
create policy exercises_read on public.exercises for select to authenticated using (true);

-- ───────────────────────── Plan de entrenamiento ─────────────────────────
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  week jsonb not null,            -- [{weekday, kind:'training'|'rest', title, warmup:[{exercise_id,seconds}], exercises:[{exercise_id,sets,reps_min,reps_max,rest_sec,notes}], cooldown:[...]}]
  rationale text,
  created_at timestamptz not null default now()
);
create unique index workout_plans_one_active on public.workout_plans (user_id) where active;

create table public.exercise_exclusions (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercises(id),
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  session_date date not null,
  weekday smallint not null check (weekday between 1 and 7),
  title text not null default '',
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 1000),
  unique (user_id, session_date)
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null,
  exercise_id text not null references public.exercises(id),
  sets smallint not null check (sets between 1 and 10),
  reps_min smallint not null check (reps_min >= 1),
  reps_max smallint not null check (reps_max >= reps_min),
  rest_sec smallint not null default 60,
  swapped_from text references public.exercises(id),
  done boolean not null default false
);
create index on public.session_exercises (session_id, position);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercises(id),
  set_number smallint not null check (set_number between 1 and 20),
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 0 and 1000),
  reps smallint check (reps is null or reps between 0 and 1000),
  logged_at timestamptz not null default now(),
  unique (session_exercise_id, set_number)
);
create index on public.set_logs (user_id, exercise_id, logged_at desc);

-- ───────────────────────── Nutrición ─────────────────────────
create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  targets jsonb not null,         -- {kcal, protein_g, carbs_g, fat_g, water_ml, notes[]}  (calculado en el servidor)
  plan jsonb not null,            -- {days:[{day, meals:[{type,title,items:[{name,grams,kcal,protein_g,carbs_g,fat_g}],recipe}]}], shopping_list, substitutions, notes}
  created_at timestamptz not null default now()
);
create unique index nutrition_plans_one_active on public.nutrition_plans (user_id) where active;

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','snack','dinner')),
  status text not null check (status in ('logged','incident')),
  photo_path text,
  incident_reason text check (incident_reason is null or char_length(incident_reason) between 3 and 300),
  ai_analysis jsonb,
  kcal numeric(7,1), protein_g numeric(6,1), carbs_g numeric(6,1), fat_g numeric(6,1),
  uncertainty_pct smallint,
  user_corrected boolean not null default false,
  logged_at timestamptz not null default now(),
  unique (user_id, log_date, meal_type),
  -- Regla central: sin foto no hay registro; sin foto solo cabe una incidencia justificada.
  constraint meal_requires_photo_or_incident check (
    (status = 'logged' and photo_path is not null and incident_reason is null) or
    (status = 'incident' and photo_path is null and incident_reason is not null)
  ),
  constraint meal_photo_own_folder check (photo_path is null or photo_path like user_id::text || '/%')
);
create index on public.meal_logs (user_id, log_date desc);

create table public.meal_log_items (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null references public.meal_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  grams numeric(7,1) check (grams is null or grams between 0 and 5000),
  kcal numeric(7,1) not null check (kcal between 0 and 5000),
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  source text not null default 'ai' check (source in ('ai','user'))
);
create index on public.meal_log_items (meal_log_id);

-- La IA "aprende" preferencias a partir de lo que el usuario realmente registra.
create table public.user_food_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null,
  times int not null default 1,
  last_seen date not null default current_date,
  primary key (user_id, food_name)
);
create function public.track_food_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_food_stats (user_id, food_name) values (new.user_id, lower(trim(new.name)))
  on conflict (user_id, food_name) do update set times = user_food_stats.times + 1, last_seen = current_date;
  return new;
end $$;
create trigger meal_items_stats after insert on public.meal_log_items for each row execute function public.track_food_stats();

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  ml int not null check (ml between 1 and 3000),
  logged_at timestamptz not null default now()
);
create index on public.water_logs (user_id, log_date desc);

-- ───────────────────────── Suplementos ─────────────────────────
create table public.supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  dose text check (dose is null or char_length(dose) <= 80),
  frequency text check (frequency is null or char_length(frequency) <= 80),
  times text[] not null default '{}',   -- horarios HH:MM
  notes text check (notes is null or char_length(notes) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.supplement_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  taken_on date not null,
  time_slot text not null default '',
  taken_at timestamptz not null default now(),
  unique (supplement_id, taken_on, time_slot)
);
create index on public.supplement_intakes (user_id, taken_on desc);

-- Base curada y conservadora. No es consejo médico: sirve para mostrar información y avisos.
create table public.supplement_knowledge (
  slug text primary key,
  aliases text[] not null,
  summary text not null,
  cautions text not null,
  watch_terms text[] not null default '{}',   -- palabras en medicación/condiciones que disparan aviso
  always_consult boolean not null default false
);
alter table public.supplement_knowledge enable row level security;
create policy supp_kb_read on public.supplement_knowledge for select to authenticated using (true);

-- ───────────────────────── Recordatorios ─────────────────────────
create table public.notification_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('meals','water','training','supplements','sleep','partner','achievements')),
  enabled boolean not null default true,
  paused_until timestamptz,
  times text[],                 -- horarios propios (agua; el resto se deriva de preferencias)
  primary key (user_id, category)
);
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  updated_at timestamptz not null default now()
);
create table public.reminder_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_on date not null,
  primary key (user_id, key, sent_on)
);
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fn text not null,
  created_at timestamptz not null default now()
);
create index on public.ai_usage (user_id, created_at desc);

-- ───────────────────────── RLS ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['workout_plans','exercise_exclusions','workout_sessions','session_exercises','set_logs',
    'nutrition_plans','meal_logs','meal_log_items','user_food_stats','water_logs','supplements','supplement_intakes',
    'notification_settings','push_tokens','reminder_log','ai_usage']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Lectura y escritura propias (el cliente solo toca filas con su user_id).
create policy own_all on public.workout_plans         for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.exercise_exclusions   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.workout_sessions      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.session_exercises     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.set_logs              for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.meal_logs             for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.meal_log_items        for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.water_logs            for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.supplements           for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.supplement_intakes    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.notification_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.push_tokens           for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Los planes de nutrición y el consumo de IA solo los escribe el servidor (service role); el cliente solo lee.
create policy own_read on public.nutrition_plans for select using (user_id = auth.uid());
create policy own_read on public.user_food_stats for select using (user_id = auth.uid());
-- reminder_log y ai_usage: sin políticas = solo servidor.

-- Los planes de entrenamiento también se crean desde el servidor: el cliente no puede inyectar planes arbitrarios.
drop policy own_all on public.workout_plans;
create policy own_read on public.workout_plans for select using (user_id = auth.uid());

-- La comida con foto: el meal_log de un día pasado no se puede reescribir sin foto (la restricción CHECK lo impide).
-- Una persona no puede borrar fotos ajenas (políticas de storage de 0001).

revoke all on all tables in schema public from anon;
