import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { Icon, type IconName } from '@/components/Icon'

const items: { to: string; icon: IconName; label: string; tint: string }[] = [
  { to: '/compte', icon: 'user', label: 'more.account', tint: 'bg-sky-soft text-sky-brand' },
  { to: '/enfants', icon: 'users', label: 'child.myChildren', tint: 'bg-sky-soft text-sky-brand' },
  { to: '/croissance', icon: 'chart', label: 'nav.growth', tint: 'bg-sky-soft text-sky-brand' },
  { to: '/vaccins', icon: 'syringe', label: 'more.vaccines', tint: 'bg-honey-soft text-honey' },
  { to: '/consultation', icon: 'chat', label: 'more.consultation', tint: 'bg-leaf-soft text-leaf' },
  { to: '/sauvegarde', icon: 'download', label: 'more.backup', tint: 'bg-sun-soft text-sun' },
  { to: '/reglages', icon: 'settings', label: 'more.settings', tint: 'bg-ink/5 text-ink-soft' },
]

export function MorePage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('more.title')} back={false} />
      <ul className="overflow-hidden rounded-3xl bg-surface shadow-sm">
        {items.map((item, i) => (
          <li key={item.to} className={i > 0 ? 'border-t border-line' : ''}>
            <Link to={item.to} className="flex min-h-16 items-center gap-3 px-4 active:bg-sky-soft">
              <span className={`flex size-10 items-center justify-center rounded-xl ${item.tint}`}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className="flex-1 font-bold">{t(item.label)}</span>
              <Icon name="chevronRight" size={20} className="text-ink-soft" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
