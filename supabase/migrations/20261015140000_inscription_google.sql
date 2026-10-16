-- Inscription avec Google : le profil parent est créé à partir des informations Google.
--
-- Une inscription par e-mail envoie last_name / first_name dans options.data.
-- Google, lui, fournit (dans raw_user_meta_data) : full_name / name, et selon les cas
-- given_name / family_name, éventuellement sous custom_claims. On prend la première valeur
-- disponible ; à défaut, le nom complet est coupé au premier espace (prénom, puis nom).
-- Le sexe, la date de naissance et le téléphone restent vides : l'application les demandera
-- à la première connexion (isProfileComplete côté client).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  claims     jsonb := coalesce(new.raw_user_meta_data -> 'custom_claims', '{}'::jsonb);
  full_name  text  := trim(coalesce(meta ->> 'full_name', meta ->> 'name', ''));
  first_name text;
  last_name  text;
begin
  if meta ->> 'account_type' = 'professional' then
    return new;
  end if;

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
    new.id,
    left(last_name, 100),
    left(first_name, 100),
    nullif(meta ->> 'sex', ''),
    nullif(meta ->> 'birth_date', '')::date,
    nullif(trim(meta ->> 'profession'), ''),
    coalesce(nullif(trim(meta ->> 'phone'), ''), new.phone),
    new.email,
    nullif(meta ->> 'country', '')
  )
  -- Par sécurité : ne jamais faire échouer une inscription si le profil existe déjà.
  -- (Un parent inscrit par mot de passe qui se connecte ensuite avec Google garde le même compte :
  -- Supabase relie les deux identités sans recréer d'utilisateur.)
  on conflict (id) do nothing;
  return new;
end;
$$;
