import { Suspense } from 'react'
import { Link, NavLink, Navigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useChildren, useSettings } from '@/data/hooks'
import { ProfileCompletionPrompt } from '@/features/auth/ProfileCompletionPrompt'
import { ChildSwitcher } from './ChildSwitcher'
import { Icon, type IconName } from './Icon'

const tabs: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'news', label: 'nav.feed' },
  { to: '/enfant', icon: 'home', label: 'nav.child' },
  { to: '/etapes', icon: 'steps', label: 'nav.milestones' },
  { to: '/souvenirs', icon: 'heart', label: 'nav.memories' },
  { to: '/plus', icon: 'more', label: 'nav.more' },
]

export function AppShell() {
  const { t } = useTranslation()
  const settings = useSettings()
  const children = useChildren()

  if (!settings || !children) return null
  if (!settings.onboardedAt) return <Navigate to="/bienvenue" replace />

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="pt-safe sticky top-0 z-30 bg-cream/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link to="/" aria-label={t('app.name')} className="shrink-0">
            <img src="/logo.png" alt="" className="size-10" />
          </Link>
          <ChildSwitcher />
        </div>
      </header>

      <main className="flex-1 px-4 pt-2 pb-28">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors ${
                    isActive ? 'text-sky-brand' : 'text-ink-soft'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-8 w-14 items-center justify-center rounded-full ${isActive ? 'bg-sky-soft' : ''}`}>
                      <Icon name={tab.icon} size={22} />
                    </span>
                    {t(tab.label)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <ProfileCompletionPrompt />
    </div>
  )
}
