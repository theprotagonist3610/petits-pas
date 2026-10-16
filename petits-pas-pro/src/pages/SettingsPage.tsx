import { useState, type FormEvent } from 'react'
import { useProAuth } from '@/auth/ProAuthProvider'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { PageTitle } from '@/components/Layout'
import { Icon } from '@/components/Icon'
import { Alert, Button, Card, Field, inputClass } from '@/components/ui'
import { PlatformSettings } from './PlatformSettings'

const PASSWORD_MIN_LENGTH = 10

function PasswordForm() {
  const { setPassword } = useProAuth()
  const [password, setValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < PASSWORD_MIN_LENGTH) return setInvalid(`Au moins ${PASSWORD_MIN_LENGTH} caractères.`)
    if (password !== confirmation) return setInvalid('Les deux mots de passe ne sont pas identiques.')
    setInvalid(undefined)
    setError(undefined)
    setSaved(false)
    setBusy(true)
    const result = await setPassword(password)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setValue('')
    setConfirmation('')
    setSaved(true)
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {error && <Alert>{errorMessage(error)}</Alert>}
      {saved && <Alert tone="success">Mot de passe modifié.</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nouveau mot de passe" hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères.`} error={invalid}>
          <input type="password" className={inputClass} value={password} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirmer le mot de passe">
          <input type="password" className={inputClass} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        Changer le mot de passe
      </Button>
    </form>
  )
}

export function SettingsPage() {
  const { user, isAdmin } = useProAuth()
  return (
    <>
      <PageTitle title="Paramètres" />
      <div className="space-y-4">
        <Card title="Mon compte">
          <p className="mb-4 text-sm text-ink-soft">
            Adresse de connexion : <span className="font-bold text-ink">{user?.email}</span>
          </p>
          <PasswordForm />
        </Card>
        <Card title="Sécurité">
          <p className="flex items-start gap-2 font-semibold text-leaf">
            <Icon name="shield" size={20} className="mt-0.5 shrink-0" />
            Double authentification active : un code de votre application d’authentification est demandé à chaque connexion.
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Téléphone perdu ou changé ? Contactez un administrateur de Petits Pas pour réinitialiser votre double authentification.
          </p>
        </Card>
        {isAdmin && <PlatformSettings />}
      </div>
    </>
  )
}
