import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConversationKeyRow, ConversationRow, Database, MessageRow, UserKeysRow } from './database.types'
import {
  DecryptionError,
  decryptMessage,
  encryptMessage,
  generateConversationKey,
  generateKeyPair,
  keyMatches,
  openConversationKey,
  sealConversationKey,
  unwrapPrivateKey,
  wrapPrivateKey,
} from './crypto'

/*
 * Messagerie chiffrée, commune à l'application parents et à Petits Pas Pro.
 * Les fonctions lèvent les erreurs (Supabase, WrongSecretCodeError…) : chaque application les traduit.
 */

/** Où chaque application garde la clé privée déverrouillée (téléphone du parent, onglet du professionnel). */
export interface PrivateKeyStore {
  get(userId: string): Promise<string | null>
  set(userId: string, privateKey: string): Promise<void>
  clear(userId: string): Promise<void>
}

/**
 * - `none` : pas encore de clés (choisir un code secret) ;
 * - `locked` : clés sur le serveur, mais pas sur cet appareil (saisir le code secret) ;
 * - `ready` : messagerie utilisable.
 */
export type KeyStatus = 'none' | 'locked' | 'ready'

export { CONVERSATION_DAYS } from './messagingRules'

export interface DecryptedMessage {
  id: string
  senderId: string
  mine: boolean
  /** `null` : message illisible (clés réinitialisées depuis son envoi). */
  text: string | null
  createdAt: string
}

export interface OpenedConversation {
  conversation: ConversationRow
  /** Clé de conversation déchiffrée, ou `null` en attente de l'autre participant. */
  key: string | null
}

/** Le canal accepte-t-il encore des messages ? */
export const isOpen = (c: Pick<ConversationRow, 'opens_at' | 'closes_at'>, now: Date = new Date()) =>
  new Date(c.opens_at) <= now && now < new Date(c.closes_at)

/** Jours restants avant la fermeture (arrondis au supérieur, 0 si fermé). */
export function daysLeft(c: Pick<ConversationRow, 'closes_at'>, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(c.closes_at).getTime() - now.getTime()) / 86_400_000))
}

const wrappedOf = (row: UserKeysRow) => ({
  wrappedPrivateKey: row.wrapped_private_key,
  salt: row.salt,
  nonce: row.nonce,
  kdfIterations: row.kdf_iterations,
  kdfMemoryKiB: row.kdf_memory_kib,
})

/**
 * Clé de conversation à utiliser, et clés à (re)sceller pour les participants.
 * Fonction pure, testée à part : c'est le cœur de la gestion des clés.
 */
export function planConversationKeys(input: {
  myId: string
  /** Le professionnel crée la clé de conversation ; le parent ne fait que la recevoir. */
  amCreator: boolean
  publicKeys: { userId: string; publicKey: string | null }[]
  rows: Pick<ConversationKeyRow, 'user_id' | 'sealed_key' | 'sealed_for'>[]
}): { openMine: string | null; createNew: boolean } {
  const current = new Map(input.publicKeys.map((k) => [k.userId, k.publicKey]))
  const valid = input.rows.filter((r) => r.sealed_for === current.get(r.user_id))
  const mine = valid.find((r) => r.user_id === input.myId)
  if (mine) return { openMine: mine.sealed_key, createNew: false }
  // Personne n'a de clé valide (premier échange, ou tout le monde a réinitialisé) : le créateur en génère une.
  return { openMine: null, createNew: input.amCreator && valid.length === 0 }
}

export function createMessagingService(client: SupabaseClient<Database>, store: PrivateKeyStore) {
  async function myKeyRow(userId: string): Promise<UserKeysRow | null> {
    const { data, error } = await client.from('user_keys').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw error
    return data
  }

  async function saveKeys(userId: string, secretCode: string, mode: 'insert' | 'update'): Promise<void> {
    const pair = await generateKeyPair()
    const wrapped = await wrapPrivateKey(pair.privateKey, secretCode)
    const row = {
      public_key: pair.publicKey,
      wrapped_private_key: wrapped.wrappedPrivateKey,
      salt: wrapped.salt,
      nonce: wrapped.nonce,
      kdf_iterations: wrapped.kdfIterations,
      kdf_memory_kib: wrapped.kdfMemoryKiB,
    }
    const { error } =
      mode === 'insert'
        ? await client.from('user_keys').insert({ user_id: userId, ...row })
        : await client.from('user_keys').update(row).eq('user_id', userId)
    if (error) throw error
    await store.set(userId, pair.privateKey)
  }

  /** Scelle la clé de conversation pour chaque participant qui n'en a pas de valide. */
  async function sealFor(conversationId: string, key: string, publicKeys: { userId: string; publicKey: string | null }[], rows: ConversationKeyRow[]) {
    const upserts = []
    for (const { userId, publicKey } of publicKeys) {
      if (!publicKey) continue // Clés pas encore créées : sera scellé plus tard.
      if (rows.some((r) => r.user_id === userId && r.sealed_for === publicKey)) continue
      upserts.push({ conversation_id: conversationId, user_id: userId, sealed_key: await sealConversationKey(key, publicKey), sealed_for: publicKey })
    }
    if (upserts.length === 0) return
    const { error } = await client.from('conversation_keys').upsert(upserts, { onConflict: 'conversation_id,user_id' })
    if (error) throw error
  }

  return {
    async keyStatus(userId: string): Promise<KeyStatus> {
      const row = await myKeyRow(userId)
      if (!row) return 'none'
      const local = await store.get(userId)
      if (local && (await keyMatches(local, row.public_key))) return 'ready'
      // Clé locale absente, ou périmée (code réinitialisé sur un autre appareil).
      if (local) await store.clear(userId)
      return 'locked'
    },

    /** Première fois : crée la paire de clés protégée par le code secret. */
    setupKeys: (userId: string, secretCode: string) => saveKeys(userId, secretCode, 'insert'),

    /** Nouvel appareil : retrouve la clé privée avec le code secret. */
    async unlock(userId: string, secretCode: string): Promise<void> {
      const row = await myKeyRow(userId)
      if (!row) throw new Error('no_keys')
      await store.set(userId, await unwrapPrivateKey(wrappedOf(row), secretCode))
    },

    /**
     * Code secret oublié : nouvelle paire de clés. Les conversations en cours redeviennent lisibles
     * dès que l'autre participant ouvre la conversation (il scelle à nouveau la clé pour la nouvelle clé publique).
     */
    resetKeys: (userId: string, secretCode: string) => saveKeys(userId, secretCode, 'update'),

    async conversationFor(consultationId: string): Promise<ConversationRow | null> {
      const { data, error } = await client.from('conversations').select('*').eq('consultation_id', consultationId).maybeSingle()
      if (error) throw error
      return data
    },

    async listConversations(): Promise<ConversationRow[]> {
      const { data, error } = await client.from('conversations').select('*').order('opens_at', { ascending: false })
      if (error) throw error
      return data
    },

    /** Ouvre une conversation : déchiffre sa clé, la crée ou la scelle pour l'autre participant si besoin. */
    async open(conversation: ConversationRow, userId: string): Promise<OpenedConversation> {
      const privateKey = await store.get(userId)
      if (!privateKey) throw new Error('locked')
      const [keys, rowsResult] = await Promise.all([
        client.rpc('conversation_public_keys', { p_conversation_id: conversation.id }),
        client.from('conversation_keys').select('*').eq('conversation_id', conversation.id),
      ])
      if (keys.error) throw keys.error
      if (rowsResult.error) throw rowsResult.error
      const publicKeys = keys.data.map((k) => ({ userId: k.user_id, publicKey: k.public_key }))
      const rows = rowsResult.data
      const myPublicKey = publicKeys.find((k) => k.userId === userId)?.publicKey
      if (!myPublicKey) throw new Error('locked')

      const plan = planConversationKeys({ myId: userId, amCreator: userId === conversation.professional_user_id, publicKeys, rows })
      let key: string | null = null
      if (plan.openMine) key = await openConversationKey(plan.openMine, myPublicKey, privateKey)
      else if (plan.createNew) key = await generateConversationKey()
      // Nouvelle clé, ou participant qui a changé de clés : on scelle pour lui.
      if (key) await sealFor(conversation.id, key, publicKeys, plan.createNew ? [] : rows)
      return { conversation, key }
    },

    async messages(conversationId: string, key: string, userId: string): Promise<DecryptedMessage[]> {
      const { data, error } = await client.from('messages').select('*').eq('conversation_id', conversationId).order('created_at')
      if (error) throw error
      return Promise.all(data.map((m) => decrypt(m, key, userId)))
    },

    async send(conversationId: string, key: string, text: string): Promise<void> {
      const { ciphertext, nonce } = await encryptMessage(text, key)
      const { error } = await client.from('messages').insert({ conversation_id: conversationId, ciphertext, nonce })
      if (error) throw error
    },

    /** Nouveaux messages en temps réel (les règles d'accès s'appliquent aussi ici). Renvoie la fonction d'arrêt. */
    subscribe(conversationId: string, onMessage: (row: MessageRow) => void): () => void {
      const channel = client
        .channel(`messages-${conversationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) =>
          onMessage(payload.new as MessageRow),
        )
        .subscribe()
      return () => void client.removeChannel(channel)
    },

    decrypt: (row: MessageRow, key: string, userId: string) => decrypt(row, key, userId),
  }
}

async function decrypt(row: MessageRow, key: string, userId: string): Promise<DecryptedMessage> {
  let text: string | null
  try {
    text = (await decryptMessage(row.ciphertext, row.nonce, key)).text
  } catch (error) {
    if (!(error instanceof DecryptionError)) throw error
    text = null
  }
  return { id: row.id, senderId: row.sender_id, mine: row.sender_id === userId, text, createdAt: row.created_at }
}

export type MessagingService = ReturnType<typeof createMessagingService>
