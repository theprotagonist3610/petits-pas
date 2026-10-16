import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isValidEmail } from '@petits-pas/shared/validation'
import { useProAuth } from '@/auth/ProAuthProvider'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { Alert, AuthScreen, Button, Field, inputClass } from '@/components/ui'
import { AvatarPicker } from '@/components/Avatar'

const PASSWORD_MIN_LENGTH = 10

export function LoginPage() {
  const { signIn, requestPasswordReset } = useProAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError(undefined)
    const result = await signIn(email, password)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  async function forgot() {
    if (!isValidEmail(email.trim())) return setError('invalid_email')
    setError(undefined)
    const result = await requestPasswordReset(email)
    if (result.ok) setNotice(`Si un compte existe pour ${email.trim()}, un lien pour choisir un nouveau mot de passe vient d’être envoyé.`)
    else setError(result.error)
  }

  return (
    <AuthScreen title="Connexion" subtitle="Espace réservé aux professionnels de santé partenaires.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{errorMessage(error)}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <Field label="E-mail">
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Mot de passe">
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          Se connecter
        </Button>
        <button type="button" onClick={() => void forgot()} className="text-sm font-bold text-sky-brand hover:underline">
          Mot de passe oublié ?
        </button>
      </form>
      <p className="text-sm text-ink-soft">Pas encore de compte ? L’accès se fait sur invitation de l’équipe Petits Pas.</p>
    </AuthScreen>
  )
}

/** Arrivée par le lien d'invitation ou de réinitialisation : choix du mot de passe. */
export function ActivationPage() {
  const { gate, setPassword, refresh } = useProAuth()
  const navigate = useNavigate()
  const [password, setValue] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  if (gate === 'loading') return null
  // Compte déjà protégé par la double authentification : Supabase exige le code avant de changer le mot de passe.
  if (gate === 'mfa_challenge') return <MfaPage mode="challenge" />
  if (gate === 'signed_out') {
    return (
      <AuthScreen title="Lien expiré" subtitle="Ce lien n’est plus valable. Demandez une nouvelle invitation ou utilisez « Mot de passe oublié ».">
        <Button onClick={() => navigate('/', { replace: true })}>Retour à la connexion</Button>
      </AuthScreen>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < PASSWORD_MIN_LENGTH) return setInvalid(`Au moins ${PASSWORD_MIN_LENGTH} caractères.`)
    if (password !== confirmation) return setInvalid('Les deux mots de passe ne sont pas identiques.')
    setInvalid(undefined)
    setBusy(true)
    const result = await setPassword(password)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    await refresh()
    navigate('/', { replace: true })
  }

  return (
    <AuthScreen title="Choisissez votre mot de passe" subtitle="Ensuite, vous activerez la double authentification.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert>{errorMessage(error)}</Alert>}
        <Field label="Nouveau mot de passe" hint={`Au moins ${PASSWORD_MIN_LENGTH} caractères.`} error={invalid}>
          <input type="password" className={inputClass} value={password} onChange={(e) => setValue(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirmer le mot de passe">
          <input
            type="password"
            className={inputClass}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          Enregistrer
        </Button>
      </form>
    </AuthScreen>
  )
}

function CodeForm({ onSubmit, label }: { onSubmit: (code: string) => Promise<ProErrorCode | undefined>; label: string }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (code.replace(/\s/g, '').length !== 6 || busy) return
    setBusy(true)
    const failure = await onSubmit(code)
    setBusy(false)
    setError(failure)
    if (failure) setCode('')
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Field label={label}>
        <input
          className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        Valider
      </Button>
    </form>
  )
}

/** Double authentification : activation (QR code) puis saisie du code à chaque connexion. */
export function MfaPage({ mode }: { mode: 'enroll' | 'challenge' }) {
  const { enrollTotp, verifyTotp, signOut } = useProAuth()
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string }>()
  const [error, setError] = useState<ProErrorCode>()

  // Une seule création par affichage de la page : en développement, React (StrictMode) exécute les effets deux fois,
  // et une seconde création supprimerait le QR code de la première alors qu'il reste affiché.
  const started = useRef(false)
  useEffect(() => {
    if (mode !== 'enroll' || started.current) return
    started.current = true
    void enrollTotp().then((result) => (result.ok ? setEnrollment(result.data) : setError(result.error)))
  }, [mode])

  const verify = async (code: string) => {
    const result = await verifyTotp(code, enrollment?.factorId)
    return result.ok ? undefined : result.error
  }

  return (
    <AuthScreen
      title={mode === 'enroll' ? 'Activez la double authentification' : 'Code de vérification'}
      subtitle={
        mode === 'enroll'
          ? 'Obligatoire pour accéder aux données de santé. Scannez ce QR code avec une application d’authentification (Google Authenticator, Microsoft Authenticator…).'
          : 'Saisissez le code à 6 chiffres affiché dans votre application d’authentification.'
      }
    >
      {error && <Alert>{errorMessage(error)}</Alert>}
      {mode === 'enroll' && enrollment && (
        <div className="flex flex-col items-center gap-2">
          <img src={enrollment.qrCode} alt="QR code à scanner avec l’application d’authentification" className="size-48 rounded-xl bg-white p-2" />
          <details className="w-full text-sm text-ink-soft">
            <summary className="cursor-pointer font-bold">Impossible de scanner ?</summary>
            <p className="mt-1">Saisissez cette clé dans l’application :</p>
            <code className="mt-1 block rounded-lg bg-ink/5 p-2 break-all select-all">{enrollment.secret}</code>
          </details>
        </div>
      )}
      {(mode === 'challenge' || enrollment) && <CodeForm onSubmit={verify} label="Code à 6 chiffres" />}
      <button type="button" onClick={() => void signOut()} className="text-sm font-bold text-ink-soft hover:underline">
        Se déconnecter
      </button>
    </AuthScreen>
  )
}

export function BlockedPage({ reason }: { reason: 'pending' | 'not_professional' }) {
  const { signOut, refresh } = useProAuth()
  return (
    <AuthScreen
      title={reason === 'pending' ? 'Compte en cours de vérification' : 'Accès réservé aux professionnels'}
      subtitle={
        reason === 'pending'
          ? 'L’équipe Petits Pas vérifie votre numéro d’ordre. Vous aurez accès aux demandes dès que votre compte sera validé.'
          : 'Ce compte n’est pas un compte professionnel. Les parents utilisent l’application Petits Pas.'
      }
    >
      <div className="flex gap-2">
        {reason === 'pending' && (
          <Button variant="secondary" onClick={() => void refresh()}>
            Vérifier à nouveau
          </Button>
        )}
        <Button variant="ghost" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </div>
    </AuthScreen>
  )
}

/** Photo de profil obligatoire avant d'accéder aux demandes. */
export function PhotoPage() {
  const { user, professional, refresh, signOut } = useProAuth()
  if (!user || !professional) return null
  return (
    <AuthScreen title="Ajoutez votre photo de profil" subtitle="Obligatoire : les parents voient la photo du professionnel qui suit leur consultation.">
      <AvatarPicker
        userId={user.id}
        professionalId={professional.id}
        currentPath={professional.avatar_path}
        name={`${professional.first_name} ${professional.last_name}`}
        onSaved={() => void refresh()}
      />
      <button type="button" onClick={() => void signOut()} className="text-sm font-bold text-ink-soft hover:underline">
        Se déconnecter
      </button>
    </AuthScreen>
  )
}

/** Plateforme en veille (mise à jour) : les professionnels patientent, les administrateurs gardent l'accès. */
export function MaintenancePage({ message }: { message: string | null }) {
  const { signOut, refresh } = useProAuth()
  return (
    <AuthScreen title="Maintenance en cours" subtitle={message || 'Petits Pas Pro est momentanément indisponible pendant une mise à jour. Merci de revenir un peu plus tard.'}>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
        <Button variant="ghost" onClick={() => void signOut().then(refresh)}>
          Se déconnecter
        </Button>
      </div>
    </AuthScreen>
  )
}
