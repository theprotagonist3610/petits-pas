import { useTranslation } from 'react-i18next'
import type { Child } from '@/data/types'
import { thousandDaysDay } from '@/lib/milestones'

export function ThousandDaysCard({ child }: { child: Child }) {
  const { t } = useTranslation()
  const day = thousandDaysDay(child)
  const done = day > 1000
  const progress = Math.min(1, Math.max(0, day / 1000))

  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-leaf to-teal-brand p-5 text-white shadow-md">
      <div className="absolute -top-10 -right-6 size-32 rounded-full bg-white/10" aria-hidden="true" />
      <p className="relative text-sm font-bold tracking-wide text-white/85 uppercase">{t('milestones.thousand.title')}</p>
      {done ? (
        <>
          <p className="relative mt-1 text-2xl font-extrabold">{t('milestones.thousand.done')}</p>
          <p className="relative mt-2 text-white/90">{t('milestones.thousand.doneText')}</p>
        </>
      ) : (
        <>
          <p className="relative mt-1 text-2xl font-extrabold">{t('milestones.thousand.day', { day })}</p>
          <div
            className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={1000}
            aria-valuenow={day}
          >
            <div className="h-full rounded-full bg-honey" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="relative mt-1 text-right text-sm font-semibold text-white/85">
            {t('milestones.thousand.remaining', { count: 1000 - day })}
          </p>
          <p className="relative mt-2 leading-relaxed text-white/90">{t('milestones.thousand.text')}</p>
        </>
      )}
    </section>
  )
}
