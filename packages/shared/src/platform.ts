import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsultationPriceRow, ConsultationType, Currency, Database, PlatformSettingsRow, PromotionRow, Specialty, SpecialtyRow } from './database.types'

/** Paramètres de la plateforme, lus par les deux applications (modifiables par les administrateurs). */
export interface Platform {
  settings: PlatformSettingsRow
  /** Toutes les spécialités, dans l'ordre d'affichage. */
  specialties: SpecialtyRow[]
  prices: ConsultationPriceRow[]
  /** Promotions en cours ou à venir (toutes, pour un administrateur). */
  promotions: PromotionRow[]
}

export const CURRENCIES: Record<Currency, string> = { XOF: 'Franc CFA (F CFA)', EUR: 'Euro (€)' }

export async function loadPlatform(client: SupabaseClient<Database>): Promise<Platform> {
  const [settings, specialties, prices, promotions] = await Promise.all([
    client.from('platform_settings').select('*').single(),
    client.from('specialties').select('*').order('sort_order').order('label'),
    client.from('consultation_prices').select('*'),
    client.from('promotions').select('*').order('starts_at', { ascending: false }),
  ])
  if (settings.error) throw settings.error
  if (specialties.error) throw specialties.error
  if (prices.error) throw prices.error
  if (promotions.error) throw promotions.error
  return { settings: settings.data, specialties: specialties.data, prices: prices.data, promotions: promotions.data }
}

/** « 15 000 F CFA », « 25,00 € ». */
export function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('fr', {
    style: 'currency',
    currency,
    currencyDisplay: currency === 'XOF' ? 'name' : 'symbol',
    maximumFractionDigits: currency === 'XOF' ? 0 : 2,
  })
    .format(amount)
    .replace(/francs? CFA \(?BCEAO\)?/i, 'F CFA')
}

export function priceFor(prices: ConsultationPriceRow[], specialty: Specialty, type: ConsultationType): number | undefined {
  return prices.find((p) => p.specialty === specialty && p.type === type)?.amount
}

export interface EffectivePrice {
  /** Tarif normal de la grille. */
  listPrice: number
  /** Prix à payer, promotion déduite. */
  price: number
  currency: Currency
  /** Promotion appliquée (la plus avantageuse), s'il y en a une. */
  promotion?: PromotionRow
}

/** La promotion est-elle valable à cet instant ? */
export const promotionRunning = (p: PromotionRow, at: Date = new Date()) => p.active && new Date(p.starts_at) <= at && at < new Date(p.ends_at)

/**
 * Prix à payer pour une spécialité et un type, à un instant donné : même règle que la fonction effective_price
 * de la base (meilleure promotion valable ; un prix fixe dans une autre devise est ignoré).
 */
export function effectivePrice(platform: Platform, specialty: Specialty, type: ConsultationType, at: Date = new Date()): EffectivePrice | undefined {
  const listPrice = priceFor(platform.prices, specialty, type)
  if (listPrice === undefined) return undefined
  const currency = platform.settings.currency
  const decimals = currency === 'XOF' ? 0 : 2
  const round = (n: number) => Math.round(n * 10 ** decimals) / 10 ** decimals
  let best: EffectivePrice = { listPrice, price: listPrice, currency }
  for (const p of platform.promotions) {
    if (!promotionRunning(p, at) || !p.specialties.includes(specialty) || !p.types.includes(type)) continue
    if (p.discount_kind === 'fixed_price' && p.currency !== currency) continue
    const price = p.discount_kind === 'percent' ? round((listPrice * (100 - p.discount_value)) / 100) : Math.min(p.discount_value, listPrice)
    if (price < best.price || (price === best.price && best.promotion && p.id < best.promotion.id)) best = { listPrice, price, currency, promotion: p }
  }
  return best
}

/** Spécialités que les parents peuvent demander ; pour le parent lui-même, seulement celles prévues pour les adultes. */
export function requestableSpecialties(specialties: SpecialtyRow[], forChild: boolean): SpecialtyRow[] {
  return specialties.filter((s) => s.requestable && (forChild || s.for_parent))
}

/** Libellé d'une spécialité (celui choisi par les administrateurs), ou son code à défaut. */
export function specialtyLabel(specialties: SpecialtyRow[] | undefined, code: Specialty): string {
  return specialties?.find((s) => s.code === code)?.label ?? code
}

/** Code d'une nouvelle spécialité à partir de son libellé : « Gynécologue obstétricien » → « gynecologue_obstetricien ». */
export function specialtyCode(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

let cache: Promise<Platform> | undefined

/**
 * Paramètres de la plateforme (lus une fois, partagés entre les écrans).
 * `reload` relit après une modification par un administrateur.
 */
export function usePlatform(client: SupabaseClient<Database> | null) {
  const [platform, setPlatform] = useState<Platform>()
  const [error, setError] = useState<unknown>()

  const reload = useCallback(
    async (force = true) => {
      if (!client) return
      if (force || !cache) cache = loadPlatform(client)
      try {
        setPlatform(await cache)
        setError(undefined)
      } catch (e) {
        cache = undefined
        setError(e)
      }
    },
    [client],
  )

  useEffect(() => {
    void reload(false)
  }, [reload])

  return { platform, error, reload }
}
