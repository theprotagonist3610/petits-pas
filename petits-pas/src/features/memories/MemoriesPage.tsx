import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child, Memory } from '@/data/types'
import { useActiveChild, useMemories } from '@/data/hooks'
import { Icon } from '@/components/Icon'
import { MemoryTile } from './MemoryTile'

function Collage({ child, memories }: { child: Child; memories: Memory[] }) {
  // Deux colonnes remplies en alternance : l'ordre chronologique se lit de gauche à droite, de haut en bas.
  const columns = [memories.filter((_, i) => i % 2 === 0), memories.filter((_, i) => i % 2 === 1)]
  return (
    <div className="grid grid-cols-2 gap-x-3">
      {columns.map((column, c) => (
        <div key={c} className={`flex flex-col gap-4 ${c === 1 ? 'pt-6' : ''}`}>
          {column.map((memory, i) => (
            <MemoryTile key={memory.id} child={child} memory={memory} index={i * 2 + c} />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyAlbum({ child }: { child: Child }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center rounded-3xl bg-surface px-6 py-10 text-center shadow-sm">
      <div className="relative mb-6 h-28 w-40" aria-hidden="true">
        <div className="absolute top-2 left-2 h-24 w-20 -rotate-6 rounded-lg bg-sun-soft p-1.5 shadow">
          <div className="h-full rounded bg-sun/20" />
        </div>
        <div className="absolute top-0 right-2 h-24 w-20 rotate-6 rounded-lg bg-sky-soft p-1.5 shadow">
          <div className="h-full rounded bg-sky-brand/20" />
        </div>
        <div className="absolute top-3 left-1/2 flex h-24 w-20 -translate-x-1/2 items-center justify-center rounded-lg bg-surface shadow-md">
          <Icon name="heart" size={32} className="text-sun" />
        </div>
      </div>
      <h2 className="mb-2 text-xl font-extrabold">{t('memories.emptyTitle')}</h2>
      <p className="mb-6 leading-relaxed text-ink-soft">{t('memories.emptyText', { name: child.firstName })}</p>
      <Link to="/souvenirs/nouveau" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sun font-bold text-white">
        <Icon name="plus" size={20} /> {t('memories.emptyCta')}
      </Link>
    </div>
  )
}

export function MemoriesPage() {
  const { t } = useTranslation()
  const { child, loading } = useActiveChild()
  const memories = useMemories(child?.id)

  if (loading) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />
  if (!memories) return null

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold">{t('memories.title')}</h1>
        {memories.length > 0 && <span className="text-sm font-bold text-ink-soft">{t('memories.count', { count: memories.length })}</span>}
      </div>

      {memories.length === 0 ? <EmptyAlbum child={child} /> : <Collage child={child} memories={memories} />}

      {memories.length > 0 && (
        <Link
          to="/souvenirs/nouveau"
          aria-label={t('memories.add')}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex size-14 items-center justify-center rounded-full bg-sun text-white shadow-lg active:scale-95"
        >
          <Icon name="plus" size={28} />
        </Link>
      )}
    </>
  )
}
