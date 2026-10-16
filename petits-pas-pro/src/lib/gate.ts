import type { ProfessionalRow } from '@petits-pas/shared/database.types'

/**
 * Étape d'accès à Petits Pas Pro, dans l'ordre :
 * connexion → double authentification (création puis saisie du code) → photo de profil → compte professionnel vérifié.
 */
export type Gate =
  | 'loading'
  | 'signed_out'
  | 'mfa_enroll'
  | 'mfa_challenge'
  /** Professionnel sans photo de profil (obligatoire). */
  | 'photo_required'
  /** Ni professionnel ni administrateur (compte parent, par exemple). */
  | 'not_professional'
  /** Professionnel désactivé ou pas encore vérifié. */
  | 'pending'
  | 'ready'

export interface GateInput {
  signedIn: boolean
  /** Au moins un facteur TOTP vérifié sur le compte. */
  hasTotp: boolean
  /** Niveau de la session : aal2 = mot de passe + code. */
  aal: 'aal1' | 'aal2' | null
  /** `undefined` : pas encore chargé. */
  professional: ProfessionalRow | null | undefined
  isAdmin: boolean | undefined
}

export function computeGate(input: GateInput): Gate {
  if (!input.signedIn) return 'signed_out'
  if (!input.hasTotp) return 'mfa_enroll'
  if (input.aal !== 'aal2') return 'mfa_challenge'
  if (input.professional === undefined || input.isAdmin === undefined) return 'loading'
  // Toute personne qui exerce (même administrateur) doit avoir une photo de profil.
  if (input.professional && !input.professional.avatar_path) return 'photo_required'
  if (input.isAdmin) return 'ready'
  if (!input.professional) return 'not_professional'
  if (!input.professional.is_active || !input.professional.verified_at) return 'pending'
  return 'ready'
}
