import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hasErrors, isProfileComplete, validateProfile, type AccountProfile, type AuthErrorCode, type ProfileInput, type ValidationErrors } from '@/lib/auth'
import { useSettings } from '@/data/hooks'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { useAuth } from './AuthProvider'
import { AuthCard, FormAlert, useAuthText } from './AuthUi'
import { ProfileFields } from './ProfileFields'

/** Formulaire du profil parent, utilisé par la page « Mon profil » et la fenêtre « Complétez votre profil ». */
export function ProfileForm({ profile, onSaved, footer }: { profile: AccountProfile; onSaved: () => void; footer?: ReactNode }) {
  const { t } = useTranslation()
  const text = useAuthText()
  const settings = useSettings()
  const { service, refreshProfile } = useAuth()

  const [input, setInput] = useState<ProfileInput>({
    lastName: profile.lastName,
    firstName: profile.firstName,
    sex: profile.sex,
    birthDate: profile.birthDate,
    profession: profile.profession,
    phone: profile.phone,
    // Profil créé avec Google : on propose le pays choisi dans l'application.
    country: profile.country ?? settings?.country,
  })
  const [errors, setErrors] = useState<ValidationErrors<ProfileInput>>({})
  const [error, setError] = useState<AuthErrorCode>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateProfile(input)
    setErrors(found)
    if (hasErrors(found) || busy) return
    setBusy(true)
    setError(undefined)
    // Champ vidé : `null` l'efface en base.
    const result = await service!.updateProfile(profile.id, {
      lastName: input.lastName,
      firstName: input.firstName,
      sex: input.sex,
      birthDate: input.birthDate || null,
      profession: input.profession ?? null,
      phone: input.phone ?? null,
      country: input.country ?? null,
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    await refreshProfile()
    onSaved()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <AuthCard>
        <ProfileFields value={input} onChange={(patch) => setInput((current) => ({ ...current, ...patch }))} errors={errors} />
      </AuthCard>
      {error && <FormAlert>{text.error(error)}</FormAlert>}
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
      {footer}
    </form>
  )
}

export function ProfileEditPage() {
  const { t } = useTranslation()
  const text = useAuthText()
  const navigate = useNavigate()
  const { profile, profileError } = useAuth()

  if (profile) {
    const completing = !isProfileComplete(profile)
    return (
      <>
        <PageHeader title={completing ? t('auth.completeProfile') : t('auth.profile.title')} />
        {completing && <p className="-mt-2 mb-4 text-ink-soft">{t('auth.completeProfileText')}</p>}
        <ProfileForm key={profile.id} profile={profile} onSaved={() => navigate('/compte', { replace: true })} />
      </>
    )
  }
  if (profileError) {
    return (
      <>
        <PageHeader title={t('auth.profile.title')} />
        <FormAlert>{text.error(profileError)}</FormAlert>
      </>
    )
  }
  return null
}
