-- CSED Parents+ : code d'activation automatique + envoi par SMS
-- À exécuter dans Supabase > SQL Editor APRÈS schema.sql.
-- Avant d'exécuter : remplacez les deux valeurs « A_REMPLACER » plus bas.

-- ---------- 1. Code d'activation généré automatiquement ----------
-- Si l'école n'en fournit pas, un code à 6 chiffres est créé à l'enregistrement du parent.
create function generer_code_activation() returns trigger
language plpgsql as $$
begin
  if coalesce(trim(new.code_activation), '') = '' then
    new.code_activation := lpad((floor(random() * 1000000))::int::text, 6, '0');
  end if;
  return new;
end $$;

create trigger familles_code before insert on familles
  for each row execute function generer_code_activation();

-- ---------- 2. File d'attente des SMS ----------
create table sms_file (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente','envoye','echec')),
  tentatives smallint not null default 0,
  erreur text,
  cree_le timestamptz not null default now(),
  envoye_le timestamptz
);
create index on sms_file (statut);

alter table sms_file enable row level security;
-- Lecture pour l'administration (suivi des envois) ; l'Edge Function écrit avec la clé service_role.
create policy admin_lit on sms_file for select to authenticated using (is_admin());
create policy admin_renvoi on sms_file for update to authenticated using (is_admin()) with check (is_admin());

-- Un SMS est mis en file dès qu'une famille est créée.
create function enfiler_sms_activation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into sms_file (famille_id) values (new.id);
  return new;
end $$;

create trigger familles_sms after insert on familles
  for each row execute function enfiler_sms_activation();

-- ---------- 3. Appel de l'Edge Function à chaque nouvel SMS ----------
-- Remplacez A_REMPLACER_REF par la référence du projet (cbcsadiglaxkhkpsukss)
-- et A_REMPLACER_SECRET par le même secret que WEBHOOK_SECRET (voir README).
create trigger sms_file_envoi after insert on sms_file
  for each row execute function supabase_functions.http_request(
    'https://cbcsadiglaxkhkpsukss.supabase.co/functions/v1/envoyer-sms',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"be53356aeb343c02d31448f1a6a763db0b2a1208f9faea7884c170c8a1f93016"}',
    '{}',
    '5000'
  );

-- ---------- 4. Nouvelle tentative automatique (optionnel, toutes les 10 minutes) ----------
-- Activez d'abord les extensions pg_cron et pg_net (Database > Extensions), puis décommentez :
-- select cron.schedule('relance-sms', '*/10 * * * *', $$
--   select net.http_post(
--     url := 'https://cbcsadiglaxkhkpsukss.supabase.co/functions/v1/envoyer-sms',
--     headers := '{"Content-Type":"application/json","x-webhook-secret":"be53356aeb343c02d31448f1a6a763db0b2a1208f9faea7884c170c8a1f93016"}'::jsonb,
--     body := '{}'::jsonb);
-- $$);
