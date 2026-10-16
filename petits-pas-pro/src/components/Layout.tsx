import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useProAuth } from '@/auth/ProAuthProvider'
import { useProData } from '@/auth/ProDataProvider'
import { specialtyName } from '@/lib/format'
import { Icon, type IconName } from './Icon'
import { Avatar } from './Avatar'
import { useWorkspace, type Workspace } from '@/auth/workspace'
import { BecomeProfessionalDialog } from '@/pages/AdminPage'
import { usePlatformSettings } from '@/auth/PlatformProvider'
import { usePendingPostsCount } from '@/lib/feedReview'

interface NavItem {
  to: string
  icon: IconName
  label: string
  badge?: number
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 font-bold whitespace-nowrap transition-colors ${
    isActive ? 'bg-sky-soft text-sky-brand' : 'text-ink-soft hover:bg-ink/5'
  }`

const WORKSPACES: { value: Workspace; icon: IconName; label: string }[] = [
  { value: 'pro', icon: 'user', label: 'Professionnel' },
  { value: 'admin', icon: 'shield', label: 'Administration' },
]

/** Bascule entre l'espace professionnel et l'administration (comptes qui ont les deux rôles). */
function WorkspaceSwitch({ value, onChange }: { value: Workspace; onChange: (next: Workspace) => void }) {
  return (
    <div role="radiogroup" aria-label="Espace" className="mx-2 mb-2 grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 lg:mx-3 lg:mb-4">
      {WORKSPACES.map((w) => (
        <button
          key={w.value}
          role="radio"
          aria-checked={value === w.value}
          onClick={() => value !== w.value && onChange(w.value)}
          className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-extrabold transition-colors ${
            value === w.value ? 'bg-surface text-sky-brand shadow-sm' : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Icon name={w.icon} size={16} />
          {w.label}
        </button>
      ))}
    </div>
  )
}

export function Layout() {
  const { professional, isAdmin, canPractice, signOut, user, refresh } = useProAuth()
  const { queue } = useProData()
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useWorkspace({ isAdmin, canPractice })
  const [becoming, setBecoming] = useState(false)
  const { platform } = usePlatformSettings()
  const pendingPosts = usePendingPostsCount(isAdmin)

  function switchTo(next: Workspace) {
    setWorkspace(next)
    navigate(next === 'pro' ? '/' : '/admin')
  }

  const practice: NavItem[] = [
    { to: '/', icon: 'news', label: 'Fil d’actualité', badge: pendingPosts },
    { to: '/tableau-de-bord', icon: 'home', label: 'Tableau de bord' },
    { to: '/demandes', icon: 'inbox', label: 'Demandes', badge: queue?.length },
    { to: '/agenda', icon: 'calendar', label: 'Agenda' },
    { to: '/messages', icon: 'chat', label: 'Messagerie' },
    { to: '/ma-comptabilite', icon: 'wallet', label: 'Ma comptabilité' },
    { to: '/profil', icon: 'user', label: 'Mon profil' },
  ]
  const administration: NavItem[] = [
    { to: '/admin', icon: 'shield', label: 'Administration' },
    { to: '/comptabilite', icon: 'wallet', label: 'Comptabilité' },
    { to: '/promotions', icon: 'tag', label: 'Promotions' },
    { to: '/', icon: 'news', label: 'Fil d’actualité', badge: pendingPosts },
  ]
  const items: NavItem[] = workspace === 'pro' ? practice : administration

  const name = professional ? `${professional.first_name} ${professional.last_name}` : user?.email

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3 lg:py-5">
          <img src="/logo.png" alt="" className="size-9" />
          <span className="font-extrabold">
            Petits Pas <span className="text-sky-brand">Pro</span>
          </span>
        </div>
        {isAdmin && canPractice && <WorkspaceSwitch value={workspace} onChange={switchTo} />}
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={navClass}
            >
              <Icon name={item.icon} size={20} />
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <span className="rounded-full bg-sun px-2 py-0.5 text-xs font-extrabold text-white">{item.badge}</span>}
            </NavLink>
          ))}
          {isAdmin && !professional && (
            <>
              {/* Ordinateur : carte d'invitation sous le menu. */}
              <button
                onClick={() => setBecoming(true)}
                className="group mt-3 hidden w-full items-center gap-3 rounded-2xl border border-sky-brand/20 bg-sky-soft p-3 text-left transition-colors hover:border-sky-brand/50 lg:flex"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-brand text-white shadow-sm">
                  <Icon name="user" size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-ink">Vous exercez aussi ?</span>
                  <span className="block text-xs leading-snug text-sky-brand">Activer mon espace professionnel</span>
                </span>
                <Icon name="chevronRight" size={18} className="shrink-0 text-sky-brand transition-transform group-hover:translate-x-0.5" />
              </button>
              {/* Mobile (menu horizontal) : bouton compact. */}
              <button
                onClick={() => setBecoming(true)}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-sky-soft px-3 text-sm font-bold whitespace-nowrap text-sky-brand lg:hidden"
              >
                <Icon name="plus" size={18} /> Espace professionnel
              </button>
            </>
          )}
          {/* Mobile : Paramètres en fin de menu horizontal. */}
          <NavLink to="/parametres" className={(state) => `${navClass(state)} lg:hidden`}>
            <Icon name="settings" size={20} /> Paramètres
          </NavLink>
        </nav>
        <div className="hidden border-t border-line p-3 lg:block">
          {/* Ordinateur : Paramètres tout en bas du menu, au-dessus du compte. */}
          <NavLink to="/parametres" className={(state) => `${navClass(state)} mb-3`}>
            <Icon name="settings" size={20} />
            <span className="flex-1">Paramètres</span>
          </NavLink>
          <div className="flex items-center gap-2 px-2">
            {professional && <Avatar path={professional.avatar_path} name={name ?? ''} size={36} />}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{name}</p>
              {professional && <p className="truncate text-xs text-ink-soft">{specialtyName(professional.specialty)}</p>}
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-2 flex min-h-10 w-full items-center gap-2 rounded-xl px-2 text-sm font-bold text-ink-soft hover:bg-ink/5"
          >
            <Icon name="logout" size={18} /> Se déconnecter
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 lg:p-8">
        {platform?.settings.maintenance && (
          <p role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-honey-soft p-3 text-sm font-bold">
            <Icon name="settings" size={18} /> Plateforme en veille : parents et professionnels ne peuvent plus créer de demandes ni de messages.
            <NavLink to="/parametres" className="text-sky-brand underline">
              Gérer
            </NavLink>
          </p>
        )}
        <Outlet />
      </main>
      {becoming && (
        <BecomeProfessionalDialog
          onClose={() => setBecoming(false)}
          onCreated={() => {
            setBecoming(false)
            setWorkspace('pro')
            // La fiche existe : l'accès passe à l'étape « photo de profil obligatoire ».
            void refresh()
          }}
        />
      )}
    </div>
  )
}

/** Titre de page avec action facultative à droite. */
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
