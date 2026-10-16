import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { repos, type Child, type Memory } from '@/data'
import { useChild, useMediaUrl, useMemories } from '@/data/hooks'
import { formatDate } from '@/lib/format'
import { memoryAgeLabel } from '@/lib/memories'
import { milestoneTitle } from '@/lib/milestones'
import { Icon } from '@/components/Icon'
import { useGoBack } from '@/components/useGoBack'

async function shareMemory(memory: Memory) {
  const text = [memory.title, memory.story].filter(Boolean).join('\n\n')
  const media = memory.mediaId ? await repos.media.get(memory.mediaId) : undefined
  const files = media ? [new File([media.blob], `souvenir.${media.mime === 'image/webp' ? 'webp' : 'jpg'}`, { type: media.mime })] : []
  try {
    if (files.length && navigator.canShare?.({ files })) await navigator.share({ files, title: memory.title, text })
    else await navigator.share({ title: memory.title, text })
  } catch {
    // Partage annulé par le parent : rien à faire.
  }
}

function MemoryView({ child, memory, siblings }: { child: Child; memory: Memory; siblings: Memory[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const close = useGoBack('/souvenirs')
  const photoUrl = useMediaUrl(memory.mediaId, 'blob')
  const index = siblings.findIndex((m) => m.id === memory.id)
  const newer = siblings[index - 1]
  const older = siblings[index + 1]
  const milestone = memory.milestoneId ? milestoneTitle(memory.milestoneId) : undefined
  const canShare = typeof navigator.share === 'function'

  const go = (target: Memory) => navigate(`/souvenirs/${target.id}`, { replace: true })

  return (
    <article className="-mt-2 pb-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={close} aria-label={t('memories.detail.close')} className="-ml-2 flex size-11 items-center justify-center rounded-full text-ink-soft active:bg-ink/5">
          <Icon name="back" />
        </button>
        <div className="flex gap-1">
          {canShare && (
            <button onClick={() => void shareMemory(memory)} aria-label={t('memories.detail.share')} className="flex size-11 items-center justify-center rounded-full text-ink-soft active:bg-ink/5">
              <Icon name="share" />
            </button>
          )}
          <Link to={`/souvenirs/${memory.id}/modifier`} aria-label={t('memories.detail.edit')} className="flex size-11 items-center justify-center rounded-full text-ink-soft active:bg-ink/5">
            <Icon name="edit" />
          </Link>
        </div>
      </div>

      {memory.mediaId && (
        <div className="-rotate-1 rounded-2xl bg-surface p-2 pb-3 shadow-lg">
          {photoUrl ? <img src={photoUrl} alt={memory.title} className="w-full rounded-xl" /> : <div className="aspect-[4/5] animate-pulse rounded-xl bg-cream" />}
        </div>
      )}

      <header className="mt-6">
        <p className="text-sm font-bold tracking-wide text-sun uppercase">{memoryAgeLabel(t, child, memory.date)}</p>
        <h1 className="mt-1 text-2xl leading-tight font-extrabold">{memory.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{formatDate(memory.date)}</p>
        {milestone && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-leaf-soft px-3 py-1 text-sm font-bold text-leaf">
            <Icon name="steps" size={16} /> {t('memories.milestone')} · {milestone}
          </p>
        )}
      </header>

      {memory.story && <p className="mt-5 text-lg leading-relaxed whitespace-pre-line">{memory.story}</p>}

      <nav className="mt-8 grid grid-cols-2 gap-3">
        <button
          onClick={() => newer && go(newer)}
          disabled={!newer}
          aria-label={t('memories.detail.previous')}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-surface font-bold text-sky-brand shadow-sm disabled:opacity-30"
        >
          <Icon name="back" />
        </button>
        <button
          onClick={() => older && go(older)}
          disabled={!older}
          aria-label={t('memories.detail.next')}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-surface font-bold text-sky-brand shadow-sm disabled:opacity-30"
        >
          <Icon name="chevronRight" />
        </button>
      </nav>
    </article>
  )
}

export function MemoryDetailPage() {
  const { id } = useParams()
  // `null` = chargé mais introuvable ; `undefined` = en cours de chargement.
  const memory = useLiveQuery(async () => (await repos.memories.get(id!)) ?? null, [id])
  const child = useChild(memory?.childId)
  const siblings = useMemories(memory?.childId)

  if (memory === null) return <Navigate to="/souvenirs" replace />
  if (!memory || !child || !siblings) return null
  return <MemoryView child={child} memory={memory} siblings={siblings} />
}
