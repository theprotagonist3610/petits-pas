import { describe, expect, it } from 'vitest'
import { daysLeft, isOpen, planConversationKeys } from './messaging'

const PARENT = 'parent'
const DOCTOR = 'medecin'

describe('gestion des clés de conversation', () => {
  const keys = (parent: string | null, doctor: string | null) => [
    { userId: PARENT, publicKey: parent },
    { userId: DOCTOR, publicKey: doctor },
  ]

  it('premier échange : le médecin crée la clé, le parent attend', () => {
    expect(planConversationKeys({ myId: DOCTOR, amCreator: true, publicKeys: keys('pkP', 'pkM'), rows: [] })).toEqual({ openMine: null, createNew: true })
    expect(planConversationKeys({ myId: PARENT, amCreator: false, publicKeys: keys('pkP', 'pkM'), rows: [] })).toEqual({ openMine: null, createNew: false })
  })

  it('ouvre sa clé scellée si elle correspond à sa clé publique actuelle', () => {
    const rows = [
      { user_id: PARENT, sealed_key: 'pourParent', sealed_for: 'pkP' },
      { user_id: DOCTOR, sealed_key: 'pourMedecin', sealed_for: 'pkM' },
    ]
    expect(planConversationKeys({ myId: PARENT, amCreator: false, publicKeys: keys('pkP', 'pkM'), rows })).toEqual({ openMine: 'pourParent', createNew: false })
  })

  it('code oublié par le parent : il attend que le médecin scelle à nouveau, sans perdre la conversation', () => {
    const rows = [
      { user_id: PARENT, sealed_key: 'pourAncienneCle', sealed_for: 'pkP-ancienne' },
      { user_id: DOCTOR, sealed_key: 'pourMedecin', sealed_for: 'pkM' },
    ]
    // Le parent (nouvelle clé pkP2) ne peut rien ouvrir, mais ne recrée pas de clé : le médecin a encore la bonne.
    expect(planConversationKeys({ myId: PARENT, amCreator: false, publicKeys: keys('pkP2', 'pkM'), rows })).toEqual({ openMine: null, createNew: false })
    // Le médecin ouvre la sienne (et l'application scellera pour pkP2).
    expect(planConversationKeys({ myId: DOCTOR, amCreator: true, publicKeys: keys('pkP2', 'pkM'), rows })).toEqual({ openMine: 'pourMedecin', createNew: false })
  })

  it('code oublié par le médecin : il ne recrée pas de clé tant que le parent a la bonne', () => {
    const rows = [
      { user_id: PARENT, sealed_key: 'pourParent', sealed_for: 'pkP' },
      { user_id: DOCTOR, sealed_key: 'pourAncienneCle', sealed_for: 'pkM-ancienne' },
    ]
    expect(planConversationKeys({ myId: DOCTOR, amCreator: true, publicKeys: keys('pkP', 'pkM2'), rows })).toEqual({ openMine: null, createNew: false })
  })

  it('les deux ont réinitialisé : le médecin recrée une clé (les anciens messages restent illisibles)', () => {
    const rows = [
      { user_id: PARENT, sealed_key: 'x', sealed_for: 'pkP-ancienne' },
      { user_id: DOCTOR, sealed_key: 'y', sealed_for: 'pkM-ancienne' },
    ]
    expect(planConversationKeys({ myId: DOCTOR, amCreator: true, publicKeys: keys('pkP2', 'pkM2'), rows })).toEqual({ openMine: null, createNew: true })
  })
})

describe('fenêtre de 10 jours', () => {
  const conversation = { opens_at: '2026-10-16T10:00:00Z', closes_at: '2026-10-26T10:00:00Z' }

  it('est ouverte pendant 10 jours, puis fermée', () => {
    expect(isOpen(conversation, new Date('2026-10-16T10:00:00Z'))).toBe(true)
    expect(isOpen(conversation, new Date('2026-10-26T09:59:00Z'))).toBe(true)
    expect(isOpen(conversation, new Date('2026-10-26T10:00:00Z'))).toBe(false)
  })

  it('affiche les jours restants', () => {
    expect(daysLeft(conversation, new Date('2026-10-16T10:00:00Z'))).toBe(10)
    expect(daysLeft(conversation, new Date('2026-10-25T12:00:00Z'))).toBe(1)
    expect(daysLeft(conversation, new Date('2026-10-27T10:00:00Z'))).toBe(0)
  })
})
