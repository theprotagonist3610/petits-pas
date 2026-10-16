import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { repos, type Child } from '@/data'
import { useActiveChild, useChildren } from '@/data/hooks'
import { ChildAvatar } from './ChildAvatar'
import { useChildAge } from './ChildAge'
import { Icon } from './Icon'

function ActiveChildLabel({ child }: { child: Child }) {
  const { age } = useChildAge(child)
  return (
    <span className="min-w-0 text-left">
      <span className="block truncate font-extrabold leading-tight">{child.firstName}</span>
      <span className="block truncate text-xs text-ink-soft">{age}</span>
    </span>
  )
}

export function ChildSwitcher() {
  const { t } = useTranslation()
  const { child } = useActiveChild()
  const children = useChildren()
  const [open, setOpen] = useState(false)

  if (!child) return <span />

  async function select(id: string) {
    await repos.settings.update({ activeChildId: id })
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('child.switchChild')}
        className="-ml-1 flex min-h-11 min-w-0 items-center gap-2 rounded-full py-1 pr-3 pl-1 active:bg-ink/5"
      >
        <ChildAvatar child={child} size={36} />
        <ActiveChildLabel child={child} />
        <Icon name="chevronDown" size={18} className="shrink-0 text-ink-soft" />
      </button>

      {open &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={t('child.switchChild')}
            className="pb-safe mx-auto w-full max-w-md rounded-t-3xl bg-cream p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <div className="space-y-2">
              {children?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void select(c.id)}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-2xl p-2 text-left ${
                    c.id === child.id ? 'bg-sky-soft' : 'bg-surface active:bg-sky-soft'
                  }`}
                >
                  <ChildAvatar child={c} size={44} />
                  <ActiveChildLabel child={c} />
                  {c.id === child.id && <Icon name="check" className="ml-auto text-sky-brand" />}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                to="/enfants/nouveau"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-sky-brand font-bold text-white"
              >
                <Icon name="plus" size={18} /> {t('child.addChild')}
              </Link>
              <Link
                to="/enfants"
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface font-bold text-sky-brand"
              >
                <Icon name="users" size={18} /> {t('child.myChildren')}
              </Link>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}
