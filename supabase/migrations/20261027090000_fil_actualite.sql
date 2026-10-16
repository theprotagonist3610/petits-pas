-- Fil d'actualité : informer surtout les parents, comme un fil Facebook.
--
--   * Publication : un texte et une photo facultative ; créée par un parent, un professionnel, ou un
--     administrateur au nom de l'équipe Petits Pas.
--   * Sous une publication : les parents posent des questions, les professionnels (et l'équipe) y répondent.
--   * Seuls les administrateurs suppriment, et la suppression est douce (masquée, pas effacée).
--   * Lecture ouverte à tous, même sans compte. Nom des parents affiché sous la forme « Afi A. ».
--   * L'auteur affiché est fixé par la base à la création (le client ne peut pas se faire passer pour un autre).

-- ---------------------------------------------------------------------------
-- Photos du fil (bucket public : le fil est lisible par tous)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feed-images', 'feed-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "connecté : dépose une photo pour le fil"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feed-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Publications et commentaires
-- ---------------------------------------------------------------------------

create table public.feed_posts (
  id                 uuid primary key default gen_random_uuid(),
  author_id          uuid references auth.users (id) on delete set null,
  -- parent · professional · team (administrateur au nom de l'équipe Petits Pas)
  author_role        text not null check (author_role in ('parent', 'professional', 'team')),
  -- Instantané de l'auteur, fixé par la base à la création.
  author_name        text not null check (char_length(author_name) <= 120),
  author_detail      text check (char_length(author_detail) <= 120),
  author_avatar_path text check (char_length(author_avatar_path) <= 200),
  body               text not null check (char_length(btrim(body)) between 1 and 3000),
  image_path         text check (char_length(image_path) <= 200),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references auth.users (id) on delete set null
);

create index feed_posts_recent_idx on public.feed_posts (created_at desc) where deleted_at is null;

create table public.feed_comments (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.feed_posts (id) on delete cascade,
  -- null : question d'un parent · sinon : réponse à cette question
  reply_to           uuid references public.feed_comments (id) on delete cascade,
  author_id          uuid references auth.users (id) on delete set null,
  author_role        text not null check (author_role in ('parent', 'professional', 'team')),
  author_name        text not null check (char_length(author_name) <= 120),
  author_detail      text check (char_length(author_detail) <= 120),
  author_avatar_path text check (char_length(author_avatar_path) <= 200),
  body               text not null check (char_length(btrim(body)) between 1 and 1500),
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references auth.users (id) on delete set null
);

create index feed_comments_post_idx on public.feed_comments (post_id, created_at);

-- Auteur fixé par la base : le client demande seulement un rôle (« publier en tant que »), vérifié ici.
create or replace function public.feed_set_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pro public.professionals;
  parent public.parents;
begin
  if auth.uid() is null then
    return new; -- service_role / SQL Editor (données de démo…)
  end if;
  new.author_id := auth.uid();
  new.created_at := now();
  new.deleted_at := null;
  new.deleted_by := null;

  if new.author_role = 'team' then
    if not public.is_admin() then
      raise exception 'Réservé aux administrateurs.' using errcode = 'insufficient_privilege';
    end if;
    new.author_name := 'Équipe Petits Pas';
    new.author_detail := null;
    new.author_avatar_path := null;
  elsif new.author_role = 'professional' then
    select * into pro from public.professionals where id = public.current_professional_id();
    if not found then
      raise exception 'Réservé aux professionnels vérifiés.' using errcode = 'insufficient_privilege';
    end if;
    new.author_name := pro.first_name || ' ' || pro.last_name;
    new.author_detail := (select s.label from public.specialties s where s.code = pro.specialty);
    new.author_avatar_path := pro.avatar_path;
  else
    select * into parent from public.parents where id = auth.uid();
    if not found then
      raise exception 'Créez votre compte parent pour participer.' using errcode = 'insufficient_privilege';
    end if;
    new.author_role := 'parent';
    -- Minimisation : prénom et initiale du nom seulement.
    new.author_name := coalesce(nullif(trim(parent.first_name), ''), 'Parent')
      || coalesce(' ' || nullif(left(trim(parent.last_name), 1), '') || '.', '');
    new.author_detail := null;
    new.author_avatar_path := null;
  end if;
  return new;
end;
$$;

create trigger feed_posts_set_author
  before insert on public.feed_posts
  for each row execute function public.feed_set_author();

create trigger feed_comments_set_author
  before insert on public.feed_comments
  for each row execute function public.feed_set_author();

-- Photo d'une publication : seulement dans le dossier de son auteur.
create or replace function public.feed_guard_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.image_path is not null and split_part(new.image_path, '/', 1) <> auth.uid()::text then
    raise exception 'Photo invalide.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger feed_posts_guard
  before insert on public.feed_posts
  for each row execute function public.feed_guard_post();

-- Questions (parents) et réponses (professionnels, équipe), sous une publication visible.
create or replace function public.feed_guard_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  question public.feed_comments;
begin
  if auth.uid() is null then
    return new;
  end if;
  if not exists (select 1 from public.feed_posts p where p.id = new.post_id and p.deleted_at is null) then
    raise exception 'Publication introuvable.' using errcode = 'no_data_found';
  end if;
  if new.reply_to is null then
    if new.author_role <> 'parent' then
      raise exception 'Les questions sont posées par les parents.' using errcode = 'insufficient_privilege';
    end if;
  else
    if new.author_role not in ('professional', 'team') then
      raise exception 'Seuls les professionnels répondent aux questions.' using errcode = 'insufficient_privilege';
    end if;
    select * into question from public.feed_comments where id = new.reply_to;
    if not found or question.post_id <> new.post_id or question.reply_to is not null or question.deleted_at is not null then
      raise exception 'Question introuvable.' using errcode = 'no_data_found';
    end if;
  end if;
  return new;
end;
$$;

-- Après feed_comments_set_author (ordre alphabétique des triggers), le rôle est donc vérifié.
create trigger feed_comments_t_guard
  before insert on public.feed_comments
  for each row execute function public.feed_guard_comment();

-- Mise en veille : pas de nouvelles publications ni de commentaires.
create trigger feed_posts_platform_open
  before insert on public.feed_posts
  for each row execute function public.guard_platform_open();

create trigger feed_comments_platform_open
  before insert on public.feed_comments
  for each row execute function public.guard_platform_open();

-- Suppression douce : seule la date de suppression change (par un administrateur).
create or replace function public.feed_guard_soft_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.body is distinct from old.body or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Seule la suppression est possible.' using errcode = 'check_violation';
  end if;
  new.deleted_by := case when new.deleted_at is null then null else auth.uid() end;
  return new;
end;
$$;

create trigger feed_posts_soft_delete
  before update on public.feed_posts
  for each row execute function public.feed_guard_soft_delete();

create trigger feed_comments_soft_delete
  before update on public.feed_comments
  for each row execute function public.feed_guard_soft_delete();

-- ---------------------------------------------------------------------------
-- Accès
-- ---------------------------------------------------------------------------

alter table public.feed_posts enable row level security;
alter table public.feed_comments enable row level security;
-- Jamais de suppression réelle depuis l'application.
revoke delete on public.feed_posts, public.feed_comments from anon, authenticated;

create policy "tous : lit le fil"
  on public.feed_posts for select to anon, authenticated
  using (deleted_at is null or (select public.is_admin()));

create policy "connecté : publie"
  on public.feed_posts for insert to authenticated
  with check (true); -- auteur et rôle vérifiés par feed_set_author

create policy "administrateur : supprime une publication"
  on public.feed_posts for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "tous : lit les questions et réponses"
  on public.feed_comments for select to anon, authenticated
  using (deleted_at is null or (select public.is_admin()));

create policy "connecté : pose une question ou répond"
  on public.feed_comments for insert to authenticated
  with check (true); -- auteur, rôle et règles vérifiés par les triggers

create policy "administrateur : supprime un commentaire"
  on public.feed_comments for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Nouvelles publications et réponses en direct.
alter publication supabase_realtime add table public.feed_posts, public.feed_comments;
