import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Child, MilestoneObservation, MilestoneStatus } from '@/data/types'
import { chronologicalAge, effectiveAgeDays } from '@/lib/age'
import { formatAge } from '@/lib/formatAge'
import { formatNumber } from '@/lib/format'
import { DAYS_PER_MONTH, WHO_MOTOR, whoWindowState } from '@/lib/milestones'
import type { WhoMotorMilestone } from '@/reference/milestones/who-motor'
import { StatusPicker } from './StatusPicker'

/** Axe des barres : de la naissance à 18 mois. */
const AXIS_DAYS = 18 * DAYS_PER_MONTH
const AXIS_TICKS = [0, 3, 6, 9, 12, 15, 18]

const pct = (days: number) => `${Math.min(100, Math.max(0, (days / AXIS_DAYS) * 100))}%`
const months = (days: number) => formatNumber(Math.round((days / DAYS_PER_MONTH) * 10) / 10)

interface Props {
  child: Child
  ageDays: number
  observations: Map<string, MilestoneObservation>
  onChange: (milestoneId: string, status: MilestoneStatus | null, achievedAt?: string) => void
}

function WindowBar({ m, ageDays, achievedDays }: { m: WhoMotorMilestone; ageDays: number; achievedDays?: number }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3" aria-hidden="true">
      <div className="relative h-6 rounded-full bg-cream">
        <div className="absolute inset-y-1 rounded-full bg-leaf-soft" style={{ left: pct(m.days.p1), right: `calc(100% - ${pct(m.days.p99)})` }} />
        <div className="absolute inset-y-1 rounded-full bg-leaf/35" style={{ left: pct(m.days.p25), right: `calc(100% - ${pct(m.days.p75)})` }} />
        <div className="absolute inset-y-0.5 w-0.5 bg-leaf" style={{ left: pct(m.days.p50) }} />
        {achievedDays !== undefined && achievedDays >= 0 ? (
          <div
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-leaf shadow"
            style={{ left: pct(achievedDays) }}
          />
        ) : (
          ageDays >= 0 &&
          ageDays <= AXIS_DAYS && (
            <div className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-sun" style={{ left: pct(ageDays) }}>
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-bold whitespace-nowrap text-sun">
                {t('milestones.who.today')}
              </span>
            </div>
          )
        )}
      </div>
      <div className="relative mt-1 h-3 text-[10px] text-ink-soft">
        {AXIS_TICKS.map((mo) => (
          <span key={mo} className="absolute -translate-x-1/2" style={{ left: pct(mo * DAYS_PER_MONTH) }}>
            {mo}
          </span>
        ))}
      </div>
    </div>
  )
}

function WhoMilestoneCard({ child, ageDays, m, obs, onChange }: { m: WhoMotorMilestone; obs?: MilestoneObservation } & Omit<Props, 'observations'>) {
  const { t } = useTranslation()
  const [help, setHelp] = useState(false)
  const state = whoWindowState(m, ageDays, obs)
  const achievedDays = obs?.achievedAt ? effectiveAgeDays(child.birthDate, child.gestationWeeks, obs.achievedAt) : undefined
  const range = { from: months(m.days.p1), to: months(m.days.p99) }

  let message: string
  if (state === 'achieved') {
    message = obs?.achievedAt
      ? t('milestones.who.achieved', { age: formatAge(t, chronologicalAge(child.birthDate, obs.achievedAt)) })
      : t('milestones.who.achievedNoDate')
  } else message = t(`milestones.who.${state}`, range)

  return (
    <li className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-extrabold">{m.title}</p>
        <button type="button" onClick={() => setHelp(!help)} aria-expanded={help} className="shrink-0 text-sm font-bold text-sky-brand">
          {t('milestones.who.howTo')}
        </button>
      </div>
      {help && <p className="mt-1 rounded-xl bg-sky-soft p-2 text-sm">{m.definition}</p>}
      <WindowBar m={m} ageDays={ageDays} achievedDays={achievedDays} />
      <p className="mt-2 text-sm text-ink-soft">{message}</p>
      {m.optional && state !== 'achieved' && <p className="mt-1 text-sm text-ink-soft">{t('milestones.who.optional')}</p>}
      <StatusPicker observation={obs} minDate={child.birthDate} onChange={(status, at) => onChange(m.id, status, at)} />
    </li>
  )
}

export function WhoMotorSection(props: Props) {
  const { t } = useTranslation()
  return (
    <section className="rounded-3xl bg-surface p-4 shadow-sm">
      <h2 className="text-lg font-extrabold">{t('milestones.who.title')}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t('milestones.who.subtitle')}</p>
      <ul className="mt-4 space-y-3">
        {WHO_MOTOR.map((m) => (
          <WhoMilestoneCard key={m.id} m={m} obs={props.observations.get(m.id)} {...props} />
        ))}
      </ul>
    </section>
  )
}
