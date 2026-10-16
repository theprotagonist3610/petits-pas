import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { repos } from '@/data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { ChildForm } from './ChildForm'
import { saveChild } from './saveChild'
import { useGoBack } from '@/components/useGoBack'

export function ChildEditPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const goBack = useGoBack('/enfants')
  // `null` = chargé mais introuvable ; `undefined` = en cours de chargement.
  const child = useLiveQuery(async () => (await repos.children.get(id!)) ?? null, [id])

  if (child === undefined) return null
  if (child === null) return <Navigate to="/enfants" replace />
  const current = child

  async function remove() {
    if (!window.confirm(t('child.deleteConfirm', { name: current.firstName }))) return
    await repos.children.remove(current.id)
    navigate('/enfants', { replace: true })
  }

  return (
    <>
      <PageHeader title={t('child.editTitle')} />
      <ChildForm
        key={current.id}
        initial={current}
        submitLabel={t('common.save')}
        onSubmit={async (input, photo) => {
          await saveChild(input, photo, current)
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
