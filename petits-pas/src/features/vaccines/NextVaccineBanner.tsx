import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child } from '@/data/types'
import { useSettings, useVaccineRecords } from '@/data/hooks'
import { scheduleFor } from '@/reference/vaccines'
import { daysUntil, dueDate, lateVisits, nextVisit } from '@/lib/vaccines'
import { Icon } from '@/components/Icon'

/** Rappel sur l'accueil : vaccins à rattraper, ou prochaine visite dans les 30 jours. */
export function NextVaccineBanner({ child }: { child: Child }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const records = useVaccineRecords(child.id)
  const schedule = scheduleFor(settings?.country)
  if (!schedule || !records) return null

  const late = lateVisits(schedule, child, records)
  const next = nextVisit(schedule, child, records)
  const days = next ? daysUntil(dueDate(child.birthDate, next.age)) : Infinity

  let text: string
  if (late.length) text = t('vaccines.late.title')
  else if (next && days <= 30) text = `${t('vaccines.next')} : ${next.label} · ${days <= 0 ? t('vaccines.state.due') : t('vaccines.inDays', { count: days })}`
  else return null

  return (
    <Link
      to="/vaccins"
      className={`flex min-h-14 items-center gap-3 rounded-2xl p-3 font-bold shadow-sm ${late.length ? 'bg-honey-soft' : 'bg-surface'}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-honey-soft text-honey">
        <Icon name="syringe" size={20} />
      </span>
      <span className="flex-1">{text}</span>
      <Icon name="chevronRight" size={20} className="text-ink-soft" />
    </Link>
  )
}
