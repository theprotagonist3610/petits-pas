-- Comptabilité des professionnels : gains par consultation terminée, demandes de paiement des arriérés.
--
-- Verrous (imposés par la base, pas seulement par l'application) :
--   1. Une consultation produit AU PLUS UN gain, pour UN SEUL professionnel (unique sur consultation_id).
--   2. Un gain appartient au plus à une demande de paiement : verrouillé à la demande (select … for update),
--      libéré seulement si la demande est refusée, définitivement figé une fois payé.
--   3. Une seule demande en cours par professionnel et par devise ; personne n'écrit directement dans ces
--      tables : tout passe par les fonctions ci-dessous.
--
-- Le paiement en ligne des parents n'existe pas encore : le montant dû est le tarif de la consultation,
-- figé à la confirmation, moins la commission de la plateforme (réglable, 0 % par défaut).

-- ---------------------------------------------------------------------------
-- Commission de la plateforme
-- ---------------------------------------------------------------------------

alter table public.platform_settings
  add column commission_percent numeric(5, 2) not null default 0 check (commission_percent between 0 and 100);

comment on column public.platform_settings.commission_percent is 'Part retenue par la plateforme sur chaque consultation, en %.';

-- ---------------------------------------------------------------------------
-- Tarif figé sur la consultation à sa confirmation
-- ---------------------------------------------------------------------------

alter table public.consultations
  add column price_amount numeric(12, 2) check (price_amount >= 0),
  add column price_currency text check (price_currency in ('XOF', 'EUR'));

comment on column public.consultations.price_amount is 'Tarif applicable, figé à la confirmation (un changement de tarif ultérieur ne le modifie pas).';

-- Personne ne fixe le tarif à la main : il est copié de la grille à la confirmation, puis ne bouge plus.
create or replace function public.freeze_consultation_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.price_amount := null;
    new.price_currency := null;
  elsif new.status = 'confirmed' and old.status <> 'confirmed' and old.price_amount is null then
    select p.amount, s.currency into new.price_amount, new.price_currency
    from public.platform_settings s
    left join public.consultation_prices p on p.specialty = new.requested_specialty and p.type = new.type
    where s.id;
  else
    new.price_amount := old.price_amount;
    new.price_currency := old.price_currency;
  end if;
  return new;
end;
$$;

create trigger consultations_freeze_price
  before insert or update on public.consultations
  for each row execute function public.freeze_consultation_price();

-- ---------------------------------------------------------------------------
-- Demandes de paiement
-- ---------------------------------------------------------------------------

create table public.payout_requests (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid not null references public.professionals (id) on delete restrict,
  amount           numeric(12, 2) not null check (amount > 0),
  currency         text not null check (currency in ('XOF', 'EUR')),
  status           text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  method           text not null check (method in ('mobile_money', 'bank_transfer')),
  -- Numéro Mobile Money ou coordonnées bancaires, saisis par le professionnel.
  payout_details   text not null check (char_length(payout_details) between 4 and 200),
  requested_at     timestamptz not null default now(),
  processed_at     timestamptz,
  processed_by     uuid references auth.users (id) on delete set null,
  -- Référence du versement (transaction Mobile Money, virement…) ou motif du refus.
  reference        text check (char_length(reference) <= 200),
  rejection_reason text check (char_length(rejection_reason) <= 500)
);

-- Verrou 3 : une seule demande en cours par professionnel et par devise.
create unique index payout_requests_one_open on public.payout_requests (professional_id, currency) where status = 'requested';
create index payout_requests_status_idx on public.payout_requests (status, requested_at);

-- ---------------------------------------------------------------------------
-- Gains
-- ---------------------------------------------------------------------------

create table public.professional_earnings (
  id                 uuid primary key default gen_random_uuid(),
  professional_id    uuid not null references public.professionals (id) on delete restrict,
  -- Verrou 1 : une consultation ne produit qu'un seul gain, pour un seul professionnel.
  -- Si la consultation est supprimée (compte parent supprimé), le gain reste pour la comptabilité, sans lien.
  consultation_id    uuid unique references public.consultations (id) on delete set null,
  gross_amount       numeric(12, 2) not null check (gross_amount >= 0),
  commission_percent numeric(5, 2) not null check (commission_percent between 0 and 100),
  net_amount         numeric(12, 2) not null check (net_amount >= 0),
  currency           text not null check (currency in ('XOF', 'EUR')),
  earned_at          timestamptz not null default now(),
  -- Verrou 2 : demande de paiement qui contient ce gain (null = disponible).
  payout_id          uuid references public.payout_requests (id) on delete restrict
);

create index professional_earnings_professional_idx on public.professional_earnings (professional_id, earned_at desc);
create index professional_earnings_available_idx on public.professional_earnings (professional_id, currency) where payout_id is null;

-- Gain enregistré quand la consultation est terminée (une seule fois, grâce à l'unicité).
create or replace function public.record_earning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  commission numeric(5, 2);
begin
  if new.status = 'completed' and old.status <> 'completed' and new.professional_id is not null and new.price_amount is not null then
    select commission_percent into commission from public.platform_settings where id;
    insert into public.professional_earnings (professional_id, consultation_id, gross_amount, commission_percent, net_amount, currency)
    values (
      new.professional_id, new.id, new.price_amount, commission,
      round(new.price_amount * (100 - commission) / 100, case when new.price_currency = 'XOF' then 0 else 2 end),
      new.price_currency
    )
    on conflict (consultation_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger consultations_record_earning
  after update on public.consultations
  for each row execute function public.record_earning();

-- Garde-fou : un gain ne change jamais de professionnel ni de montant, et n'est rattaché qu'à une demande à la fois.
create or replace function public.guard_earning_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.professional_id <> old.professional_id
     or (new.consultation_id is not null and new.consultation_id is distinct from old.consultation_id)
     or new.net_amount <> old.net_amount or new.gross_amount <> old.gross_amount or new.currency <> old.currency then
    raise exception 'Un gain ne peut pas être modifié.' using errcode = 'check_violation';
  end if;
  if old.payout_id is not null and new.payout_id is not null and new.payout_id <> old.payout_id then
    raise exception 'Ce gain est déjà dans une autre demande de paiement.' using errcode = 'PP409';
  end if;
  -- Libéré seulement si sa demande est refusée ; jamais une fois payé.
  if old.payout_id is not null and new.payout_id is null
     and exists (select 1 from public.payout_requests r where r.id = old.payout_id and r.status <> 'rejected') then
    raise exception 'Ce gain est en cours de paiement ou déjà payé.' using errcode = 'PP409';
  end if;
  return new;
end;
$$;

create trigger professional_earnings_guard
  before update on public.professional_earnings
  for each row execute function public.guard_earning_change();

-- ---------------------------------------------------------------------------
-- Accès : lecture seulement ; toute écriture passe par les fonctions.
-- ---------------------------------------------------------------------------

alter table public.professional_earnings enable row level security;
alter table public.payout_requests enable row level security;
revoke all on public.professional_earnings, public.payout_requests from anon;
revoke insert, update, delete on public.professional_earnings, public.payout_requests from authenticated;

-- Fiche professionnelle du compte connecté (même désactivée : il doit pouvoir consulter ce qu'on lui doit).
create or replace function public.my_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.professionals where user_id = auth.uid() and public.has_mfa()
$$;

revoke execute on function public.my_professional_id() from public, anon;
grant execute on function public.my_professional_id() to authenticated;

create policy "professionnel : lit ses gains"
  on public.professional_earnings for select to authenticated
  using (professional_id = (select public.my_professional_id()) or (select public.is_admin()));

create policy "professionnel : lit ses demandes de paiement"
  on public.payout_requests for select to authenticated
  using (professional_id = (select public.my_professional_id()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Demande de paiement des arriérés (professionnel)
-- Codes : PP401 pas de fiche / double authentification · PP404 rien à payer · PP409 demande déjà en cours
-- ---------------------------------------------------------------------------

create or replace function public.request_payout(p_method text, p_details text)
returns setof public.payout_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        uuid := public.my_professional_id();
  cur       record;
  request   public.payout_requests;
  created   integer := 0;
begin
  if me is null then
    raise exception 'Fiche professionnelle introuvable ou double authentification manquante.' using errcode = 'PP401';
  end if;
  if p_method not in ('mobile_money', 'bank_transfer') or char_length(trim(coalesce(p_details, ''))) < 4 then
    raise exception 'Moyen de paiement incomplet.' using errcode = 'check_violation';
  end if;

  -- Verrou 2 : les gains disponibles sont verrouillés le temps de la transaction (deux demandes simultanées
  -- ne peuvent pas prendre les mêmes).
  perform 1 from public.professional_earnings where professional_id = me and payout_id is null for update;

  for cur in
    select currency, sum(net_amount) as total
    from public.professional_earnings
    where professional_id = me and payout_id is null
    group by currency
    having sum(net_amount) > 0
  loop
    if exists (select 1 from public.payout_requests where professional_id = me and currency = cur.currency and status = 'requested') then
      raise exception 'Une demande de paiement est déjà en cours.' using errcode = 'PP409';
    end if;
    insert into public.payout_requests (professional_id, amount, currency, method, payout_details)
    values (me, cur.total, cur.currency, p_method, trim(p_details))
    returning * into request;
    update public.professional_earnings set payout_id = request.id
    where professional_id = me and payout_id is null and currency = cur.currency;
    created := created + 1;
    return next request;
  end loop;

  if created = 0 then
    raise exception 'Aucun montant disponible.' using errcode = 'PP404';
  end if;
end;
$$;

revoke execute on function public.request_payout(text, text) from public, anon;
grant execute on function public.request_payout(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Traitement d'une demande (administrateur) : payée (définitif) ou refusée (gains libérés)
-- ---------------------------------------------------------------------------

create or replace function public.admin_process_payout(p_id uuid, p_paid boolean, p_reference text default null, p_reason text default null)
returns public.payout_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.payout_requests;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;

  -- Verrou : la demande est verrouillée ; une demande déjà traitée ne peut pas l'être une seconde fois.
  select * into request from public.payout_requests where id = p_id for update;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  if request.status <> 'requested' then
    raise exception 'Cette demande a déjà été traitée.' using errcode = 'PP409';
  end if;

  if p_paid then
    update public.payout_requests
    set status = 'paid', processed_at = now(), processed_by = auth.uid(), reference = nullif(trim(p_reference), '')
    where id = p_id returning * into request;
  else
    if char_length(trim(coalesce(p_reason, ''))) = 0 then
      raise exception 'Indiquez le motif du refus.' using errcode = 'check_violation';
    end if;
    update public.payout_requests
    set status = 'rejected', processed_at = now(), processed_by = auth.uid(), rejection_reason = trim(p_reason)
    where id = p_id returning * into request;
    -- Gains libérés : le professionnel pourra les redemander.
    update public.professional_earnings set payout_id = null where payout_id = p_id;
  end if;
  return request;
end;
$$;

revoke execute on function public.admin_process_payout(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_process_payout(uuid, boolean, text, text) to authenticated;
