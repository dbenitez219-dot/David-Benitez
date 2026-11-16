-- Comida con foto sin análisis de IA: descripción libre opcional; las calorías pueden quedar sin estimar.
alter table public.meal_logs add column if not exists note text check (note is null or char_length(note) <= 300);
