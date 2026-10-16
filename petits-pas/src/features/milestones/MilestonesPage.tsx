import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { repos, type Child, type MilestoneObservation, type MilestoneStatus } from '@/data'
import { useActiveChild, useMilestoneObservations } from '@/data/hooks'
import {
  CHECKPOINTS,
  checkpointDays,
  currentCheckpoint,
  milestoneAgeDays,
  milestoneConcerns,
  THOUSAND_DAYS_MONTHS,
} from '@/lib/milestones'
import { PageHeader } from '@/components/PageHeader'
import { Segmented } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { ThousandDaysCard } from './ThousandDaysCard'
import { WhoMotorSection } from './WhoMotorSection'
import { CheckpointCard, type CheckpointState } from './CheckpointCard'

type Era = 'thousand' | 'after'

function MilestonesView({ child, observations }: { child: Child; observations: Map<string, MilestoneObservation> }) {
  const { t } = useTranslation()
  const ageDays = milestoneAgeDays(child)
  const current = currentCheckpoint(ageDays)
  const [era, setEra] = useState<Era>(current <= THOUSAND_DAYS_MONTHS ? 'thousand' : 'after')
  const [open, setOpen] = useState<number | undefined>(current)
  // Étape tout juste franchie : on propose d'en faire un souvenir.
  const [bravo, setBravo] = useState<string>()
  const concerns = milestoneConcerns(ageDays, observations)
  const hasConcerns = concerns.cdc.length + concerns.who.length > 0

  useEffect(() => {
    if (!bravo) return
    const timer = setTimeout(() => setBravo(undefined), 6000)
    return () => clearTimeout(timer)
  }, [bravo])

  async function change(milestoneId: string, status: MilestoneStatus | null, achievedAt?: string) {
    const wasAchieved = observations.get(milestoneId)?.status === 'achieved'
    await repos.milestones.set(child.id, milestoneId, status, achievedAt)
    if (status === 'achieved' && !wasAchieved) setBravo(milestoneId)
  }

  const checkpoints = CHECKPOINTS.filter((m) => (era === 'thousand' ? m <= THOUSAND_DAYS_MONTHS : m > THOUSAND_DAYS_MONTHS))
  const stateOf = (months: number): CheckpointState =>
    months === current ? 'current' : checkpointDays(months) <= ageDays ? 'past' : 'upcoming'

  return (
    <div className="space-y-4">
      <ThousandDaysCard child={child} />

      {hasConcerns && (
        <section className="rounded-3xl bg-honey-soft p-4">
          <h2 className="flex items-center gap-2 font-extrabold">
            <Icon name="chat" size={20} /> {t('milestones.concern.title')}
          </h2>
          <p className="mt-1 text-sm leading-relaxed">{t('milestones.concern.text')}</p>
          <Link to="/consultation" className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-surface font-bold text-sky-brand">
            {t('growth.talk')}
          </Link>
        </section>
      )}

      <Segmented
        value={era}
        onChange={setEra}
        options={[
          { value: 'thousand', label: t('milestones.eras.thousand') },
          { value: 'after', label: t('milestones.eras.after') },
        ]}
      />

      {era === 'thousand' && <WhoMotorSection child={child} ageDays={ageDays} observations={observations} onChange={change} />}

      {checkpoints.map((months) => (
        <CheckpointCard
          key={months}
          child={child}
          months={months}
          state={stateOf(months)}
          open={open === months}
          onToggle={() => setOpen(open === months ? undefined : months)}
          observations={observations}
          onChange={change}
        />
      ))}

      <p className="rounded-2xl bg-surface p-4 text-sm font-semibold shadow-sm">{t('milestones.regression')}</p>
      <p className="px-2 text-center text-xs leading-relaxed text-ink-soft">{t('milestones.source')}</p>

      {bravo && (
        <div
          role="status"
          className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto max-w-md rounded-2xl bg-leaf p-4 text-center text-white shadow-lg"
        >
          <p className="font-extrabold">{t('milestones.bravo', { name: child.firstName })}</p>
          <Link
            to={`/souvenirs/nouveau?etape=${bravo}`}
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface font-bold text-leaf"
          >
            <Icon name="camera" size={18} /> {t('memories.fromMilestone')}
          </Link>
        </div>
      )}
    </div>
  )
}

export function MilestonesPage() {
  const { t } = useTranslation()
  const { child, loading } = useActiveChild()
  const observations = useMilestoneObservations(child?.id)

  if (loading) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />

  return (
    <>
      <PageHeader title={t('milestones.title')} back={false} />
      {observations && <MilestonesView key={child.id} child={child} observations={observations} />}
    </>
  )
}
