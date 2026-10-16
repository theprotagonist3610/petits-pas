import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import type { AdminStats, CountryCode, ProfessionalRow, Specialty } from '@petits-pas/shared/database.types'
import { isValidEmail } from '@petits-pas/shared/validation'
import { admin } from '@/lib/services'
import type { Invitation, OwnProfessional } from '@/lib/admin'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { COUNTRIES, specialtyName, specialtyOptions } from '@/lib/format'
import { PageTitle } from '@/components/Layout'
import { Icon, type IconName } from '@/components/Icon'
import { Alert, Button, Card, Dialog, Field, inputClass } from '@/components/ui'
import { Avatar } from '@/components/Avatar'

const EMPTY: Invitation = {
  email: '',
  first_name: '',
  last_name: '',
  specialty: 'pediatrician',
  country: 'BJ',
  license_number: '',
  facility_name: '',
  city: '',
  phone: '',
  offers_teleconsultation: true,
  offers_appointment: true,
  verified: false,
}

function InviteDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (pro: ProfessionalRow) => void }) {
  const [form, setForm] = useState<Invitation>(EMPTY)
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<Invitation>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) return setInvalid('Nom et prénom obligatoires.')
    if (!isValidEmail(form.email.trim())) return setInvalid('Adresse e-mail non valide.')
    setInvalid(undefined)
    setBusy(true)
    setError(undefined)
    const result = await admin.invite({ ...form, email: form.email.trim() })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onInvited(result.data)
  }

  return (
    <Dialog title="Inviter un professionnel" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {(invalid || error) && <Alert>{invalid ?? errorMessage(error!)}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prénom">
            <input className={inputClass} value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} />
          </Field>
          <Field label="Nom">
            <input className={inputClass} value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} />
          </Field>
        </div>
        <Field label="E-mail" hint="Le lien d’invitation sera envoyé à cette adresse.">
          <input type="email" className={inputClass} value={form.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Spécialité">
            <select className={inputClass} value={form.specialty} onChange={(e) => set({ specialty: e.target.value as Specialty })}>
              {specialtyOptions().map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pays">
            <select className={inputClass} value={form.country} onChange={(e) => set({ country: e.target.value as CountryCode })}>
              {Object.entries(COUNTRIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Numéro d’ordre">
            <input className={inputClass} value={form.license_number} onChange={(e) => set({ license_number: e.target.value })} />
          </Field>
          <Field label="Établissement">
            <input className={inputClass} value={form.facility_name} onChange={(e) => set({ facility_name: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.offers_appointment} onChange={(e) => set({ offers_appointment: e.target.checked })} className="size-5 accent-sky-brand" />
          Propose des rendez-vous
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.offers_teleconsultation}
            onChange={(e) => set({ offers_teleconsultation: e.target.checked })}
            className="size-5 accent-sky-brand"
          />
          Propose des téléconsultations
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-honey-soft p-3 text-sm font-bold">
          <input type="checkbox" checked={form.verified} onChange={(e) => set({ verified: e.target.checked })} className="size-5 accent-sky-brand" />
          J’ai vérifié le numéro d’ordre auprès de l’ordre professionnel
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            Envoyer l’invitation
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Un administrateur qui exerce aussi : création de sa propre fiche professionnelle (vérifiée d'office). */
export function BecomeProfessionalDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<OwnProfessional>({
    first_name: '',
    last_name: '',
    specialty: 'pediatrician',
    country: 'BJ',
    license_number: '',
    facility_name: '',
    city: '',
    phone: '',
    offers_teleconsultation: true,
    offers_appointment: true,
  })
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<OwnProfessional>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim()) return setInvalid('Nom et prénom obligatoires.')
    if (!form.offers_appointment && !form.offers_teleconsultation) return setInvalid('Proposez au moins un type de consultation.')
    setInvalid(undefined)
    setBusy(true)
    const result = await admin.becomeProfessional(form)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onCreated()
  }

  return (
    <Dialog title="Activer mon espace professionnel" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <p className="text-sm text-ink-soft">
          Votre fiche est vérifiée d’office. Vous ajouterez ensuite votre photo de profil, obligatoire, puis vous passerez d’un espace à l’autre
          depuis le menu.
        </p>
        {(invalid || error) && <Alert>{invalid ?? errorMessage(error!)}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prénom">
            <input className={inputClass} value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} autoComplete="given-name" />
          </Field>
          <Field label="Nom">
            <input className={inputClass} value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} autoComplete="family-name" />
          </Field>
          <Field label="Spécialité">
            <select className={inputClass} value={form.specialty} onChange={(e) => set({ specialty: e.target.value as Specialty })}>
              {specialtyOptions().map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pays d’exercice">
            <select className={inputClass} value={form.country} onChange={(e) => set({ country: e.target.value as CountryCode })}>
              {Object.entries(COUNTRIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Numéro d’ordre">
            <input className={inputClass} value={form.license_number} onChange={(e) => set({ license_number: e.target.value })} />
          </Field>
          <Field label="Établissement">
            <input className={inputClass} value={form.facility_name} onChange={(e) => set({ facility_name: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={form.offers_appointment} onChange={(e) => set({ offers_appointment: e.target.checked })} className="size-5 accent-sky-brand" />
          Je propose des rendez-vous
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.offers_teleconsultation}
            onChange={(e) => set({ offers_teleconsultation: e.target.checked })}
            className="size-5 accent-sky-brand"
          />
          Je propose des téléconsultations
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button type="submit" disabled={busy}>
            Créer ma fiche professionnelle
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function StatusPill({ pro }: { pro: ProfessionalRow }) {
  if (!pro.is_active) return <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-xs font-extrabold text-ink-soft">Désactivé</span>
  if (!pro.verified_at) return <span className="rounded-full bg-honey-soft px-2.5 py-0.5 text-xs font-extrabold text-ink">À vérifier</span>
  return <span className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-extrabold text-leaf">Actif</span>
}

interface Kpi {
  label: string
  value: number | undefined
  detail?: string
  icon: IconName
  tint: string
}

function KpiCard({ label, value, detail, icon, tint }: Kpi) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-surface p-5 shadow-sm">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon name={icon} size={24} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink-soft">{label}</p>
        <p className="text-3xl font-extrabold">{value?.toLocaleString('fr') ?? '–'}</p>
        {detail && <p className="mt-0.5 text-xs text-ink-soft">{detail}</p>}
      </div>
    </div>
  )
}

const TABS: { to: string; label: string }[] = [
  { to: '/admin', label: 'Vue d’ensemble' },
  { to: '/admin/consultations', label: 'Consultations' },
  { to: '/admin/parents', label: 'Parents' },
]

/** Administration : titre et onglets, puis l'onglet choisi. */
export function AdminLayout() {
  return (
    <>
      <PageTitle title="Administration" />
      <nav aria-label="Sections de l’administration" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/admin'}
            className={({ isActive }) =>
              `-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 font-bold whitespace-nowrap transition-colors ${
                isActive ? 'border-sky-brand text-sky-brand' : 'border-transparent text-ink-soft hover:text-ink'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}

/** Vue d'ensemble : 3 indicateurs principaux, puis les professionnels partenaires. */
export function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats>()
  const [pros, setPros] = useState<ProfessionalRow[]>()
  const [error, setError] = useState<ProErrorCode>()
  const [inviting, setInviting] = useState(false)
  const [notice, setNotice] = useState<string>()

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([admin.stats(), admin.listProfessionals()])
    if (s.ok) setStats(s.data)
    if (p.ok) setPros(p.data)
    setError(!s.ok ? s.error : !p.ok ? p.error : undefined)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function change(pro: ProfessionalRow, patch: { isActive?: boolean; verified?: boolean }) {
    const result = await admin.update(pro.id, patch)
    if (!result.ok) return setError(result.error)
    setPros((list) => list?.map((p) => (p.id === pro.id ? result.data : p)))
    void admin.stats().then((s) => s.ok && setStats(s.data))
  }

  const byStatus = stats?.consultations_by_status ?? {}
  const kpis: Kpi[] = [
    {
      label: 'Consultations',
      value: stats?.consultations,
      detail: stats && `${byStatus.pending ?? 0} en attente · ${byStatus.confirmed ?? 0} confirmées · ${byStatus.completed ?? 0} terminées`,
      icon: 'chat',
      tint: 'bg-leaf-soft text-leaf',
    },
    {
      label: 'Professionnels',
      value: stats?.professionals,
      detail: stats && `${stats.professionals_operational} opérationnels · ${stats.professionals_to_verify} à vérifier`,
      icon: 'shield',
      tint: 'bg-sky-soft text-sky-brand',
    },
    {
      label: 'Parents',
      value: stats?.parents,
      detail: stats && `${stats.parents_last_30_days} inscrits ces 30 derniers jours`,
      icon: 'user',
      tint: 'bg-sun-soft text-sun',
    },
  ]

  return (
    <>
      {(error || notice) && (
        <div className="mb-4 space-y-2">
          {error && <Alert>{errorMessage(error)}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
        </div>
      )}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>
      <Card
        title="Professionnels partenaires"
        action={
          <Button onClick={() => setInviting(true)}>
            <Icon name="plus" size={18} /> Inviter un professionnel
          </Button>
        }
      >
        {pros?.length === 0 && <p className="text-ink-soft">Aucun professionnel pour le moment.</p>}
        <ul className="divide-y divide-line">
          {pros?.map((pro) => (
            <li key={pro.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar path={pro.avatar_path} name={`${pro.first_name} ${pro.last_name}`} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {pro.first_name} {pro.last_name} <StatusPill pro={pro} />
                </p>
                <p className="text-sm text-ink-soft">
                  {specialtyName(pro.specialty)} · {COUNTRIES[pro.country]}
                  {pro.license_number && ` · N° ${pro.license_number}`}
                  {pro.email && ` · ${pro.email}`}
                  {!pro.avatar_path && ' · sans photo (accès bloqué)'}
                </p>
              </div>
              <div className="flex gap-2">
                {!pro.verified_at && (
                  <Button variant="secondary" onClick={() => void change(pro, { verified: true })}>
                    <Icon name="check" size={18} /> Vérifier
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void change(pro, { isActive: !pro.is_active })}>
                  {pro.is_active ? 'Désactiver' : 'Réactiver'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {inviting && (
        <InviteDialog
          onClose={() => setInviting(false)}
          onInvited={(pro) => {
            setInviting(false)
            setPros((list) => [...(list ?? []), pro].sort((a, b) => a.last_name.localeCompare(b.last_name)))
            setNotice(`Invitation envoyée à ${pro.email}.`)
            void admin.stats().then((s) => s.ok && setStats(s.data))
          }}
        />
      )}
    </>
  )
}
