/*
 * Google Identity Services (GIS) : bouton « Continuer avec Google » et One Tap affichés par Google
 * directement dans l'application. Google renvoie un jeton d'identité (JWT) que Supabase vérifie
 * (signInWithIdToken) : pas de redirection, et Google affiche le nom de l'application, pas Supabase.
 * https://developers.google.com/identity/gsi/web/reference/js-reference
 */

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export interface GoogleCredentialResponse {
  credential: string
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
  locale?: string
}

export interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    nonce?: string
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    use_fedcm_for_prompt?: boolean
    itp_support?: boolean
    context?: 'signin' | 'signup' | 'use'
  }): void
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void
  prompt(): void
  cancel(): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

let loading: Promise<GoogleAccountsId> | undefined

/** Charge le script de Google une seule fois. Échoue hors ligne ou si le script est bloqué. */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('gsi_unavailable')))
    script.onerror = () => {
      script.remove()
      loading = undefined // Nouvel essai possible au retour du réseau.
      reject(new Error('gsi_unavailable'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * Nonce anti-rejeu : Google reçoit son empreinte SHA-256 (placée dans le jeton),
 * Supabase reçoit la valeur brute et vérifie que les deux correspondent.
 */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const hashed = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return { raw, hashed }
}
