-- Photo de profil obligatoire pour les professionnels, stockée dans Supabase Storage.
--
-- * Bucket privé : visible des utilisateurs connectés (parents et professionnels), pas public sur Internet.
-- * Chaque professionnel écrit uniquement dans son dossier : professional-avatars/<son user_id>/…
-- * Sans photo, un professionnel n'a accès à aucune demande (current_professional_id renvoie null).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-avatars', 'professional-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Chemin de la photo dans le bucket, toujours dans le dossier du professionnel lui-même.
alter table public.professionals
  add column avatar_path text check (char_length(avatar_path) <= 200),
  add constraint professionals_avatar_in_own_folder
    check (avatar_path is null or (user_id is not null and split_part(avatar_path, '/', 1) = user_id::text));

comment on column public.professionals.avatar_path is 'Photo de profil (bucket professional-avatars), obligatoire pour accéder aux demandes.';

-- Le professionnel peut changer sa photo (en plus de ses coordonnées).
grant update (avatar_path) on public.professionals to authenticated;

-- ---------------------------------------------------------------------------
-- Accès au bucket
-- ---------------------------------------------------------------------------

create policy "connecté : voit les photos des professionnels"
  on storage.objects for select to authenticated
  using (bucket_id = 'professional-avatars');

create policy "professionnel : dépose sa photo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'professional-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_mfa())
    and exists (select 1 from public.professionals p where p.user_id = (select auth.uid()))
  );

create policy "professionnel : remplace sa photo"
  on storage.objects for update to authenticated
  using (bucket_id = 'professional-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.has_mfa()))
  with check (bucket_id = 'professional-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "professionnel : supprime son ancienne photo"
  on storage.objects for delete to authenticated
  using (bucket_id = 'professional-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.has_mfa()));

-- ---------------------------------------------------------------------------
-- Professionnel « opérationnel » : actif, vérifié, double authentification ET photo de profil.
-- ---------------------------------------------------------------------------

create or replace function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.professionals
  where user_id = auth.uid() and is_active and verified_at is not null and avatar_path is not null and public.has_mfa()
$$;

create or replace function public.current_professional_specialty()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select specialty from public.professionals
  where user_id = auth.uid() and is_active and verified_at is not null and avatar_path is not null and public.has_mfa()
$$;

create or replace function public.current_professional_country()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select country from public.professionals
  where user_id = auth.uid() and is_active and verified_at is not null and avatar_path is not null and public.has_mfa()
$$;
