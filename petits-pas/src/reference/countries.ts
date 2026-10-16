import type { CountryCode } from '@/data/types'

export interface Country {
  code: CountryCode
  name: string
}

/** Pays pilotes de la V1. Les calendriers vaccinaux (PEV) seront ajoutés par pays après validation médicale. */
export const COUNTRIES: Country[] = [
  { code: 'BJ', name: 'Bénin' },
  { code: 'TG', name: 'Togo' },
  { code: 'NE', name: 'Niger' },
]

export function countryName(code: CountryCode | undefined): string | undefined {
  return COUNTRIES.find((c) => c.code === code)?.name
}
