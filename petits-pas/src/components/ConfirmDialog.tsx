import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Icon } from './Icon'

interface Props {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Pendant l'action : boutons désactivés, la fenêtre reste ouverte. */
  busy?: boolean
}

/**
 * Fenêtre de confirmation d'une action destructrice (remplace window.confirm).
 * Le focus va sur « Garder » : un appui distrait ne détruit rien. Échap ou un appui à côté ferment la fenêtre.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel, busy = false }: Props) {
  const titleId = useId()
  const messageId = useId()
  const keep = useRef<HTMLButtonElement>(null)
  // Dernières valeurs, lues par l'écouteur Échap installé une seule fois à l'ouverture.
  const latest = useRef({ busy, onCancel })
  latest.current = { busy, onCancel }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    keep.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !latest.current.busy && latest.current.onCancel()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus() // Rend le focus au bouton qui a ouvert la fenêtre.
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="pb-safe w-full max-w-sm rounded-3xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <Icon name="close" size={24} />
        </span>
        <h2 id={titleId} className="text-lg font-extrabold">
          {title}
        </h2>
        <p id={messageId} className="mt-1 text-ink-soft">
          {message}
        </p>
        <div className="mt-5 space-y-2">
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button ref={keep} variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
