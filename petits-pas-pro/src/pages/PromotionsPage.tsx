import { useState, type FormEvent } from 'react'
import type { ConsultationType, DiscountKind, PromotionRow, Specialty } from '@petits-pas/shared/database.types'
import { formatPrice, priceFor } from '@petits-pas/shared/platform'
import { useProAuth } from '@/auth/ProAuthProvider'
import { usePlatformSettings } from '@/auth/PlatformProvider'
import { PROMOTION_PROBLEMS, promotionPhase, savePromotion, setPromotionActive, validatePromotion, type PromotionInput, type PromotionPhase } from '@/lib/promotions'
import { parseAmount } from '@/lib/platformAdmin'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { TYPES, specialtyName, toLocalInput } from '@/lib/format'
import { PageTitle } from '@/components/Layout'
import { Icon } from '@/components/Icon'
import { Alert, Button, Card, Dialog, Field, inputClass } from '@/components/ui'

const ALL_TYPES: ConsultationType[] = ['teleconsultation', 'appointment']
const period = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const PHASES: { phase: PromotionPhase; title: string; empty: string }[] = [
  { phase: 'running', title: 'En cours', empty: 'Aucune promotion en cours.' },
  { phase: 'upcoming', title: 'À venir', empty: 'Aucune promotion programmée.' },
  { phase: 'ended', title: 'Terminées ou désactivées', empty: 'Aucune.' },
]

function PromotionDialog({ promotion, onClose, onSaved }: { promotion?: PromotionRow; onClose: () => void; onSaved: () => void }) {
  const { user } = useProAuth()
  const { platform } = usePlatformSettings()
  const currency = platform!.settings.currency
  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 86_400_000)
  const [name, setName] = useState(promotion?.name ?? '')
  const [description, setDescription] = useState(promotion?.description ?? '')
  const [specialties, setSpecialties] = useState<Specialty[]>(promotion?.specialties ?? [])
  const [types, setTypes] = useState<ConsultationType[]>(promotion?.types ?? ALL_TYPES)
  const [kind, setKind] = useState<DiscountKind>(promotion?.discount_kind ?? 'percent')
  const [value, setValue] = useState(promotion ? String(promotion.discount_value) : '')
  const [startsAt, setStartsAt] = useState(toLocalInput(promotion ? new Date(promotion.starts_at) : now))
  const [endsAt, setEndsAt] = useState(toLocalInput(promotion ? new Date(promotion.ends_at) : in30Days))
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])
  // Spécialités proposées aux parents en premier (les seules qui ont un tarif).
  const options = [...platform!.specialties].sort((a, b) => Number(b.requestable) - Number(a.requestable))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const input: PromotionInput = { name, description, specialties, types, discountKind: kind, discountValue: parseAmount(value), startsAt, endsAt }
    const problem = validatePromotion(input)
    if (problem) return setInvalid(PROMOTION_PROBLEMS[problem])
    setInvalid(undefined)
    setBusy(true)
    const result = await savePromotion(input, currency, user!.id, promotion?.id)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onSaved()
  }

  // Aperçu sur un exemple : première spécialité et premier type choisis qui ont un tarif.
  const example = specialties.flatMap((s) => types.map((t) => ({ s, t, price: priceFor(platform!.prices, s, t) }))).find((x) => x.price !== undefined)
  const amount = parseAmount(value)
  const preview =
    example && amount !== null && !Number.isNaN(amount)
      ? kind === 'percent'
        ? Math.round(example.price! * (100 - Math.min(amount, 100))) / 100
        : Math.min(amount, example.price!)
      : undefined

  return (
    <Dialog title={promotion ? 'Modifier la promotion' : 'Nouvelle promotion'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {(invalid || error) && <Alert>{invalid ?? errorMessage(error!)}</Alert>}
        <Field label="Nom" hint="Visible par les parents, ex. « Rentrée scolaire ».">
          <input className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description (facultatif)">
          <input className={inputClass} value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-bold text-ink-soft">Spécialités concernées</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {options.map((s) => (
              <label key={s.code} className={`flex items-center gap-2 text-sm ${s.requestable ? '' : 'text-ink-soft'}`}>
                <input type="checkbox" className="size-5 accent-sky-brand" checked={specialties.includes(s.code)} onChange={() => setSpecialties((l) => toggle(l, s.code))} />
                {s.label}
                {!s.requestable && <span className="text-xs">(non proposée)</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-bold text-ink-soft">Types de consultation</legend>
          <div className="flex flex-wrap gap-4">
            {ALL_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-sky-brand" checked={types.includes(t)} onChange={() => setTypes((l) => toggle(l, t))} />
                {TYPES[t]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-sm font-bold text-ink-soft">Remise</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1">
              {(['percent', 'fixed_price'] as DiscountKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`min-h-9 rounded-lg text-sm font-bold ${kind === k ? 'bg-surface text-sky-brand shadow-sm' : 'text-ink-soft'}`}
                >
                  {k === 'percent' ? 'Pourcentage' : 'Prix fixe'}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={kind === 'percent' ? 'Remise (%)' : `Prix promotionnel (${currency === 'XOF' ? 'F CFA' : '€'})`}>
            <input inputMode="decimal" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Début">
            <input type="datetime-local" className={inputClass} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Fin">
            <input type="datetime-local" className={inputClass} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        {example && preview !== undefined && (
          <p className="rounded-xl bg-sun-soft p-3 text-sm">
            Exemple : {specialtyName(example.s)}, {TYPES[example.t].toLowerCase()} :{' '}
            <s className="text-ink-soft">{formatPrice(example.price!, currency)}</s> → <strong>{formatPrice(preview, currency)}</strong>
          </p>
        )}
        <p className="text-xs text-ink-soft">
          Le prix est figé au moment de la demande du parent. Si plusieurs promotions s’appliquent, la plus avantageuse pour le parent l’emporte.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            {promotion ? 'Enregistrer' : 'Créer la promotion'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function PromotionCard({ promotion: p, onEdit, onChanged }: { promotion: PromotionRow; onEdit: () => void; onChanged: () => void }) {
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    const result = await setPromotionActive(p.id, !p.active)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onChanged()
  }

  return (
    <li className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sun-soft text-sun">
          <Icon name="tag" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">
            {p.name}{' '}
            <span className="ml-1 rounded-full bg-sun px-2 py-0.5 text-xs text-white">
              {p.discount_kind === 'percent' ? `−${p.discount_value} %` : `${formatPrice(p.discount_value, p.currency ?? 'XOF')}`}
            </span>
          </p>
          {p.description && <p className="text-sm text-ink-soft">{p.description}</p>}
          <p className="mt-1 text-sm">
            {p.specialties.map(specialtyName).join(', ')} · {p.types.map((t) => TYPES[t]).join(' et ')}
          </p>
          <p className="text-xs text-ink-soft">
            Du {period.format(new Date(p.starts_at))} au {period.format(new Date(p.ends_at))}
            {!p.active && ' · désactivée'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onEdit}>
            Modifier
          </Button>
          <Button variant={p.active ? 'ghost' : 'secondary'} onClick={() => void toggle()} disabled={busy}>
            {p.active ? 'Désactiver' : 'Réactiver'}
          </Button>
        </div>
      </div>
      {error && <Alert>{errorMessage(error)}</Alert>}
    </li>
  )
}

/** Promotions sur le prix des consultations (administrateurs). */
export function PromotionsPage() {
  const { platform, reload } = usePlatformSettings()
  const [editing, setEditing] = useState<PromotionRow | 'new'>()

  if (!platform) return <Alert>Paramètres de la plateforme indisponibles : vérifiez la connexion, puis rechargez la page.</Alert>
  const promotions = platform.promotions

  return (
    <>
      <PageTitle
        title="Promotions"
        subtitle="Remises temporaires sur le prix des consultations, par spécialité et par type."
        action={
          <Button onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Nouvelle promotion
          </Button>
        }
      />
      <div className="space-y-6">
        {PHASES.map(({ phase, title, empty }) => {
          const list = promotions.filter((p) => promotionPhase(p) === phase)
          return (
            <Card key={phase} title={`${title} (${list.length})`}>
              {list.length === 0 ? (
                <p className="text-ink-soft">{empty}</p>
              ) : (
                <ul className="space-y-3">
                  {list.map((p) => (
                    <PromotionCard key={p.id} promotion={p} onEdit={() => setEditing(p)} onChanged={() => void reload()} />
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
      {editing && (
        <PromotionDialog
          promotion={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            void reload()
          }}
        />
      )}
    </>
  )
}
