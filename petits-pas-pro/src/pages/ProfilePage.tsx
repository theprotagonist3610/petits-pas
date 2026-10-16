import { useState, type FormEvent } from 'react'
import { isValidEmail, isValidPhone } from '@petits-pas/shared/validation'
import { useProAuth } from '@/auth/ProAuthProvider'
import { supabase } from '@/lib/supabase'
import { attempt, done, errorMessage, fail, type ProErrorCode } from '@/lib/errors'
import { COUNTRIES, specialtyName } from '@/lib/format'
import { PageTitle } from '@/components/Layout'
import { Icon } from '@/components/Icon'
import { Alert, Button, Card, Field, inputClass } from '@/components/ui'
import { AvatarPicker } from '@/components/Avatar'

/** Seules ces colonnes sont modifiables par le professionnel (droits accordés par la base). */
const save = (id: string, patch: { facility_name: string | null; city: string | null; phone: string | null; email: string | null; offers_teleconsultation: boolean; offers_appointment: boolean }) =>
  attempt(async () => {
    const { error } = await supabase.from('professionals').update(patch).eq('id', id)
    return error ? fail(error) : done(undefined)
  })

export function ProfilePage() {
  const { professional, refresh, signOut, user } = useProAuth()
  const [facility, setFacility] = useState(professional?.facility_name ?? '')
  const [city, setCity] = useState(professional?.city ?? '')
  const [phone, setPhone] = useState(professional?.phone ?? '')
  const [email, setEmail] = useState(professional?.email ?? '')
  const [tele, setTele] = useState(professional?.offers_teleconsultation ?? false)
  const [appointment, setAppointment] = useState(professional?.offers_appointment ?? true)
  const [invalid, setInvalid] = useState<Record<string, string>>({})
  const [error, setError] = useState<ProErrorCode>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!professional) return null
  const pro = professional

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (phone.trim() && !isValidPhone(phone.trim())) found.phone = 'Numéro non valide (8 à 15 chiffres).'
    if (email.trim() && !isValidEmail(email.trim())) found.email = 'Adresse e-mail non valide.'
    if (!tele && !appointment) found.offers = 'Proposez au moins un type de consultation.'
    setInvalid(found)
    if (Object.keys(found).length || busy) return
    setBusy(true)
    setSaved(false)
    setError(undefined)
    const result = await save(pro.id, {
      facility_name: facility.trim() || null,
      city: city.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      offers_teleconsultation: tele,
      offers_appointment: appointment,
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setSaved(true)
    await refresh()
  }

  return (
    <>
      <PageTitle title="Mon profil" />
      <Card title="Photo de profil" className="mb-4">
        {user && (
          <AvatarPicker
            userId={user.id}
            professionalId={pro.id}
            currentPath={pro.avatar_path}
            name={`${pro.first_name} ${pro.last_name}`}
            onSaved={() => void refresh()}
          />
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Identité" className="lg:order-2">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-ink-soft">Nom</dt>
              <dd className="font-bold">
                {pro.first_name} {pro.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-ink-soft">Spécialité</dt>
              <dd className="font-bold">{specialtyName(pro.specialty)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Pays</dt>
              <dd className="font-bold">{COUNTRIES[pro.country]}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Numéro d’ordre</dt>
              <dd className="font-bold">{pro.license_number ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-soft">Pour modifier ces informations, contactez l’équipe Petits Pas.</p>
          <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}>
            <Icon name="logout" size={18} /> Se déconnecter
          </Button>
        </Card>
        <Card title="Coordonnées et consultations proposées" className="lg:order-1 lg:col-span-2">
          <form onSubmit={submit} noValidate className="space-y-4">
            {error && <Alert>{errorMessage(error)}</Alert>}
            {saved && <Alert tone="success">Profil enregistré.</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Établissement" hint="Lieu des rendez-vous, indiqué au parent.">
                <input className={inputClass} value={facility} maxLength={200} onChange={(e) => setFacility(e.target.value)} />
              </Field>
              <Field label="Ville">
                <input className={inputClass} value={city} maxLength={100} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="Téléphone professionnel" error={invalid.phone}>
                <input type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="E-mail professionnel" error={invalid.email}>
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-bold text-ink-soft">Consultations proposées</legend>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={appointment} onChange={(e) => setAppointment(e.target.checked)} className="size-5 accent-sky-brand" />
                Rendez-vous dans mon établissement
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={tele} onChange={(e) => setTele(e.target.checked)} className="size-5 accent-sky-brand" />
                Téléconsultation (messagerie sécurisée pendant 10 jours)
              </label>
              {invalid.offers && <span className="block text-sm font-semibold text-red-600">{invalid.offers}</span>}
            </fieldset>
            <Button type="submit" disabled={busy}>
              Enregistrer
            </Button>
          </form>
        </Card>
      </div>
    </>
  )
}
