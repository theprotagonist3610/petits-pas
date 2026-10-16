import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { repos } from '@/data'
import { PageHeader } from '@/components/PageHeader'
import { ChildForm } from './ChildForm'
import { saveChild } from './saveChild'

export function ChildNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title={t('child.newTitle')} />
      <ChildForm
        submitLabel={t('common.save')}
        onSubmit={async (input, photo) => {
          const child = await saveChild(input, photo)
          await repos.settings.update({ activeChildId: child.id })
          navigate('/enfant', { replace: true })
        }}
      />
    </>
  )
}
