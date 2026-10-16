import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ConversationRow } from '@petits-pas/shared/database.types'
import { daysLeft, isOpen } from '@petits-pas/shared/messaging'
import { useConversation } from '@petits-pas/shared/useConversation'
import { toAuthErrorCode } from '@/lib/auth'
import { messaging } from '@/lib/messaging'
import { formatDateTime } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthCard, FormAlert, PasswordInput, useAuthText } from '@/features/auth/AuthUi'
import { SecretCodeFields, numericInputProps, validateSecretCode, type SecretCodeError } from './SecretCodeFields'

const time = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit' })

/** Message d'erreur traduit, y compris le code secret incorrect. */
function useErrorText() {
  const { t } = useTranslation()
  const text = useAuthText()
  return (error: unknown) =>
    error instanceof Error && error.message === 'wrong_secret_code' ? t('messages.errors.wrongCode') : text.error(toAuthErrorCode(error))
}

function NewCodeForm({ onSubmit }: { onSubmit: (code: string) => Promise<void> }) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const [value, setValue] = useState({ code: '', confirmation: '' })
  const [invalid, setInvalid] = useState<SecretCodeError>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateSecretCode(value.code, value.confirmation)
    setInvalid(found)
    if (found || busy) return
    setBusy(true)
    try {
      await onSubmit(value.code)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <FormAlert>{error}</FormAlert>}
      <SecretCodeFields code={value.code} confirmation={value.confirmation} onChange={setValue} error={invalid} />
      <Button type="submit" disabled={busy}>
        {busy ? t('messages.encrypting') : t('messages.save')}
      </Button>
    </form>
  )
}

function UnlockForm({ onUnlock, onReset }: { onUnlock: (code: string) => Promise<void>; onReset: (code: string) => Promise<void> }) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!code || busy) return
    setBusy(true)
    try {
      await onUnlock(code)
    } catch (e) {
      setError(errorText(e))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  if (forgot) {
    return (
      <AuthCard>
        <FormAlert>{t('messages.resetWarning')}</FormAlert>
        <NewCodeForm onSubmit={onReset} />
        <Button variant="ghost" onClick={() => setForgot(false)}>
          {t('messages.back')}
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>{t('messages.unlockText')}</p>
        {error && <FormAlert>{error}</FormAlert>}
        <Field label={t('messages.code')}>
          <PasswordInput {...numericInputProps} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" />
        </Field>
        <Button type="submit" disabled={busy}>
          <Icon name="lock" size={20} /> {busy ? t('messages.decrypting') : t('messages.unlock')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setForgot(true)}>
          {t('messages.forgot')}
        </Button>
      </form>
    </AuthCard>
  )
}

function Conversation({ conversation, userId }: { conversation: ConversationRow; userId: string }) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const chat = useConversation(messaging!, userId, conversation)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string>()
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
      setSendError(errorText(e))
    } finally {
      setSending(false)
    }
  }

  const status = (
    <p className={`mb-3 flex items-center gap-2 text-sm font-bold ${open ? 'text-leaf' : 'text-ink-soft'}`}>
      <Icon name="lock" size={16} />
      {open ? t('messages.encrypted', { count: daysLeft(conversation) }) : t('messages.closed', { date: formatDateTime(conversation.closes_at) })}
    </p>
  )

  if (chat.error && chat.phase === 'loading') return <FormAlert>{errorText(chat.error)}</FormAlert>

  switch (chat.phase) {
    case 'loading':
      return <p className="text-ink-soft">{t('messages.loading')}</p>
    case 'setup':
      return (
        <AuthCard title={t('messages.setupTitle')}>
          <p className="text-ink-soft">{t('messages.setupText')}</p>
          <NewCodeForm onSubmit={chat.setup} />
        </AuthCard>
      )
    case 'locked':
      return <UnlockForm onUnlock={chat.unlock} onReset={chat.reset} />
    case 'waiting':
      return (
        <>
          {status}
          <AuthCard>
            <p className="text-ink-soft">{t('messages.waiting')}</p>
          </AuthCard>
        </>
      )
  }

  return (
    <>
      {status}
      <div className="space-y-2 pb-36">
        {chat.messages.length === 0 && <p className="rounded-3xl bg-surface p-4 text-center text-ink-soft shadow-sm">{t('messages.empty')}</p>}
        {chat.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-3xl px-4 py-2 ${m.mine ? 'bg-sky-brand text-white' : 'bg-surface shadow-sm'}`}>
              {m.text === null ? (
                <p className="text-sm italic opacity-80">{t('messages.unreadable')}</p>
              ) : (
                <p className="whitespace-pre-line break-words">{m.text}</p>
              )}
              <p className={`mt-0.5 text-right text-xs ${m.mine ? 'text-white/85' : 'text-ink-soft'}`}>{time.format(new Date(m.createdAt))}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* Saisie fixée au-dessus de la barre de navigation. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto max-w-md p-3">
          {sendError && (
            <div className="mb-2">
              <FormAlert>{sendError}</FormAlert>
            </div>
          )}
          {open ? (
            <form onSubmit={send} className="flex items-end gap-2">
              <textarea
                className="block max-h-32 min-h-12 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 outline-none focus:border-sky-brand focus:ring-2 focus:ring-sky-brand/20"
                rows={1}
                value={draft}
                maxLength={4000}
                placeholder={t('messages.placeholder')}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={t('messages.placeholder')}
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label={t('messages.send')}
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sky-brand text-white disabled:opacity-50"
              >
                <Icon name="send" size={22} />
              </button>
            </form>
          ) : (
            <p className="text-center text-sm text-ink-soft">{t('messages.closedText')}</p>
          )}
        </div>
      </div>
    </>
  )
}

export function ConsultationMessagesPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const errorText = useErrorText()
  const { user } = useAuth()
  const [conversation, setConversation] = useState<ConversationRow | null>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!id || !messaging) return
    messaging.conversationFor(id).then(setConversation, (e) => setError(errorText(e)))
    // errorText ne dépend que de la langue : pas besoin de relancer la lecture quand il change.
  }, [id])

  return (
    <>
      <PageHeader title={t('messages.title')} />
      {error && <FormAlert>{error}</FormAlert>}
      {conversation === null && <AuthCard>{t('messages.none')}</AuthCard>}
      {conversation && user && <Conversation conversation={conversation} userId={user.id} />}
    </>
  )
}
