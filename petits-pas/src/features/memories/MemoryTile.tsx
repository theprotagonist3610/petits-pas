import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child, Memory } from '@/data/types'
import { useMediaUrl } from '@/data/hooks'
import { memoryAgeLabel } from '@/lib/memories'
import { Icon } from '@/components/Icon'

/** Légère inclinaison des « polaroïds » pour l'effet collage. */
const TILTS = ['-rotate-[1.5deg]', 'rotate-[1deg]', '-rotate-[0.5deg]', 'rotate-[1.5deg]', 'rotate-[0.5deg]', '-rotate-[1deg]']
const TEXT_TINTS = ['bg-sun-soft', 'bg-sky-soft', 'bg-leaf-soft', 'bg-honey-soft', 'bg-teal-soft']

export function MemoryTile({ child, memory, index }: { child: Child; memory: Memory; index: number }) {
  const { t } = useTranslation()
  const url = useMediaUrl(memory.mediaId)
  const age = memoryAgeLabel(t, child, memory.date)

  return (
    <Link
      to={`/souvenirs/${memory.id}`}
      className={`relative block rounded-xl bg-surface p-1.5 pb-2.5 shadow-md transition-transform active:scale-[0.97] ${TILTS[index % TILTS.length]}`}
    >
      {memory.mediaId ? (
        url ? (
          <img src={url} alt="" className="w-full rounded-lg" />
        ) : (
          <div className="aspect-[4/5] w-full animate-pulse rounded-lg bg-cream" />
        )
      ) : (
        <div className={`rounded-lg p-3 ${TEXT_TINTS[index % TEXT_TINTS.length]}`}>
          <span className="block font-serif text-4xl leading-none text-ink/25" aria-hidden="true">
            “
          </span>
          <p className="line-clamp-6 text-sm leading-snug text-ink">{memory.story}</p>
        </div>
      )}
      <p className="mt-2 line-clamp-2 px-1 leading-tight font-extrabold">{memory.title}</p>
      <p className="px-1 text-xs font-semibold text-ink-soft">{age}</p>
      {memory.milestoneId && (
        <span className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-leaf text-white shadow" title={t('memories.milestone')}>
          <Icon name="steps" size={14} />
        </span>
      )}
    </Link>
  )
}
