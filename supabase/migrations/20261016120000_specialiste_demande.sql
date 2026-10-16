-- Le parent précise le spécialiste qu'il souhaite consulter.
-- Pour commencer : médecin généraliste, pédiatre, neuropédiatre.

-- Nouvelle spécialité pour les professionnels : neuropédiatre.
alter table public.professionals drop constraint professionals_specialty_check;
alter table public.professionals add constraint professionals_specialty_check check (
  specialty in ('general_practitioner', 'pediatrician', 'pediatric_neurologist', 'midwife', 'nurse', 'nutritionist', 'other')
);

-- Spécialiste demandé. Facultatif en base pour les demandes déjà enregistrées ;
-- l'application l'exige pour toute nouvelle demande.
alter table public.consultations
  add column requested_specialty text
  check (requested_specialty in ('general_practitioner', 'pediatrician', 'pediatric_neurologist'));

comment on column public.consultations.requested_specialty is 'Spécialiste souhaité par le parent.';

drop index if exists public.consultations_unassigned_idx;
create index consultations_unassigned_idx on public.consultations (requested_specialty, type, created_at)
  where professional_id is null and status = 'pending';

-- Spécialité du professionnel connecté (null s'il n'est pas un professionnel actif).
create or replace function public.current_professional_specialty()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select specialty from public.professionals where user_id = auth.uid() and is_active
$$;

-- Un professionnel ne voit et ne prend que les demandes libres de sa spécialité
-- (ou sans spécialité précisée, pour les demandes antérieures).
drop policy "professionnel : lit ses consultations et les demandes à prendre" on public.consultations;
create policy "professionnel : lit ses consultations et les demandes à prendre"
  on public.consultations for select to authenticated
  using (
    professional_id = (select public.current_professional_id())
    or (
      professional_id is null and status = 'pending' and (select public.current_professional_id()) is not null
      and (requested_specialty is null or requested_specialty = (select public.current_professional_specialty()))
    )
  );

drop policy "professionnel : prend en charge et suit ses consultations" on public.consultations;
create policy "professionnel : prend en charge et suit ses consultations"
  on public.consultations for update to authenticated
  using (
    professional_id = (select public.current_professional_id())
    or (
      professional_id is null and status = 'pending' and (select public.current_professional_id()) is not null
      and (requested_specialty is null or requested_specialty = (select public.current_professional_specialty()))
    )
  )
  with check (professional_id = (select public.current_professional_id()));

-- Règles métier : le spécialiste demandé fait partie de la demande du parent
-- (modifiable par lui tant qu'elle est en attente, jamais par le professionnel).
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
  if new.parent_id <> old.parent_id or new.type <> old.type or new.created_at <> old.created_at then
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
       or new.child_first_name is distinct from old.child_first_name
       or new.child_birth_date is distinct from old.child_birth_date
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
