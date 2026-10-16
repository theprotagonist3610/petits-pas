-- Un administrateur exerce aussi comme professionnel : il crée sa propre fiche professionnelle.
--
-- Les professionnels sont normalement créés par invitation (fonction invite-professional), qui refuse un e-mail
-- déjà inscrit. Un administrateur, lui, a déjà un compte : cette fonction rattache une fiche à ce compte.
-- Elle est vérifiée d'office (l'administrateur vérifie les autres) ; la photo reste obligatoire.

create or replace function public.admin_become_professional(
  p_first_name text,
  p_last_name text,
  p_specialty text,
  p_country text,
  p_license_number text default null,
  p_facility_name text default null,
  p_city text default null,
  p_phone text default null,
  p_offers_teleconsultation boolean default true,
  p_offers_appointment boolean default true
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
  if exists (select 1 from public.professionals where user_id = auth.uid()) then
    raise exception 'Ce compte a déjà une fiche professionnelle.' using errcode = 'unique_violation';
  end if;
  if not (p_offers_teleconsultation or p_offers_appointment) then
    raise exception 'Proposez au moins un type de consultation.' using errcode = 'check_violation';
  end if;

  insert into public.professionals (
    user_id, first_name, last_name, specialty, country, license_number, facility_name, city, phone, email,
    offers_teleconsultation, offers_appointment, verified_at
  )
  select auth.uid(), trim(p_first_name), trim(p_last_name), p_specialty, p_country,
         nullif(trim(p_license_number), ''), nullif(trim(p_facility_name), ''), nullif(trim(p_city), ''), nullif(trim(p_phone), ''),
         u.email, p_offers_teleconsultation, p_offers_appointment, now()
  from auth.users u
  where u.id = auth.uid()
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.admin_become_professional(text, text, text, text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.admin_become_professional(text, text, text, text, text, text, text, text, boolean, boolean) to authenticated;
