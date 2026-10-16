-- Paramètres de la plateforme, gérés par les administrateurs :
--   * devise des tarifs (F CFA ou euro) et tarifs des consultations par spécialité et par type ;
--   * spécialités (liste modifiable, au lieu d'une liste figée dans la base et dans le code) ;
--   * mise en veille pendant les mises à jour : plus de nouvelles demandes, prises en charge ni messages.
-- Lecture ouverte à tous (les tarifs et les spécialités s'affichent avant même la connexion).

-- ---------------------------------------------------------------------------
-- Réglages généraux (une seule ligne)
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  id                  boolean primary key default true check (id),
  currency            text not null default 'XOF' check (currency in ('XOF', 'EUR')),
  maintenance         boolean not null default false,
  maintenance_message text check (char_length(maintenance_message) <= 500),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id) on delete set null
);

insert into public.platform_settings (id) values (true);

create trigger platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;
revoke insert, delete on public.platform_settings from anon, authenticated;

create policy "tous : lit les réglages"
  on public.platform_settings for select to anon, authenticated
  using (true);

create policy "administrateur : modifie les réglages"
  on public.platform_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

/** Plateforme ouverte (pas en veille). */
create or replace function public.platform_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce((select maintenance from public.platform_settings where id), false)
$$;

grant execute on function public.platform_open() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spécialités
-- ---------------------------------------------------------------------------

create table public.specialties (
  code        text primary key check (code ~ '^[a-z][a-z_]{1,39}$'),
  label       text not null check (char_length(label) between 1 and 80),
  description text check (char_length(description) <= 200),
  -- Les parents peuvent demander ce spécialiste.
  requestable boolean not null default false,
  -- Un parent peut le demander « pour lui-même » (sinon : seulement pour un enfant).
  for_parent  boolean not null default false,
  sort_order  smallint not null default 100,
  created_at  timestamptz not null default now()
);

insert into public.specialties (code, label, description, requestable, for_parent, sort_order) values
  ('general_practitioner', 'Médecin généraliste', 'Pour la plupart des questions de santé.', true, true, 10),
  ('pediatrician', 'Pédiatre', 'Médecin spécialiste des enfants.', true, false, 20),
  ('pediatric_neurologist', 'Neuropédiatre', 'Développement, convulsions, retards moteurs ou de langage.', true, false, 30),
  ('midwife', 'Sage-femme', null, false, false, 40),
  ('nurse', 'Infirmier·ère', null, false, false, 50),
  ('nutritionist', 'Nutritionniste', null, false, false, 60),
  ('other', 'Autre professionnel de santé', null, false, false, 90);

alter table public.specialties enable row level security;

create policy "tous : lit les spécialités"
  on public.specialties for select to anon, authenticated
  using (true);

create policy "administrateur : ajoute une spécialité"
  on public.specialties for insert to authenticated
  with check ((select public.is_admin()));

create policy "administrateur : modifie une spécialité"
  on public.specialties for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Les listes figées deviennent des références à la table.
alter table public.professionals drop constraint professionals_specialty_check;
alter table public.professionals
  add constraint professionals_specialty_fkey foreign key (specialty) references public.specialties (code);

alter table public.consultations drop constraint consultations_requested_specialty_check;
alter table public.consultations
  add constraint consultations_requested_specialty_fkey foreign key (requested_specialty) references public.specialties (code);

-- ---------------------------------------------------------------------------
-- Tarifs (dans la devise des réglages)
-- ---------------------------------------------------------------------------

create table public.consultation_prices (
  specialty  text not null references public.specialties (code) on delete cascade,
  type       text not null check (type in ('teleconsultation', 'appointment')),
  amount     numeric(12, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (specialty, type)
);

create trigger consultation_prices_updated_at
  before update on public.consultation_prices
  for each row execute function public.set_updated_at();

alter table public.consultation_prices enable row level security;

create policy "tous : lit les tarifs"
  on public.consultation_prices for select to anon, authenticated
  using (true);

create policy "administrateur : fixe un tarif"
  on public.consultation_prices for insert to authenticated
  with check ((select public.is_admin()));

create policy "administrateur : modifie un tarif"
  on public.consultation_prices for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "administrateur : retire un tarif"
  on public.consultation_prices for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Règles des demandes : spécialité demandable, « pour moi » selon la spécialité
-- (remplace la règle figée « généraliste uniquement »).
-- ---------------------------------------------------------------------------

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

  -- Seuls les spécialistes proposés aux parents peuvent être demandés.
  if tg_op = 'INSERT' and auth.uid() is not null and new.requested_specialty is not null
     and not exists (select 1 from public.specialties s where s.code = new.requested_specialty and s.requestable) then
    raise exception 'Ce spécialiste ne peut pas être demandé.' using errcode = 'check_violation';
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

  -- Pour le parent lui-même : seulement les spécialités prévues pour les adultes.
  if new.child_ref is null and new.requested_specialty is not null
     and not exists (select 1 from public.specialties s where s.code = new.requested_specialty and s.for_parent) then
    raise exception 'Ce spécialiste ne peut être demandé que pour un enfant.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mise en veille : la base refuse les nouvelles demandes, prises en charge et messages.
-- (Lecture toujours possible ; les administrateurs ne sont pas concernés par l'écran de veille.)
-- Code d'erreur PP503, lu par les applications.
-- ---------------------------------------------------------------------------

create or replace function public.guard_platform_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.platform_open() then
    raise exception 'Petits Pas est momentanément en maintenance.' using errcode = 'PP503';
  end if;
  return new;
end;
$$;

create trigger consultations_platform_open
  before insert on public.consultations
  for each row execute function public.guard_platform_open();

create trigger messages_platform_open
  before insert on public.messages
  for each row execute function public.guard_platform_open();

-- Prise en charge : même vérification, avant toute autre.
create or replace function public.guard_claim_platform_open()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and old.professional_id is null and new.professional_id is not null and not public.platform_open() then
    raise exception 'Petits Pas est momentanément en maintenance.' using errcode = 'PP503';
  end if;
  return new;
end;
$$;

create trigger consultations_claim_platform_open
  before update on public.consultations
  for each row execute function public.guard_claim_platform_open();
