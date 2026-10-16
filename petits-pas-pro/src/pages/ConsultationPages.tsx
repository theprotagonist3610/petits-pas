import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useProData } from '@/auth/ProDataProvider'
import { consultations as service } from '@/lib/services'
import { groupByDay, upcoming, type ConsultationEvent, type ParentContact, type ProConsultation } from '@/lib/consultations'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { specialtyName, TYPES, formatDateTime, formatDay, formatPatient } from '@/lib/format'
import { ConsultationItem } from '@/components/ConsultationItem'
import { PageTitle } from '@/components/Layout'
import { Icon } from '@/components/Icon'
import { Alert, Button, Card, Dialog, Field, StatusBadge, inputClass } from '@/components/ui'
import { formatPrice } from '@petits-pas/shared/platform'

export function AgendaPage() {
  const { mine, error } = useProData()
  const [showPast, setShowPast] = useState(false)
  const next = upcoming(mine ?? [])
  const nextIds = new Set(next.map((c) => c.id))
  const past = (mine ?? []).filter((c) => !nextIds.has(c.id)).sort((a, b) => (b.scheduledAt ?? b.createdAt).localeCompare(a.scheduledAt ?? a.createdAt))

  return (
    <>
      <PageTitle title="Agenda" subtitle="Vos consultations confirmées, jour par jour." />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {mine && next.length === 0 && (
        <Card>
          <p className="text-ink-soft">
            Aucune consultation à venir. <Link to="/demandes" className="font-bold text-sky-brand">Voir les demandes à prendre</Link>
          </p>
        </Card>
      )}
      <div className="space-y-6">
        {groupByDay(next).map(([day, items]) => (
          <section key={day}>
            <h2 className="mb-2 font-extrabold capitalize">{formatDay(day)}</h2>
            <ul className="space-y-3">
              {items.map((c) => (
                <ConsultationItem key={c.id} consultation={c} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {past.length > 0 && (
        <section className="mt-8">
          <Button variant="secondary" onClick={() => setShowPast((v) => !v)}>
            {showPast ? 'Masquer l’historique' : `Historique (${past.length})`}
          </Button>
          {showPast && (
            <ul className="mt-3 space-y-3">
              {past.map((c) => (
                <ConsultationItem key={c.id} consultation={c} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

const EVENT_LABELS: Record<ConsultationEvent['event'], string> = {
  created: 'Demande envoyée',
  confirmed: 'Confirmée',
  rescheduled: 'Horaire modifié',
  cancelled: 'Annulée',
  completed: 'Terminée',
}

const ACTOR_LABELS: Record<ConsultationEvent['actorRole'], string> = { parent: 'par le parent', professional: 'par le professionnel', system: '' }

function CloseDialog({ consultation, mode, onClose }: { consultation: ProConsultation; mode: 'complete' | 'cancel'; onClose: (updated?: ProConsultation) => void }) {
  const { refresh } = useProData()
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)
  const cancel = mode === 'cancel'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (cancel && !text.trim()) return setInvalid('Indiquez le motif : il sera communiqué au parent.')
    setBusy(true)
    const result = cancel ? await service.cancel(consultation.id, text) : await service.complete(consultation.id, text)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    await refresh()
    onClose(result.data)
  }

  return (
    <Dialog title={cancel ? 'Annuler la consultation' : 'Terminer la consultation'} onClose={() => onClose()} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Field
          label={cancel ? 'Motif de l’annulation' : 'Message de fin au parent (facultatif)'}
          hint={cancel ? 'Le parent pourra refaire une demande.' : 'Conseils, suite à donner… Visible par le parent.'}
          error={invalid}
        >
          <textarea className={`${inputClass} min-h-24 py-2`} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onClose()} disabled={busy}>
            Retour
          </Button>
          <Button type="submit" variant={cancel ? 'destructive' : 'primary'} disabled={busy}>
            {cancel ? 'Annuler la consultation' : 'Marquer comme terminée'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ConsultationDetailPage() {
  const { id } = useParams()
  const [consultation, setConsultation] = useState<ProConsultation | null>()
  const [contact, setContact] = useState<ParentContact | null>()
  const [events, setEvents] = useState<ConsultationEvent[]>([])
  const [error, setError] = useState<ProErrorCode>()
  const [closing, setClosing] = useState<'complete' | 'cancel'>()

  useEffect(() => {
    if (!id) return
    let active = true
    void Promise.all([service.get(id), service.contact(id), service.events(id)]).then(([c, contactResult, e]) => {
      if (!active) return
      if (c.ok) setConsultation(c.data)
      else setError(c.error)
      if (contactResult.ok) setContact(contactResult.data)
      if (e.ok) setEvents(e.data)
    })
    return () => {
      active = false
    }
  }, [id, consultation?.status])

  if (error) return <Alert>{errorMessage(error)}</Alert>
  if (consultation === undefined) return null
  if (consultation === null) return <Alert>Consultation introuvable, ou réservée à un autre professionnel.</Alert>
  const c = consultation
  const open = c.status === 'confirmed'

  return (
    <>
      <Link to="/agenda" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="back" size={18} /> Agenda
      </Link>
      <PageTitle
        title={TYPES[c.type]}
        subtitle={[c.requestedSpecialty && specialtyName(c.requestedSpecialty), formatPatient(c.forChild, c.childAgeMonths, c.childSex)].filter(Boolean).join(' · ')}
        action={<StatusBadge status={c.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Motif">
            <p className="whitespace-pre-line">{c.reason}</p>
          </Card>
          {c.professionalNotes && (
            <Card title="Votre message au parent">
              <p className="whitespace-pre-line text-ink-soft">{c.professionalNotes}</p>
            </Card>
          )}
          {c.type === 'teleconsultation' && c.status !== 'pending' && c.paymentStatus !== 'paid' && c.status === 'confirmed' && (
            <p className="rounded-2xl bg-ink/5 p-4 text-sm text-ink-soft">La messagerie avec le parent s’ouvrira dès qu’il aura payé la consultation.</p>
          )}
          {c.type === 'teleconsultation' && c.status !== 'pending' && c.paymentStatus === 'paid' && (
            <Link
              to={`/messages/${c.id}`}
              className="flex items-center gap-3 rounded-2xl bg-leaf-soft p-4 font-bold text-leaf hover:opacity-90"
            >
              <Icon name="chat" size={22} />
              <span className="flex-1">Messagerie chiffrée avec le parent</span>
              <Icon name="chevronRight" size={20} />
            </Link>
          )}
          {open && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setClosing('complete')}>
                <Icon name="check" size={18} /> Marquer comme terminée
              </Button>
              <Button variant="destructive" onClick={() => setClosing('cancel')}>
                <Icon name="close" size={18} /> Annuler la consultation
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Paiement">
            {c.paymentStatus === 'paid' && c.paidAmount !== undefined && c.paidCurrency ? (
              <p className="font-bold text-leaf">Payée · {formatPrice(c.paidAmount, c.paidCurrency)}</p>
            ) : (
              <p className={c.paymentStatus === 'refunded' ? 'font-bold text-red-700' : 'text-ink-soft'}>
                {c.paymentStatus === 'refunded' ? 'Remboursée au parent' : 'Pas encore payée'}
              </p>
            )}
            <p className="mt-1 text-xs text-ink-soft">Votre gain est calculé sur le montant payé, une fois la consultation terminée.</p>
          </Card>
          <Card title="Horaire">
            <p className="font-bold">{c.scheduledAt ? formatDateTime(c.scheduledAt) : '—'}</p>
            {c.preferredAt && <p className="mt-1 text-sm text-ink-soft">Souhaité par le parent : {formatDateTime(c.preferredAt)}</p>}
          </Card>
          <Card title="Parent">
            {contact ? (
              <>
                <p className="font-bold">
                  {contact.firstName} {contact.lastName}
                </p>
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="mt-2 inline-flex items-center gap-2 font-bold text-sky-brand">
                    <Icon name="phone" size={18} /> {contact.phone}
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-soft">Coordonnées visibles uniquement pour vos consultations confirmées.</p>
            )}
          </Card>
          <Card title="Historique">
            <ol className="space-y-2 text-sm">
              {events.map((e, i) => (
                <li key={i}>
                  <span className="font-bold">{EVENT_LABELS[e.event]}</span> <span className="text-ink-soft">{ACTOR_LABELS[e.actorRole]}</span>
                  <span className="block text-xs text-ink-soft">{formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      {closing && (
        <CloseDialog
          consultation={c}
          mode={closing}
          onClose={(updated) => {
            setClosing(undefined)
            if (updated) setConsultation(updated)
          }}
        />
      )}
    </>
  )
}
