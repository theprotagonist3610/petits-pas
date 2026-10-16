-- Garantit que tout compte parent a sa ligne dans public.parents.
--
-- Le trigger d'inscription la crée normalement. Mais un compte peut en être dépourvu
-- (créé avant une migration, trigger en échec…). L'application appelle alors
-- ensure_parent_profile() à la connexion : le profil est créé à partir des informations
-- du compte (Google ou formulaire d'inscription), puis le parent est invité à le compléter.

-- Création du profil à partir de auth.users ; partagée par le trigger et ensure_parent_profile.
create or replace function public.create_parent_profile(user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u          auth.users%rowtype;
  meta       jsonb;
  claims     jsonb;
  full_name  text;
  first_name text;
  last_name  text;
begin
  select * into u from auth.users where id = user_id;
  if not found then
    return;
  end if;

  meta   := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  claims := coalesce(meta -> 'custom_claims', '{}'::jsonb);
  if meta ->> 'account_type' = 'professional' then
    return;
  end if;

  full_name := trim(coalesce(meta ->> 'full_name', meta ->> 'name', ''));
  first_name := coalesce(
    nullif(trim(meta ->> 'first_name'), ''),
    nullif(trim(meta ->> 'given_name'), ''),
    nullif(trim(claims ->> 'given_name'), ''),
    nullif(split_part(full_name, ' ', 1), ''),
    ''
  );
  last_name := coalesce(
    nullif(trim(meta ->> 'last_name'), ''),
    nullif(trim(meta ->> 'family_name'), ''),
    nullif(trim(claims ->> 'family_name'), ''),
    nullif(trim(substr(full_name, char_length(split_part(full_name, ' ', 1)) + 1)), ''),
    ''
  );

  insert into public.parents (id, last_name, first_name, sex, birth_date, profession, phone, email, country)
  values (
    u.id,
    left(last_name, 100),
    left(first_name, 100),
    nullif(meta ->> 'sex', ''),
    nullif(meta ->> 'birth_date', '')::date,
    nullif(trim(meta ->> 'profession'), ''),
    coalesce(nullif(trim(meta ->> 'phone'), ''), u.phone),
    u.email,
    nullif(meta ->> 'country', '')
  )
  on conflict (id) do nothing;
end;
$$;

-- Réservée au trigger et à ensure_parent_profile : personne ne crée le profil d'un autre.
revoke execute on function public.create_parent_profile(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_parent_profile(new.id);
  return new;
end;
$$;

-- Profil du parent connecté, créé au besoin.
create or replace function public.ensure_parent_profile()
returns public.parents
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.parents;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'insufficient_privilege';
  end if;
  perform public.create_parent_profile(auth.uid());
  select * into profile from public.parents where id = auth.uid();
  return profile;
end;
$$;

revoke execute on function public.ensure_parent_profile() from public, anon;
grant execute on function public.ensure_parent_profile() to authenticated;

-- Rattrapage : comptes existants sans profil (hors professionnels).
select public.create_parent_profile(u.id)
from auth.users u
where not exists (select 1 from public.parents p where p.id = u.id);
