import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { useGoBack } from './useGoBack'

export function PageHeader({ title, back = true }: { title: string; back?: boolean }) {
  const goBack = useGoBack('/')
  const { t } = useTranslation()
  return (
    <div className="mb-5 flex items-center gap-2">
      {back && (
        <button
          onClick={goBack}
          aria-label={t('common.back')}
          className="-ml-2 flex size-11 items-center justify-center rounded-full text-ink-soft active:bg-ink/5"
        >
          <Icon name="back" />
        </button>
      )}
      <h1 className="text-2xl font-extrabold">{title}</h1>
    </div>
  )
}
