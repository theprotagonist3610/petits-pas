// Invitation d'un professionnel de santé par un administrateur de Petits Pas Pro.
//
// 1. Vérifie que l'appelant est administrateur ET connecté avec double authentification (rpc is_admin).
// 2. Crée le compte avec account_type = professional (aucun profil parent n'est créé) et envoie
//    l'e-mail d'invitation, dont le lien mène à la page d'activation de Petits Pas Pro.
// 3. Crée la fiche professionnelle rattachée à ce compte.
//
// Déploiement : npx supabase functions deploy invite-professional --project-ref <ref>
// Secret requis : npx supabase secrets set PRO_APP_URL=https://pro.exemple.org --project-ref <ref>
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.

// Types de l'environnement d'exécution Supabase (objet global Deno, EdgeRuntime) : Deno n'a pas à être
// « initialisé », il est fourni par Supabase. Cette ligne sert à l'éditeur et à `deno check`.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from '@supabase/supabase-js'

const COUNTRIES = ['BJ', 'TG', 'NE']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

interface Invitation {
  email: string
  first_name: string
  last_name: string
  specialty: string
  country: string
  license_number?: string
  facility_name?: string
  city?: string
  phone?: string
  offers_teleconsultation?: boolean
  offers_appointment?: boolean
  /** Numéro d'ordre déjà vérifié par l'administrateur. */
  verified?: boolean
}

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return reply(200, { ok: true })
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

  const url = Deno.env.get('SUPABASE_URL')!
  const appUrl = Deno.env.get('PRO_APP_URL')
  if (!appUrl) return reply(500, { error: 'missing_pro_app_url' })

  // 1. L'appelant est-il administrateur (avec double authentification) ?
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: isAdmin, error: adminError } = await caller.rpc('is_admin')
  if (adminError || isAdmin !== true) return reply(403, { error: 'not_admin' })

  // 2. Données de l'invitation
  let body: Invitation
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'invalid_json' })
  }
  const email = text(body.email, 254)?.toLowerCase()
  const firstName = text(body.first_name, 100)
  const lastName = text(body.last_name, 100)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'invalid_email' })
  if (!firstName || !lastName) return reply(400, { error: 'missing_name' })
  if (!COUNTRIES.includes(body.country)) return reply(400, { error: 'invalid_country' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Spécialités : liste gérée par les administrateurs (table specialties), plus une liste figée.
  const { data: specialty } = await admin.from('specialties').select('code').eq('code', String(body.specialty ?? '')).maybeSingle()
  if (!specialty) return reply(400, { error: 'invalid_specialty' })

  // 3. Compte + e-mail d'invitation
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { account_type: 'professional', first_name: firstName, last_name: lastName },
    redirectTo: `${appUrl.replace(/\/$/, '')}/activation`,
  })
  if (inviteError || !invited.user) {
    const exists = /already|registered|exists/i.test(inviteError?.message ?? '')
    return reply(exists ? 409 : 500, { error: exists ? 'email_exists' : 'invite_failed', detail: inviteError?.message })
  }

  // 4. Fiche professionnelle
  const { data: professional, error: insertError } = await admin
    .from('professionals')
    .insert({
      user_id: invited.user.id,
      first_name: firstName,
      last_name: lastName,
      specialty: body.specialty,
      country: body.country,
      license_number: text(body.license_number, 50),
      facility_name: text(body.facility_name, 200),
      city: text(body.city, 100),
      phone: text(body.phone, 20),
      email,
      offers_teleconsultation: body.offers_teleconsultation ?? false,
      offers_appointment: body.offers_appointment ?? true,
      verified_at: body.verified ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (insertError) {
    // Pas de compte orphelin : on annule l'invitation.
    await admin.auth.admin.deleteUser(invited.user.id)
    return reply(400, { error: 'invalid_professional', detail: insertError.message })
  }
  return reply(200, { professional })
})
