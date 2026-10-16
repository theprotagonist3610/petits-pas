import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { canCancel, canPay, consultationService, type Consultation, type ConsultationStatus } from '@/lib/consultations'
import { useMyConsultations } from './useMyConsultations'
import { useSpecialtyLabel } from './useSpecialtyLabel'
import { formatPrice, usePlatform } from '@petits-pas/shared/platform'
import { useChildRefs } from './useChildRefs'
import { useChildren } from '@/data/hooks'
import { formatAgeMonths } from '@/lib/formatAge'
import type { AuthErrorCode } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { useAvatarUrl } from '@petits-pas/shared/avatars'
import { supabase } from '@/lib/supabase/client'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/components/Icon'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthCard, FormAlert, useAuthText } from '@/features/auth/AuthUi'

const statusStyle: Record<ConsultationStatus, string> = {
  pending: 'bg-honey-soft text-ink',
  confirmed: 'bg-leaf-soft text-leaf',
  cancelled: 'bg-ink/5 text-ink-soft',
  completed: 'bg-sky-soft text-sky-brand',
}

/** Photo du professionnel (bucket privé : lien signé temporaire). */
function ProPhoto({ path }: { path: string | undefined }) {
  const url = useAvatarUrl(supabase, path)
  return url ? (
    <img src={url} alt="" className="size-12 shrink-0 rounded-full object-cover ring-2 ring-surface" />
  ) : (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sky-soft text-sky-brand" aria-hidden="true">
      <Icon name="user" size={22} />
    </span>
  )
}

function ConsultationCard({
  consultation,
  childName,
  onChange,
}: {
  consultation: Consultation
  /** Prénom retrouvé sur ce téléphone à partir de l'empreinte de l'enfant (jamais transmis). */
  childName?: string
  onChange: (c: Consultation) => void
}) {
  const { t } = useTranslation()
  const text = useAuthText()
  const [error, setError] = useState<AuthErrorCode>()
  const [payNotice, setPayNotice] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const specialtyLabel = useSpecialtyLabel()
  const [busy, setBusy] = useState(false)
  const c = consultation
  const pro = c.professional

  async function cancel() {
    setBusy(true)
    const result = await consultationService!.cancel(c.id)
    setBusy(false)
    setConfirming(false)
    if (result.ok) onChange(result.data)
    else setError(result.error)
  }

  return (
    <li className="space-y-3 rounded-3xl bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
            c.type === 'teleconsultation' ? 'bg-leaf-soft text-leaf' : 'bg-teal-soft text-teal-brand'
          }`}
        >
          <Icon name={c.type === 'teleconsultation' ? 'chat' : 'calendar'} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold leading-tight">{t(`consultation.types.${c.type}`)}</h3>
          {c.requestedSpecialty && (
            <p className="text-sm font-semibold text-sky-brand">
              {t('consultation.specialist', { name: specialtyLabel(c.requestedSpecialty) })}
            </p>
          )}
          <p className="text-sm text-ink-soft">
            {c.childRef
              ? [
                  childName ? t('consultation.forChild', { name: childName }) : t('consultation.forUnknownChild'),
                  c.childAgeMonths !== undefined && formatAgeMonths(t, c.childAgeMonths),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('consultation.forSelf')}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${statusStyle[c.status]}`}>{t(`consultation.status.${c.status}`)}</span>
      </div>

      <p className="line-clamp-3 whitespace-pre-line">{c.reason}</p>

      {c.status === 'confirmed' && c.scheduledAt ? (
        <p className="flex items-center gap-2 font-bold text-leaf">
          <Icon name="calendar" size={18} /> {t('consultation.scheduled', { date: formatDateTime(c.scheduledAt) })}
        </p>
      ) : (
        c.preferredAt &&
        c.status === 'pending' && <p className="text-sm text-ink-soft">{t('consultation.preferred', { date: formatDateTime(c.preferredAt) })}</p>
      )}
      {(c.status === 'pending' || c.status === 'confirmed') && <p className="text-sm text-ink-soft">{t(`consultation.statusTexts.${c.status}`)}</p>}

      {pro && (
        <div className="flex items-center gap-3">
          <ProPhoto path={pro.avatarPath} />
          <p className="text-sm">
            {t('consultation.with', { name: `${pro.firstName} ${pro.lastName}` })}
            <span className="block text-ink-soft">
              {[specialtyLabel(pro.specialty), pro.facilityName, pro.city].filter(Boolean).join(' · ')}
            </span>
          </p>
        </div>
      )}
      {c.professionalNotes && (
        <div className="rounded-2xl bg-sky-soft p-3 text-sm">
          <p className="font-bold text-sky-brand">{t('consultation.proNotes')}</p>
          <p className="whitespace-pre-line">{c.professionalNotes}</p>
        </div>
      )}

      {c.type === 'teleconsultation' && c.status === 'confirmed' && c.paymentStatus === 'unpaid' && (
        <p className="text-sm text-ink-soft">{t('consultation.messagesAfterPayment')}</p>
      )}
      {c.type === 'teleconsultation' && (c.status === 'confirmed' || c.status === 'completed') && c.paymentStatus === 'paid' && (
        <Link
          to={`/consultation/${c.id}/messages`}
          className="flex min-h-12 items-center gap-3 rounded-2xl bg-leaf-soft px-4 py-2 font-bold text-leaf active:opacity-80"
        >
          <Icon name="chat" size={20} />
          <span className="flex-1">{t('messages.open')}</span>
          <Icon name="chevronRight" size={20} />
        </Link>
      )}
      {error && <FormAlert>{text.error(error)}</FormAlert>}
      {c.paymentStatus === 'paid' && c.paidAmount !== undefined && c.paidCurrency && (
        <p className="flex items-center gap-2 text-sm font-bold text-leaf">
          <Icon name="check" size={18} /> {t('consultation.paid', { amount: formatPrice(c.paidAmount, c.paidCurrency) })}
        </p>
      )}
      {c.paymentStatus === 'refunded' && <p className="text-sm font-bold text-ink-soft">{t('consultation.refunded')}</p>}
      {canPay(c) && (
        <>
          {/* Paiement en ligne à brancher plus tard : le bouton est déjà à sa place. */}
          <Button onClick={() => setPayNotice(true)}>{t('consultation.pay')}</Button>
          {payNotice && <FormAlert tone="success">{t('consultation.payLater')}</FormAlert>}
        </>
      )}
      {canCancel(c) && (
        <Button variant="destructive" disabled={busy} onClick={() => setConfirming(true)}>
          <Icon name="close" size={20} /> {t('consultation.cancel')}
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title={t('consultation.cancelDialog.title')}
          message={t(`consultation.cancelDialog.${c.status === 'confirmed' ? 'confirmedText' : 'text'}`)}
          confirmLabel={t('consultation.cancelDialog.confirm')}
          cancelLabel={t('consultation.cancelDialog.keep')}
          busy={busy}
          onConfirm={() => void cancel()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  )
}

function SignedInContent({ parentId }: { parentId: string }) {
  const { t } = useTranslation()
  const text = useAuthText()
  const location = useLocation()
  const justSent = (location.state as { sent?: boolean } | null)?.sent
  const { items, error, replace } = useMyConsultations(parentId)
  const { platform } = usePlatform(supabase)
  const closed = platform?.settings.maintenance === true
  const children = useChildren()
  const refs = useChildRefs(parentId, children)
  // Empreinte → prénom, pour les enfants de ce téléphone.
  const nameByRef = new Map(children?.flatMap((c) => (refs?.get(c.id) ? [[refs.get(c.id)!, c.firstName] as const] : [])))

  return (
    <>
      {justSent && <FormAlert tone="success">{t('consultation.sent')}</FormAlert>}
      {closed ? (
        <FormAlert>{platform?.settings.maintenance_message || t('consultation.form.maintenance')}</FormAlert>
      ) : (
        <Link
          to="/consultation/nouvelle"
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-sky-brand px-5 font-bold text-white shadow-sm active:bg-sky-brand/90"
        >
          <Icon name="plus" size={20} /> {t('consultation.newRequest')}
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-lg font-extrabold">{t('consultation.myRequests')}</h2>
        {error && !items && <FormAlert>{text.error(error)}</FormAlert>}
        {items?.length === 0 && <p className="rounded-3xl bg-surface p-4 text-ink-soft shadow-sm">{t('consultation.empty')}</p>}
        {items && items.length > 0 && (
          <ul className="space-y-3">
            {items.map((c) => (
              <ConsultationCard key={c.id} consultation={c} childName={c.childRef ? nameByRef.get(c.childRef) : undefined} onChange={replace} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export function ConsultationPage() {
  const { t } = useTranslation()
  const { status, user } = useAuth()

  return (
    <>
      <PageHeader title={t('consultation.title')} />
      <div className="space-y-4">
        <p className="leading-relaxed">{t('consultation.text')}</p>

        {status === 'unavailable' && <AuthCard>{t('auth.account.unavailable')}</AuthCard>}
        {status === 'signed_out' && (
          <AuthCard>
            <p>{t('consultation.signedOutText')}</p>
            <Link
              to="/connexion?next=%2Fconsultation"
              className="flex min-h-12 items-center justify-center rounded-2xl bg-sky-brand px-5 font-bold text-white shadow-sm"
            >
              {t('auth.account.signIn')}
            </Link>
            <Link
              to="/inscription?next=%2Fconsultation"
              className="flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface px-5 font-bold text-sky-brand"
            >
              {t('auth.account.signUp')}
            </Link>
          </AuthCard>
        )}
        {status === 'signed_in' && user && <SignedInContent parentId={user.id} />}

        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{t('consultation.emergency')}</p>
      </div>
    </>
  )
}
