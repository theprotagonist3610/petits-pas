import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Currency, PayoutMethod, PayoutRequestRow, PayoutStatus } from '@petits-pas/shared/database.types'
import { formatPrice } from '@petits-pas/shared/platform'
import { useProAuth } from '@/auth/ProAuthProvider'
import { accounting } from '@/lib/services'
import { PAYOUT_METHODS, summarize, type Earning, type PayoutRequest } from '@/lib/accounting'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { TYPES, specialtyName } from '@/lib/format'
import { PageTitle } from '@/components/Layout'
import { Icon, type IconName } from '@/components/Icon'
import { Alert, Button, Card, Dialog, Field, inputClass } from '@/components/ui'

const date = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', year: 'numeric' })

const PAYOUT_STATUS: Record<PayoutStatus, { label: string; style: string }> = {
  requested: { label: 'En attente de paiement', style: 'bg-honey-soft text-ink' },
  paid: { label: 'Payée', style: 'bg-leaf-soft text-leaf' },
  rejected: { label: 'Refusée', style: 'bg-red-50 text-red-700' },
}

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const s = PAYOUT_STATUS[status]
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold ${s.style}`}>{s.label}</span>
}

function Total({ label, amount, currency, icon, tint }: { label: string; amount: number; currency: Currency; icon: IconName; tint: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-sm">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="text-sm font-bold text-ink-soft">{label}</p>
        <p className="text-2xl font-extrabold">{formatPrice(amount, currency)}</p>
      </div>
    </div>
  )
}

function RequestDialog({
  amounts,
  lastRequest,
  onClose,
  onDone,
}: {
  amounts: [Currency, number][]
  lastRequest: PayoutRequestRow | undefined
  onClose: () => void
  onDone: () => void
}) {
  const [method, setMethod] = useState<PayoutMethod>(lastRequest?.method ?? 'mobile_money')
  // Coordonnées reprises de la dernière demande, pour ne pas les ressaisir.
  const [details, setDetails] = useState(lastRequest?.payout_details ?? '')
  const [error, setError] = useState<ProErrorCode>()
  const [invalid, setInvalid] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (details.trim().length < 4) return setInvalid('Indiquez où vous verser le paiement.')
    setInvalid(undefined)
    setBusy(true)
    const result = await accounting.requestPayout(method, details)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onDone()
  }

  return (
    <Dialog title="Demander le paiement" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>
          Montant demandé :{' '}
          <strong>{amounts.map(([currency, amount]) => formatPrice(amount, currency)).join(' + ')}</strong>
          <span className="block text-sm text-ink-soft">Toutes vos consultations terminées et pas encore payées.</span>
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-sm font-bold text-ink-soft">Moyen de paiement</legend>
          {(Object.keys(PAYOUT_METHODS) as PayoutMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
              className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${method === m ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line text-ink-soft'}`}
            >
              {PAYOUT_METHODS[m].label}
            </button>
          ))}
        </fieldset>
        <Field label={PAYOUT_METHODS[method].detailsLabel} error={invalid}>
          <input className={inputClass} value={details} maxLength={200} placeholder={PAYOUT_METHODS[method].placeholder} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-soft">Ces consultations sont réservées à cette demande : elles ne pourront pas être payées une seconde fois.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            Envoyer la demande
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Comptabilité du professionnel : gains, paiements, demande de paiement des arriérés. */
export function ProAccountingPage() {
  const { professional } = useProAuth()
  const [earnings, setEarnings] = useState<Earning[]>()
  const [payouts, setPayouts] = useState<PayoutRequest[]>()
  const [error, setError] = useState<ProErrorCode>()
  const [requesting, setRequesting] = useState(false)
  const [notice, setNotice] = useState(false)

  const load = useCallback(async () => {
    if (!professional) return
    const [e, p] = await Promise.all([accounting.earnings(professional.id), accounting.payouts(professional.id)])
    if (e.ok) setEarnings(e.data)
    if (p.ok) setPayouts(p.data)
    setError(!e.ok ? e.error : !p.ok ? p.error : undefined)
  }, [professional])

  useEffect(() => {
    void load()
  }, [load])

  const totals = earnings && payouts ? summarize(earnings, payouts) : undefined
  const open = new Set(payouts?.filter((p) => p.status === 'requested').map((p) => p.currency))
  // Montants demandables : disponibles, sans demande déjà en cours dans la même devise.
  const requestable = [...(totals ?? [])].filter(([currency, t]) => t.available > 0 && !open.has(currency)).map(([c, t]) => [c, t.available] as [Currency, number])
  const payoutStatus = new Map(payouts?.map((p) => [p.id, p.status]))

  return (
    <>
      <PageTitle
        title="Ma comptabilité"
        subtitle="Vos consultations terminées et leurs paiements."
        action={
          <Button onClick={() => setRequesting(true)} disabled={requestable.length === 0}>
            <Icon name="wallet" size={18} /> Demander le paiement
          </Button>
        }
      />
      <div className="space-y-4">
        {error && <Alert>{errorMessage(error)}</Alert>}
        {notice && <Alert tone="success">Demande envoyée : l’équipe Petits Pas vous prévient dès que le paiement est effectué.</Alert>}

        {totals && totals.size === 0 && (
          <Card>
            <p className="text-ink-soft">Aucun gain pour le moment. Chaque consultation terminée (avec un tarif) apparaîtra ici.</p>
          </Card>
        )}
        {[...(totals ?? [])].map(([currency, t]) => (
          <div key={currency} className="grid gap-3 sm:grid-cols-3">
            <Total label="Disponible" amount={t.available} currency={currency} icon="wallet" tint="bg-leaf-soft text-leaf" />
            <Total label="En cours de paiement" amount={t.pending} currency={currency} icon="clock" tint="bg-honey-soft text-honey" />
            <Total label="Déjà versé" amount={t.paid} currency={currency} icon="check" tint="bg-sky-soft text-sky-brand" />
          </div>
        ))}

        {!!payouts?.length && (
          <Card title="Demandes de paiement">
            <ul className="divide-y divide-line">
              {payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="font-extrabold">{formatPrice(p.amount, p.currency)}</span>
                  <PayoutStatusBadge status={p.status} />
                  <span className="text-sm text-ink-soft">
                    Demandée le {date.format(new Date(p.requested_at))} · {PAYOUT_METHODS[p.method].label}
                  </span>
                  {p.status === 'paid' && p.reference && <span className="w-full text-sm text-ink-soft">Référence du versement : {p.reference}</span>}
                  {p.status === 'rejected' && p.rejection_reason && (
                    <span className="w-full text-sm text-red-700">Motif : {p.rejection_reason} — les montants sont à nouveau disponibles.</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {!!earnings?.length && (
          <Card title="Détail des consultations">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-ink-soft">
                  <tr>
                    <th className="py-2 pr-3 font-bold">Terminée le</th>
                    <th className="py-2 pr-3 font-bold">Consultation</th>
                    <th className="py-2 pr-3 text-right font-bold">Tarif</th>
                    <th className="py-2 pr-3 text-right font-bold">Commission</th>
                    <th className="py-2 pr-3 text-right font-bold">Pour vous</th>
                    <th className="py-2 font-bold">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {earnings.map((e) => {
                    const s = e.payout_id ? payoutStatus.get(e.payout_id) : undefined
                    return (
                      <tr key={e.id}>
                        <td className="py-2.5 pr-3 whitespace-nowrap">{date.format(new Date(e.earned_at))}</td>
                        <td className="py-2.5 pr-3">
                          {e.consultation ? `${TYPES[e.consultation.type]}${e.consultation.requested_specialty ? ` · ${specialtyName(e.consultation.requested_specialty)}` : ''}` : 'Consultation supprimée'}
                        </td>
                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">{formatPrice(e.gross_amount, e.currency)}</td>
                        <td className="py-2.5 pr-3 text-right">{e.commission_percent} %</td>
                        <td className="py-2.5 pr-3 text-right font-bold whitespace-nowrap">{formatPrice(e.net_amount, e.currency)}</td>
                        <td className="py-2.5 whitespace-nowrap">{s === 'paid' ? 'Payé' : s === 'requested' ? 'En cours de paiement' : 'Disponible'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      {requesting && (
        <RequestDialog
          amounts={requestable}
          lastRequest={payouts?.[0]}
          onClose={() => setRequesting(false)}
          onDone={() => {
            setRequesting(false)
            setNotice(true)
            void load()
          }}
        />
      )}
    </>
  )
}

function ProcessDialog({ request, paid, onClose, onDone }: { request: PayoutRequest; paid: boolean; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [invalid, setInvalid] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!paid && !text.trim()) return setInvalid('Indiquez le motif : il sera visible par le professionnel.')
    setInvalid(undefined)
    setBusy(true)
    const result = await accounting.process(request.id, paid, text)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onDone()
  }

  return (
    <Dialog title={paid ? 'Confirmer le versement' : 'Refuser la demande'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>
          {request.professional ? `${request.professional.first_name} ${request.professional.last_name}` : 'Professionnel'} ·{' '}
          <strong>{formatPrice(request.amount, request.currency)}</strong>
          <span className="block text-sm text-ink-soft">
            {PAYOUT_METHODS[request.method].label} : {request.payout_details}
          </span>
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Field
          label={paid ? 'Référence du versement (facultatif)' : 'Motif du refus'}
          hint={paid ? 'Numéro de transaction Mobile Money ou référence du virement. Le versement est définitif.' : 'Les montants redeviennent disponibles pour une nouvelle demande.'}
          error={invalid}
        >
          <input className={inputClass} value={text} maxLength={paid ? 200 : 500} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Retour
          </Button>
          <Button type="submit" variant={paid ? 'primary' : 'destructive'} disabled={busy}>
            {paid ? 'Marquer comme payé' : 'Refuser la demande'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Comptabilité de la plateforme : traitement des demandes de paiement des professionnels. */
export function AdminAccountingPage() {
  const [payouts, setPayouts] = useState<PayoutRequest[]>()
  const [error, setError] = useState<ProErrorCode>()
  const [processing, setProcessing] = useState<{ request: PayoutRequest; paid: boolean }>()

  const load = useCallback(async () => {
    const result = await accounting.payouts()
    if (result.ok) setPayouts(result.data)
    setError(result.ok ? undefined : result.error)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pending = payouts?.filter((p) => p.status === 'requested') ?? []
  const done = payouts?.filter((p) => p.status !== 'requested') ?? []
  const toPay = new Map<Currency, number>()
  for (const p of pending) toPay.set(p.currency, (toPay.get(p.currency) ?? 0) + p.amount)

  return (
    <>
      <PageTitle
        title="Comptabilité"
        subtitle={pending.length ? `À verser : ${[...toPay].map(([c, a]) => formatPrice(a, c)).join(' + ')}` : 'Demandes de paiement des professionnels.'}
      />
      <div className="space-y-4">
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Card title={`Demandes à traiter (${pending.length})`}>
          {payouts && pending.length === 0 && <p className="text-ink-soft">Aucune demande en attente.</p>}
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {p.professional ? `${p.professional.first_name} ${p.professional.last_name}` : 'Professionnel'} ·{' '}
                    <span className="font-extrabold">{formatPrice(p.amount, p.currency)}</span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    Demandée le {date.format(new Date(p.requested_at))} · {PAYOUT_METHODS[p.method].label} : {p.payout_details}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setProcessing({ request: p, paid: true })}>
                    <Icon name="check" size={18} /> Payé
                  </Button>
                  <Button variant="ghost" onClick={() => setProcessing({ request: p, paid: false })}>
                    Refuser
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {done.length > 0 && (
          <Card title="Historique">
            <ul className="divide-y divide-line">
              {done.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="font-bold">{p.professional ? `${p.professional.first_name} ${p.professional.last_name}` : 'Professionnel'}</span>
                  <span className="font-extrabold">{formatPrice(p.amount, p.currency)}</span>
                  <PayoutStatusBadge status={p.status} />
                  <span className="text-ink-soft">
                    {p.processed_at && `le ${date.format(new Date(p.processed_at))}`}
                    {p.reference && ` · réf. ${p.reference}`}
                    {p.rejection_reason && ` · ${p.rejection_reason}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {processing && (
        <ProcessDialog
          request={processing.request}
          paid={processing.paid}
          onClose={() => setProcessing(undefined)}
          onDone={() => {
            setProcessing(undefined)
            void load()
          }}
        />
      )}
    </>
  )
}
