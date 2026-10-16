-- Messagerie chiffrée de bout en bout entre le parent et le professionnel d'une téléconsultation.
--
-- * Ouverte automatiquement quand le professionnel confirme une téléconsultation, pour 10 jours.
-- * Le serveur ne stocke que des données chiffrées : clés publiques, clés privées chiffrées par le code
--   secret de chaque utilisateur (Argon2id), clés de conversation scellées, messages chiffrés.
-- * La base impose la fenêtre de 10 jours : aucun message ne peut être écrit en dehors.

-- ---------------------------------------------------------------------------
-- Clés des utilisateurs
-- ---------------------------------------------------------------------------

create table public.user_keys (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  public_key          text not null check (char_length(public_key) between 40 and 64),
  -- Clé privée chiffrée par le code secret de l'utilisateur : illisible pour le serveur.
  wrapped_private_key text not null check (char_length(wrapped_private_key) <= 200),
  salt                text not null check (char_length(salt) <= 64),
  nonce               text not null check (char_length(nonce) <= 64),
  kdf_iterations      smallint not null check (kdf_iterations between 1 and 20),
  kdf_memory_kib      integer not null check (kdf_memory_kib between 8192 and 1048576),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.user_keys is 'Clés de messagerie : publique en clair, privée chiffrée par le code secret de l''utilisateur.';

create trigger user_keys_updated_at
  before update on public.user_keys
  for each row execute function public.set_updated_at();

alter table public.user_keys enable row level security;
revoke all on public.user_keys from anon;
revoke delete on public.user_keys from authenticated;

create policy "lit sa clé"
  on public.user_keys for select to authenticated
  using (user_id = (select auth.uid()));

create policy "crée sa clé"
  on public.user_keys for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Code secret oublié : l'utilisateur remplace sa paire de clés.
create policy "remplace sa clé"
  on public.user_keys for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  consultation_id       uuid not null unique references public.consultations (id) on delete cascade,
  parent_id             uuid not null references auth.users (id) on delete cascade,
  professional_user_id  uuid not null references auth.users (id) on delete cascade,
  opens_at              timestamptz not null default now(),
  closes_at             timestamptz not null,
  created_at            timestamptz not null default now(),
  check (closes_at > opens_at)
);

comment on table public.conversations is 'Canal de messagerie d''une téléconsultation, ouvert 10 jours à partir de la confirmation.';

create index conversations_parent_idx on public.conversations (parent_id, opens_at desc);
create index conversations_professional_idx on public.conversations (professional_user_id, opens_at desc);

alter table public.conversations enable row level security;
revoke all on public.conversations from anon;
revoke insert, update, delete on public.conversations from authenticated;

-- Participant : le parent, ou le professionnel connecté avec double authentification.
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.parent_id = auth.uid() or (c.professional_user_id = auth.uid() and public.has_mfa()))
  )
$$;

revoke execute on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

create policy "participant : lit la conversation"
  on public.conversations for select to authenticated
  using (parent_id = (select auth.uid()) or (professional_user_id = (select auth.uid()) and (select public.has_mfa())));

-- Ouverture à la confirmation d'une téléconsultation ; fermeture anticipée si elle est annulée.
create or replace function public.sync_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'teleconsultation' and new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    insert into public.conversations (consultation_id, parent_id, professional_user_id, opens_at, closes_at)
    select new.id, new.parent_id, p.user_id, now(), now() + interval '10 days'
    from public.professionals p
    where p.id = new.professional_id and p.user_id is not null
    on conflict (consultation_id) do nothing;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.conversations set closes_at = greatest(opens_at + interval '1 second', least(closes_at, now()))
    where consultation_id = new.id;
  end if;
  return new;
end;
$$;

create trigger consultations_sync_conversation
  after update on public.consultations
  for each row execute function public.sync_conversation();

-- Rattrapage : téléconsultations déjà confirmées avant cette migration (10 jours à partir de maintenant).
insert into public.conversations (consultation_id, parent_id, professional_user_id, opens_at, closes_at)
select c.id, c.parent_id, p.user_id, now(), now() + interval '10 days'
from public.consultations c
join public.professionals p on p.id = c.professional_id
where c.type = 'teleconsultation' and c.status = 'confirmed' and p.user_id is not null
on conflict (consultation_id) do nothing;

-- Clés publiques des deux participants (pour sceller la clé de conversation).
create or replace function public.conversation_public_keys(p_conversation_id uuid)
returns table (user_id uuid, role text, public_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.parent_id, 'parent', k.public_key
  from public.conversations c left join public.user_keys k on k.user_id = c.parent_id
  where c.id = p_conversation_id and public.is_conversation_participant(p_conversation_id)
  union all
  select c.professional_user_id, 'professional', k.public_key
  from public.conversations c left join public.user_keys k on k.user_id = c.professional_user_id
  where c.id = p_conversation_id and public.is_conversation_participant(p_conversation_id)
$$;

revoke execute on function public.conversation_public_keys(uuid) from public, anon;
grant execute on function public.conversation_public_keys(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clés de conversation scellées (une par participant)
-- ---------------------------------------------------------------------------

create table public.conversation_keys (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- Clé de conversation scellée pour ce participant (crypto_box_seal).
  sealed_key      text not null check (char_length(sealed_key) <= 200),
  -- Clé publique utilisée pour sceller : si le participant change de clés, il faut sceller à nouveau.
  sealed_for      text not null check (char_length(sealed_for) <= 64),
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_keys enable row level security;
revoke all on public.conversation_keys from anon;
revoke delete on public.conversation_keys from authenticated;

create policy "participant : lit les clés scellées"
  on public.conversation_keys for select to authenticated
  using ((select public.is_conversation_participant(conversation_id)));

-- Un participant scelle la clé pour lui-même ou pour l'autre participant, jamais pour un tiers.
create policy "participant : scelle la clé"
  on public.conversation_keys for insert to authenticated
  with check (
    (select public.is_conversation_participant(conversation_id))
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and user_id in (c.parent_id, c.professional_user_id)
    )
  );

create policy "participant : scelle à nouveau la clé"
  on public.conversation_keys for update to authenticated
  using ((select public.is_conversation_participant(conversation_id)))
  with check ((select public.is_conversation_participant(conversation_id)));

-- ---------------------------------------------------------------------------
-- Messages chiffrés
-- ---------------------------------------------------------------------------

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ciphertext      text not null check (char_length(ciphertext) <= 20000),
  nonce           text not null check (char_length(nonce) <= 64),
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;
revoke all on public.messages from anon;
-- Un message envoyé ne se modifie pas et ne se supprime pas (purge automatique après la fermeture).
revoke update, delete on public.messages from authenticated;

create policy "participant : lit les messages"
  on public.messages for select to authenticated
  using ((select public.is_conversation_participant(conversation_id)));

create policy "participant : écrit pendant les 10 jours"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_conversation_participant(conversation_id))
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and now() between c.opens_at and c.closes_at
    )
  );

alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- Purge : messages supprimés 30 jours après la fermeture du canal (durée à aligner sur
-- la politique de confidentialité). Planifiée chaque nuit si l'extension pg_cron est activée
-- (Database › Extensions › pg_cron) ; sinon, à lancer manuellement.
-- ---------------------------------------------------------------------------

create or replace function public.purge_closed_conversations(retention interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.messages m
  using public.conversations c
  where m.conversation_id = c.id and c.closes_at < now() - retention;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.purge_closed_conversations(interval) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-messages-fermes', '0 3 * * *', 'select public.purge_closed_conversations()');
  end if;
end;
$$;
