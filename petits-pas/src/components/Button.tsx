import type { ComponentProps } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive'

const variants: Record<Variant, string> = {
  primary: 'bg-sky-brand text-white shadow-sm active:bg-sky-brand/90 disabled:bg-sky-brand/50',
  secondary: 'bg-surface text-sky-brand border border-line active:bg-sky-soft',
  ghost: 'text-ink-soft active:bg-ink/5',
  danger: 'bg-surface text-red-600 border border-red-200 active:bg-red-50',
  /** Rouge plein, très visible : action destructrice (annuler, supprimer). */
  destructive: 'bg-danger text-white shadow-sm active:bg-danger/90 disabled:bg-danger/50',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
