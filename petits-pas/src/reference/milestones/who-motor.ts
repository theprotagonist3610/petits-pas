/**
 * Les 6 grandes étapes motrices de l'OMS : âges d'acquisition en jours (percentiles).
 * Source : WHO Multicentre Growth Reference Study Group. WHO Motor Development Study: Windows of
 * achievement for six gross motor development milestones. Acta Paediatrica Suppl 2006;450:86-95.
 * (scripts/who-data/who-motor-milestones-percentiles.pdf)
 * La « fenêtre d'acquisition » de l'OMS va du 1er au 99e percentile.
 * Les définitions sont adaptées des critères de l'étude — À FAIRE VALIDER.
 */
export interface WhoMotorMilestone {
  id: string
  title: string
  definition: string
  /** Âge en jours aux percentiles 1, 3, 5, 10, 25, 50, 75, 90, 95, 97, 99. */
  days: { p1: number; p3: number; p5: number; p10: number; p25: number; p50: number; p75: number; p90: number; p95: number; p97: number; p99: number }
  /** Étape que certains enfants sautent sans que ce soit inquiétant. */
  optional?: boolean
}

const d = (...v: number[]) => {
  const [p1, p3, p5, p10, p25, p50, p75, p90, p95, p97, p99] = v
  return { p1, p3, p5, p10, p25, p50, p75, p90, p95, p97, p99 }
}

export const WHO_MOTOR: WhoMotorMilestone[] = [
  {
    id: 'who-sit',
    title: 'Tient assis sans appui',
    definition: "Assis bien droit, la tête droite, pendant au moins 10 secondes, sans s'aider des bras ni des mains pour garder l'équilibre.",
    days: d(115, 125, 131, 140, 158, 179, 204, 229, 245, 256, 279),
  },
  {
    id: 'who-stand-assisted',
    title: 'Debout avec appui',
    definition: "Debout sur ses deux pieds en se tenant des deux mains à un meuble stable, sans s'y appuyer avec le corps, pendant au moins 10 secondes.",
    days: d(147, 160, 167, 178, 200, 226, 256, 287, 307, 320, 348),
  },
  {
    id: 'who-crawl',
    title: 'Marche à quatre pattes',
    definition: 'Avance ou recule à quatre pattes, le ventre ne touchant pas le sol, en enchaînant au moins trois mouvements.',
    days: d(157, 177, 187, 202, 226, 254, 284, 319, 345, 364, 409),
    optional: true,
  },
  {
    id: 'who-walk-assisted',
    title: 'Marche avec appui',
    definition: "Fait au moins 5 pas, en avant ou sur le côté, en se tenant à un meuble d'une ou des deux mains, le dos droit.",
    days: d(181, 200, 210, 225, 249, 275, 304, 336, 360, 378, 418),
  },
  {
    id: 'who-stand-alone',
    title: 'Debout seul',
    definition: 'Debout sur ses deux pieds, le dos droit, sans toucher ni personne ni objet, pendant au moins 10 secondes.',
    days: d(211, 235, 248, 266, 296, 330, 367, 408, 438, 461, 514),
  },
  {
    id: 'who-walk-alone',
    title: 'Marche seul',
    definition: 'Fait au moins 5 pas tout seul, le dos droit, sans toucher ni personne ni objet.',
    days: d(250, 274, 286, 304, 333, 365, 400, 438, 466, 487, 534),
  },
]
