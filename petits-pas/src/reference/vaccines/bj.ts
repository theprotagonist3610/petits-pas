import type { VaccineSchedule } from './types'
import { visitBuilder } from './builder'

/*
 * Calendrier vaccinal de l'enfant et de l'adolescente — Bénin.
 * Source : Ministère de la Santé, Agence nationale des soins de santé primaires (ANSSP),
 * Programme élargi de vaccination, édition mars 2026.
 * Interprétations À FAIRE CONFIRMER PAR LE PROFESSIONNEL DE SANTÉ :
 * - CPP = chimioprévention du paludisme pérenne (aux âges recommandés par l'OMS pour ce protocole) ;
 * - VAP = vaccin antipaludique ; VAA = vaccin anti-amaril (fièvre jaune) ;
 * - le pentavalent protège aussi contre le tétanos (absent de la liste de l'affiche).
 */
const visit = visitBuilder('bj')

export const BENIN: VaccineSchedule = {
  country: 'BJ',
  title: 'Calendrier vaccinal du Bénin',
  source: 'Ministère de la Santé du Bénin — ANSSP, Programme élargi de vaccination, édition mars 2026',
  helpline: '+229 01 97 05 13 00',
  visits: [
    visit({ weeks: 0 }, 'Naissance', ['hepb', 'bcg', 'vpo:0']),
    visit({ weeks: 6 }, '6 semaines', ['penta:1', 'pcv:1', 'vpo:1', 'rota:1']),
    visit({ weeks: 10 }, '10 semaines', ['penta:2', 'pcv:2', 'vpo:2', 'rota:2', 'cpp']),
    visit({ weeks: 14 }, '14 semaines', ['penta:3', 'pcv:3', 'vpo:3', 'rota:3', 'vpi', 'cpp']),
    visit({ months: 6 }, '6 mois', ['vap:1', 'vita', 'cpp']),
    visit({ months: 7 }, '7 mois', ['vap:2']),
    visit({ months: 9 }, '9 mois', ['rr:1', 'vaa', 'mena', 'vap:3', 'cpp']),
    visit({ months: 12 }, '1 an', ['vita', 'cpp']),
    visit({ months: 15 }, '15 mois', ['cpp']),
    visit({ months: 18 }, '18 mois', ['rr:2', 'vap:4', 'vita', 'cpp']),
    visit({ months: 24 }, '2 ans', ['vita', 'cpp']),
    visit({ months: 30 }, '2 ans et demi', ['deworm', 'vita']),
    visit({ months: 36 }, '3 ans', ['deworm', 'vita']),
    visit({ years: 9 }, '9 ans', ['hpv'], { sex: 'female' }),
  ],
}
