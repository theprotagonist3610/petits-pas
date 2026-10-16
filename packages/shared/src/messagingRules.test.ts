import { describe, expect, it } from 'vitest'
import { checkSecretCode, digitsOnly } from './messagingRules'

describe('code secret numérique', () => {
  it('accepte 8 chiffres ou plus, non évidents', () => {
    expect(checkSecretCode('20491736')).toBeUndefined()
    expect(checkSecretCode('8302917465')).toBeUndefined()
  })

  it('refuse les lettres, les codes trop courts et les codes évidents', () => {
    expect(checkSecretCode('abc12345')).toBe('not_numeric')
    expect(checkSecretCode('1234567')).toBe('too_short')
    for (const code of ['00000000', '11111111', '12345678', '23456789', '87654321', '90123456', '1234567890']) {
      expect(checkSecretCode(code), code).toBe('too_simple')
    }
  })

  it('ignore espaces et tirets à la saisie', () => {
    expect(digitsOnly('2049 1736')).toBe('20491736')
    expect(digitsOnly('20-49-17-36')).toBe('20491736')
  })
})
