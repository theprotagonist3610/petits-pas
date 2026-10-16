-- Paiement des consultations : statut et MONTANT RÉELLEMENT PAYÉ (qui peut différer du tarif : promotions…).
--
-- * price_amount (déjà présent) = tarif de la grille, figé à la confirmation : sert de référence.
-- * paid_amount = ce que le parent a réellement payé : c'est sur lui qu'est calculé le gain du professionnel.
-- * Personne n'écrit ces colonnes directement : seulement un administrateur via admin_record_payment
--   (paiement constaté à la main) ou, plus tard, le service de paiement en ligne (clé service_role).
-- * Gain du professionnel : créé quand la consultation est à la fois TERMINÉE et PAYÉE, dans n'importe quel ordre.

alter table public.consultations
  add column payment_status    text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  add column paid_amount       numeric(12, 2) check (paid_amount >= 0),
  add column paid_currency     text check (paid_currency in ('XOF', 'EUR')),
  add column paid_at           timestamptz,
  add column payment_method    text check (payment_method in ('mobile_money', 'card', 'cash', 'bank_transfer', 'other')),
  add column payment_reference text check (char_length(payment_reference) <= 200),
  add constraint consultations_paid_complete
    check (payment_status = 'unpaid' or (paid_amount is not null and paid_currency is not null and paid_at is not null));

comment on column public.consultations.payment_status is 'unpaid : non payée · paid : payée · refunded : remboursée.';
comment on column public.consultations.paid_amount is 'Montant réellement payé (peut différer du tarif price_amount : promotion, geste commercial…).';

-- ---------------------------------------------------------------------------
-- Colonnes de paiement protégées : seule une écriture autorisée (fonction admin ou service_role) passe.
-- ---------------------------------------------------------------------------

-- Écriture du paiement en cours : drapeau posé par admin_record_payment pour sa seule transaction,
-- et valable seulement pour un administrateur (un client ne peut pas s'en servir).
create or replace function public.payment_write_allowed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('petits_pas.payment_write', true), '') = 'on' and public.is_admin()
$$;

create or replace function public.guard_payment_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or public.payment_write_allowed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Une demande naît non payée.
    new.payment_status := 'unpaid';
    new.paid_amount := null;
    new.paid_currency := null;
    new.paid_at := null;
    new.payment_method := null;
    new.payment_reference := null;
    return new;
  end if;
  if new.payment_status is distinct from old.payment_status or new.paid_amount is distinct from old.paid_amount
     or new.paid_currency is distinct from old.paid_currency or new.paid_at is distinct from old.paid_at
     or new.payment_method is distinct from old.payment_method or new.payment_reference is distinct from old.payment_reference then
    raise exception 'Le paiement ne peut pas être modifié ici.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger consultations_guard_payment
  before insert or update on public.consultations
  for each row execute function public.guard_payment_fields();

-- ---------------------------------------------------------------------------
-- Gain du professionnel : sur le montant payé, quand la consultation est terminée ET payée.
-- (Remplace la version basée sur le tarif de la grille.)
-- ---------------------------------------------------------------------------

create or replace function public.record_earning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  commission numeric(5, 2);
begin
  if new.status = 'completed' and new.payment_status = 'paid' and new.professional_id is not null
     and (old.status <> 'completed' or old.payment_status <> 'paid') then
    select commission_percent into commission from public.platform_settings where id;
    insert into public.professional_earnings (professional_id, consultation_id, gross_amount, commission_percent, net_amount, currency)
    values (
      new.professional_id, new.id, new.paid_amount, commission,
      round(new.paid_amount * (100 - commission) / 100, case when new.paid_currency = 'XOF' then 0 else 2 end),
      new.paid_currency
    )
    -- Verrou 1 (unicité sur la consultation) : jamais deux gains pour une même consultation.
    on conflict (consultation_id) do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enregistrement d'un paiement ou d'un remboursement (administrateur)
-- Codes : PP409 gain déjà demandé ou versé (remboursement impossible) · PP422 montant ou devise invalide
-- ---------------------------------------------------------------------------

create or replace function public.admin_record_payment(
  p_consultation_id uuid,
  p_status text,
  p_amount numeric default null,
  p_currency text default null,
  p_method text default null,
  p_reference text default null,
  p_paid_at timestamptz default null
)
returns public.consultations
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       public.consultations;
  earning public.professional_earnings;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.consultations where id = p_consultation_id for update;
  if not found then
    raise exception 'Consultation introuvable.' using errcode = 'no_data_found';
  end if;

  -- Autorise l'écriture des colonnes de paiement pour cette transaction seulement.
  perform set_config('petits_pas.payment_write', 'on', true);

  if p_status = 'paid' then
    if p_amount is null or p_amount < 0 or p_currency not in ('XOF', 'EUR') then
      raise exception 'Montant ou devise invalide.' using errcode = 'PP422';
    end if;
    update public.consultations
    set payment_status = 'paid', paid_amount = p_amount, paid_currency = p_currency, paid_at = coalesce(p_paid_at, now()),
        payment_method = p_method, payment_reference = nullif(trim(p_reference), '')
    where id = p_consultation_id
    returning * into c;

  elsif p_status = 'refunded' then
    select * into earning from public.professional_earnings where consultation_id = p_consultation_id for update;
    if found and earning.payout_id is not null then
      raise exception 'Le gain de cette consultation est déjà demandé ou versé au professionnel.' using errcode = 'PP409';
    end if;
    -- Gain pas encore demandé : retiré (la consultation remboursée ne rapporte rien).
    delete from public.professional_earnings where consultation_id = p_consultation_id and payout_id is null;
    update public.consultations
    set payment_status = 'refunded', payment_reference = coalesce(nullif(trim(p_reference), ''), payment_reference)
    where id = p_consultation_id
    returning * into c;

  else
    raise exception 'Statut de paiement invalide.' using errcode = 'check_violation';
  end if;

  perform set_config('petits_pas.payment_write', 'off', true);
  return c;
end;
$$;

revoke execute on function public.admin_record_payment(uuid, text, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.admin_record_payment(uuid, text, numeric, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Liste d'administration : ajout du paiement (la forme du résultat change : on recrée la fonction).
-- ---------------------------------------------------------------------------

drop function public.admin_list_consultations(text, integer, integer);

create function public.admin_list_consultations(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  type text,
  requested_specialty text,
  status text,
  country text,
  scheduled_at timestamptz,
  for_child boolean,
  professional_name text,
  price_amount numeric,
  price_currency text,
  payment_status text,
  paid_amount numeric,
  paid_currency text,
  paid_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.id, c.created_at, c.type, c.requested_specialty, c.status, c.country, c.scheduled_at,
           c.child_ref is not null,
           nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
           c.price_amount, c.price_currency, c.payment_status, c.paid_amount, c.paid_currency, c.paid_at,
           count(*) over ()
    from public.consultations c
    left join public.professionals p on p.id = c.professional_id
    where p_status is null or c.status = p_status
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.admin_list_consultations(text, integer, integer) from public, anon;
grant execute on function public.admin_list_consultations(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Règles générales des consultations : l'enregistrement d'un paiement par un administrateur
-- (consultation terminée comprise) n'est pas une modification de la demande.
-- Reprise de la version précédente, avec cette seule exception en tête.
-- ---------------------------------------------------------------------------

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

  -- Paiement enregistré par un administrateur (admin_record_payment) : seules les colonnes de paiement changent.
  if tg_op = 'UPDATE' and public.payment_write_allowed() then
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
