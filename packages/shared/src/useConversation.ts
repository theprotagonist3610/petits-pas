import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationRow } from './database.types'
import type { DecryptedMessage, MessagingService } from './messaging'

/**
 * Étapes d'une conversation chiffrée :
 * - `setup` : l'utilisateur doit choisir son code secret (première fois) ;
 * - `locked` : clés sur le serveur mais pas sur cet appareil : saisir le code secret ;
 * - `waiting` : la clé de conversation n'est pas encore disponible pour lui (l'autre participant doit ouvrir la conversation) ;
 * - `ready` : lecture et envoi possibles.
 */
export type ConversationPhase = 'loading' | 'setup' | 'locked' | 'waiting' | 'ready'

/** Nouvel essai tant que la clé de conversation n'est pas disponible. */
const WAITING_RETRY_MS = 15_000

export function useConversation(service: MessagingService, userId: string | undefined, conversation: ConversationRow | null | undefined) {
  const [phase, setPhase] = useState<ConversationPhase>('loading')
  const [messages, setMessages] = useState<DecryptedMessage[]>([])
  const [error, setError] = useState<unknown>()
  const key = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!userId || !conversation) return
    try {
      const status = await service.keyStatus(userId)
      if (status !== 'ready') return setPhase(status === 'none' ? 'setup' : 'locked')
      const opened = await service.open(conversation, userId)
      key.current = opened.key
      if (!opened.key) return setPhase('waiting')
      setMessages(await service.messages(conversation.id, opened.key, userId))
      setPhase('ready')
      setError(undefined)
    } catch (e) {
      setError(e)
    }
  }, [service, userId, conversation])

  useEffect(() => {
    void load()
  }, [load])

  // En attente de l'autre participant : nouvel essai régulier et au retour sur l'application.
  useEffect(() => {
    if (phase !== 'waiting') return
    const timer = setInterval(() => void load(), WAITING_RETRY_MS)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [phase, load])

  // Temps réel : chaque nouveau message est déchiffré et ajouté.
  useEffect(() => {
    if (phase !== 'ready' || !conversation || !userId) return
    return service.subscribe(conversation.id, (row) => {
      if (!key.current) return
      void service.decrypt(row, key.current, userId).then((message) =>
        setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message])),
      )
    })
  }, [phase, service, conversation, userId])

  /** Envoie un message ; lève l'erreur pour que l'écran garde le texte et l'affiche. */
  const send = useCallback(
    async (text: string) => {
      if (!conversation || !userId || !key.current || !text.trim()) return
      await service.send(conversation.id, key.current, text.trim())
      setMessages(await service.messages(conversation.id, key.current, userId))
    },
    [service, conversation, userId],
  )

  const withReload = (run: (userId: string, code: string) => Promise<void>) => async (code: string) => {
    if (!userId) return
    await run(userId, code)
    setPhase('loading')
    await load()
  }

  return {
    phase,
    messages,
    /** Dernière erreur de chargement (réseau…), à traduire par l'application. */
    error,
    send,
    /** Première fois : choisir le code secret. */
    setup: withReload(service.setupKeys),
    /** Nouvel appareil : saisir le code secret (lève WrongSecretCodeError si faux). */
    unlock: withReload(service.unlock),
    /** Code oublié : nouvelles clés (les messages déjà reçus resteront illisibles sur ce compte). */
    reset: withReload(service.resetKeys),
    reload: load,
  }
}
