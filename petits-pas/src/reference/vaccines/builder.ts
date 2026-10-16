import type { AgeSpec, Intervention, InterventionKind, VaccineVisit } from './types'

interface Product {
  code: string
  name: string
  kind: InterventionKind
  protects: string[]
}

/** Catalogue commun des vaccins et soins ; chaque pays peut adapter l'abréviation (celle de son carnet) ou la liste des maladies. */
export const PRODUCTS = {
  hepb: { code: 'HepB', name: 'Hépatite B (dose de naissance)', kind: 'vaccine', protects: ['Hépatite B'] },
  bcg: { code: 'BCG', name: 'BCG', kind: 'vaccine', protects: ['Tuberculose'] },
  vpo: { code: 'VPO', name: 'Polio oral', kind: 'vaccine', protects: ['Poliomyélite'] },
  penta: {
    code: 'Penta',
    name: 'Pentavalent',
    kind: 'vaccine',
    protects: ['Diphtérie', 'Tétanos', 'Coqueluche', 'Hépatite B', 'Haemophilus influenzae de type b'],
  },
  pcv: { code: 'PCV13', name: 'Pneumocoque', kind: 'vaccine', protects: ['Pneumocoque', 'Infections respiratoires aiguës'] },
  rota: { code: 'Rota', name: 'Rotavirus', kind: 'vaccine', protects: ['Diarrhée à rotavirus'] },
  vpi: { code: 'VPI', name: 'Polio injectable', kind: 'vaccine', protects: ['Poliomyélite'] },
  vap: { code: 'VAP', name: 'Antipaludique', kind: 'vaccine', protects: ['Paludisme'] },
  rr: { code: 'RR', name: 'Rougeole-Rubéole', kind: 'vaccine', protects: ['Rougeole', 'Rubéole'] },
  vaa: { code: 'VAA', name: 'Fièvre jaune', kind: 'vaccine', protects: ['Fièvre jaune'] },
  mena: { code: 'MenA', name: 'Méningite A', kind: 'vaccine', protects: ['Méningite'] },
  hpv: { code: 'HPV', name: 'Papillomavirus', kind: 'vaccine', protects: ['Cancer du col de l’utérus'] },
  vita: { code: 'Vit. A', name: 'Vitamine A', kind: 'supplement', protects: ['Renforce les défenses de l’enfant'] },
  cpp: { code: 'CPP', name: 'Chimioprévention du paludisme', kind: 'prevention', protects: ['Paludisme'] },
  deworm: { code: 'Déparasitage', name: 'Déparasitage', kind: 'prevention', protects: ['Vers intestinaux'] },
} satisfies Record<string, Product>

export type ProductKey = keyof typeof PRODUCTS

/**
 * Fabrique les visites d'un pays. Identifiants stables (ils retrouvent les doses déjà notées) :
 * `<pays>-<produit>-<dose>` pour un vaccin, `<pays>-<produit>-v<n>` pour un soin répété à plusieurs visites,
 * `<pays>-v<n>` pour la n-ième visite.
 */
export function visitBuilder(country: string, overrides: Partial<Record<ProductKey, Partial<Pick<Product, 'code' | 'protects'>>>> = {}) {
  let count = 0
  return function visit(age: AgeSpec, label: string, refs: string[], extra?: Partial<VaccineVisit>): VaccineVisit {
    const n = ++count
    const interventions = refs.map((ref): Intervention => {
      const [key, dose] = ref.split(':') as [ProductKey, string | undefined]
      const product = { ...PRODUCTS[key], ...overrides[key] }
      const repeated = dose === undefined && product.kind !== 'vaccine'
      const id = `${country}-${key}${dose !== undefined ? `-${dose}` : repeated ? `-v${n}` : ''}`
      return { id, ...product, ...(dose !== undefined && { dose: Number(dose) }) }
    })
    return { id: `${country}-v${n}`, age, label, interventions, ...extra }
  }
}
