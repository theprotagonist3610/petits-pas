const number = new Intl.NumberFormat('fr', { maximumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

const dateTime = new Intl.DateTimeFormat('fr', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Instant ISO → « mardi 20 octobre à 14:30 », à l'heure du téléphone. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

export const formatNumber = (n: number) => number.format(n)

/** Date ISO (AAAA-MM-JJ) → « 12 octobre 2026 ». */
export const formatDate = (iso: string) => date.format(new Date(`${iso}T00:00:00Z`))

/** Lit un nombre saisi avec une virgule ou un point. */
export function parseDecimal(input: string): number | undefined {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : NaN
}
