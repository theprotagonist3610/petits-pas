import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child } from '@/data/types'
import { useActiveChild } from '@/data/hooks'
import { ChildAvatar } from '@/components/ChildAvatar'
import { useChildAge } from '@/components/ChildAge'
import { Icon, type IconName } from '@/components/Icon'
import { thousandDaysDay } from '@/lib/thousandDays'
import { NextVaccineBanner } from '@/features/vaccines/NextVaccineBanner'
import { BackupReminderBanner } from '@/features/backup/BackupReminderBanner'

const cards: { to: string; icon: IconName; title: string; text: string; tint: string }[] = [
  { to: '/etapes', icon: 'steps', title: 'home.milestonesCard', text: 'home.milestonesText', tint: 'bg-leaf-soft text-leaf' },
  { to: '/souvenirs', icon: 'heart', title: 'home.memoryCard', text: 'home.memoryText', tint: 'bg-sun-soft text-sun' },
  { to: '/croissance', icon: 'chart', title: 'home.growthCard', text: 'home.growthText', tint: 'bg-sky-soft text-sky-brand' },
  { to: '/vaccins', icon: 'syringe', title: 'home.vaccinesCard', text: 'home.vaccinesText', tint: 'bg-honey-soft text-honey' },
]

function Hero({ child }: { child: Child }) {
  const { t } = useTranslation()
  const { age, corrected } = useChildAge(child)
  const day = thousandDaysDay(child)
  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-brand to-teal-brand p-5 text-white shadow-md">
      <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute -right-2 -bottom-10 size-24 rounded-full bg-honey/30" aria-hidden="true" />
      <div className="relative flex items-center gap-4">
        <ChildAvatar child={child} size={72} />
        <div className="min-w-0">
          <p className="font-semibold text-white/85">{t('home.today', { name: child.firstName })}</p>
          <p className="text-2xl leading-tight font-extrabold">{age}</p>
          {corrected && <p className="mt-1 text-sm font-semibold text-white/85">{corrected}</p>}
          {day <= 1000 && <p className="mt-1 text-sm font-semibold text-white/85">{t('home.thousandDay', { day })}</p>}
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  const { child, loading } = useActiveChild()

  if (loading) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t('home.hello')}</h1>
      <Hero child={child} />
      <NextVaccineBanner child={child} />
      <BackupReminderBanner />
      <section>
        <h2 className="mb-3 text-lg font-extrabold">{t('home.discover')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <Link key={card.to} to={card.to} className="rounded-3xl bg-surface p-4 shadow-sm active:scale-[0.98] transition-transform">
              <span className={`mb-3 flex size-11 items-center justify-center rounded-2xl ${card.tint}`}>
                <Icon name={card.icon} />
              </span>
              <span className="block leading-tight font-extrabold">{t(card.title)}</span>
              <span className="mt-1 block text-sm leading-snug text-ink-soft">{t(card.text)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
