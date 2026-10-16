-- Tableau de bord d'administration : indicateurs, consultations et parents.
--
-- Minimisation (APDP) : l'administrateur gère la plateforme, il ne soigne pas. Ces fonctions ne renvoient
-- jamais le motif d'une consultation (donnée de santé), ni les informations sur l'enfant, ni le téléphone.
-- Toutes exigent un administrateur connecté avec double authentification (is_admin).

-- ---------------------------------------------------------------------------
-- Indicateurs
-- ---------------------------------------------------------------------------

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'consultations', (select count(*) from public.consultations),
    'consultations_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from public.consultations group by status) s
    ),
    'professionals', (select count(*) from public.professionals),
    'professionals_operational', (
      select count(*) from public.professionals where is_active and verified_at is not null and avatar_path is not null
    ),
    'professionals_to_verify', (select count(*) from public.professionals where is_active and verified_at is null),
    'parents', (select count(*) from public.parents),
    'parents_last_30_days', (select count(*) from public.parents where created_at >= now() - interval '30 days')
  );
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Consultations (métadonnées uniquement), de la plus récente à la plus ancienne
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_consultations(
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
-- Parents : identité, e-mail, pays, inscription, nombre de consultations
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_parents(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  country text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  consultations_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pattern text := '%' || replace(replace(replace(coalesce(trim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select pa.id, pa.first_name, pa.last_name, pa.email, pa.country, pa.created_at, u.last_sign_in_at,
           (select count(*) from public.consultations c where c.parent_id = pa.id),
           count(*) over ()
    from public.parents pa
    left join auth.users u on u.id = pa.id
    where p_search is null or trim(p_search) = ''
       or (pa.first_name || ' ' || pa.last_name) ilike pattern
       or (pa.last_name || ' ' || pa.first_name) ilike pattern
       or pa.email ilike pattern
    order by pa.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.admin_list_parents(text, integer, integer) from public, anon;
grant execute on function public.admin_list_parents(text, integer, integer) to authenticated;
