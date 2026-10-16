-- Fil d'actualité : validation des publications des parents par un administrateur avant diffusion.
--
--   * Publication d'un parent : créée « en attente » ; visible seulement par son auteur (et les administrateurs).
--   * Un administrateur la valide (visible de tous) ou la refuse avec un motif (visible par l'auteur seul).
--   * Publications des professionnels vérifiés et de l'équipe : publiées directement.
--   * Le statut est fixé par la base : un parent ne peut pas se publier lui-même.
--   * Aucune écriture sans compte, jamais (rappel explicite ci-dessous).

alter table public.feed_posts
  add column status           text not null default 'published' check (status in ('pending', 'published', 'rejected')),
  add column reviewed_at      timestamptz,
  add column reviewed_by      uuid references auth.users (id) on delete set null,
  add column rejection_reason text check (char_length(rejection_reason) <= 500);

comment on column public.feed_posts.status is 'pending : en attente de validation (visible par l''auteur seul) · published : visible de tous · rejected : refusée.';

create index feed_posts_pending_idx on public.feed_posts (created_at) where status = 'pending' and deleted_at is null;

-- Statut à la création, selon l'auteur réellement retenu par feed_set_author (trigger exécuté avant celui-ci :
-- les triggers d'une même table s'exécutent dans l'ordre alphabétique de leur nom).
create or replace function public.feed_set_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new; -- service_role / SQL Editor
  end if;
  new.status := case when new.author_role = 'parent' then 'pending' else 'published' end;
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.rejection_reason := null;
  return new;
end;
$$;

create trigger feed_posts_z_status
  before insert on public.feed_posts
  for each row execute function public.feed_set_status();

-- Modification (administrateurs) : suppression douce ou validation ; le texte et l'auteur ne changent jamais.
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
    raise exception 'Seules la suppression et la validation sont possibles.' using errcode = 'check_violation';
  end if;
  new.deleted_by := case when new.deleted_at is null then null else coalesce(old.deleted_by, auth.uid()) end;
  -- Validation : seulement pour les publications (les commentaires n'ont pas de statut ; la condition interne
  -- n'est évaluée que pour feed_posts).
  if tg_table_name = 'feed_posts' then
    if new.status is distinct from old.status then
      if new.status = 'pending' then
        raise exception 'Une publication ne repasse pas en attente.' using errcode = 'check_violation';
      end if;
      if new.status = 'rejected' and char_length(trim(coalesce(new.rejection_reason, ''))) = 0 then
        raise exception 'Indiquez le motif du refus.' using errcode = 'check_violation';
      end if;
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
      if new.status = 'published' then
        new.rejection_reason := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Lecture : publications validées pour tous ; ses propres publications (en attente ou refusées) pour l'auteur.
drop policy "tous : lit le fil" on public.feed_posts;
create policy "tous : lit le fil"
  on public.feed_posts for select to anon, authenticated
  using (
    (deleted_at is null and status = 'published')
    or (deleted_at is null and author_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- Questions seulement sous une publication validée et visible.
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
  if not exists (select 1 from public.feed_posts p where p.id = new.post_id and p.deleted_at is null and p.status = 'published') then
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

-- ---------------------------------------------------------------------------
-- Sans compte : lecture seulement, jamais d'écriture (publications, commentaires, photos).
-- Les politiques d'écriture ne visent déjà que les utilisateurs connectés ; ce retrait des droits le rend explicite.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.feed_posts, public.feed_comments from anon;
