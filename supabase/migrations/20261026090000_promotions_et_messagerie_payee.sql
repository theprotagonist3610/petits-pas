-- 1. Promotions sur le prix des consultations (par spécialité et par type, durée limitée).
-- 2. La messagerie d'une téléconsultation ne s'ouvre qu'une fois la consultation PAYÉE (10 jours à partir de là).
--
-- Prix d'une consultation : calculé à la DEMANDE du parent (c'est le prix qu'il voit dans le formulaire),
-- promotion comprise, puis figé. Si la promotion se termine avant la confirmation, le parent garde son prix.
-- Plusieurs promotions possibles : la plus avantageuse pour le parent l'emporte.

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------

create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  description    text check (char_length(description) <= 200),
  -- Spécialités concernées (codes de la table specialties) : au moins une.
  specialties    text[] not null check (cardinality(specialties) >= 1),
  -- Types concernés : téléconsultation, rendez-vous, ou les deux.
  types          text[] not null default array['teleconsultation', 'appointment']
                   check (cardinality(types) >= 1 and types <@ array['teleconsultation', 'appointment']),
  -- percent : remise en % · fixed_price : prix promotionnel (dans la devise indiquée).
  discount_kind  text not null check (discount_kind in ('percent', 'fixed_price')),
  discount_value numeric(12, 2) not null check (discount_value >= 0),
  currency       text check (currency in ('XOF', 'EUR')),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  check (ends_at > starts_at),
  check (discount_kind <> 'percent' or discount_value <= 100),
  check (discount_kind <> 'fixed_price' or currency is not null)
);

comment on table public.promotions is 'Promotions sur le prix des consultations, limitées dans le temps.';

create index promotions_period_idx on public.promotions (starts_at, ends_at) where active;

-- Spécialités inconnues refusées (un tableau ne peut pas porter de clé étrangère).
create or replace function public.guard_promotion_specialties()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.specialties) code where code not in (select s.code from public.specialties s)) then
    raise exception 'Spécialité inconnue dans la promotion.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger promotions_guard_specialties
  before insert or update on public.promotions
  for each row execute function public.guard_promotion_specialties();

alter table public.promotions enable row level security;
revoke delete on public.promotions from anon, authenticated;

-- Tout le monde voit les promotions en cours ou à venir (affichées aux parents) ; l'administrateur voit tout.
create policy "tous : lit les promotions en cours"
  on public.promotions for select to anon, authenticated
  using ((active and ends_at > now()) or (select public.is_admin()));

create policy "administrateur : crée une promotion"
  on public.promotions for insert to authenticated
  with check ((select public.is_admin()));

-- Pas de suppression : une promotion utilisée par des consultations se désactive (historique conservé).
create policy "administrateur : modifie une promotion"
  on public.promotions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Prix effectif : tarif de la grille, moins la meilleure promotion valable à l'instant donné.
-- ---------------------------------------------------------------------------

create or replace function public.effective_price(p_specialty text, p_type text, p_at timestamptz default now())
returns table (list_price numeric, price numeric, currency text, promotion_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.amount as list_price, s.currency
    from public.platform_settings s
    left join public.consultation_prices p on p.specialty = p_specialty and p.type = p_type
    where s.id
  ),
  offers as (
    select pr.id,
           case pr.discount_kind
             when 'percent' then round(b.list_price * (100 - pr.discount_value) / 100, case when b.currency = 'XOF' then 0 else 2 end)
             else least(pr.discount_value, b.list_price)
           end as promo_price
    from public.promotions pr, base b
    where pr.active and p_at >= pr.starts_at and p_at < pr.ends_at
      and p_specialty = any (pr.specialties) and p_type = any (pr.types)
      and b.list_price is not null
      and (pr.discount_kind = 'percent' or pr.currency = b.currency)
  )
  select b.list_price,
         coalesce((select min(o.promo_price) from offers o), b.list_price),
         b.currency,
         (select o.id from offers o order by o.promo_price, o.id limit 1)
  from base b
$$;

grant execute on function public.effective_price(text, text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prix figé sur la consultation : à la demande (promotion comprise).
-- ---------------------------------------------------------------------------

alter table public.consultations
  add column list_price_amount numeric(12, 2) check (list_price_amount >= 0),
  add column promotion_id uuid references public.promotions (id) on delete set null;

comment on column public.consultations.list_price_amount is 'Tarif normal de la grille au moment de la demande.';
comment on column public.consultations.price_amount is 'Prix à payer : tarif, promotion déduite, figé à la demande.';

create or replace function public.freeze_consultation_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ep record;
begin
  if tg_op = 'INSERT'
     or (old.status = 'pending' and (new.requested_specialty is distinct from old.requested_specialty or new.type is distinct from old.type))
     -- Demandes antérieures à cette règle : prix calculé à la confirmation, comme avant.
     or (new.status = 'confirmed' and old.status <> 'confirmed' and old.price_amount is null) then
    select * into ep from public.effective_price(new.requested_specialty, new.type, now());
    new.list_price_amount := ep.list_price;
    new.price_amount := ep.price;
    new.price_currency := ep.currency;
    new.promotion_id := ep.promotion_id;
  else
    new.list_price_amount := old.list_price_amount;
    new.price_amount := old.price_amount;
    new.price_currency := old.price_currency;
    new.promotion_id := old.promotion_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Messagerie : ouverte quand la téléconsultation est confirmée ET payée (dans n'importe quel ordre),
-- pour 10 jours à partir de là ; fermée si la consultation est annulée ou remboursée.
-- ---------------------------------------------------------------------------

create or replace function public.sync_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'teleconsultation' and new.status in ('confirmed', 'completed') and new.payment_status = 'paid'
     and (old.status not in ('confirmed', 'completed') or old.payment_status <> 'paid') then
    insert into public.conversations (consultation_id, parent_id, professional_user_id, opens_at, closes_at)
    select new.id, new.parent_id, p.user_id, now(), now() + interval '10 days'
    from public.professionals p
    where p.id = new.professional_id and p.user_id is not null
    on conflict (consultation_id) do nothing;
  elsif (new.status = 'cancelled' and old.status <> 'cancelled') or (new.payment_status = 'refunded' and old.payment_status <> 'refunded') then
    update public.conversations set closes_at = greatest(opens_at + interval '1 second', least(closes_at, now()))
    where consultation_id = new.id;
  end if;
  return new;
end;
$$;
