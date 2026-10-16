import type { ConsultationType, Currency, DiscountKind, PromotionRow, Specialty } from '@petits-pas/shared/database.types'
import { supabase } from './supabase'
import { attempt, done, fail, type Result } from './errors'

/** Saisie du formulaire d'une promotion. */
export interface PromotionInput {
  name: string
  description: string
  specialties: Specialty[]
  types: ConsultationType[]
  discountKind: DiscountKind
  /** Pourcentage (0–100) ou prix promotionnel, selon `discountKind`. */
  discountValue: number | null
  /** Valeurs de champs datetime-local (heure de l'ordinateur). */
  startsAt: string
  endsAt: string
}

export type PromotionProblem = 'name' | 'specialties' | 'types' | 'value' | 'percent' | 'period'

export function validatePromotion(input: PromotionInput): PromotionProblem | undefined {
  if (!input.name.trim()) return 'name'
  if (input.specialties.length === 0) return 'specialties'
  if (input.types.length === 0) return 'types'
  if (input.discountValue === null || Number.isNaN(input.discountValue) || input.discountValue < 0) return 'value'
  if (input.discountKind === 'percent' && (input.discountValue <= 0 || input.discountValue > 100)) return 'percent'
  const start = new Date(input.startsAt)
  const end = new Date(input.endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 'period'
}

export const PROMOTION_PROBLEMS: Record<PromotionProblem, string> = {
  name: 'Donnez un nom à la promotion.',
  specialties: 'Choisissez au moins une spécialité.',
  types: 'Choisissez au moins un type de consultation.',
  value: 'Indiquez la remise.',
  percent: 'La remise en pourcentage doit être comprise entre 1 et 100 %.',
  period: 'La fin doit être après le début.',
}

export type PromotionPhase = 'running' | 'upcoming' | 'ended'

/** En cours, à venir, ou terminée (fin passée ou désactivée). */
export function promotionPhase(p: Pick<PromotionRow, 'active' | 'starts_at' | 'ends_at'>, now: Date = new Date()): PromotionPhase {
  if (!p.active || new Date(p.ends_at) <= now) return 'ended'
  return new Date(p.starts_at) > now ? 'upcoming' : 'running'
}

export function savePromotion(input: PromotionInput, currency: Currency, adminId: string, id?: string): Promise<Result> {
  return attempt(async () => {
    const row = {
      name: input.name.trim(),
      description: input.description.trim() || null,
      specialties: input.specialties,
      types: input.types,
      discount_kind: input.discountKind,
      discount_value: input.discountValue!,
      // Le prix promotionnel est exprimé dans la devise de la plateforme.
      currency: input.discountKind === 'fixed_price' ? currency : null,
      starts_at: new Date(input.startsAt).toISOString(),
      ends_at: new Date(input.endsAt).toISOString(),
    }
    const { error } = id
      ? await supabase.from('promotions').update(row).eq('id', id)
      : await supabase.from('promotions').insert({ ...row, active: true, created_by: adminId })
    return error ? fail(error) : done(undefined)
  })
}

export function setPromotionActive(id: string, active: boolean): Promise<Result> {
  return attempt(async () => {
    const { error } = await supabase.from('promotions').update({ active }).eq('id', id)
    return error ? fail(error) : done(undefined)
  })
}
