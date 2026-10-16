import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child, VaccineRecord } from '@/data/types'
import { useActiveChild, useSettings, useVaccineRecords } from '@/data/hooks'
import { scheduleFor, type VaccineSchedule } from '@/reference/vaccines'
import { formatDate } from '@/lib/format'
import { downloadIcs } from '@/lib/ics'
import { daysUntil, dueDate, lateVisits, nextVisit, vaccineProgress, visitsFor, visitState } from '@/lib/vaccines'
import { PageHeader } from '@/components/PageHeader'
import { Icon } from '@/components/Icon'
import { VisitCard } from './VisitCard'

function Summary({ child, schedule, records }: { child: Child; schedule: VaccineSchedule; records: Map<string, VaccineRecord> }) {
  const { t } = useTranslation()
  const { done, total } = vaccineProgress(schedule, child, records)
  const next = nextVisit(schedule, child, records)
  const nextDate = next && dueDate(child.birthDate, next.age)
  const days = nextDate ? daysUntil(nextDate) : 0

  function addToCalendar() {
    if (!next || !nextDate) return
    downloadIcs(
      {
        uid: `${child.id}-${next.id}`,
        date: nextDate,
        title: t('vaccines.calendarTitle', { label: next.label, name: child.firstName }),
        description: t('vaccines.calendarText', { items: next.interventions.map((i) => i.name).join(', ') }),
      },
      `vaccins-${child.firstName}-${next.label}.ics`.replace(/\s+/g, '-'),
    )
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-honey to-sun p-5 text-white shadow-md">
      <div className="absolute -top-10 -right-6 size-32 rounded-full bg-white/10" aria-hidden="true" />
      <div className="relative flex items-center gap-4">
        <svg viewBox="0 0 36 36" className="size-16 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-white/25" />
          {done > 0 && (
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-white" strokeDasharray={`${(done / total) * 94.25} 94.25`} />
          )}
        </svg>
        <p className="text-lg leading-snug font-extrabold">{t('vaccines.progress', { done, total })}</p>
      </div>

      {next && nextDate ? (
        <div className="relative mt-4 rounded-2xl bg-white/15 p-3">
          <p className="text-sm font-bold text-white/85 uppercase">{t('vaccines.next')}</p>
          <p className="text-lg font-extrabold">{t('vaccines.nextWhen', { label: next.label, date: formatDate(nextDate) })}</p>
          <p className="font-semibold text-white/90">{days <= 0 ? t('vaccines.dueNow') : t('vaccines.inDays', { count: days })}</p>
          {days > 0 && (
            <button onClick={addToCalendar} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface font-bold text-sun">
              <Icon name="calendar" size={18} /> {t('vaccines.addToCalendar')}
            </button>
          )}
        </div>
      ) : (
        done === total && <p className="relative mt-3 font-semibold">{t('vaccines.allDone')}</p>
      )}
    </section>
  )
}

function Unavailable({ countryLabel }: { countryLabel?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-10 text-center shadow-sm">
      <span className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-honey-soft text-honey">
        <Icon name="syringe" size={32} />
      </span>
      {countryLabel ? (
        <>
          <h2 className="mb-2 text-xl font-extrabold">{t('vaccines.unavailableTitle')}</h2>
          <p className="mb-6 text-ink-soft">{t('vaccines.unavailableText', { country: countryLabel })}</p>
        </>
      ) : (
        <p className="mb-6 text-ink-soft">{t('vaccines.noCountry')}</p>
      )}
      <Link to="/reglages" className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-line font-bold text-sky-brand">
        {t('vaccines.changeCountry')}
      </Link>
    </div>
  )
}

function Schedule({ child, schedule, records }: { child: Child; schedule: VaccineSchedule; records: Map<string, VaccineRecord> }) {
  const { t } = useTranslation()
  const visits = visitsFor(schedule, child)
  const late = lateVisits(schedule, child, records)
  const next = nextVisit(schedule, child, records)
  // Ouvertes d'office : la prochaine visite et celles à rattraper.
  const [open, setOpen] = useState<Set<string>>(() => new Set([...late.map((v) => v.id), ...(next ? [next.id] : [])]))

  const toggle = (id: string) =>
    setOpen((current) => {
      const updated = new Set(current)
      if (!updated.delete(id)) updated.add(id)
      return updated
    })

  return (
    <div className="space-y-4">
      <Summary child={child} schedule={schedule} records={records} />

      {late.length > 0 && (
        <section className="rounded-3xl bg-honey-soft p-4">
          <h2 className="flex items-center gap-2 font-extrabold">
            <Icon name="syringe" size={20} /> {t('vaccines.late.title')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed">{t('vaccines.late.text', { name: child.firstName })}</p>
        </section>
      )}

      <ol className="space-y-4 pt-2">
        {visits.map((visit, i) => (
          <VisitCard
            key={visit.id}
            child={child}
            visit={visit}
            state={visitState(visit, child, records)}
            records={records}
            open={open.has(visit.id)}
            onToggle={() => toggle(visit.id)}
            last={i === visits.length - 1}
          />
        ))}
      </ol>

      <p className="rounded-2xl bg-surface p-4 text-sm leading-relaxed shadow-sm">{t('vaccines.notice')}</p>
      {schedule.helpline && (
        <a
          href={`tel:${schedule.helpline.replace(/\s+/g, '')}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-center font-bold text-sky-brand"
        >
          <Icon name="chat" size={18} /> {t('vaccines.call', { number: schedule.helpline })}
        </a>
      )}
      <p className="px-2 text-center text-xs text-ink-soft">{schedule.source}</p>
    </div>
  )
}

export function VaccinesPage() {
  const { t } = useTranslation()
  const { child, loading } = useActiveChild()
  const settings = useSettings()
  const records = useVaccineRecords(child?.id)

  if (loading || !settings) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />
  const schedule = scheduleFor(settings.country)

  return (
    <>
      <PageHeader title={t('vaccines.title')} />
      {!schedule ? (
        <Unavailable countryLabel={settings.country && t(`vaccines.countryOf.${settings.country}`)} />
      ) : (
        records && <Schedule key={child.id} child={child} schedule={schedule} records={records} />
      )}
    </>
  )
}
