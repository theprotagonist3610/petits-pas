import { describe, expect, it } from 'vitest'
import {
  WrongSecretCodeError,
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

describe('chiffrement de bout en bout', () => {
  it('retrouve la clé privée avec le bon code secret, jamais avec un autre', async () => {
    const pair = await generateKeyPair()
    const wrapped = await wrapPrivateKey(pair.privateKey, 'mon code secret')
    expect(wrapped.wrappedPrivateKey).not.toContain(pair.privateKey)
    expect(await unwrapPrivateKey(wrapped, 'mon code secret')).toBe(pair.privateKey)
    await expect(unwrapPrivateKey(wrapped, 'mauvais code')).rejects.toBeInstanceOf(WrongSecretCodeError)
    expect(await keyMatches(pair.privateKey, pair.publicKey)).toBe(true)
    expect(await keyMatches((await generateKeyPair()).privateKey, pair.publicKey)).toBe(false)
  }, 20_000)

  it('seuls les deux participants lisent les messages de la conversation', async () => {
    const parent = await generateKeyPair()
    const doctor = await generateKeyPair()
    const intruder = await generateKeyPair()
    const key = await generateConversationKey()

    const forParent = await sealConversationKey(key, parent.publicKey)
    const forDoctor = await sealConversationKey(key, doctor.publicKey)
    expect(await openConversationKey(forParent, parent.publicKey, parent.privateKey)).toBe(key)
    expect(await openConversationKey(forDoctor, doctor.publicKey, doctor.privateKey)).toBe(key)
    await expect(openConversationKey(forParent, intruder.publicKey, intruder.privateKey)).rejects.toThrow()

    const sent = await encryptMessage('Bonjour docteur, la fièvre est tombée 🙂', key)
    expect(sent.ciphertext).not.toContain('fièvre')
    expect(await decryptMessage(sent.ciphertext, sent.nonce, key)).toEqual({ v: 1, text: 'Bonjour docteur, la fièvre est tombée 🙂' })
    await expect(decryptMessage(sent.ciphertext, sent.nonce, await generateConversationKey())).rejects.toThrow()
  })
})
