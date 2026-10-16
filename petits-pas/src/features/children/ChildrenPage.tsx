import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child } from '@/data/types'
import { useChildren } from '@/data/hooks'
import { PageHeader } from '@/components/PageHeader'
import { ChildAvatar } from '@/components/ChildAvatar'
import { useChildAge } from '@/components/ChildAge'
import { Icon } from '@/components/Icon'

function ChildRow({ child }: { child: Child }) {
  const { age } = useChildAge(child)
  return (
    <Link
      to={`/enfants/${child.id}`}
      className="flex min-h-16 items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm active:bg-sky-soft"
    >
      <ChildAvatar child={child} size={48} />
      <span className="flex-1">
        <span className="block font-extrabold">{child.firstName}</span>
        <span className="block text-sm text-ink-soft">{age}</span>
      </span>
      <Icon name="chevronRight" className="text-ink-soft" />
    </Link>
  )
}

export function ChildrenPage() {
  const { t } = useTranslation()
  const children = useChildren()
  return (
    <>
      <PageHeader title={t('child.myChildren')} />
      <div className="space-y-3">
        {children?.map((c) => <ChildRow key={c.id} child={c} />)}
        <Link
          to="/enfants/nouveau"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-brand/40 font-bold text-sky-brand active:bg-sky-soft"
        >
          <Icon name="plus" size={20} /> {t('child.addChild')}
        </Link>
      </div>
    </>
  )
}
