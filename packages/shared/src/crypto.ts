import sodium from 'libsodium-wrappers'
import { argon2id } from 'hash-wasm'

/*
 * Chiffrement de bout en bout de la messagerie parent ↔ professionnel.
 *
 * - Chaque compte a une paire de clés X25519 (crypto_box). La clé publique est sur le serveur ;
 *   la clé privée ne le quitte que chiffrée par le code secret de l'utilisateur (Argon2id + secretbox),
 *   ce qui permet de la retrouver sur un nouvel appareil sans que le serveur puisse la lire.
 * - Chaque conversation a une clé symétrique, « scellée » (crypto_box_seal) pour chaque participant.
 * - Chaque message est chiffré avec la clé de conversation (crypto_secretbox, XSalsa20-Poly1305).
 *
 * Le serveur ne voit que des données chiffrées, plus qui écrit à qui, quand, et la taille des messages.
 * Toutes les valeurs binaires circulent en base64 (variante URL sans remplissage de libsodium).
 */

export { SECRET_CODE_MIN_LENGTH } from './messagingRules'

/** Réglages Argon2id (enregistrés avec la clé chiffrée, pour pouvoir les durcir plus tard). */
export const KDF_DEFAULTS = { iterations: 3, memoryKiB: 65_536 } as const

export interface KeyPair {
  publicKey: string
  privateKey: string
}

/** Clé privée chiffrée par le code secret, telle que stockée sur le serveur. */
export interface WrappedPrivateKey {
  wrappedPrivateKey: string
  salt: string
  nonce: string
  kdfIterations: number
  kdfMemoryKiB: number
}

export class WrongSecretCodeError extends Error {
  constructor() {
    super('wrong_secret_code')
  }
}

export class DecryptionError extends Error {
  constructor() {
    super('decryption_failed')
  }
}

const ready = () => sodium.ready
const b64 = (bytes: Uint8Array) => sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING)
const bytes = (value: string) => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING)

async function deriveKey(secretCode: string, salt: Uint8Array, iterations: number, memoryKiB: number): Promise<Uint8Array> {
  return argon2id({
    password: secretCode.normalize('NFC'),
    salt,
    parallelism: 1,
    iterations,
    memorySize: memoryKiB,
    hashLength: sodium.crypto_secretbox_KEYBYTES,
    outputType: 'binary',
  })
}

export async function generateKeyPair(): Promise<KeyPair> {
  await ready()
  const pair = sodium.crypto_box_keypair()
  return { publicKey: b64(pair.publicKey), privateKey: b64(pair.privateKey) }
}

/** Chiffre la clé privée avec le code secret (Argon2id) avant de l'envoyer au serveur. */
export async function wrapPrivateKey(privateKey: string, secretCode: string): Promise<WrappedPrivateKey> {
  await ready()
  const salt = sodium.randombytes_buf(16)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const key = await deriveKey(secretCode, salt, KDF_DEFAULTS.iterations, KDF_DEFAULTS.memoryKiB)
  return {
    wrappedPrivateKey: b64(sodium.crypto_secretbox_easy(bytes(privateKey), nonce, key)),
    salt: b64(salt),
    nonce: b64(nonce),
    kdfIterations: KDF_DEFAULTS.iterations,
    kdfMemoryKiB: KDF_DEFAULTS.memoryKiB,
  }
}

/** Retrouve la clé privée avec le code secret. Lève `WrongSecretCodeError` si le code est faux. */
export async function unwrapPrivateKey(wrapped: WrappedPrivateKey, secretCode: string): Promise<string> {
  await ready()
  const key = await deriveKey(secretCode, bytes(wrapped.salt), wrapped.kdfIterations, wrapped.kdfMemoryKiB)
  try {
    return b64(sodium.crypto_secretbox_open_easy(bytes(wrapped.wrappedPrivateKey), bytes(wrapped.nonce), key))
  } catch {
    throw new WrongSecretCodeError()
  }
}

/** Vérifie qu'une clé privée correspond bien à une clé publique (clé locale périmée après une réinitialisation). */
export async function keyMatches(privateKey: string, publicKey: string): Promise<boolean> {
  await ready()
  return b64(sodium.crypto_scalarmult_base(bytes(privateKey))) === publicKey
}

export async function generateConversationKey(): Promise<string> {
  await ready()
  return b64(sodium.crypto_secretbox_keygen())
}

/** Scelle la clé de conversation pour un participant : seul le détenteur de la clé privée correspondante peut l'ouvrir. */
export async function sealConversationKey(conversationKey: string, recipientPublicKey: string): Promise<string> {
  await ready()
  return b64(sodium.crypto_box_seal(bytes(conversationKey), bytes(recipientPublicKey)))
}

export async function openConversationKey(sealed: string, publicKey: string, privateKey: string): Promise<string> {
  await ready()
  try {
    return b64(sodium.crypto_box_seal_open(bytes(sealed), bytes(publicKey), bytes(privateKey)))
  } catch {
    throw new DecryptionError()
  }
}

/** Contenu d'un message une fois déchiffré (versionné pour ajouter plus tard des pièces jointes). */
export interface MessageContent {
  v: 1
  text: string
}

export async function encryptMessage(text: string, conversationKey: string): Promise<{ ciphertext: string; nonce: string }> {
  await ready()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const content: MessageContent = { v: 1, text }
  const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(JSON.stringify(content)), nonce, bytes(conversationKey))
  return { ciphertext: b64(ciphertext), nonce: b64(nonce) }
}

export async function decryptMessage(ciphertext: string, nonce: string, conversationKey: string): Promise<MessageContent> {
  await ready()
  try {
    const plain = sodium.crypto_secretbox_open_easy(bytes(ciphertext), bytes(nonce), bytes(conversationKey))
    const content = JSON.parse(sodium.to_string(plain)) as MessageContent
    if (content?.v !== 1 || typeof content.text !== 'string') throw new Error('format')
    return content
  } catch {
    throw new DecryptionError()
  }
}
