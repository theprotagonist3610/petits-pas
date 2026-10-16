import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ConsultationStatus } from '@petits-pas/shared/database.types'
import { STATUSES } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'

const variants: Record<Variant, string> = {
  primary: 'bg-sky-brand text-white shadow-sm hover:bg-sky-brand/90 disabled:bg-sky-brand/50',
  secondary: 'bg-surface text-sky-brand border border-line hover:bg-sky-soft',
  ghost: 'text-ink-soft hover:bg-ink/5',
  destructive: 'bg-danger text-white shadow-sm hover:bg-danger/90 disabled:bg-danger/50',
}

export function Button({ variant = 'primary', className = '', ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export const inputClass =
  'block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-sky-brand focus:ring-2 focus:ring-sky-brand/20'

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink-soft">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm font-semibold text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-sm text-ink-soft">{hint}</span>
      )}
    </label>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tones = { error: 'bg-red-50 text-red-700', success: 'bg-leaf-soft text-leaf', info: 'bg-sky-soft text-sky-brand' }
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm font-semibold ${tones[tone]}`}>
      {children}
    </p>
  )
}

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-surface p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-extrabold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const statusStyle: Record<ConsultationStatus, string> = {
  pending: 'bg-honey-soft text-ink',
  confirmed: 'bg-leaf-soft text-leaf',
  cancelled: 'bg-ink/5 text-ink-soft',
  completed: 'bg-sky-soft text-sky-brand',
}

export function StatusBadge({ status }: { status: ConsultationStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold ${statusStyle[status]}`}>{STATUSES[status]}</span>
}

/** Fenêtre de confirmation (action destructrice ou engageante). Le focus va sur « Annuler ». */
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const latest = useRef({ busy, onClose })
  latest.current = { busy, onClose }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !latest.current.busy && latest.current.onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="mb-4 text-lg font-extrabold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Écran centré (connexion, double authentification, attente de vérification). */
export function AuthScreen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/logo.png" alt="" className="size-12" />
          <span className="text-xl font-extrabold">
            Petits Pas <span className="text-sky-brand">Pro</span>
          </span>
        </div>
        <section className="space-y-4 rounded-2xl bg-surface p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
          </div>
          {children}
        </section>
      </div>
    </main>
  )
}
