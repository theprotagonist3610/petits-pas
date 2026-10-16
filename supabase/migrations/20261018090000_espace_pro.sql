-- Espace professionnel (Petits Pas Pro) : administration, vérification, double authentification,
-- pays des demandes, historique, prise en charge atomique et coordonnées minimisées du parent.

-- ---------------------------------------------------------------------------
-- Double authentification : toutes les données de santé côté pro exigent aal2
-- (mot de passe + code TOTP). Les fonctions ci-dessous renvoient null / false sinon,
-- ce qui ferme automatiquement toutes les politiques qui s'en servent.
-- ---------------------------------------------------------------------------

create or replace function public.has_mfa()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- ---------------------------------------------------------------------------
-- Administrateurs
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is 'Administrateurs de Petits Pas Pro. Ajout uniquement en SQL (tableau de bord Supabase).';

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_mfa() and exists (select 1 from public.admins where user_id = auth.uid())
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Professionnels : numéro d'ordre et vérification
-- ---------------------------------------------------------------------------

alter table public.professionals
  add column license_number text check (char_length(license_number) <= 50),
  add column verified_at timestamptz;

comment on column public.professionals.license_number is 'Numéro d''inscription à l''ordre professionnel.';
comment on column public.professionals.verified_at is 'Vérification du professionnel par un administrateur. Sans elle, aucun accès aux demandes.';

-- Professionnel « opérationnel » : actif, vérifié, connecté avec double authentification.
create or replace function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.professionals
  where user_id = auth.uid() and is_active and verified_at is not null and public.has_mfa()
$$;

create or replace function public.current_professional_specialty()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select specialty from public.professionals
  where user_id = auth.uid() and is_active and verified_at is not null and public.has_mfa()
$$;

create or replace function public.current_professional_country()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select country from public.professionals
  where user_id = auth.uid() and is_active and verified_at is not null and public.has_mfa()
$$;

-- Lecture des professionnels : les parents voient les professionnels actifs et vérifiés
-- (nom affiché sur leurs consultations) ; chacun voit sa propre fiche ; l'administrateur voit tout.
drop policy "connecté : lit les professionnels actifs" on public.professionals;
create policy "connecté : lit les professionnels actifs"
  on public.professionals for select to authenticated
  using ((is_active and verified_at is not null) or user_id = (select auth.uid()) or (select public.is_admin()));

drop policy "professionnel : modifie ses coordonnées" on public.professionals;
create policy "professionnel : modifie ses coordonnées"
  on public.professionals for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_mfa()))
  with check (user_id = (select auth.uid()));

-- Modifications réservées à l'administrateur (activation, vérification, spécialité…).
-- Les champs passés à null restent inchangés.
create or replace function public.admin_update_professional(
  p_id uuid,
  p_is_active boolean default null,
  p_verified boolean default null,
  p_specialty text default null,
  p_country text default null,
  p_license_number text default null
)
returns public.professionals
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.professionals;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  update public.professionals set
    is_active      = coalesce(p_is_active, is_active),
    verified_at    = case when p_verified is null then verified_at when p_verified then coalesce(verified_at, now()) else null end,
    specialty      = coalesce(p_specialty, specialty),
    country        = coalesce(p_country, country),
    license_number = coalesce(nullif(trim(p_license_number), ''), license_number)
  where id = p_id
  returning * into result;
  if not found then
    raise exception 'Professionnel introuvable.' using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

revoke execute on function public.admin_update_professional(uuid, boolean, boolean, text, text, text) from public, anon;
grant execute on function public.admin_update_professional(uuid, boolean, boolean, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Pays des demandes : un professionnel ne voit que les demandes de son pays
-- ---------------------------------------------------------------------------

alter table public.consultations add column country text check (country in ('BJ', 'TG', 'NE'));
comment on column public.consultations.country is 'Pays du parent au moment de la demande (choisi dans les réglages de l''application).';

update public.consultations c set country = p.country
from public.parents p
where p.id = c.parent_id and c.country is null;

drop policy "professionnel : lit ses consultations et les demandes à prendre" on public.consultations;
create policy "professionnel : lit ses consultations et les demandes à prendre"
  on public.consultations for select to authenticated
  using (
    professional_id = (select public.current_professional_id())
    or (
      professional_id is null and status = 'pending' and (select public.current_professional_id()) is not null
      and (requested_specialty is null or requested_specialty = (select public.current_professional_specialty()))
      and (country is null or country = (select public.current_professional_country()))
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
      and (country is null or country = (select public.current_professional_country()))
    )
  )
  with check (professional_id = (select public.current_professional_id()));

-- Le pays fait partie de la demande du parent : le professionnel ne peut pas le changer.
create or replace function public.guard_consultation_country()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.parent_id and new.country is distinct from old.country then
    raise exception 'La demande du parent ne peut pas être modifiée.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger consultations_guard_country
  before update on public.consultations
  for each row execute function public.guard_consultation_country();

-- ---------------------------------------------------------------------------
-- Historique des consultations (frise du tableau de bord, litiges)
-- ---------------------------------------------------------------------------

create table public.consultation_events (
  id              bigint generated always as identity primary key,
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  actor_id        uuid references auth.users (id) on delete set null,
  actor_role      text not null check (actor_role in ('parent', 'professional', 'system')),
  event           text not null check (event in ('created', 'confirmed', 'rescheduled', 'cancelled', 'completed')),
  created_at      timestamptz not null default now()
);

create index consultation_events_consultation_idx on public.consultation_events (consultation_id, created_at);

alter table public.consultation_events enable row level security;
revoke all on public.consultation_events from anon;
revoke insert, update, delete on public.consultation_events from authenticated;

-- Visible par ceux qui voient la consultation (les politiques de consultations s'appliquent dans la sous-requête).
create policy "lit l'historique des consultations visibles"
  on public.consultation_events for select to authenticated
  using (exists (select 1 from public.consultations c where c.id = consultation_id));

create or replace function public.log_consultation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role  text := case when auth.uid() is null then 'system' when auth.uid() = new.parent_id then 'parent' else 'professional' end;
  v_event text;
begin
  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif new.status <> old.status and new.status in ('confirmed', 'cancelled', 'completed') then
    v_event := new.status;
  elsif new.status = 'confirmed' and new.scheduled_at is distinct from old.scheduled_at then
    v_event := 'rescheduled';
  else
    return new;
  end if;
  insert into public.consultation_events (consultation_id, actor_id, actor_role, event)
  values (new.id, auth.uid(), v_role, v_event);
  return new;
end;
$$;

create trigger consultations_log_event
  after insert or update on public.consultations
  for each row execute function public.log_consultation_event();

-- ---------------------------------------------------------------------------
-- Prise en charge atomique : attribuer + confirmer en une seule opération.
-- Si deux professionnels cliquent en même temps, un seul réussit.
-- Codes d'erreur propres (lus par l'application) :
--   PP401 professionnel non opérationnel · PP409 déjà prise · PP403 type non proposé · PP422 date passée
-- ---------------------------------------------------------------------------

create or replace function public.claim_consultation(p_id uuid, p_scheduled_at timestamptz, p_note text default null)
returns public.consultations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me     uuid := public.current_professional_id();
  result public.consultations;
  wanted public.consultations;
begin
  if me is null then
    raise exception 'Professionnel non vérifié ou double authentification manquante.' using errcode = 'PP401';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() - interval '5 minutes' then
    raise exception 'Choisissez une date à venir.' using errcode = 'PP422';
  end if;

  select * into wanted from public.consultations where id = p_id;
  if found and not exists (
    select 1 from public.professionals p
    where p.id = me and (case wanted.type when 'teleconsultation' then p.offers_teleconsultation else p.offers_appointment end)
  ) then
    raise exception 'Vous ne proposez pas ce type de consultation.' using errcode = 'PP403';
  end if;

  update public.consultations
  set professional_id = me,
      status = 'confirmed',
      scheduled_at = p_scheduled_at,
      professional_notes = nullif(trim(p_note), '')
  where id = p_id and professional_id is null and status = 'pending'
  returning * into result;

  if not found then
    raise exception 'Cette demande a déjà été prise ou annulée.' using errcode = 'PP409';
  end if;
  return result;
end;
$$;

revoke execute on function public.claim_consultation(uuid, timestamptz, text) from public, anon;
grant execute on function public.claim_consultation(uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Coordonnées du parent : seulement prénom, nom et téléphone, pour ses consultations confirmées.
-- Remplace l'accès du professionnel à toute la fiche parent (date de naissance, profession…).
-- ---------------------------------------------------------------------------

drop policy "professionnel : lit les parents de ses consultations" on public.parents;

create or replace function public.consultation_contact(p_id uuid)
returns table (first_name text, last_name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.first_name, p.last_name, coalesce(c.contact_phone, p.phone)
  from public.consultations c
  join public.parents p on p.id = c.parent_id
  where c.id = p_id
    and c.professional_id = public.current_professional_id()
    and c.status in ('confirmed', 'completed')
$$;

revoke execute on function public.consultation_contact(uuid) from public, anon;
grant execute on function public.consultation_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Temps réel : tableaux de bord et listes mis à jour sans recharger.
-- Les politiques RLS s'appliquent aussi au temps réel (chacun ne reçoit que ce qu'il peut lire).
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.consultations;
