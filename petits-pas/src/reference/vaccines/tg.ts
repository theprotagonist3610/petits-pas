import type { VaccineSchedule } from './types'
import { visitBuilder } from './builder'

/*
 * Calendrier vaccinal chez les enfants de 0 à 23 mois et la jeune fille — Togo.
 * Source : calendrier vaccinal du Togo (document « Calendrier-vaccinal.pdf », page 1).
 * Non repris ici (hors suivi de l'enfant) : vaccination Td de la femme enceinte et vaccins Covid des 12 ans et plus (page 2).
 * Les abréviations sont celles du document, pour correspondre au carnet de santé.
 */
const visit = visitBuilder('tg', {
  penta: { code: 'DTC-HepB-Hib' },
  pcv: { code: 'Pneumo', protects: ['Infection à pneumocoque'] },
  hpv: { code: 'VPH', protects: ['Virus du papillome humain (cancer du col de l’utérus)'] },
})

export const TOGO: VaccineSchedule = {
  country: 'TG',
  title: 'Calendrier vaccinal du Togo',
  source: 'Calendrier vaccinal du Togo — enfants de 0 à 23 mois et jeune fille',
  visits: [
    visit({ weeks: 0 }, 'Naissance', ['bcg', 'vpo:0']),
    visit({ weeks: 6 }, '6 semaines', ['penta:1', 'vpo:1', 'rota:1', 'pcv:1']),
    visit({ weeks: 10 }, '10 semaines', ['penta:2', 'vpo:2', 'rota:2', 'pcv:2']),
    visit({ weeks: 14 }, '14 semaines', ['penta:3', 'vpo:3', 'pcv:3', 'vpi:1']),
    visit({ months: 9 }, '9 mois', ['rr:1', 'vaa', 'vpi:2']),
    visit({ months: 15 }, '15 mois', ['rr:2', 'mena']),
    visit({ years: 9 }, '9 ans', ['hpv'], { sex: 'female' }),
  ],
}
