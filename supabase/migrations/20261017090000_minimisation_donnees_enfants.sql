-- Minimisation des données d'enfants envoyées avec une demande de consultation (protection des données / APDP).
--
--   1. Plus de date de naissance : seulement l'âge en mois au moment de la demande.
--   2. Plus de prénom : le téléphone du parent retrouve lui-même le prénom de son enfant.
--   3. Plus d'identifiant lisible : une empreinte SHA-256 (compte + identifiant local de l'enfant),
--      calculée sur le téléphone. Elle suffit pour la règle « un spécialiste à la fois par enfant ».
--   4. Consentement explicite du parent, horodaté, obligatoire pour toute nouvelle demande.
--
-- Le motif de la consultation reste une donnée de santé : c'est l'objet même du service.

-- 1. Âge en mois au moment de la demande (0 à 20 ans).
alter table public.consultations add column child_age_months smallint check (child_age_months between 0 and 240);

update public.consultations
set child_age_months = least(240, greatest(0,
  (extract(year from age(created_at::date, child_birth_date)) * 12 + extract(month from age(created_at::date, child_birth_date)))::int))
where child_birth_date is not null;

-- 3. Empreinte de l'enfant. Les demandes antérieures sont converties de la même façon que le téléphone
--    (sha256 de « compte:identifiant »), pour que la règle des doublons continue de s'appliquer.
alter table public.consultations add column child_ref text check (child_ref ~ '^[0-9a-f]{64}$');

update public.consultations
set child_ref = encode(sha256(convert_to(parent_id::text || ':' || child_local_id, 'UTF8')), 'hex')
where child_local_id is not null;

comment on column public.consultations.child_ref is 'Empreinte SHA-256 de « compte:identifiant local de l''enfant » ; vide si la demande concerne le parent.';
comment on column public.consultations.child_age_months is 'Âge de l''enfant en mois au moment de la demande.';

-- 4. Consentement du parent à la transmission de sa demande à un professionnel de santé.
alter table public.consultations add column consent_at timestamptz;
comment on column public.consultations.consent_at is 'Moment où le parent a accepté la transmission de sa demande à un professionnel de santé.';

-- Index des doublons : désormais sur l'empreinte.
drop index public.consultations_one_active_per_specialty;
create unique index consultations_one_active_per_specialty
  on public.consultations (parent_id, coalesce(child_ref, ''), requested_specialty)
  where status in ('pending', 'confirmed') and requested_specialty is not null;

-- Règles du bénéficiaire et du consentement.
create or replace function public.guard_consultation_beneficiary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Toute nouvelle demande d'un parent porte son consentement.
  if tg_op = 'INSERT' and auth.uid() is not null and new.consent_at is null then
    raise exception 'Le consentement du parent est requis.' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE'
     and new.child_ref is not distinct from old.child_ref
     and new.child_age_months is not distinct from old.child_age_months
     and new.requested_specialty is not distinct from old.requested_specialty then
    return new;
  end if;

  -- Le bénéficiaire fait partie de la demande du parent : le professionnel ne peut pas le changer.
  if tg_op = 'UPDATE' and auth.uid() is not null and auth.uid() <> old.parent_id
     and (new.child_ref is distinct from old.child_ref or new.child_age_months is distinct from old.child_age_months) then
    raise exception 'La demande du parent ne peut pas être modifiée.' using errcode = 'insufficient_privilege';
  end if;

  -- Un enfant identifié porte aussi son âge, et inversement.
  if (new.child_ref is null) <> (new.child_age_months is null) then
    raise exception 'Enfant incomplet dans la demande.' using errcode = 'check_violation';
  end if;

  -- Pour le parent lui-même : médecin généraliste uniquement.
  if new.child_ref is null and new.requested_specialty is not null and new.requested_specialty <> 'general_practitioner' then
    raise exception 'Pour vous-même, seul le médecin généraliste peut être demandé.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Règles métier générales, mises à jour avec les nouvelles colonnes.
create or replace function public.guard_consultation_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me_pro uuid := public.current_professional_id();
begin
  -- Clé service_role / administration : aucune restriction.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Une demande naît toujours « en attente », sans créneau ni note du professionnel.
    if new.status <> 'pending' or new.scheduled_at is not null or new.professional_notes is not null or new.cancelled_at is not null then
      raise exception 'Une nouvelle demande doit être en attente.' using errcode = 'check_violation';
    end if;
    if new.professional_id is not null and not exists (
      select 1 from public.professionals p
      where p.id = new.professional_id and p.is_active
        and (case new.type when 'teleconsultation' then p.offers_teleconsultation else p.offers_appointment end)
        and (new.requested_specialty is null or p.specialty = new.requested_specialty)
    ) then
      raise exception 'Ce professionnel ne propose pas ce type de consultation.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.parent_id <> old.parent_id or new.type <> old.type or new.created_at <> old.created_at
     or new.consent_at is distinct from old.consent_at then
    raise exception 'Ces informations ne peuvent pas être modifiées.' using errcode = 'check_violation';
  end if;

  if old.status in ('cancelled', 'completed') then
    raise exception 'Cette consultation est close.' using errcode = 'check_violation';
  end if;

  if auth.uid() = old.parent_id then
    -- Le parent peut modifier sa demande tant qu'elle est en attente, ou l'annuler.
    if new.professional_id is distinct from old.professional_id
       or new.scheduled_at is distinct from old.scheduled_at
       or new.professional_notes is distinct from old.professional_notes then
      raise exception 'Réservé au professionnel.' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'cancelled' then
      new.cancelled_at := now();
    elsif new.status <> old.status then
      raise exception 'Le parent peut seulement annuler.' using errcode = 'insufficient_privilege';
    elsif old.status <> 'pending' then
      raise exception 'Une demande confirmée ne peut plus être modifiée, seulement annulée.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if me_pro is not null and (old.professional_id = me_pro or (old.professional_id is null and new.professional_id = me_pro)) then
    -- Le professionnel ne touche pas à la demande du parent.
    if new.reason <> old.reason
       or new.requested_specialty is distinct from old.requested_specialty
       or new.child_ref is distinct from old.child_ref
       or new.child_age_months is distinct from old.child_age_months
       or new.child_sex is distinct from old.child_sex
       or new.preferred_at is distinct from old.preferred_at
       or new.contact_phone is distinct from old.contact_phone then
      raise exception 'La demande du parent ne peut pas être modifiée.' using errcode = 'insufficient_privilege';
    end if;
    if new.professional_id is distinct from me_pro then
      raise exception 'Une consultation prise en charge ne peut pas être transférée.' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_at := now();
    elsif new.status = 'completed' and old.status <> 'confirmed' then
      raise exception 'Seule une consultation confirmée peut être terminée.' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  raise exception 'Modification non autorisée.' using errcode = 'insufficient_privilege';
end;
$$;

-- 1, 2, 3 : suppression définitive des données identifiantes des enfants.
alter table public.consultations drop column child_first_name;
alter table public.consultations drop column child_birth_date;
alter table public.consultations drop column child_local_id;
