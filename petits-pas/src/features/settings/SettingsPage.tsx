import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { repos } from '@/data'
import { useSettings } from '@/data/hooks'
import { COUNTRIES } from '@/reference/countries'
import { requestPersistentStorage } from '@/lib/storage'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Icon, type IconName } from '@/components/Icon'
import { useTheme } from '@/components/ThemeSync'
import type { Theme } from '@/data/types'

const themes: { value: Theme; icon: IconName; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'settings.themes.light' },
  { value: 'dark', icon: 'moon', label: 'settings.themes.dark' },
]

export function SettingsPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const theme = useTheme()
  if (!settings) return null

  async function protect() {
    await repos.settings.update({ persisted: await requestPersistentStorage() })
  }

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="space-y-5">
        <section className="rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-extrabold">{t('settings.country')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                aria-pressed={settings.country === c.code}
                onClick={() => void repos.settings.update({ country: c.code })}
                className={`min-h-12 rounded-2xl border-2 font-bold ${
                  settings.country === c.code ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line text-ink-soft'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-extrabold">{t('settings.theme')}</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.theme')}>
            {themes.map((option) => (
              <button
                key={option.value}
                role="radio"
                aria-checked={theme === option.value}
                onClick={() => void repos.settings.update({ theme: option.value })}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 font-bold ${
                  theme === option.value ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line text-ink-soft'
                }`}
              >
                <Icon name={option.icon} size={20} />
                {t(option.label)}
              </button>
            ))}
          </div>
          {!settings.theme && <p className="mt-2 text-sm text-ink-soft">{t('settings.themeSystem')}</p>}
        </section>

        <section className="rounded-3xl bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-extrabold">{t('settings.storage')}</h2>
          <p className={`mb-3 flex gap-2 font-semibold ${settings.persisted ? 'text-leaf' : 'text-sun'}`}>
            <Icon name="shield" className="shrink-0" />
            {settings.persisted ? t('settings.persisted') : t('settings.notPersisted')}
          </p>
          {!settings.persisted && (
            <Button variant="secondary" onClick={() => void protect()}>
              {t('settings.protect')}
            </Button>
          )}
          <p className="mt-3 text-sm text-ink-soft">
            {t('settings.privacy')}{' '}
            <Link to="/confidentialite" className="font-bold text-sky-brand underline">
              {t('settings.privacyLink')}
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
