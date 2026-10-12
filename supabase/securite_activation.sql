-- CSED Parents+ : sécurisation de la création de compte et de l'activation
-- À exécuter dans Supabase > SQL Editor APRÈS schema.sql (peut être relancé sans risque).

-- ---------- 1. Inscription : seul un parent connu, avec son code, peut créer un compte ----------
-- L'application envoie le code dans les métadonnées de l'inscription. Sans numéro enregistré
-- par l'école ni bon code, la création du compte est refusée : personne ne peut « réserver »
-- le numéro d'un autre parent. Les autres adresses (comptes admin) ne sont pas concernées.
create or replace function verifier_inscription_parent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(split_part(coalesce(new.email, ''), '@', 2)) <> 'parents.csed.app' then
    return new;
  end if;
  if not exists (
    select 1 from familles
     where telephone = split_part(new.email, '@', 1)
       and code_activation = coalesce(new.raw_user_meta_data ->> 'code', '')
       and user_id is null
  ) then
    raise exception 'Numéro ou code d''activation invalide';
  end if;
  return new;
end $$;

drop trigger if exists verifier_inscription_parent on auth.users;
create trigger verifier_inscription_parent before insert on auth.users
  for each row execute function verifier_inscription_parent();

-- ---------- 2. Activation : domaine vérifié + limitation des essais ----------
create table if not exists tentatives_activation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  echecs smallint not null default 0,
  dernier timestamptz not null default now()
);
alter table tentatives_activation enable row level security; -- aucune policy : inaccessible aux clients

create or replace function activer_compte(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_tel text := split_part(lower(auth.jwt() ->> 'email'), '@', 1);
  v_t tentatives_activation%rowtype;
begin
  if auth.uid() is null then return false; end if;
  -- Seuls les comptes parents (numéro@parents.csed.app) peuvent être reliés à une famille.
  if split_part(v_email, '@', 2) <> 'parents.csed.app' then return false; end if;
  if exists (select 1 from familles where user_id = auth.uid()) then return true; end if;

  select * into v_t from tentatives_activation where user_id = auth.uid();
  if found and v_t.echecs >= 5 and v_t.dernier > now() - interval '15 minutes' then
    raise exception 'trop_de_tentatives';
  end if;

  update familles set user_id = auth.uid()
   where telephone = v_tel and code_activation = trim(p_code) and user_id is null;
  if found then
    delete from tentatives_activation where user_id = auth.uid();
    return true;
  end if;

  insert into tentatives_activation (user_id, echecs, dernier) values (auth.uid(), 1, now())
  on conflict (user_id) do update
    set echecs = case when tentatives_activation.dernier > now() - interval '15 minutes'
                      then tentatives_activation.echecs + 1 else 1 end,
        dernier = now();
  return false;
end $$;

revoke execute on function activer_compte(text) from public, anon;
grant execute on function activer_compte(text) to authenticated;
