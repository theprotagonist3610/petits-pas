import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProAuth } from '@/auth/ProAuthProvider'
import { useProData } from '@/auth/ProDataProvider'
import { consultations as service } from '@/lib/services'
import { defaultSlot, upcoming, type ProConsultation } from '@/lib/consultations'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { COUNTRIES, specialtyName, TYPES, formatPatient, formatTime, toLocalInput } from '@/lib/format'
import { ConsultationItem } from '@/components/ConsultationItem'
import { PageTitle } from '@/components/Layout'
import { Icon } from '@/components/Icon'
import { Alert, Button, Card, Dialog, Field, inputClass } from '@/components/ui'

function ClaimDialog({ consultation, onClose }: { consultation: ProConsultation; onClose: () => void }) {
  const { professional } = useProAuth()
  const { refresh } = useProData()
  const navigate = useNavigate()
  const [when, setWhen] = useState(toLocalInput(defaultSlot(consultation)))
  const [note, setNote] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)
  const tele = consultation.type === 'teleconsultation'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(undefined)
    const result = await service.claim(consultation.id, new Date(when), note)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      // Prise par un confrère entre-temps : la liste est rafraîchie.
      if (result.error === 'already_taken') void refresh()
      return
    }
    await refresh()
    navigate(`/consultations/${consultation.id}`)
  }

  return (
    <Dialog title="Prendre en charge et confirmer" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-ink-soft">
          {TYPES[consultation.type]} · {formatPatient(consultation.forChild, consultation.childAgeMonths, consultation.childSex)}
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Field
          label={tele ? 'Date et heure du premier échange' : 'Date et heure du rendez-vous'}
          hint={
            tele
              ? 'La messagerie avec le parent s’ouvre dès qu’il a payé la consultation, pour 10 jours.'
              : `Lieu : ${professional?.facility_name ?? 'votre établissement'}${professional?.city ? `, ${professional.city}` : ''}.`
          }
        >
          <input type="datetime-local" className={inputClass} value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} required />
        </Field>
        <Field label="Message au parent (facultatif)" hint="Visible par le parent : consignes, documents à apporter…">
          <textarea className={`${inputClass} min-h-24 py-2`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            <Icon name="check" size={18} /> Confirmer
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function QueuePage() {
  const { professional } = useProAuth()
  const { queue, error } = useProData()
  const [claiming, setClaiming] = useState<ProConsultation>()

  return (
    <>
      <PageTitle
        title="Demandes à prendre"
        subtitle={professional ? `${specialtyName(professional.specialty)} · ${COUNTRIES[professional.country]} · la plus ancienne en premier` : undefined}
      />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {queue?.length === 0 && (
        <Card>
          <p className="text-ink-soft">Aucune demande en attente pour votre spécialité. La liste se met à jour automatiquement.</p>
        </Card>
      )}
      <ul className="space-y-3">
        {queue?.map((c) => (
          <ConsultationItem
            key={c.id}
            consultation={c}
            link={false}
            action={
              <div className="flex justify-end">
                <Button onClick={() => setClaiming(c)}>Prendre en charge</Button>
              </div>
            }
          />
        ))}
      </ul>
      {claiming && <ClaimDialog consultation={claiming} onClose={() => setClaiming(undefined)} />}
    </>
  )
}

function Stat({ label, value, to, tint }: { label: string; value: number | undefined; to: string; tint: string }) {
  return (
    <Link to={to} className="rounded-2xl bg-surface p-4 shadow-sm hover:bg-ink/5">
      <span className={`text-3xl font-extrabold ${tint}`}>{value ?? '–'}</span>
      <span className="mt-1 block text-sm font-bold text-ink-soft">{label}</span>
    </Link>
  )
}

export function DashboardPage() {
  const { professional } = useProAuth()
  const { queue, mine } = useProData()
  const now = new Date()
  const next = upcoming(mine ?? [], now)
  const today = next.filter((c) => new Date(c.scheduledAt!).toDateString() === now.toDateString())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const doneThisMonth = mine?.filter((c) => c.status === 'completed' && new Date(c.scheduledAt ?? c.createdAt) >= monthStart).length

  return (
    <>
      <PageTitle title={`Bonjour${professional ? ` ${professional.first_name}` : ''}`} subtitle="Votre activité sur Petits Pas Pro." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Demandes à prendre" value={queue?.length} to="/demandes" tint="text-sun" />
        <Stat label="Aujourd’hui" value={mine ? today.length : undefined} to="/agenda" tint="text-sky-brand" />
        <Stat label="À venir" value={mine ? next.length : undefined} to="/agenda" tint="text-teal-brand" />
        <Stat label="Terminées ce mois" value={doneThisMonth} to="/agenda" tint="text-leaf" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Aujourd’hui" action={<Link to="/agenda" className="text-sm font-bold text-sky-brand">Agenda</Link>}>
          {today.length === 0 ? (
            <p className="text-ink-soft">Aucune consultation prévue aujourd’hui.</p>
          ) : (
            <ul className="space-y-2">
              {today.map((c) => (
                <li key={c.id}>
                  <Link to={`/consultations/${c.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-ink/5">
                    <span className="w-14 font-extrabold text-sky-brand">{formatTime(c.scheduledAt!)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {TYPES[c.type]} · {formatPatient(c.forChild, c.childAgeMonths, c.childSex)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Dernières demandes" action={<Link to="/demandes" className="text-sm font-bold text-sky-brand">Tout voir</Link>}>
          {queue?.length === 0 ? (
            <p className="text-ink-soft">Aucune demande en attente.</p>
          ) : (
            <ul className="space-y-3">
              {queue?.slice(0, 3).map((c) => <ConsultationItem key={c.id} consultation={c} link={false} />)}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
