import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { Child, MilestoneObservation, MilestoneStatus } from '@/data/types'
import { CDC_MILESTONES, DOMAINS, observationKey, type Domain } from '@/lib/milestones'
import { Icon, type IconName } from '@/components/Icon'
import { StatusPicker } from './StatusPicker'

const DOMAIN_STYLE: Record<Domain, { icon: IconName; tint: string }> = {
  social: { icon: 'heart', tint: 'bg-sun-soft text-sun' },
  language: { icon: 'chat', tint: 'bg-sky-soft text-sky-brand' },
  cognitive: { icon: 'steps', tint: 'bg-honey-soft text-honey' },
  movement: { icon: 'users', tint: 'bg-leaf-soft text-leaf' },
}

export type CheckpointState = 'past' | 'current' | 'upcoming'

const BADGE: Record<CheckpointState, string> = {
  past: 'bg-ink/5 text-ink-soft',
  current: 'bg-sun text-white',
  upcoming: 'bg-sky-soft text-sky-brand',
}

export function checkpointLabel(t: TFunction, months: number): string {
  return months < 24 ? t('milestones.checkpoint.label_months', { count: months }) : t(`milestones.checkpoint.label${months}`)
}

interface Props {
  child: Child
  months: number
  state: CheckpointState
  open: boolean
  onToggle: () => void
  observations: Map<string, MilestoneObservation>
  onChange: (milestoneId: string, status: MilestoneStatus | null, achievedAt?: string) => void
}

export function CheckpointCard({ child, months, state, open, onToggle, observations, onChange }: Props) {
  const { t } = useTranslation()
  const items = CDC_MILESTONES.filter((m) => m.months === months)
  const done = items.filter((m) => observations.get(observationKey(m.id))?.status === 'achieved').length
  const label = checkpointLabel(t, months)

  return (
    <section className={`overflow-hidden rounded-3xl bg-surface shadow-sm ${state === 'current' ? 'ring-2 ring-sun' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold">{label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[state]}`}>{t(`milestones.checkpoint.${state}`)}</span>
          </span>
          {months === 24 && <span className="block text-sm font-bold text-leaf">{t('milestones.checkpoint.review')}</span>}
          <span className="mt-1 block text-sm text-ink-soft">{t('milestones.checkpoint.progress', { done, total: items.length })}</span>
        </span>
        <svg viewBox="0 0 36 36" className="size-10 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-cream" />
          {done > 0 && (
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-leaf"
              strokeDasharray={`${(done / items.length) * 94.25} 94.25`}
            />
          )}
        </svg>
        <Icon name="chevronDown" size={20} className={`shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-4 pt-3 pb-4">
          <p className="text-sm text-ink-soft">{t('milestones.checkpoint.intro', { age: label })}</p>
          {DOMAINS.map((domain) => {
            const domainItems = items.filter((m) => m.domain === domain)
            if (!domainItems.length) return null
            const style = DOMAIN_STYLE[domain]
            return (
              <div key={domain}>
                <h3 className="mb-2 flex items-center gap-2 font-extrabold">
                  <span className={`flex size-8 items-center justify-center rounded-xl ${style.tint}`}>
                    <Icon name={style.icon} size={18} />
                  </span>
                  {t(`milestones.domains.${domain}`)}
                </h3>
                <ul className="space-y-3">
                  {domainItems.map((m) => {
                    const key = observationKey(m.id)
                    return (
                      <li key={m.id} className="rounded-2xl bg-cream p-3">
                        <p className="leading-snug">{m.fr}</p>
                        <StatusPicker
                          observation={observations.get(key)}
                          minDate={child.birthDate}
                          onChange={(status, at) => onChange(key, status, at)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
