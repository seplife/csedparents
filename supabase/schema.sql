-- CSED Parents+ : schéma de la base Supabase
-- À exécuter une seule fois dans Supabase > SQL Editor.

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table familles (
  id uuid primary key default gen_random_uuid(),
  nom_parent text not null,
  telephone text not null unique check (telephone ~ '^[0-9]{8,15}$'),
  code_activation text not null,
  user_id uuid unique references auth.users(id) on delete set null,
  cree_le timestamptz not null default now()
);

create table eleves (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles(id) on delete cascade,
  matricule text not null unique,
  nom text not null,
  prenom text not null,
  classe text not null,
  scolarite_total integer not null default 0
);

create table cours (
  id uuid primary key default gen_random_uuid(),
  classe text not null,
  jour smallint not null check (jour between 1 and 6), -- 1 = lundi ... 6 = samedi
  debut time not null,
  fin time not null,
  matiere text not null,
  enseignant text not null default '',
  salle text not null default ''
);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  classe text not null,
  date date not null,
  heure time not null,
  matiere text not null,
  type text not null,
  chapitre text not null default ''
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  trimestre smallint not null check (trimestre between 1 and 3),
  matiere text not null,
  coefficient smallint not null default 1 check (coefficient > 0),
  libelle text not null,
  note numeric(5,2) not null check (note >= 0),
  sur numeric(5,2) not null default 20 check (sur > 0),
  date date not null default current_date
);

create table presences (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  date date not null,
  type text not null check (type in ('absence','retard')),
  detail text not null default '',
  statut text not null default 'a_justifier'
    check (statut in ('a_justifier','justificatif_envoye','justifiee')),
  motif text
);

create table echeances (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references eleves(id) on delete cascade,
  libelle text not null,
  date_limite date not null,
  montant integer not null check (montant >= 0),
  payee boolean not null default false
);

create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create index on eleves (famille_id);
create index on cours (classe);
create index on evaluations (classe, date);
create index on notes (eleve_id);
create index on presences (eleve_id);
create index on echeances (eleve_id);

-- ---------- Fonctions d'accès ----------
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create function mes_eleves() returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.id from eleves e join familles f on f.id = e.famille_id
  where f.user_id = auth.uid();
$$;

create function mes_classes() returns setof text
language sql stable security definer set search_path = public as $$
  select distinct e.classe from eleves e join familles f on f.id = e.famille_id
  where f.user_id = auth.uid();
$$;

-- Le parent relie son compte à sa famille grâce au code remis par l'école.
create function activer_compte(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_tel text := split_part(auth.jwt() ->> 'email', '@', 1);
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from familles where user_id = auth.uid()) then return true; end if;
  update familles set user_id = auth.uid()
   where telephone = v_tel and code_activation = p_code and user_id is null;
  return found;
end $$;

-- Le parent envoie un motif pour une absence ou un retard de son enfant.
create function envoyer_justificatif(p_presence uuid, p_motif text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update presences set statut = 'justificatif_envoye', motif = left(p_motif, 500)
   where id = p_presence and statut = 'a_justifier'
     and eleve_id in (select mes_eleves());
  return found;
end $$;

revoke execute on function is_admin(), mes_eleves(), mes_classes(),
  activer_compte(text), envoyer_justificatif(uuid, text) from public, anon;
grant execute on function is_admin(), mes_eleves(), mes_classes(),
  activer_compte(text), envoyer_justificatif(uuid, text) to authenticated;

-- ---------- Sécurité au niveau des lignes ----------
alter table familles enable row level security;
alter table eleves enable row level security;
alter table cours enable row level security;
alter table evaluations enable row level security;
alter table notes enable row level security;
alter table presences enable row level security;
alter table echeances enable row level security;
alter table admins enable row level security;

-- L'administration lit et modifie tout.
create policy admin_all on familles    for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on eleves      for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on cours       for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on evaluations for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on notes       for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on presences   for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_all on echeances   for all to authenticated using (is_admin()) with check (is_admin());
create policy admin_self on admins     for select to authenticated using (user_id = auth.uid());

-- Le parent lit uniquement ce qui concerne ses enfants. Il n'écrit rien directement.
create policy parent_lit on familles    for select to authenticated using (user_id = auth.uid());
create policy parent_lit on eleves      for select to authenticated using (id in (select mes_eleves()));
create policy parent_lit on cours       for select to authenticated using (classe in (select mes_classes()));
create policy parent_lit on evaluations for select to authenticated using (classe in (select mes_classes()));
create policy parent_lit on notes       for select to authenticated using (eleve_id in (select mes_eleves()));
create policy parent_lit on presences   for select to authenticated using (eleve_id in (select mes_eleves()));
create policy parent_lit on echeances   for select to authenticated using (eleve_id in (select mes_eleves()));
