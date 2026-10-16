import { useTranslation } from 'react-i18next'
import type { MilestoneObservation, MilestoneStatus } from '@/data/types'
import { toISODate } from '@/lib/age'
import { Icon } from '@/components/Icon'

const STATUSES: MilestoneStatus[] = ['not_yet', 'emerging', 'achieved']

const SELECTED: Record<MilestoneStatus, string> = {
  not_yet: 'border-honey bg-honey-soft text-ink',
  emerging: 'border-sky-brand bg-sky-soft text-sky-brand',
  achieved: 'border-leaf bg-leaf text-white',
}

interface Props {
  observation: MilestoneObservation | undefined
  minDate: string
  /** `null` efface l'observation (nouvel appui sur le statut déjà choisi). */
  onChange: (status: MilestoneStatus | null, achievedAt?: string) => void
}

export function StatusPicker({ observation, minDate, onChange }: Props) {
  const { t } = useTranslation()
  const today = toISODate(new Date())
  const current = observation?.status

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={current === status}
            onClick={() => (current === status ? onChange(null) : onChange(status, status === 'achieved' ? today : undefined))}
            className={`flex min-h-10 items-center justify-center gap-1 rounded-xl border text-sm font-bold transition-colors ${
              current === status ? SELECTED[status] : 'border-line bg-surface text-ink-soft'
            }`}
          >
            {status === 'achieved' && current === status && <Icon name="check" size={16} />}
            {t(`milestones.status.${status}`)}
          </button>
        ))}
      </div>
      {current === 'achieved' && (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          {t('milestones.since')}
          <input
            type="date"
            value={observation?.achievedAt ?? ''}
            min={minDate}
            max={today}
            onChange={(e) => e.target.value && onChange('achieved', e.target.value)}
            className="min-h-9 rounded-lg border border-line bg-surface px-2 text-ink"
          />
        </label>
      )}
    </div>
  )
}
