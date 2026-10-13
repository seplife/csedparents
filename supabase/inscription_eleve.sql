-- CSED Parents+ : inscription d'un élève depuis l'application « CSE Divo — Gestion Financière ».
-- À exécuter dans Supabase > SQL Editor APRÈS schema.sql et sms_activation.sql.
--
-- L'appli de gestion se connecte à Supabase avec un compte administrateur (table admins)
-- et appelle inscrire_eleve(). La famille est créée (ou retrouvée via le numéro du parent),
-- l'élève est rattaché, et les déclencheurs existants génèrent le code d'activation
-- puis le mettent en file pour l'envoi WhatsApp.

create or replace function inscrire_eleve(
  p_nom_parent text,
  p_telephone text,
  p_matricule text,
  p_nom text,
  p_prenom text,
  p_classe text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := regexp_replace(coalesce(p_telephone, ''), '\D', '', 'g');
  v_famille uuid;
  v_nouvelle boolean := false;
begin
  if not is_admin() then raise exception 'Accès refusé'; end if;

  -- Format national : on retire l'indicatif 225 si le numéro est saisi en international.
  if v_tel like '225%' and length(v_tel) >= 11 then v_tel := substr(v_tel, 4); end if;
  if v_tel !~ '^[0-9]{8,15}$' then raise exception 'Numéro WhatsApp invalide'; end if;

  select id into v_famille from familles where telephone = v_tel;
  if v_famille is null then
    insert into familles (nom_parent, telephone, code_activation)
      values (coalesce(nullif(trim(p_nom_parent), ''), 'Parent / Tuteur'), v_tel, '')
      returning id into v_famille;
    v_nouvelle := true;
  end if;

  insert into eleves (famille_id, matricule, nom, prenom, classe)
    values (v_famille, upper(trim(p_matricule)), trim(p_nom), trim(p_prenom), trim(p_classe))
  on conflict (matricule) do update
    set famille_id = excluded.famille_id, nom = excluded.nom,
        prenom = excluded.prenom, classe = excluded.classe;

  -- true = un nouveau code d'activation vient d'être envoyé par WhatsApp.
  return jsonb_build_object('famille_id', v_famille, 'code_envoye', v_nouvelle);
end $$;

revoke execute on function inscrire_eleve(text, text, text, text, text, text) from public, anon;
grant execute on function inscrire_eleve(text, text, text, text, text, text) to authenticated;
