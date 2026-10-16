import type { ReactNode } from 'react'

export const inputClass =
  'block min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-sky-brand focus:ring-2 focus:ring-sky-brand/20'

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink-soft">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm font-semibold text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-sm text-ink-soft">{hint}</span>
      )}
    </label>
  )
}

/** Choix exclusif sous forme de gros boutons (adapté au tactile). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className={`grid gap-3 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-12 rounded-2xl border-2 font-bold transition-colors ${
            value === o.value ? 'border-sky-brand bg-sky-soft text-sky-brand' : 'border-line bg-surface text-ink-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
