import { useState, type FormEvent } from 'react'
import type { ConsultationType, Currency, SpecialtyRow } from '@petits-pas/shared/database.types'
import { CURRENCIES, formatPrice, priceFor } from '@petits-pas/shared/platform'
import { useProAuth } from '@/auth/ProAuthProvider'
import { usePlatformSettings } from '@/auth/PlatformProvider'
import { addSpecialty, parseAmount, saveGeneralSettings, savePrices, updateSpecialty } from '@/lib/platformAdmin'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { TYPES } from '@/lib/format'
import { Icon } from '@/components/Icon'
import { Alert, Button, Card, Field, inputClass } from '@/components/ui'

const PRICE_TYPES: ConsultationType[] = ['teleconsultation', 'appointment']

/** Retour d'enregistrement commun aux blocs (succès ou erreur). */
function useSaveState() {
  const [error, setError] = useState<ProErrorCode>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  async function run(action: () => Promise<{ ok: true } | { ok: false; error: ProErrorCode }>, after?: () => Promise<void>) {
    setBusy(true)
    setSaved(false)
    setError(undefined)
    const result = await action()
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setSaved(true)
    await after?.()
  }
  const feedback = (
    <>
      {error && <Alert>{errorMessage(error)}</Alert>}
      {saved && <Alert tone="success">Enregistré.</Alert>}
    </>
  )
  return { busy, run, feedback }
}

function MaintenanceCard() {
  const { user } = useProAuth()
  const { platform, reload } = usePlatformSettings()
  const settings = platform!.settings
  const [message, setMessage] = useState(settings.maintenance_message ?? '')
  const save = useSaveState()
  const on = settings.maintenance

  const toggle = () =>
    save.run(() => saveGeneralSettings({ maintenance: !on, maintenance_message: message.trim() || null }, user!.id), reload)

  return (
    <Card title="Mise en veille">
      <div className="space-y-3">
        <p className={`flex items-center gap-2 font-bold ${on ? 'text-sun' : 'text-leaf'}`}>
          <span className={`size-2.5 rounded-full ${on ? 'bg-sun' : 'bg-leaf'}`} />
          {on ? 'Plateforme en veille' : 'Plateforme ouverte'}
        </p>
        <p className="text-sm text-ink-soft">
          Pendant une mise à jour : les parents ne peuvent plus envoyer de demandes ni de messages, les professionnels voient un écran de
          maintenance. Les données restent consultables, et les administrateurs gardent l’accès.
        </p>
        <Field label="Message affiché (facultatif)" hint="Par exemple : « Mise à jour en cours, retour prévu à 14 h. »">
          <textarea className={`${inputClass} min-h-20 py-2`} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        {save.feedback}
        <div className="flex flex-wrap gap-2">
          <Button variant={on ? 'primary' : 'destructive'} onClick={() => void toggle()} disabled={save.busy}>
            {on ? 'Rouvrir la plateforme' : 'Mettre en veille'}
          </Button>
          {on && (
            <Button
              variant="secondary"
              disabled={save.busy}
              onClick={() => void save.run(() => saveGeneralSettings({ maintenance_message: message.trim() || null }, user!.id), reload)}
            >
              Mettre à jour le message
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function PricesCard() {
  const { user } = useProAuth()
  const { platform, reload } = usePlatformSettings()
  const { settings, specialties, prices } = platform!
  const [currency, setCurrency] = useState<Currency>(settings.currency)
  const [commission, setCommission] = useState(String(settings.commission_percent))
  // Montants saisis, par « spécialité:type ».
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(prices.map((p) => [`${p.specialty}:${p.type}`, String(p.amount)])),
  )
  const [invalid, setInvalid] = useState<string>()
  const save = useSaveState()
  const priced = specialties.filter((s) => s.requestable)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const rows = priced.flatMap((s) => PRICE_TYPES.map((type) => ({ specialty: s.code, type, amount: parseAmount(amounts[`${s.code}:${type}`] ?? '') })))
    if (rows.some((r) => Number.isNaN(r.amount))) return setInvalid('Montant invalide : chiffres uniquement (ex. 15000 ou 12,50).')
    const commissionPercent = parseAmount(commission)
    if (commissionPercent === null || Number.isNaN(commissionPercent) || commissionPercent > 100) return setInvalid('Commission : un pourcentage entre 0 et 100.')
    setInvalid(undefined)
    await save.run(async () => {
      if (currency !== settings.currency || commissionPercent !== settings.commission_percent) {
        const general = await saveGeneralSettings({ currency, commission_percent: commissionPercent }, user!.id)
        if (!general.ok) return general
      }
      return savePrices(rows)
    }, reload)
  }

  return (
    <Card title="Devise et tarifs">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Devise" hint={currency !== settings.currency ? 'Les montants ne sont pas convertis : vérifiez-les avant d’enregistrer.' : undefined}>
          <select className={`${inputClass} max-w-xs`} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {Object.entries(CURRENCIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Commission de la plateforme (%)"
          hint="Retenue sur chaque consultation terminée ; le reste revient au professionnel. S’applique aux consultations terminées après l’enregistrement."
        >
          <input inputMode="decimal" className={`${inputClass} max-w-32`} value={commission} onChange={(e) => setCommission(e.target.value)} />
        </Field>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-line text-ink-soft">
              <tr>
                <th className="py-2 pr-3 font-bold">Spécialité</th>
                {PRICE_TYPES.map((type) => (
                  <th key={type} className="py-2 pr-3 font-bold">
                    {TYPES[type]} ({currency === 'XOF' ? 'F CFA' : '€'})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {priced.map((s) => (
                <tr key={s.code}>
                  <td className="py-2 pr-3 font-bold">{s.label}</td>
                  {PRICE_TYPES.map((type) => {
                    const key = `${s.code}:${type}`
                    const current = priceFor(prices, s.code, type)
                    return (
                      <td key={type} className="py-2 pr-3">
                        <input
                          inputMode="decimal"
                          className={`${inputClass} max-w-40`}
                          value={amounts[key] ?? ''}
                          placeholder="Non défini"
                          aria-label={`${s.label}, ${TYPES[type]}`}
                          title={current !== undefined ? `Actuel : ${formatPrice(current, settings.currency)}` : undefined}
                          onChange={(e) => setAmounts((a) => ({ ...a, [key]: e.target.value }))}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-soft">Seules les spécialités proposées aux parents ont un tarif. Laissez vide pour ne pas afficher de prix.</p>
        {invalid && <Alert>{invalid}</Alert>}
        {save.feedback}
        <Button type="submit" disabled={save.busy}>
          Enregistrer les tarifs
        </Button>
      </form>
    </Card>
  )
}

function SpecialtyRowEditor({ specialty, onSaved }: { specialty: SpecialtyRow; onSaved: () => Promise<void> }) {
  const [label, setLabel] = useState(specialty.label)
  const [description, setDescription] = useState(specialty.description ?? '')
  const save = useSaveState()
  const changed = label.trim() !== specialty.label || (description.trim() || null) !== specialty.description

  const toggle = (patch: Partial<Pick<SpecialtyRow, 'requestable' | 'for_parent'>>) => save.run(() => updateSpecialty(specialty.code, patch), onSaved)

  return (
    <li className="space-y-2 py-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <input className={inputClass} value={label} maxLength={80} aria-label="Libellé" onChange={(e) => setLabel(e.target.value)} />
        <input
          className={inputClass}
          value={description}
          maxLength={200}
          placeholder="Description pour les parents (facultatif)"
          aria-label="Description"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-sky-brand" checked={specialty.requestable} disabled={save.busy} onChange={() => void toggle({ requestable: !specialty.requestable })} />
          Proposée aux parents
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-5 accent-sky-brand" checked={specialty.for_parent} disabled={save.busy} onChange={() => void toggle({ for_parent: !specialty.for_parent })} />
          Aussi pour le parent lui-même
        </label>
        {changed && (
          <Button
            variant="secondary"
            disabled={save.busy || !label.trim()}
            onClick={() => void save.run(() => updateSpecialty(specialty.code, { label: label.trim(), description: description.trim() || null }), onSaved)}
          >
            Enregistrer le libellé
          </Button>
        )}
      </div>
      {save.feedback}
    </li>
  )
}

function SpecialtiesCard() {
  const { platform, reload } = usePlatformSettings()
  const specialties = platform!.specialties
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const save = useSaveState()

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!label.trim()) return
    const nextOrder = Math.max(0, ...specialties.map((s) => s.sort_order)) + 10
    await save.run(() => addSpecialty(label, description, nextOrder), async () => {
      setLabel('')
      setDescription('')
      await reload()
    })
  }

  return (
    <Card title="Spécialités">
      <p className="text-sm text-ink-soft">
        « Proposée aux parents » : le parent peut demander ce spécialiste. « Aussi pour le parent » : il peut le demander pour lui-même, pas seulement pour
        un enfant. Les professionnels sont rattachés à une spécialité de cette liste.
      </p>
      <ul className="divide-y divide-line">
        {specialties.map((s) => (
          <SpecialtyRowEditor key={`${s.code}:${s.label}:${s.description}`} specialty={s} onSaved={reload} />
        ))}
      </ul>
      <form onSubmit={add} noValidate className="mt-2 space-y-2 rounded-xl bg-ink/5 p-3">
        <p className="text-sm font-bold">Ajouter une spécialité</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input className={inputClass} value={label} maxLength={80} placeholder="Ex. Gynécologue" aria-label="Libellé" onChange={(e) => setLabel(e.target.value)} />
          <input
            className={inputClass}
            value={description}
            maxLength={200}
            placeholder="Description pour les parents (facultatif)"
            aria-label="Description"
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button type="submit" disabled={save.busy || !label.trim()}>
            <Icon name="plus" size={18} /> Ajouter
          </Button>
        </div>
        <p className="text-xs text-ink-soft">Ajoutée non proposée aux parents : activez-la quand des professionnels de cette spécialité sont inscrits.</p>
        {save.feedback}
      </form>
    </Card>
  )
}

/** Réglages de la plateforme (administrateurs). */
export function PlatformSettings() {
  const { platform } = usePlatformSettings()
  if (!platform) return <Alert>Paramètres de la plateforme indisponibles : vérifiez la connexion, puis rechargez la page.</Alert>
  return (
    <div className="space-y-4">
      <h2 className="pt-4 text-xl font-extrabold">Plateforme</h2>
      <MaintenanceCard />
      <PricesCard />
      <SpecialtiesCard />
    </div>
  )
}
