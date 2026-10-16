import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useActiveChild, useChildren, useSettings } from '@/data/hooks'
import {
  REASON_MAX_LENGTH,
  busySpecialties,
  consultationService,
  validateConsultationRequest,
  type ConsultationRequest,
  type ConsultationType,
  type RequestableSpecialty,
} from '@/lib/consultations'
import { toAuthErrorCode, type AuthErrorCode } from '@/lib/auth'
import type { KeyStatus } from '@petits-pas/shared/messaging'
import { effectivePrice, formatPrice, requestableSpecialties, usePlatform } from '@petits-pas/shared/platform'
import { supabase } from '@/lib/supabase/client'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { Icon, type IconName } from '@/components/Icon'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthCard, FormAlert, useAuthText } from '@/features/auth/AuthUi'
import { useMyConsultations } from './useMyConsultations'
import { useChildRefs } from './useChildRefs'
import { SecretCodeFields, validateSecretCode, type SecretCodeError } from './SecretCodeFields'

const types: { value: ConsultationType; icon: IconName; tint: string }[] = [
  { value: 'teleconsultation', icon: 'chat', tint: 'bg-leaf-soft text-leaf' },
  { value: 'appointment', icon: 'calendar', tint: 'bg-teal-soft text-teal-brand' },
]

/** Valeur minimale d'un champ datetime-local : maintenant, à l'heure du téléphone. */
function nowLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const ME = 'me'

const promoEnd = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long' })

const choice = (selected: boolean) =>
  `rounded-2xl border-2 font-bold transition-colors ${selected ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line bg-surface text-ink-soft'}`

export function ConsultationNewPage() {
  const { t } = useTranslation()
  const text = useAuthText()
  const navigate = useNavigate()
  const children = useChildren()
  const { child: activeChild } = useActiveChild()
  const { user, profile } = useAuth()
  const { items: existing } = useMyConsultations(user?.id)
  const refs = useChildRefs(user?.id, children)
  const settings = useSettings()
  // Spécialistes proposés, tarifs et mise en veille : paramètres de la plateforme (en ligne).
  const { platform, error: platformError } = usePlatform(supabase)
  const closed = platform?.settings.maintenance === true

  const [type, setType] = useState<ConsultationType>()
  const [chosenSpecialty, setSpecialty] = useState<RequestableSpecialty>()
  const [who, setWho] = useState<string>()
  const [reason, setReason] = useState('')
  const [preferredAt, setPreferredAt] = useState('')
  const [phone, setPhone] = useState<string>()
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<ReturnType<typeof validateConsultationRequest>>({})
  const [error, setError] = useState<AuthErrorCode>()
  const [busy, setBusy] = useState(false)
  // Téléconsultation : le médecin chiffre la messagerie avec la clé publique du parent, qui doit donc exister avant la demande.
  const [keyStatus, setKeyStatus] = useState<KeyStatus>()
  const [secret, setSecret] = useState({ code: '', confirmation: '' })
  const [secretError, setSecretError] = useState<SecretCodeError>()
  const needsSecret = type === 'teleconsultation' && keyStatus === 'none'

  useEffect(() => {
    if (type !== 'teleconsultation' || !user || keyStatus) return
    // Chargée à la demande : la cryptographie n'est utile que pour les téléconsultations.
    void import('@/lib/messaging')
      .then(({ messaging }) => messaging?.keyStatus(user.id))
      .then(setKeyStatus, () => undefined) // Hors ligne : le code secret sera demandé à l'ouverture des messages.
  }, [type, user, keyStatus])

  // Valeurs par défaut : l'enfant actif, et le téléphone du profil une fois chargé.
  const selectedWho = who ?? activeChild?.id ?? ME
  const contactPhone = phone ?? profile?.phone ?? ''
  const child = children?.find((c) => c.id === selectedWho)
  // Seuls l'empreinte, l'âge et le sexe de l'enfant seront transmis (jamais son prénom ni sa date de naissance).
  const childRef = child ? refs?.get(child.id) : undefined
  const requestChild = child && childRef ? { ref: childRef, birthDate: child.birthDate, sex: child.sex } : undefined
  const ready = !child || !!childRef

  // Règles : un spécialiste par personne à la fois ; « Pour moi » = spécialités prévues pour les adultes.
  const allowedRows = platform ? requestableSpecialties(platform.specialties, !!child) : []
  const allowed = allowedRows.map((s) => s.code)
  const taken = busySpecialties(existing ?? [], childRef)
  const available = allowed.filter((s) => !taken.has(s))
  // Un choix devenu impossible (changement de personne) est oublié ; s'il ne reste qu'une possibilité, elle est choisie.
  const specialty =
    chosenSpecialty && available.includes(chosenSpecialty) ? chosenSpecialty : available.length === 1 && !child ? available[0] : undefined
  const nothingLeft = existing !== undefined && !!platform && available.length === 0

  const message = (key: keyof typeof errors) => {
    const code = errors[key]
    return code ? t(`consultation.form.errors.${code}`, { max: REASON_MAX_LENGTH }) : undefined
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const request: ConsultationRequest = { type, specialty, reason, child: requestChild, preferredAt: preferredAt || undefined, contactPhone, consent, country: settings?.country }
    const found = validateConsultationRequest(request, new Date(), existing, platform ? allowed : undefined)
    const foundSecret = needsSecret ? validateSecretCode(secret.code, secret.confirmation) : undefined
    setErrors(found)
    setSecretError(foundSecret)
    if (Object.keys(found).length > 0 || foundSecret) {
      requestAnimationFrame(() => document.querySelector('.text-red-600')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
      return
    }
    if (busy || !user || !ready) return
    setBusy(true)
    setError(undefined)
    if (needsSecret) {
      try {
        const { messaging } = await import('@/lib/messaging')
        await messaging!.setupKeys(user.id, secret.code)
        setKeyStatus('ready')
      } catch (e) {
        setBusy(false)
        return setError(toAuthErrorCode(e))
      }
    }
    const result = await consultationService!.create(user.id, request)
    setBusy(false)
    if (result.ok) navigate('/consultation', { replace: true, state: { sent: true } })
    else setError(result.error)
  }

  return (
    <>
      <PageHeader title={t('consultation.form.title')} />
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-bold text-ink-soft">{t('consultation.form.type')}</legend>
          {types.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={type === option.value}
              onClick={() => setType(option.value)}
              className={`flex w-full items-center gap-3 p-3 text-left ${choice(type === option.value)}`}
            >
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${option.tint}`}>
                <Icon name={option.icon} size={22} />
              </span>
              <span>
                <span className="block text-ink">{t(`consultation.types.${option.value}`)}</span>
                <span className="block text-sm font-normal text-ink-soft">{t(`consultation.typeTexts.${option.value}`)}</span>
              </span>
            </button>
          ))}
          {errors.type && <span className="block text-sm font-semibold text-red-600">{message('type')}</span>}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-ink-soft">{t('consultation.form.who')}</legend>
          <div className="flex flex-wrap gap-2">
            {[...(children ?? []).map((c) => ({ id: c.id, label: c.firstName })), { id: ME, label: t('consultation.form.me') }].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={selectedWho === option.id}
                onClick={() => setWho(option.id)}
                className={`min-h-11 px-4 ${choice(selectedWho === option.id)}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-bold text-ink-soft">{t('consultation.form.specialty')}</legend>
          {!child && <p className="text-sm text-ink-soft">{t('consultation.form.selfNote')}</p>}
          {!platform && platformError !== undefined && <FormAlert>{t('consultation.form.offline')}</FormAlert>}
          {allowedRows.map(({ code: value, label, description }) => {
            const isTaken = taken.has(value)
            const price = type && platform ? effectivePrice(platform, value, type) : undefined
            const selected = specialty === value
            return (
              <button
                key={value}
                type="button"
                disabled={isTaken}
                aria-pressed={selected}
                onClick={() => setSpecialty(value)}
                className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${choice(selected)}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-sky-brand' : 'border-line'}`}
                >
                  {selected && <span className="size-2.5 rounded-full bg-sky-brand" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{label}</span>
                  {description && <span className="block text-sm font-normal text-ink-soft">{description}</span>}
                  {type && !price && <span className="mt-0.5 block text-sm font-bold text-leaf">{t('consultation.form.priceUnknown')}</span>}
                  {price && (
                    <span className="mt-0.5 block text-sm font-bold text-leaf">
                      {t('consultation.form.priceLabel')}{' '}
                      {price.promotion && <s className="font-normal text-ink-soft">{formatPrice(price.listPrice, price.currency)}</s>}{' '}
                      {formatPrice(price.price, price.currency)}
                      {price.promotion && (
                        <span className="ml-1 rounded-full bg-sun-soft px-2 py-0.5 text-xs text-sun">
                          {t('consultation.form.promo', { name: price.promotion.name, date: promoEnd.format(new Date(price.promotion.ends_at)) })}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {isTaken && (
                  <span className="shrink-0 rounded-full bg-honey-soft px-2.5 py-1 text-xs font-extrabold text-ink">{t('consultation.form.busy')}</span>
                )}
              </button>
            )
          })}
          {errors.specialty && <span className="block text-sm font-semibold text-red-600">{message('specialty')}</span>}
          {nothingLeft ? (
            <FormAlert>{t(child ? 'consultation.form.allBusy' : 'consultation.form.allBusySelf')}</FormAlert>
          ) : (
            <p className="text-xs text-ink-soft">{t('consultation.form.ruleNote')}</p>
          )}
        </fieldset>

        <AuthCard>
          <Field label={t('consultation.form.reason')} error={message('reason')}>
            <textarea
              className={`${inputClass} min-h-32 py-3`}
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              placeholder={t('consultation.form.reasonPlaceholder')}
              onChange={(e) => setReason(e.target.value)}
            />
            <span className="mt-1 block text-right text-xs text-ink-soft">
              {t('consultation.form.count', { count: reason.length, max: REASON_MAX_LENGTH })}
            </span>
          </Field>

          <Field
            label={
              <>
                {t('consultation.form.preferredAt')} <span className="font-normal">({t('common.optional')})</span>
              </>
            }
            hint={t('consultation.form.preferredHint')}
            error={message('preferredAt')}
          >
            <input type="datetime-local" className={inputClass} value={preferredAt} min={nowLocal()} onChange={(e) => setPreferredAt(e.target.value)} />
          </Field>

          <Field label={t('consultation.form.phone')} error={message('contactPhone')}>
            <input
              type="tel"
              inputMode="tel"
              className={inputClass}
              value={contactPhone}
              placeholder={t('auth.profile.phonePlaceholder')}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </Field>
        </AuthCard>

        {needsSecret && (
          <AuthCard title={t('messages.setupTitle')}>
            <p className="text-sm text-ink-soft">{t('messages.setupText')}</p>
            <SecretCodeFields code={secret.code} confirmation={secret.confirmation} onChange={setSecret} error={secretError} />
          </AuthCard>
        )}

        <div>
          <label className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-sky-brand" />
            <span className="text-sm">
              {t(child ? 'consultation.form.consentChild' : 'consultation.form.consentSelf')}{' '}
              <Link to="/confidentialite" className="font-bold text-sky-brand underline">
                {t('consultation.form.privacyLink')}
              </Link>
            </span>
          </label>
          {errors.consent && <span className="mt-1 block text-sm font-semibold text-red-600">{message('consent')}</span>}
        </div>

        {closed && <FormAlert>{platform?.settings.maintenance_message || t('consultation.form.maintenance')}</FormAlert>}
        {error && <FormAlert>{text.error(error)}</FormAlert>}
        <Button type="submit" disabled={busy || nothingLeft || !ready || closed || !platform}>
          {t('consultation.form.submit')}
        </Button>
      </form>
    </>
  )
}
