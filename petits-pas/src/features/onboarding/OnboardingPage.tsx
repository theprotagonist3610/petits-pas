import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { repos, type CountryCode } from '@/data'
import { useSettings } from '@/data/hooks'
import { COUNTRIES } from '@/reference/countries'
import { requestPersistentStorage } from '@/lib/storage'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { ChildForm } from '@/features/children/ChildForm'
import { saveChild } from '@/features/children/saveChild'

type Step = 'welcome' | 'country' | 'child'
const STEPS: Step[] = ['welcome', 'country', 'child']

export function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useSettings()
  const [step, setStep] = useState<Step>('welcome')
  const [country, setCountry] = useState<CountryCode>()

  if (settings?.onboardedAt) return <Navigate to="/" replace />

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col px-4">
      <div className="flex h-14 items-center">
        {stepIndex > 0 && (
          <button
            onClick={() => setStep(STEPS[stepIndex - 1])}
            aria-label={t('common.back')}
            className="-ml-2 flex size-11 items-center justify-center rounded-full text-ink-soft active:bg-ink/5"
          >
            <Icon name="back" />
          </button>
        )}
        <div className="ml-auto flex gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-2 rounded-full transition-all ${i <= stepIndex ? 'w-6 bg-sky-brand' : 'w-2 bg-line'}`} />
          ))}
        </div>
      </div>

      {step === 'welcome' && (
        <div className="flex flex-1 flex-col pb-6">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <img src="/logo.png" alt="" className="mb-6 size-40" />
            <p className="mb-2 font-bold tracking-wide text-sun">{t('app.tagline')}</p>
            <h1 className="mb-4 text-3xl font-extrabold">{t('onboarding.welcomeTitle')}</h1>
            <p className="text-lg leading-relaxed text-ink-soft">{t('onboarding.welcomeText')}</p>
          </div>
          <Button onClick={() => setStep('country')}>{t('onboarding.start')}</Button>
          <Link to="/restaurer" className="mt-3 flex min-h-12 items-center justify-center font-bold text-sky-brand">
            {t('backup.welcomeLink')}
          </Link>
        </div>
      )}

      {step === 'country' && (
        <div className="flex flex-1 flex-col pb-6">
          <h1 className="mt-4 mb-2 text-2xl font-extrabold">{t('onboarding.countryTitle')}</h1>
          <p className="mb-6 text-ink-soft">{t('onboarding.countryText')}</p>
          <div className="flex-1 space-y-3">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setCountry(c.code)}
                aria-pressed={country === c.code}
                className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-5 text-lg font-bold transition-colors ${
                  country === c.code ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line bg-surface'
                }`}
              >
                {c.name}
                {country === c.code && <Icon name="check" />}
              </button>
            ))}
          </div>
          <Button disabled={!country} onClick={() => setStep('child')}>
            {t('common.continue')}
          </Button>
        </div>
      )}

      {step === 'child' && (
        <div className="pb-6">
          <h1 className="mt-4 mb-2 text-2xl font-extrabold">{t('onboarding.childTitle')}</h1>
          <p className="mb-6 text-ink-soft">{t('onboarding.childText')}</p>
          <ChildForm
            submitLabel={t('common.continue')}
            onSubmit={async (input, photo) => {
              const child = await saveChild(input, photo)
              const persisted = await requestPersistentStorage()
              await repos.settings.update({
                country,
                activeChildId: child.id,
                onboardedAt: new Date().toISOString(),
                persisted,
              })
              navigate('/', { replace: true })
            }}
          />
        </div>
      )}
    </div>
  )
}
