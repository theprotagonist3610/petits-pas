import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ConversationRow } from '@petits-pas/shared/database.types'
import { SECRET_CODE_MIN_LENGTH, checkSecretCode, digitsOnly } from '@petits-pas/shared/messagingRules'
import { daysLeft, isOpen } from '@petits-pas/shared/messaging'
import { useConversation } from '@petits-pas/shared/useConversation'
import { messaging } from '@/lib/messaging'
import { errorMessage, toProErrorCode, type ProErrorCode } from '@/lib/errors'
import { formatDateTime, formatTime } from '@/lib/format'
import { Icon } from './Icon'
import { Alert, Button, Field, inputClass } from './ui'

/** Choix (ou nouveau choix) du code secret, avec confirmation. */
function SecretCodeForm({ onSubmit, reset = false }: { onSubmit: (code: string) => Promise<void>; reset?: boolean }) {
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problem = checkSecretCode(code)
    if (problem === 'too_simple') return setInvalid('Code trop simple : évitez les suites (12345678) et les chiffres répétés.')
    if (problem) return setInvalid(`Au moins ${SECRET_CODE_MIN_LENGTH} chiffres.`)
    if (code !== confirmation) return setInvalid('Les deux codes ne sont pas identiques.')
    setInvalid(undefined)
    setBusy(true)
    try {
      await onSubmit(code)
    } catch (e) {
      setError(toProErrorCode(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Field label={reset ? 'Nouveau code secret' : 'Code secret de messagerie'} hint={`Au moins ${SECRET_CODE_MIN_LENGTH} chiffres, un seul code pour toutes vos conversations. Il n’est jamais envoyé à Petits Pas.`} error={invalid}>
        <input type="password" inputMode="numeric" pattern="[0-9]*" className={inputClass} value={code} onChange={(e) => setCode(digitsOnly(e.target.value))} autoComplete="new-password" />
      </Field>
      <Field label="Confirmer le code secret">
        <input type="password" inputMode="numeric" pattern="[0-9]*" className={inputClass} value={confirmation} onChange={(e) => setConfirmation(digitsOnly(e.target.value))} autoComplete="new-password" />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Chiffrement…' : 'Enregistrer le code secret'}
      </Button>
    </form>
  )
}

function UnlockForm({ onUnlock, onReset }: { onUnlock: (code: string) => Promise<void>; onReset: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!code || busy) return
    setBusy(true)
    try {
      await onUnlock(code)
    } catch (e) {
      setError(toProErrorCode(e))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  if (forgot) {
    return (
      <div className="space-y-3">
        <Alert tone="info">
          Avec un nouveau code, les messages déjà échangés deviennent illisibles pour vous. Les conversations en cours redeviennent lisibles dès
          que le parent ouvre à nouveau la sienne.
        </Alert>
        <SecretCodeForm onSubmit={onReset} reset />
        <Button variant="ghost" onClick={() => setForgot(false)}>
          Retour
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-ink-soft">Saisissez votre code secret pour déchiffrer vos messages sur cet ordinateur.</p>
      {error && <Alert>{errorMessage(error)}</Alert>}
      <Field label="Code secret">
        <input type="password" inputMode="numeric" className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" autoFocus />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          <Icon name="lock" size={18} /> {busy ? 'Déchiffrement…' : 'Déverrouiller'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setForgot(true)}>
          Code oublié ?
        </Button>
      </div>
    </form>
  )
}

/** Messagerie chiffrée d'une téléconsultation : fil de messages et saisie, pendant les 10 jours d'ouverture. */
export function Chat({ conversation, userId }: { conversation: ConversationRow; userId: string }) {
  const chat = useConversation(messaging, userId, conversation)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<ProErrorCode>()
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const open = isOpen(conversation)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages.length])

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError(undefined)
    try {
      await chat.send(draft)
      setDraft('')
    } catch (e) {
      setSendError(toProErrorCode(e))
    } finally {
      setSending(false)
    }
  }

  const header = (
    <p className={`flex items-center gap-2 text-sm font-bold ${open ? 'text-leaf' : 'text-ink-soft'}`}>
      <Icon name={open ? 'lock' : 'clock'} size={16} />
      {open ? `Chiffrée de bout en bout · ferme dans ${daysLeft(conversation)} jour${daysLeft(conversation) > 1 ? 's' : ''}` : `Fermée le ${formatDateTime(conversation.closes_at)} · lecture seule`}
    </p>
  )

  if (chat.error && chat.phase === 'loading') return <Alert>{errorMessage(toProErrorCode(chat.error))}</Alert>

  switch (chat.phase) {
    case 'loading':
      return <p className="text-ink-soft">Chargement de la messagerie…</p>
    case 'setup':
      return (
        <div className="space-y-3">
          <p>Choisissez un code secret : il protège vos messages et vous permettra de les retrouver sur un autre ordinateur.</p>
          <SecretCodeForm onSubmit={chat.setup} />
        </div>
      )
    case 'locked':
      return <UnlockForm onUnlock={chat.unlock} onReset={chat.reset} />
    case 'waiting':
      return (
        <div className="space-y-2">
          {header}
          <Alert tone="info">
            Connexion sécurisée en attente : le parent doit ouvrir la conversation sur son téléphone. Cette page se met à jour toute seule.
          </Alert>
        </div>
      )
  }

  return (
    <div className="flex flex-col gap-3">
      {header}
      <div className="max-h-[60dvh] min-h-48 space-y-2 overflow-y-auto rounded-xl bg-cream p-3">
        {chat.messages.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">Aucun message. Écrivez le premier pour le parent.</p>}
        {chat.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.mine ? 'bg-sky-brand text-white' : 'bg-surface shadow-sm'}`}>
              {m.text === null ? (
                <p className="text-sm italic opacity-80">Message illisible (clés réinitialisées depuis son envoi)</p>
              ) : (
                <p className="whitespace-pre-line break-words">{m.text}</p>
              )}
              <p className={`mt-0.5 text-right text-xs ${m.mine ? 'text-white/80' : 'text-ink-soft'}`}>{formatTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {sendError && <Alert>{errorMessage(sendError)}</Alert>}
      {open ? (
        <form onSubmit={send} className="flex items-end gap-2">
          <textarea
            className={`${inputClass} max-h-40 min-h-11 flex-1 py-2`}
            value={draft}
            maxLength={4000}
            placeholder="Votre message au parent…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Entrée envoie, Maj+Entrée va à la ligne.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            aria-label="Message"
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            Envoyer
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-soft">La messagerie est fermée. Pour un nouvel échange, le parent peut faire une nouvelle demande.</p>
      )}
    </div>
  )
}
