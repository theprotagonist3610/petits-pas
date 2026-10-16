import { useTranslation } from 'react-i18next'
import type { ProfileInput, ValidationErrors } from '@/lib/auth'
import { toISODate } from '@/lib/age'
import { COUNTRIES } from '@/reference/countries'
import { Field, Segmented, inputClass } from '@/components/Field'
import { useAuthText } from './AuthUi'

/** Champs du profil parent, partagés par l'inscription et l'écran « Mon profil ». */
export function ProfileFields({
  value,
  onChange,
  errors,
}: {
  value: ProfileInput
  onChange: (patch: Partial<ProfileInput>) => void
  errors: ValidationErrors<ProfileInput>
}) {
  const { t } = useTranslation()
  const text = useAuthText()
  const optional = (label: string) => (
    <>
      {label} <span className="font-normal">({t('common.optional')})</span>
    </>
  )

  return (
    <>
      <Field label={t('auth.profile.lastName')} error={text.validation(errors.lastName)}>
        <input
          className={inputClass}
          value={value.lastName}
          onChange={(e) => onChange({ lastName: e.target.value })}
          autoComplete="family-name"
          autoCapitalize="characters"
        />
      </Field>

      <Field label={t('auth.profile.firstName')} error={text.validation(errors.firstName)}>
        <input
          className={inputClass}
          value={value.firstName}
          onChange={(e) => onChange({ firstName: e.target.value })}
          autoComplete="given-name"
          autoCapitalize="words"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-bold text-ink-soft">{t('auth.profile.sex')}</legend>
        <Segmented
          value={value.sex}
          onChange={(sex) => onChange({ sex })}
          options={[
            { value: 'female', label: t('auth.profile.female') },
            { value: 'male', label: t('auth.profile.male') },
          ]}
        />
        {errors.sex && <span className="mt-1 block text-sm font-semibold text-red-600">{text.validation(errors.sex)}</span>}
      </fieldset>

      <Field label={optional(t('auth.profile.phone'))} hint={t('auth.profile.phoneHint')} error={text.validation(errors.phone)}>
        <input
          type="tel"
          inputMode="tel"
          className={inputClass}
          value={value.phone ?? ''}
          placeholder={t('auth.profile.phonePlaceholder')}
          onChange={(e) => onChange({ phone: e.target.value })}
          autoComplete="tel"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-bold text-ink-soft">{optional(t('auth.profile.country'))}</legend>
        <Segmented value={value.country} onChange={(country) => onChange({ country })} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
      </fieldset>

      <Field label={optional(t('auth.profile.birthDate'))} error={text.validation(errors.birthDate)}>
        <input
          type="date"
          className={inputClass}
          value={value.birthDate ?? ''}
          max={toISODate(new Date())}
          onChange={(e) => onChange({ birthDate: e.target.value })}
        />
      </Field>

      <Field label={optional(t('auth.profile.profession'))}>
        <input
          className={inputClass}
          value={value.profession ?? ''}
          onChange={(e) => onChange({ profession: e.target.value })}
          autoComplete="organization-title"
        />
      </Field>
    </>
  )
}
