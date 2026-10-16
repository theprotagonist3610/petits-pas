import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { AdminConsultationRow, AdminParentRow, ConsultationStatus, Currency, PaymentMethod } from '@petits-pas/shared/database.types'
import { CURRENCIES, formatPrice } from '@petits-pas/shared/platform'
import { usePlatformSettings } from '@/auth/PlatformProvider'
import { parseAmount } from '@/lib/platformAdmin'
import { admin } from '@/lib/services'
import type { Page } from '@/lib/admin'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { COUNTRIES, specialtyName, STATUSES, TYPES, formatAgo } from '@/lib/format'
import { Icon, type IconName } from '@/components/Icon'
import { Alert, Button, Card, Dialog, Field, StatusBadge, inputClass } from '@/components/ui'

const date = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Liste paginée (« Voir plus ») : recharge depuis le début quand `query` change, ajoute la page suivante sinon.
 */
function usePagedList<T, Q>(query: Q, fetchPage: (query: Q, offset: number) => Promise<{ ok: true; data: Page<T> } | { ok: false; error: ProErrorCode }>) {
  const [rows, setRows] = useState<T[]>()
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<ProErrorCode>()
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      const result = await fetchPage(query, offset)
      setLoading(false)
      if (!result.ok) return setError(result.error)
      setError(undefined)
      setTotal(result.data.total)
      setRows((current) => (offset === 0 ? result.data.rows : [...(current ?? []), ...result.data.rows]))
    },
    [query, fetchPage],
  )

  useEffect(() => {
    void load(0)
  }, [load])

  return { rows, total, error, loading, more: () => load(rows?.length ?? 0), reload: () => load(0) }
}

function MoreButton({ shown, total, loading, onMore }: { shown: number; total: number; loading: boolean; onMore: () => void }) {
  if (shown >= total) return null
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <span className="text-sm text-ink-soft">
        {shown} sur {total.toLocaleString('fr')}
      </span>
      <Button variant="secondary" onClick={onMore} disabled={loading}>
        {loading ? 'Chargement…' : 'Voir plus'}
      </Button>
    </div>
  )
}

const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  mobile_money: 'Mobile Money',
  card: 'Carte bancaire',
  cash: 'Espèces',
  bank_transfer: 'Virement',
  other: 'Autre',
}

/** Enregistrement d'un paiement (montant réel, promotion comprise) ou d'un remboursement. */
function PaymentDialog({
  consultation: c,
  refund,
  onClose,
  onDone,
}: {
  consultation: AdminConsultationRow
  refund: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { platform } = usePlatformSettings()
  const [amount, setAmount] = useState(c.price_amount !== null ? String(c.price_amount) : '')
  const [currency, setCurrency] = useState<Currency>(c.price_currency ?? platform?.settings.currency ?? 'XOF')
  const [method, setMethod] = useState<PaymentMethod>('mobile_money')
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10))
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)
  const value = parseAmount(amount)
  const promo = !refund && c.price_amount !== null && value !== null && !Number.isNaN(value) && value !== c.price_amount

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!refund && (value === null || Number.isNaN(value))) return setInvalid('Indiquez le montant réellement payé.')
    setInvalid(undefined)
    setBusy(true)
    const result = refund ? await admin.refund(c.id, reference) : await admin.recordPayment(c.id, { amount: value!, currency, method, reference, paidOn })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onDone()
  }

  return (
    <Dialog title={refund ? 'Rembourser la consultation' : 'Enregistrer le paiement'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-ink-soft">
          {TYPES[c.type]}
          {c.requested_specialty && ` · ${specialtyName(c.requested_specialty)}`}
          {c.professional_name && ` · ${c.professional_name}`}
          {c.price_amount !== null && c.price_currency && ` · tarif ${formatPrice(c.price_amount, c.price_currency)}`}
        </p>
        {error && <Alert>{errorMessage(error)}</Alert>}
        {refund ? (
          <p>
            Remboursement de <strong>{formatPrice(c.paid_amount ?? 0, c.paid_currency ?? 'XOF')}</strong>. La consultation ne rapportera rien au
            professionnel ; impossible si son gain est déjà demandé ou versé.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Montant payé" hint={promo ? 'Différent du tarif : prix promotionnel.' : undefined} error={invalid}>
              <input inputMode="decimal" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Devise">
              <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {Object.entries(CURRENCIES).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Moyen de paiement">
              <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_METHODS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date du paiement">
              <input type="date" className={inputClass} value={paidOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Référence (facultatif)" hint="Numéro de transaction, reçu…">
          <input className={inputClass} value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Retour
          </Button>
          <Button type="submit" variant={refund ? 'destructive' : 'primary'} disabled={busy}>
            {refund ? 'Rembourser' : 'Enregistrer le paiement'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Cellule « Paiement » : état, montant payé (signalé s'il diffère du tarif) et action. */
function PaymentCell({ consultation: c, onChanged }: { consultation: AdminConsultationRow; onChanged: () => void }) {
  const [dialog, setDialog] = useState<'pay' | 'refund'>()
  const payable = c.payment_status === 'unpaid' && (c.status === 'confirmed' || c.status === 'completed')
  return (
    <div className="flex flex-col items-start gap-1">
      {c.payment_status === 'paid' && c.paid_amount !== null && c.paid_currency ? (
        <span className="font-bold whitespace-nowrap text-leaf">
          {formatPrice(c.paid_amount, c.paid_currency)}
          {c.price_amount !== null && c.paid_amount !== c.price_amount && <span className="ml-1 rounded bg-sun-soft px-1.5 text-xs text-sun">promo</span>}
        </span>
      ) : (
        <span className={c.payment_status === 'refunded' ? 'text-red-700' : 'text-ink-soft'}>{c.payment_status === 'refunded' ? 'Remboursée' : 'Non payée'}</span>
      )}
      {payable && (
        <button className="text-xs font-bold text-sky-brand hover:underline" onClick={() => setDialog('pay')}>
          Enregistrer le paiement
        </button>
      )}
      {c.payment_status === 'paid' && (
        <button className="text-xs font-bold text-red-700 hover:underline" onClick={() => setDialog('refund')}>
          Rembourser
        </button>
      )}
      {dialog && (
        <PaymentDialog
          consultation={c}
          refund={dialog === 'refund'}
          onClose={() => setDialog(undefined)}
          onDone={() => {
            setDialog(undefined)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

const STATUS_FILTERS: (ConsultationStatus | null)[] = [null, 'pending', 'confirmed', 'completed', 'cancelled']

const fetchConsultations = (status: ConsultationStatus | null, offset: number) => admin.listConsultations(status, offset)

export function AdminConsultationsPage() {
  const [status, setStatus] = useState<ConsultationStatus | null>(null)
  const list = usePagedList<AdminConsultationRow, ConsultationStatus | null>(status, fetchConsultations)

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par statut">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value ?? 'all'}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold ${
              status === value ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line bg-surface text-ink-soft hover:bg-ink/5'
            }`}
          >
            {value ? STATUSES[value] : 'Toutes'}
          </button>
        ))}
      </div>
      {list.error && (
        <div className="mb-4">
          <Alert>{errorMessage(list.error)}</Alert>
        </div>
      )}
      <Card>
        <p className="mb-3 flex items-center gap-2 text-xs text-ink-soft">
          <Icon name="lock" size={14} /> Motifs et informations sur les enfants non affichés : ils ne concernent que le parent et le professionnel.
        </p>
        {list.rows?.length === 0 && <p className="text-ink-soft">Aucune consultation.</p>}
        {!!list.rows?.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="py-2 pr-3 font-bold">Demandée</th>
                  <th className="py-2 pr-3 font-bold">Type</th>
                  <th className="py-2 pr-3 font-bold">Spécialiste</th>
                  <th className="py-2 pr-3 font-bold">Pour</th>
                  <th className="py-2 pr-3 font-bold">Pays</th>
                  <th className="py-2 pr-3 font-bold">Professionnel</th>
                  <th className="py-2 pr-3 font-bold">Rendez-vous</th>
                  <th className="py-2 pr-3 font-bold">Statut</th>
                  <th className="py-2 font-bold">Paiement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3 whitespace-nowrap" title={dateTime.format(new Date(c.created_at))}>
                      {formatAgo(c.created_at)}
                    </td>
                    <td className="py-2.5 pr-3">{TYPES[c.type]}</td>
                    <td className="py-2.5 pr-3">{c.requested_specialty ? specialtyName(c.requested_specialty) : '—'}</td>
                    <td className="py-2.5 pr-3">{c.for_child ? 'Un enfant' : 'Le parent'}</td>
                    <td className="py-2.5 pr-3">{c.country ? COUNTRIES[c.country] : '—'}</td>
                    <td className="py-2.5 pr-3">{c.professional_name ?? <span className="text-ink-soft">Non attribuée</span>}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{c.scheduled_at ? dateTime.format(new Date(c.scheduled_at)) : '—'}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-2.5">
                      <PaymentCell consultation={c} onChanged={() => void list.reload()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <MoreButton shown={list.rows?.length ?? 0} total={list.total} loading={list.loading} onMore={() => void list.more()} />
      </Card>
    </>
  )
}

const fetchParents = (search: string, offset: number) => admin.listParents(search, offset)

export function AdminParentsPage() {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const list = usePagedList<AdminParentRow, string>(search, fetchParents)

  // Recherche lancée 300 ms après la dernière frappe.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input), 300)
    return () => clearTimeout(timer)
  }, [input])

  return (
    <>
      <div className="mb-4 max-w-md">
        <label className="block">
          <span className="sr-only">Rechercher un parent</span>
          <input type="search" className={inputClass} value={input} placeholder="Rechercher par nom ou e-mail…" onChange={(e) => setInput(e.target.value)} />
        </label>
      </div>
      {list.error && (
        <div className="mb-4">
          <Alert>{errorMessage(list.error)}</Alert>
        </div>
      )}
      <Card>
        {list.rows?.length === 0 && <p className="text-ink-soft">{search ? 'Aucun parent ne correspond à cette recherche.' : 'Aucun parent inscrit.'}</p>}
        {!!list.rows?.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="py-2 pr-3 font-bold">Parent</th>
                  <th className="py-2 pr-3 font-bold">E-mail</th>
                  <th className="py-2 pr-3 font-bold">Pays</th>
                  <th className="py-2 pr-3 font-bold">Inscription</th>
                  <th className="py-2 pr-3 font-bold">Dernière connexion</th>
                  <th className="py-2 text-right font-bold">Consultations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.rows.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 font-bold">{`${p.first_name} ${p.last_name}`.trim() || <span className="font-normal text-ink-soft">Profil incomplet</span>}</td>
                    <td className="py-2.5 pr-3">{p.email ?? '—'}</td>
                    <td className="py-2.5 pr-3">{p.country ? COUNTRIES[p.country] : '—'}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{date.format(new Date(p.created_at))}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{p.last_sign_in_at ? formatAgo(p.last_sign_in_at) : '—'}</td>
                    <td className="py-2.5 text-right font-bold">{p.consultations_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <MoreButton shown={list.rows?.length ?? 0} total={list.total} loading={list.loading} onMore={() => void list.more()} />
      </Card>
    </>
  )
}

/** Onglet prévu, pas encore construit. */
export function AdminSoonPage({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-ink/5 text-ink-soft">
          <Icon name={icon} size={28} />
        </span>
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="max-w-md text-ink-soft">{text}</p>
      </div>
    </Card>
  )
}


