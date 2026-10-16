-- Limite des demandes actives (en attente ou confirmées) :
--   * pour chaque enfant, une seule demande active par spécialiste
--     (donc au plus 3 à la fois : généraliste, pédiatre, neuropédiatre) ;
--   * « Pour moi » (le parent) : seulement le médecin généraliste, une demande active au plus.

-- Identifiant de l'enfant sur le téléphone (les profils enfants ne quittent pas le téléphone ;
-- il reste le même après une restauration de sauvegarde). Vide = demande pour le parent lui-même.
alter table public.consultations add column child_local_id text check (char_length(child_local_id) <= 100);

comment on column public.consultations.child_local_id is 'Identifiant local de l''enfant concerné ; vide si la demande concerne le parent.';

-- Demandes antérieures : on reconstitue un identifiant à partir de la copie de l'enfant.
update public.consultations
set child_local_id = 'ancien:' || child_first_name || ':' || coalesce(child_birth_date::text, '')
where child_local_id is null and child_first_name is not null;

-- Une seule demande active par parent, par bénéficiaire (enfant ou parent) et par spécialiste.
-- La création échoue si des doublons actifs existent déjà : annulez-les d'abord (voir la requête en bas).
create unique index consultations_one_active_per_specialty
  on public.consultations (parent_id, coalesce(child_local_id, ''), requested_specialty)
  where status in ('pending', 'confirmed') and requested_specialty is not null;

-- Requête de contrôle des doublons actifs, si la création de l'index échoue :
--   select parent_id, child_local_id, requested_specialty, count(*)
--   from public.consultations
--   where status in ('pending', 'confirmed') and requested_specialty is not null
--   group by 1, 2, 3 having count(*) > 1;

-- Règles du bénéficiaire, contrôlées à la création et quand le bénéficiaire ou le spécialiste change
-- (pas sur les autres modifications : une ancienne demande peut toujours être annulée).
create or replace function public.guard_consultation_beneficiary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.child_local_id is not distinct from old.child_local_id
     and new.child_first_name is not distinct from old.child_first_name
     and new.requested_specialty is not distinct from old.requested_specialty then
    return new;
  end if;

  -- Le bénéficiaire fait partie de la demande du parent : le professionnel ne peut pas le changer.
  if tg_op = 'UPDATE' and auth.uid() is not null and auth.uid() <> old.parent_id
     and new.child_local_id is distinct from old.child_local_id then
    raise exception 'La demande du parent ne peut pas être modifiée.' using errcode = 'insufficient_privilege';
  end if;

  -- Un enfant identifié porte aussi son prénom, et inversement.
  if (new.child_local_id is null) <> (new.child_first_name is null) then
    raise exception 'Enfant incomplet dans la demande.' using errcode = 'check_violation';
  end if;

  -- Pour le parent lui-même : médecin généraliste uniquement.
  if new.child_local_id is null and new.requested_specialty is not null and new.requested_specialty <> 'general_practitioner' then
    raise exception 'Pour vous-même, seul le médecin généraliste peut être demandé.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger consultations_guard_beneficiary
  before insert or update on public.consultations
  for each row execute function public.guard_consultation_beneficiary();
