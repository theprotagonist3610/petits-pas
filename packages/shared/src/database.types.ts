/*
 * Types du schéma Supabase (supabase/migrations). Écrits à la main pour l'instant ;
 * une fois le projet lié, on peut les régénérer avec :
 *   npx supabase gen types typescript --linked > packages/shared/src/database.types.ts
 */

export type CountryCode = 'BJ' | 'TG' | 'NE'
export type Sex = 'female' | 'male'
export type ConsultationType = 'teleconsultation' | 'appointment'
export type ConsultationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type PaymentMethod = 'mobile_money' | 'card' | 'cash' | 'bank_transfer' | 'other'
/** Spécialités connues à l'installation ; la liste est modifiable par les administrateurs (table specialties). */
export type KnownSpecialty = 'general_practitioner' | 'pediatrician' | 'pediatric_neurologist' | 'midwife' | 'nurse' | 'nutritionist' | 'other'
/** Code d'une spécialité (table specialties) : les connues, ou une ajoutée par un administrateur. */
export type Specialty = KnownSpecialty | (string & {})
/** Spécialiste qu'un parent peut demander (specialties.requestable). */
export type RequestableSpecialty = Specialty

export type ParentRow = {
  id: string
  last_name: string
  first_name: string
  sex: Sex | null
  birth_date: string | null
  profession: string | null
  phone: string | null
  email: string | null
  country: CountryCode | null
  created_at: string
  updated_at: string
}

export type ProfessionalRow = {
  id: string
  user_id: string | null
  last_name: string
  first_name: string
  specialty: Specialty
  facility_name: string | null
  city: string | null
  country: CountryCode
  phone: string | null
  email: string | null
  offers_teleconsultation: boolean
  offers_appointment: boolean
  is_active: boolean
  /** Numéro d'inscription à l'ordre professionnel. */
  license_number: string | null
  /** Vérification par un administrateur ; sans elle, aucun accès aux demandes. */
  verified_at: string | null
  /** Photo de profil (bucket professional-avatars), obligatoire pour accéder aux demandes. */
  avatar_path: string | null
  created_at: string
  updated_at: string
}

export type ConsultationRow = {
  id: string
  parent_id: string
  professional_id: string | null
  type: ConsultationType
  status: ConsultationStatus
  requested_specialty: RequestableSpecialty | null
  /** Empreinte SHA-256 de « compte:identifiant local de l'enfant » ; `null` : demande pour le parent lui-même. */
  child_ref: string | null
  /** Âge de l'enfant en mois au moment de la demande. */
  child_age_months: number | null
  child_sex: Sex | null
  reason: string
  preferred_at: string | null
  scheduled_at: string | null
  contact_phone: string | null
  professional_notes: string | null
  cancelled_at: string | null
  /** Consentement du parent à la transmission de sa demande. */
  consent_at: string | null
  /** Pays du parent au moment de la demande. */
  country: CountryCode | null
  /** Tarif figé à la confirmation (copié de la grille ; personne ne le fixe à la main). */
  price_amount: number | null
  price_currency: Currency | null
  /** Tarif normal de la grille au moment de la demande (price_amount = après promotion). */
  list_price_amount: number | null
  /** Promotion appliquée au prix, s'il y en a une. */
  promotion_id: string | null
  /** Paiement : écrit seulement par un administrateur ou le service de paiement (jamais par le parent ou le pro). */
  payment_status: PaymentStatus
  /** Montant réellement payé (peut différer du tarif : promotion…). Base du gain du professionnel. */
  paid_amount: number | null
  paid_currency: Currency | null
  paid_at: string | null
  payment_method: PaymentMethod | null
  payment_reference: string | null
  created_at: string
  updated_at: string
}

/** Champs remplis par le parent lors d'une demande ; le reste est fixé par la base ou le professionnel. */
export type ConsultationInsert = Pick<ConsultationRow, 'parent_id' | 'type' | 'reason' | 'requested_specialty'> &
  Partial<
    Pick<ConsultationRow, 'professional_id' | 'child_ref' | 'child_age_months' | 'child_sex' | 'preferred_at' | 'contact_phone' | 'consent_at' | 'country'>
  >

type ParentUpdate = Partial<Omit<ParentRow, 'id' | 'created_at' | 'updated_at'>>
type ProfessionalUpdate = Partial<
  Pick<ProfessionalRow, 'facility_name' | 'city' | 'phone' | 'email' | 'offers_teleconsultation' | 'offers_appointment' | 'avatar_path'>
>
type ConsultationUpdate = Partial<Omit<ConsultationRow, 'id' | 'parent_id' | 'type' | 'created_at' | 'updated_at'>>

export type ConsultationEventType = 'created' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed'

export type ConsultationEventRow = {
  id: number
  consultation_id: string
  actor_id: string | null
  actor_role: 'parent' | 'professional' | 'system'
  event: ConsultationEventType
  created_at: string
}

export type UserKeysRow = {
  user_id: string
  public_key: string
  wrapped_private_key: string
  salt: string
  nonce: string
  kdf_iterations: number
  kdf_memory_kib: number
  created_at: string
  updated_at: string
}

export type ConversationRow = {
  id: string
  consultation_id: string
  parent_id: string
  professional_user_id: string
  opens_at: string
  closes_at: string
  created_at: string
}

export type ConversationKeyRow = {
  conversation_id: string
  user_id: string
  sealed_key: string
  sealed_for: string
  updated_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  ciphertext: string
  nonce: string
  created_at: string
}

export type Currency = 'XOF' | 'EUR'

export type PlatformSettingsRow = {
  id: boolean
  currency: Currency
  maintenance: boolean
  maintenance_message: string | null
  /** Part retenue par la plateforme sur chaque consultation, en %. */
  commission_percent: number
  updated_at: string
  updated_by: string | null
}

export type SpecialtyRow = {
  code: Specialty
  label: string
  description: string | null
  requestable: boolean
  for_parent: boolean
  sort_order: number
  created_at: string
}

export type ConsultationPriceRow = {
  specialty: Specialty
  type: ConsultationType
  amount: number
  updated_at: string
}

export type DiscountKind = 'percent' | 'fixed_price'

export type PromotionRow = {
  id: string
  name: string
  description: string | null
  specialties: Specialty[]
  types: ConsultationType[]
  discount_kind: DiscountKind
  discount_value: number
  /** Devise du prix promotionnel (remise « prix fixe » seulement). */
  currency: Currency | null
  starts_at: string
  ends_at: string
  active: boolean
  created_at: string
  created_by: string | null
}

export type FeedAuthorRole = 'parent' | 'professional' | 'team'
/** pending : en attente de validation (visible par l'auteur seul) · published · rejected */
export type FeedPostStatus = 'pending' | 'published' | 'rejected'

export type FeedPostRow = {
  id: string
  author_id: string | null
  author_role: FeedAuthorRole
  author_name: string
  author_detail: string | null
  author_avatar_path: string | null
  body: string
  image_path: string | null
  status: FeedPostStatus
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
}

export type FeedCommentRow = {
  id: string
  post_id: string
  reply_to: string | null
  author_id: string | null
  author_role: FeedAuthorRole
  author_name: string
  author_detail: string | null
  author_avatar_path: string | null
  body: string
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
}

/** À la création : l'auteur affiché est fixé par la base, le client ne choisit que le rôle. */
type FeedAuthorInsert = { author_role: FeedAuthorRole; author_name: string }

export type PayoutStatus = 'requested' | 'paid' | 'rejected'
export type PayoutMethod = 'mobile_money' | 'bank_transfer'

export type PayoutRequestRow = {
  id: string
  professional_id: string
  amount: number
  currency: Currency
  status: PayoutStatus
  method: PayoutMethod
  payout_details: string
  requested_at: string
  processed_at: string | null
  processed_by: string | null
  reference: string | null
  rejection_reason: string | null
}

export type ProfessionalEarningRow = {
  id: string
  professional_id: string
  consultation_id: string | null
  gross_amount: number
  commission_percent: number
  net_amount: number
  currency: Currency
  earned_at: string
  payout_id: string | null
}

export type AdminStats = {
  consultations: number
  consultations_by_status: Partial<Record<ConsultationStatus, number>>
  professionals: number
  professionals_operational: number
  professionals_to_verify: number
  parents: number
  parents_last_30_days: number
}

/** Consultation vue par l'administrateur : métadonnées seulement (ni motif ni enfant). */
export type AdminConsultationRow = {
  id: string
  created_at: string
  type: ConsultationType
  requested_specialty: RequestableSpecialty | null
  status: ConsultationStatus
  country: CountryCode | null
  scheduled_at: string | null
  for_child: boolean
  professional_name: string | null
  price_amount: number | null
  price_currency: Currency | null
  payment_status: PaymentStatus
  paid_amount: number | null
  paid_currency: Currency | null
  paid_at: string | null
  total_count: number
}

export type AdminParentRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  country: CountryCode | null
  created_at: string
  last_sign_in_at: string | null
  consultations_count: number
  total_count: number
}

export type ConversationPublicKey = { user_id: string; role: 'parent' | 'professional'; public_key: string | null }

/** Coordonnées du parent visibles par le professionnel d'une consultation confirmée. */
export type ConsultationContact = { first_name: string; last_name: string; phone: string | null }

export type Database = {
  public: {
    Tables: {
      parents: { Row: ParentRow; Insert: { [_ in never]: never }; Update: ParentUpdate; Relationships: [] }
      professionals: { Row: ProfessionalRow; Insert: { [_ in never]: never }; Update: ProfessionalUpdate; Relationships: [] }
      platform_settings: {
        Row: PlatformSettingsRow
        Insert: { [_ in never]: never }
        Update: Partial<Pick<PlatformSettingsRow, 'currency' | 'maintenance' | 'maintenance_message' | 'commission_percent' | 'updated_by'>>
        Relationships: []
      }
      specialties: {
        Row: SpecialtyRow
        Insert: Pick<SpecialtyRow, 'code' | 'label'> & Partial<Pick<SpecialtyRow, 'description' | 'requestable' | 'for_parent' | 'sort_order'>>
        Update: Partial<Pick<SpecialtyRow, 'label' | 'description' | 'requestable' | 'for_parent' | 'sort_order'>>
        Relationships: []
      }
      consultation_prices: {
        Row: ConsultationPriceRow
        Insert: Pick<ConsultationPriceRow, 'specialty' | 'type' | 'amount'>
        Update: Pick<ConsultationPriceRow, 'amount'>
        Relationships: []
      }
      feed_posts: {
        Row: FeedPostRow
        Insert: FeedAuthorInsert & Pick<FeedPostRow, 'body'> & Partial<Pick<FeedPostRow, 'image_path'>>
        Update: Partial<Pick<FeedPostRow, 'deleted_at' | 'status' | 'rejection_reason'>>
        Relationships: []
      }
      feed_comments: {
        Row: FeedCommentRow
        Insert: FeedAuthorInsert & Pick<FeedCommentRow, 'post_id' | 'body'> & Partial<Pick<FeedCommentRow, 'reply_to'>>
        Update: Pick<FeedCommentRow, 'deleted_at'>
        Relationships: [
          { foreignKeyName: 'feed_comments_post_id_fkey'; columns: ['post_id']; isOneToOne: false; referencedRelation: 'feed_posts'; referencedColumns: ['id'] },
        ]
      }
      promotions: {
        Row: PromotionRow
        Insert: Omit<PromotionRow, 'id' | 'created_at'>
        Update: Partial<Omit<PromotionRow, 'id' | 'created_at' | 'created_by'>>
        Relationships: []
      }
      professional_earnings: {
        Row: ProfessionalEarningRow
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: [
          {
            foreignKeyName: 'professional_earnings_consultation_id_fkey'
            columns: ['consultation_id']
            isOneToOne: true
            referencedRelation: 'consultations'
            referencedColumns: ['id']
          },
        ]
      }
      payout_requests: {
        Row: PayoutRequestRow
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: [
          {
            foreignKeyName: 'payout_requests_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
      user_keys: {
        Row: UserKeysRow
        Insert: Omit<UserKeysRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserKeysRow, 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      conversations: {
        Row: ConversationRow
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: [
          {
            foreignKeyName: 'conversations_consultation_id_fkey'
            columns: ['consultation_id']
            isOneToOne: true
            referencedRelation: 'consultations'
            referencedColumns: ['id']
          },
        ]
      }
      conversation_keys: {
        Row: ConversationKeyRow
        Insert: Omit<ConversationKeyRow, 'updated_at'>
        Update: Partial<Pick<ConversationKeyRow, 'sealed_key' | 'sealed_for'>>
        Relationships: []
      }
      messages: {
        Row: MessageRow
        Insert: Pick<MessageRow, 'conversation_id' | 'ciphertext' | 'nonce'>
        Update: { [_ in never]: never }
        Relationships: []
      }
      consultation_events: { Row: ConsultationEventRow; Insert: { [_ in never]: never }; Update: { [_ in never]: never }; Relationships: [] }
      consultations: {
        Row: ConsultationRow
        Insert: ConsultationInsert
        Update: ConsultationUpdate
        Relationships: [
          { foreignKeyName: 'consultations_parent_id_fkey'; columns: ['parent_id']; isOneToOne: false; referencedRelation: 'parents'; referencedColumns: ['id'] },
          {
            foreignKeyName: 'consultations_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      current_professional_id: { Args: Record<string, never>; Returns: string | null }
      /** Profil du parent connecté, créé à partir de son compte s'il manque. `null` pour un compte professionnel. */
      ensure_parent_profile: { Args: Record<string, never>; Returns: ParentRow | null }
      has_mfa: { Args: Record<string, never>; Returns: boolean }
      platform_open: { Args: Record<string, never>; Returns: boolean }
      effective_price: {
        Args: { p_specialty: Specialty; p_type: ConsultationType; p_at?: string }
        Returns: { list_price: number | null; price: number | null; currency: Currency; promotion_id: string | null }[]
      }
      my_professional_id: { Args: Record<string, never>; Returns: string | null }
      /** Demande de paiement des arriérés. Erreurs : PP401, PP404 (rien à payer), PP409 (demande déjà en cours). */
      request_payout: { Args: { p_method: PayoutMethod; p_details: string }; Returns: PayoutRequestRow[] }
      /** Paiement constaté (montant réel, promotion comprise) ou remboursement. Erreurs : PP409, PP422. */
      admin_record_payment: {
        Args: {
          p_consultation_id: string
          p_status: 'paid' | 'refunded'
          p_amount?: number | null
          p_currency?: Currency | null
          p_method?: PaymentMethod | null
          p_reference?: string | null
          p_paid_at?: string | null
        }
        Returns: ConsultationRow
      }
      admin_process_payout: { Args: { p_id: string; p_paid: boolean; p_reference?: string | null; p_reason?: string | null }; Returns: PayoutRequestRow }
      admin_stats: { Args: Record<string, never>; Returns: AdminStats }
      admin_become_professional: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_specialty: Specialty
          p_country: CountryCode
          p_license_number?: string | null
          p_facility_name?: string | null
          p_city?: string | null
          p_phone?: string | null
          p_offers_teleconsultation?: boolean
          p_offers_appointment?: boolean
        }
        Returns: ProfessionalRow
      }
      admin_list_consultations: { Args: { p_status?: ConsultationStatus | null; p_limit?: number; p_offset?: number }; Returns: AdminConsultationRow[] }
      admin_list_parents: { Args: { p_search?: string | null; p_limit?: number; p_offset?: number }; Returns: AdminParentRow[] }
      is_conversation_participant: { Args: { p_conversation_id: string }; Returns: boolean }
      conversation_public_keys: { Args: { p_conversation_id: string }; Returns: ConversationPublicKey[] }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      /** Prise en charge atomique. Erreurs : PP401, PP403, PP409, PP422. */
      claim_consultation: { Args: { p_id: string; p_scheduled_at: string; p_note?: string | null }; Returns: ConsultationRow }
      consultation_contact: { Args: { p_id: string }; Returns: ConsultationContact[] }
      admin_update_professional: {
        Args: {
          p_id: string
          p_is_active?: boolean | null
          p_verified?: boolean | null
          p_specialty?: Specialty | null
          p_country?: CountryCode | null
          p_license_number?: string | null
        }
        Returns: ProfessionalRow
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

/** Données transmises à `supabase.auth.signUp({ options: { data } })`, lues par le trigger handle_new_user. */
export type ParentSignUpData = {
  last_name: string
  first_name: string
  sex?: Sex
  birth_date?: string
  profession?: string
  phone?: string
  country?: CountryCode
}
