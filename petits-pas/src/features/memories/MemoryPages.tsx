import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { repos } from '@/data'
import { useActiveChild, useChild } from '@/data/hooks'
import { milestoneTitle } from '@/lib/milestones'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { useGoBack } from '@/components/useGoBack'
import { MemoryForm } from './MemoryForm'
import { saveMemory } from './saveMemory'

export function MemoryNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { child, loading } = useActiveChild()
  const milestoneId = params.get('etape') ?? undefined
  // Depuis une étape franchie : titre et date de l'étape proposés d'office. Le résultat porte l'enfant
  // concerné, pour ne pas afficher le formulaire avec la réponse d'une requête faite avant son chargement.
  const lookup = useLiveQuery(
    async () => ({
      childId: child?.id,
      observation: child && milestoneId ? (await repos.milestones.listByChild(child.id)).find((o) => o.milestoneId === milestoneId) : undefined,
    }),
    [child?.id, milestoneId],
  )

  if (loading) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />
  if (lookup?.childId !== child.id) return null
  const observation = lookup.observation

  return (
    <>
      <PageHeader title={t('memories.form.newTitle')} />
      <MemoryForm
        key={child.id}
        child={child}
        defaults={milestoneId ? { milestoneId, title: milestoneTitle(milestoneId), date: observation?.achievedAt } : undefined}
        onSubmit={async (input, photo) => {
          const memory = await saveMemory(input, photo)
          navigate(`/souvenirs/${memory.id}`, { replace: true })
        }}
      />
    </>
  )
}

export function MemoryEditPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const goBack = useGoBack(`/souvenirs/${id}`)
  // `null` = chargé mais introuvable ; `undefined` = en cours de chargement.
  const memory = useLiveQuery(async () => (await repos.memories.get(id!)) ?? null, [id])
  const child = useChild(memory?.childId)

  if (memory === null) return <Navigate to="/souvenirs" replace />
  if (!memory || !child) return null
  const current = memory

  async function remove() {
    if (!window.confirm(t('memories.detail.deleteConfirm'))) return
    await repos.memories.remove(current.id)
    navigate('/souvenirs', { replace: true })
  }

  return (
    <>
      <PageHeader title={t('memories.form.editTitle')} />
      <MemoryForm
        key={current.id}
        child={child}
        initial={current}
        onSubmit={async (input, photo) => {
          await saveMemory(input, photo, current)
          goBack()
        }}
        footer={
          <Button type="button" variant="danger" onClick={() => void remove()}>
            <Icon name="trash" size={20} /> {t('common.delete')}
          </Button>
        }
      />
    </>
  )
}
