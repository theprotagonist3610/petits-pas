import { describe, expect, it } from 'vitest'
import { createIcs } from './ics'

describe('createIcs', () => {
  const ics = createIcs(
    { uid: 'c-bj-v7', date: '2026-10-31', title: 'Vaccins de 9 mois, Awa', description: 'RR, VAA; MenA\nCentre de santé' },
    new Date('2026-10-15T08:30:00.123Z'),
  )
  const lines = ics.split('\r\n')

  it('crée un événement sur toute la journée', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261031')
    expect(lines).toContain('DTEND;VALUE=DATE:20261101')
    expect(lines).toContain('DTSTAMP:20261015T083000Z')
  })

  it('échappe les virgules, points-virgules et retours à la ligne', () => {
    expect(lines).toContain('SUMMARY:Vaccins de 9 mois\\, Awa')
    expect(lines).toContain('DESCRIPTION:RR\\, VAA\\; MenA\\nCentre de santé')
  })

  it('ajoute un rappel la veille au soir', () => {
    expect(lines).toContain('TRIGGER:-PT6H')
  })
})
