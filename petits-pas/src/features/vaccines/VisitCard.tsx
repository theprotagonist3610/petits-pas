import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { repos, type Child, type VaccineRecord } from '@/data'
import type { Intervention, VaccineVisit } from '@/reference/vaccines'
import { toISODate } from '@/lib/age'
import { formatDate } from '@/lib/format'
import { dueDate, suggestedDoneDate, type VisitState } from '@/lib/vaccines'
import { Icon } from '@/components/Icon'

const DOT: Record<VisitState, string> = {
  done: 'bg-leaf border-leaf',
  due: 'bg-sun border-sun',
  late: 'bg-honey border-honey',
  upcoming: 'bg-surface border-line',
}

const CHIP: Record<VisitState, string> = {
  done: 'bg-leaf-soft text-leaf',
  due: 'bg-sun text-white',
  late: 'bg-honey-soft text-ink',
  upcoming: 'bg-sky-soft text-sky-brand',
}

/** Abréviation du carnet avec la dose : « Penta2 », « PCV13-2 » (tiret si l'abréviation finit par un chiffre). */
function shortCode(i: Intervention): string {
  if (i.dose === undefined) return i.code
  return /\d$/.test(i.code) ? `${i.code}-${i.dose}` : `${i.code}${i.dose}`
}

interface Props {
  child: Child
  visit: VaccineVisit
  state: VisitState
  records: Map<string, VaccineRecord>
  open: boolean
  onToggle: () => void
  last: boolean
}

function InterventionRow({ item, done, onToggle }: { item: Intervention; done: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <li>
      <button type="button" onClick={onToggle} aria-pressed={done} className="flex w-full items-start gap-3 rounded-2xl bg-cream p-3 text-left">
        <span
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
            done ? 'border-leaf bg-leaf text-white' : 'border-line bg-surface'
          }`}
        >
          {done && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
        <span className="flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 font-bold">
            {item.name}
            {item.dose !== undefined && <span className="text-sm font-semibold text-ink-soft">{t('vaccines.dose', { n: item.dose })}</span>}
            {item.kind !== 'vaccine' && (
              <span className="rounded-full bg-surface px-2 text-xs font-bold text-teal-brand">{t(`vaccines.kinds.${item.kind}`)}</span>
            )}
          </span>
          <span className="block text-sm text-ink-soft">
            {item.kind === 'vaccine' ? t('vaccines.protects', { list: item.protects.join(', ') }) : item.protects.join(', ')}
          </span>
        </span>
      </button>
    </li>
  )
}

export function VisitCard({ child, visit, state, records, open, onToggle, last }: Props) {
  const { t } = useTranslation()
  const due = dueDate(child.birthDate, visit.age)
  const ids = visit.interventions.map((i) => i.id)
  const doneCount = ids.filter((id) => records.has(id)).length
  const recordedDate = ids.map((id) => records.get(id)?.doneAt).find(Boolean)
  const [doneDate, setDoneDate] = useState(recordedDate ?? suggestedDoneDate(due))

  async function toggle(id: string) {
    await repos.vaccines.set(child.id, [id], records.has(id) ? null : doneDate)
  }

  async function changeDate(date: string) {
    if (!date) return
    setDoneDate(date)
    const done = ids.filter((id) => records.has(id))
    if (done.length) await repos.vaccines.set(child.id, done, date)
  }

  return (
    <li className="relative pl-8">
      {!last && <span className="absolute top-6 -bottom-4 left-2.75 w-0.5 bg-line" aria-hidden="true" />}
      <span className={`absolute top-5 left-1 size-4 rounded-full border-[3px] ${DOT[state]}`} aria-hidden="true" />

      <section className={`overflow-hidden rounded-3xl bg-surface shadow-sm ${state === 'due' ? 'ring-2 ring-sun' : ''}`}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
          <span className="flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold">{visit.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${CHIP[state]}`}>{t(`vaccines.state.${state}`)}</span>
            </span>
            <span className="mt-0.5 block text-sm text-ink-soft">
              {state === 'done' && recordedDate ? `${t('vaccines.doneOn')} ${formatDate(recordedDate)}` : t('vaccines.expected', { date: formatDate(due) })}
            </span>
            <span className="mt-1 block text-sm font-semibold text-ink-soft">{visit.interventions.map(shortCode).join(' · ')}</span>
          </span>
          <span className="text-sm font-bold text-ink-soft">
            {doneCount}/{ids.length}
          </span>
          <Icon name="chevronDown" size={20} className={`shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="space-y-3 border-t border-line p-4">
            <ul className="space-y-2">
              {visit.interventions.map((item) => (
                <InterventionRow key={item.id} item={item} done={records.has(item.id)} onToggle={() => void toggle(item.id)} />
              ))}
            </ul>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              {t('vaccines.doneOn')}
              <input
                type="date"
                value={doneDate}
                min={child.birthDate}
                max={toISODate(new Date())}
                onChange={(e) => void changeDate(e.target.value)}
                className="min-h-9 rounded-lg border border-line bg-surface px-2 text-ink"
              />
            </label>
            {doneCount < ids.length && (
              <button
                type="button"
                onClick={() => void repos.vaccines.set(child.id, ids, doneDate)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-leaf font-bold text-white"
              >
                <Icon name="check" size={18} /> {t('vaccines.markAll')}
              </button>
            )}
          </div>
        )}
      </section>
    </li>
  )
}
