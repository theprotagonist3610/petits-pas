import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GOOGLE_CLIENT_ID, createNonce, loadGoogleIdentity, type AuthErrorCode } from '@/lib/auth'
import { useAuth } from './AuthProvider'
import { GoogleButton } from './AuthUi'

/** Largeur maximale acceptée par Google pour son bouton. */
const MAX_BUTTON_WIDTH = 400

interface Props {
  /** Page où aller une fois connecté. */
  next: string
  onError: (code: AuthErrorCode) => void
  /** Propose aussi le panneau One Tap de Google (compte déjà connu sur le téléphone). */
  oneTap?: boolean
  /** Formulation du bouton : « Continuer avec Google » ou « S'inscrire avec Google ». */
  context?: 'signin' | 'signup'
}

/**
 * Bouton officiel « Continuer avec Google » (Google Identity Services), dessiné par Google dans l'application.
 * Repli automatique sur la connexion par redirection si le script de Google ne peut pas être chargé.
 */
export function GoogleSignIn({ next, onError, oneTap = false, context = 'signin' }: Props) {
  const { service } = useAuth()
  const navigate = useNavigate()
  const container = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'loading' | 'ready' | 'fallback'>(GOOGLE_CLIENT_ID ? 'loading' : 'fallback')
  const [busy, setBusy] = useState(false)
  // Un nonce ne sert qu'une fois : après un échec, on réinitialise Google avec un nouveau nonce.
  const [round, setRound] = useState(0)

  // Références stables pour le rappel de Google (créé une seule fois par initialisation).
  const latest = useRef({ next, onError, navigate })
  latest.current = { next, onError, navigate }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !service) return
    let active = true
    let gsi: Awaited<ReturnType<typeof loadGoogleIdentity>> | undefined

    void (async () => {
      try {
        gsi = await loadGoogleIdentity()
        const nonce = await createNonce()
        if (!active || !container.current) return
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          context,
          use_fedcm_for_prompt: true,
          itp_support: true,
          cancel_on_tap_outside: true,
          callback: async ({ credential }) => {
            setBusy(true)
            const result = await service.signInWithGoogleIdToken(credential, nonce.raw)
            if (!active) return
            setBusy(false)
            if (result.ok) latest.current.navigate(latest.current.next, { replace: true })
            else {
              latest.current.onError(result.error)
              setRound((r) => r + 1)
            }
          },
        })
        const width = Math.min(MAX_BUTTON_WIDTH, Math.max(200, Math.floor(container.current.getBoundingClientRect().width)))
        container.current.replaceChildren()
        gsi.renderButton(container.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: context === 'signup' ? 'signup_with' : 'continue_with',
          logo_alignment: 'center',
          locale: 'fr',
          width,
        })
        setMode('ready')
        if (oneTap) gsi.prompt()
      } catch {
        if (active) setMode('fallback')
      }
    })()

    return () => {
      active = false
      gsi?.cancel()
    }
  }, [service, context, oneTap, round])

  if (!service) return null

  if (mode === 'fallback') {
    return (
      <GoogleButton
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void service.signInWithGoogle(next).then((result) => {
            // En cas de succès, le navigateur part chez Google : on reste « occupé ».
            if (!result.ok) {
              onError(result.error)
              setBusy(false)
            }
          })
        }}
      />
    )
  }

  return (
    <div className={`flex min-h-11 justify-center transition-opacity ${busy ? 'pointer-events-none opacity-50' : ''}`} aria-busy={busy}>
      {/* Google dessine son bouton dans ce conteneur (iframe). */}
      <div ref={container} className="w-full max-w-[400px] [&>div]:mx-auto" />
    </div>
  )
}
