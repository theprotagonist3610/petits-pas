import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ConversationRow } from '@petits-pas/shared/database.types'
import { daysLeft, isOpen } from '@petits-pas/shared/messaging'
import { useProAuth } from '@/auth/ProAuthProvider'
import { useProData } from '@/auth/ProDataProvider'
import { messaging } from '@/lib/messaging'
import { errorMessage, toProErrorCode, type ProErrorCode } from '@/lib/errors'
import { specialtyName, formatDateTime, formatPatient } from '@/lib/format'
import { Chat } from '@/components/Chat'
import { PageTitle } from '@/components/Layout'
import { Icon } from '@/components/Icon'
import { Alert, Card } from '@/components/ui'

export function MessagesPage() {
  const { mine } = useProData()
  const [conversations, setConversations] = useState<ConversationRow[]>()
  const [error, setError] = useState<ProErrorCode>()

  useEffect(() => {
    messaging.listConversations().then(setConversations, (e) => setError(toProErrorCode(e)))
  }, [])

  const byConsultation = new Map(mine?.map((c) => [c.id, c]))
  const sorted = [...(conversations ?? [])].sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.opens_at.localeCompare(a.opens_at))

  return (
    <>
      <PageTitle title="Messagerie" subtitle="Téléconsultations : échanges chiffrés avec les parents, 10 jours à partir du paiement." />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {conversations?.length === 0 && (
        <Card>
          <p className="text-ink-soft">Aucune conversation. Une messagerie s’ouvre quand une téléconsultation que vous avez confirmée est payée par le parent.</p>
        </Card>
      )}
      <ul className="space-y-2">
        {sorted.map((conversation) => {
          const c = byConsultation.get(conversation.consultation_id)
          const open = isOpen(conversation)
          return (
            <li key={conversation.id}>
              <Link
                to={`/messages/${conversation.consultation_id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:bg-ink/5"
              >
                <span className={`flex size-10 items-center justify-center rounded-xl ${open ? 'bg-leaf-soft text-leaf' : 'bg-ink/5 text-ink-soft'}`}>
                  <Icon name="chat" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {c ? formatPatient(c.forChild, c.childAgeMonths, c.childSex) : 'Téléconsultation'}
                    {c?.requestedSpecialty && <span className="font-normal text-ink-soft"> · {specialtyName(c.requestedSpecialty)}</span>}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {open ? `Ouverte · ferme dans ${daysLeft(conversation)} j` : `Fermée le ${formatDateTime(conversation.closes_at)}`}
                  </span>
                </span>
                <Icon name="chevronRight" size={20} className="text-ink-soft" />
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export function ConversationPage() {
  const { consultationId } = useParams()
  const { user } = useProAuth()
  const { mine } = useProData()
  const [conversation, setConversation] = useState<ConversationRow | null>()
  const [error, setError] = useState<ProErrorCode>()
  const consultation = mine?.find((c) => c.id === consultationId)

  useEffect(() => {
    if (!consultationId) return
    messaging.conversationFor(consultationId).then(setConversation, (e) => setError(toProErrorCode(e)))
  }, [consultationId])

  return (
    <>
      <Link to={`/consultations/${consultationId}`} className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="back" size={18} /> Fiche de la consultation
      </Link>
      <PageTitle
        title="Messagerie"
        subtitle={consultation ? `${formatPatient(consultation.forChild, consultation.childAgeMonths, consultation.childSex)} · ${consultation.reason.slice(0, 80)}` : undefined}
      />
      {error && <Alert>{errorMessage(error)}</Alert>}
      {conversation === null && <Alert tone="info">Pas encore de messagerie : elle s’ouvre quand la téléconsultation est confirmée et que le parent l’a payée.</Alert>}
      {conversation && user && (
        <Card>
          <Chat conversation={conversation} userId={user.id} />
        </Card>
      )}
    </>
  )
}
