-- Petits Pas : comptes parents, professionnels de santé et demandes de consultation.
--
-- Principes :
--   * Un compte de connexion = une ligne dans auth.users (géré par Supabase Auth).
--   * Chaque inscription crée automatiquement sa ligne dans public.parents (trigger on_auth_user_created).
--   * Un professionnel est créé par l'administration (clé service_role / tableau de bord),
--     puis rattaché à son compte de connexion via professionals.user_id. Personne ne peut
--     s'auto-déclarer professionnel depuis l'application.
--   * Les enfants restent sur le téléphone (hors ligne) : une consultation garde une copie
--     des informations utiles de l'enfant au moment de la demande.
--   * Toutes les tables sont protégées par RLS : chacun ne voit que ses propres données.

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parents
-- ---------------------------------------------------------------------------

create table public.parents (
  id          uuid primary key references auth.users (id) on delete cascade,
  last_name   text not null default '' check (char_length(last_name) <= 100),
  first_name  text not null default '' check (char_length(first_name) <= 100),
  sex         text check (sex in ('female', 'male')),
  birth_date  date,
  profession  text check (char_length(profession) <= 100),
  phone       text check (phone ~ '^\+?[0-9 .()-]{8,20}$'),
  email       text check (char_length(email) <= 254),
  country     text check (country in ('BJ', 'TG', 'NE')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.parents is 'Profil du parent titulaire d''un compte (1 ligne par compte de connexion).';

create trigger parents_updated_at
  before update on public.parents
  for each row execute function public.set_updated_at();

-- Création automatique du profil parent à l'inscription.
-- Les champs viennent de options.data de supabase.auth.signUp(...).
-- account_type = 'professional' : compte créé pour un professionnel, pas de profil parent.
-- (Ce champ est modifiable par le client, mais il ne donne aucun droit : les droits
-- professionnels viennent uniquement de professionals.user_id, fixé par l'administration.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if meta ->> 'account_type' = 'professional' then
    return new;
  end if;

  insert into public.parents (id, last_name, first_name, sex, birth_date, profession, phone, email, country)
  values (
    new.id,
    coalesce(trim(meta ->> 'last_name'), ''),
    coalesce(trim(meta ->> 'first_name'), ''),
    nullif(meta ->> 'sex', ''),
    nullif(meta ->> 'birth_date', '')::date,
    nullif(trim(meta ->> 'profession'), ''),
    coalesce(nullif(trim(meta ->> 'phone'), ''), new.phone),
    new.email,
    nullif(meta ->> 'country', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Professionnels de santé
-- ---------------------------------------------------------------------------

create table public.professionals (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid unique references auth.users (id) on delete set null,
  last_name               text not null check (char_length(last_name) between 1 and 100),
  first_name              text not null check (char_length(first_name) between 1 and 100),
  specialty               text not null check (
    specialty in ('general_practitioner', 'pediatrician', 'midwife', 'nurse', 'nutritionist', 'other')
  ),
  facility_name           text check (char_length(facility_name) <= 200),
  city                    text check (char_length(city) <= 100),
  country                 text not null check (country in ('BJ', 'TG', 'NE')),
  phone                   text check (phone ~ '^\+?[0-9 .()-]{8,20}$'),
  email                   text check (char_length(email) <= 254),
  offers_teleconsultation boolean not null default false,
  offers_appointment      boolean not null default true,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.professionals is 'Professionnels de santé partenaires. Créés et activés par l''administration.';

create index professionals_country_active_idx on public.professionals (country) where is_active;

create trigger professionals_updated_at
  before update on public.professionals
  for each row execute function public.set_updated_at();

-- Identifiant professionnel de l'utilisateur connecté (null s'il n'est pas un professionnel actif).
create or replace function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.professionals where user_id = auth.uid() and is_active
$$;

-- ---------------------------------------------------------------------------
-- Consultations (téléconsultations et rendez-vous)
-- ---------------------------------------------------------------------------

create table public.consultations (
  id                  uuid primary key default gen_random_uuid(),
  parent_id           uuid not null references public.parents (id) on delete cascade,
  professional_id     uuid references public.professionals (id) on delete set null,
  type                text not null check (type in ('teleconsultation', 'appointment')),
  status              text not null default 'pending'
                        check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  -- Copie de l'enfant concerné (les profils enfants restent sur le téléphone).
  child_first_name    text check (char_length(child_first_name) <= 100),
  child_birth_date    date,
  child_sex           text check (child_sex in ('female', 'male')),
  -- Motif de la consultation : obligatoire, et pas seulement des espaces.
  reason              text not null check (char_length(btrim(reason)) between 1 and 2000),
  -- Créneau souhaité par le parent, créneau fixé par le professionnel.
  preferred_at        timestamptz,
  scheduled_at        timestamptz,
  contact_phone       text check (contact_phone ~ '^\+?[0-9 .()-]{8,20}$'),
  professional_notes  text check (char_length(professional_notes) <= 2000),
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint consultations_confirmed_has_slot check (status <> 'confirmed' or scheduled_at is not null)
);

comment on table public.consultations is 'Demandes de téléconsultation ou de rendez-vous en centre de santé, faites par un parent.';

create index consultations_parent_idx on public.consultations (parent_id, created_at desc);
create index consultations_professional_idx on public.consultations (professional_id, status);
create index consultations_unassigned_idx on public.consultations (type, created_at) where professional_id is null and status = 'pending';

create trigger consultations_updated_at
  before update on public.consultations
  for each row execute function public.set_updated_at();

-- Règles métier qu'une politique RLS ne peut pas exprimer (comparaison ancien / nouveau).
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

create trigger consultations_guard
  before insert or update on public.consultations
  for each row execute function public.guard_consultation_change();

-- ---------------------------------------------------------------------------
-- Sécurité : RLS
-- ---------------------------------------------------------------------------

alter table public.parents enable row level security;
alter table public.professionals enable row level security;
alter table public.consultations enable row level security;

-- Aucun accès anonyme.
revoke all on public.parents, public.professionals, public.consultations from anon;

-- Parents ---------------------------------------------------------------------
-- La ligne est créée par le trigger d'inscription et supprimée avec le compte.
revoke insert, delete on public.parents from authenticated;

create policy "parent : lit son profil"
  on public.parents for select to authenticated
  using (id = (select auth.uid()));

create policy "parent : modifie son profil"
  on public.parents for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "professionnel : lit les parents de ses consultations"
  on public.parents for select to authenticated
  using (exists (
    select 1 from public.consultations c
    where c.parent_id = parents.id and c.professional_id = (select public.current_professional_id())
  ));

-- Professionnels ---------------------------------------------------------------
-- Création, activation et rattachement au compte : administration uniquement.
revoke insert, update, delete on public.professionals from authenticated;
grant update (facility_name, city, phone, email, offers_teleconsultation, offers_appointment)
  on public.professionals to authenticated;

create policy "connecté : lit les professionnels actifs"
  on public.professionals for select to authenticated
  using (is_active or user_id = (select auth.uid()));

create policy "professionnel : modifie ses coordonnées"
  on public.professionals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Consultations ----------------------------------------------------------------
-- Pas de suppression : on annule, pour garder l'historique.
revoke delete on public.consultations from authenticated;

create policy "parent : lit ses consultations"
  on public.consultations for select to authenticated
  using (parent_id = (select auth.uid()));

create policy "parent : crée une demande"
  on public.consultations for insert to authenticated
  with check (parent_id = (select auth.uid()));

create policy "parent : modifie ou annule sa demande"
  on public.consultations for update to authenticated
  using (parent_id = (select auth.uid()))
  with check (parent_id = (select auth.uid()));

create policy "professionnel : lit ses consultations et les demandes à prendre"
  on public.consultations for select to authenticated
  using (
    professional_id = (select public.current_professional_id())
    or (professional_id is null and status = 'pending' and (select public.current_professional_id()) is not null)
  );

create policy "professionnel : prend en charge et suit ses consultations"
  on public.consultations for update to authenticated
  using (
    professional_id = (select public.current_professional_id())
    or (professional_id is null and status = 'pending' and (select public.current_professional_id()) is not null)
  )
  with check (professional_id = (select public.current_professional_id()));
