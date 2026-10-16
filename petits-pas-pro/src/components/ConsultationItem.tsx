import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ProConsultation } from '@/lib/consultations'
import { specialtyName, TYPES, formatAgo, formatDateTime, formatPatient } from '@/lib/format'
import { Icon } from './Icon'
import { StatusBadge } from './ui'

/** Ligne de consultation : type, spécialité, patient (âge et sexe seulement), motif, horaire. */
export function ConsultationItem({ consultation: c, action, link = true }: { consultation: ProConsultation; action?: ReactNode; link?: boolean }) {
  const when = c.scheduledAt
    ? formatDateTime(c.scheduledAt)
    : c.preferredAt
      ? `Souhaité : ${formatDateTime(c.preferredAt)}`
      : `Demandé ${formatAgo(c.createdAt)}`

  const body = (
    <div className="flex items-start gap-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          c.type === 'teleconsultation' ? 'bg-leaf-soft text-leaf' : 'bg-teal-soft text-teal-brand'
        }`}
      >
        <Icon name={c.type === 'teleconsultation' ? 'chat' : 'calendar'} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-extrabold">{TYPES[c.type]}</span>
          {c.requestedSpecialty && <span className="text-sm text-ink-soft">· {specialtyName(c.requestedSpecialty)}</span>}
          {c.status !== 'pending' && <StatusBadge status={c.status} />}
        </div>
        <p className="text-sm font-semibold text-sky-brand">{formatPatient(c.forChild, c.childAgeMonths, c.childSex)}</p>
        <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line">{c.reason}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
          <Icon name="clock" size={14} /> {when}
        </p>
      </div>
      {link && <Icon name="chevronRight" size={20} className="mt-2 shrink-0 text-ink-soft" />}
    </div>
  )

  return (
    <li className="rounded-2xl border border-line bg-surface">
      {link ? (
        <Link to={`/consultations/${c.id}`} className="block rounded-2xl p-4 hover:bg-ink/5">
          {body}
        </Link>
      ) : (
        <div className="p-4">{body}</div>
      )}
      {action && <div className="border-t border-line px-4 py-3">{action}</div>}
    </li>
  )
}
