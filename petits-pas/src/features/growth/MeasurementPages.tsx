import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { repos } from '@/data'
import { useActiveChild, useChild } from '@/data/hooks'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { useGoBack } from '@/components/useGoBack'
import { MeasurementForm } from './MeasurementForm'

export function MeasurementNewPage() {
  const { t } = useTranslation()
  const goBack = useGoBack('/croissance')
  const { child, loading } = useActiveChild()
  if (loading) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />

  return (
    <>
      <PageHeader title={t('growth.form.newTitle')} />
      <MeasurementForm
        key={child.id}
        child={child}
        onSubmit={async (input) => {
          await repos.measurements.create(input)
          goBack()
        }}
      />
    </>
  )
}

export function MeasurementEditPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const goBack = useGoBack('/croissance')
  // `null` = chargée mais introuvable ; `undefined` = en cours de chargement.
  const measurement = useLiveQuery(async () => (await repos.measurements.get(id!)) ?? null, [id])
  const child = useChild(measurement?.childId)

  if (measurement === null) return <Navigate to="/croissance" replace />
  if (!measurement || !child) return null
  const current = measurement

  async function remove() {
    if (!window.confirm(t('growth.form.deleteConfirm'))) return
    await repos.measurements.remove(current.id)
    goBack()
  }

  return (
    <>
      <PageHeader title={t('growth.form.editTitle')} />
      <MeasurementForm
        key={current.id}
        child={child}
        initial={current}
        onSubmit={async ({ childId: _childId, ...input }) => {
          // Les champs vidés doivent être effacés, pas conservés.
          await repos.measurements.update(current.id, {
            weightKg: undefined,
            heightCm: undefined,
            heightMethod: undefined,
            headCm: undefined,
            muacCm: undefined,
            ...input,
          })
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
