import type { Child } from '@/data/types'
import { useMediaUrl } from '@/data/hooks'

const tints = ['bg-sky-soft text-sky-brand', 'bg-leaf-soft text-leaf', 'bg-sun-soft text-sun', 'bg-honey-soft text-honey', 'bg-teal-soft text-teal-brand']

function tintFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return tints[h % tints.length]
}

export function ChildAvatar({ child, size = 40 }: { child: Child; size?: number }) {
  const url = useMediaUrl(child.avatarMediaId)
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (url) return <img src={url} alt="" style={style} className="shrink-0 rounded-full object-cover ring-2 ring-surface" />
  return (
    <span style={style} className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ring-2 ring-surface ${tintFor(child.id)}`}>
      {child.firstName.trim().charAt(0).toUpperCase()}
    </span>
  )
}
