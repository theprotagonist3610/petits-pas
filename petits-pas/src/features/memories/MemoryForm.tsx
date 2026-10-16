import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Child, Memory, MemoryInput } from '@/data/types'
import { useMediaUrl } from '@/data/hooks'
import { toISODate } from '@/lib/age'
import { compressPhoto } from '@/lib/image'
import { countWords, earliestMemoryDate, MAX_STORY_WORDS } from '@/lib/memories'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { Icon } from '@/components/Icon'
import type { PhotoChange } from './saveMemory'

/** Vignettes du collage : assez grandes pour une demi-largeur d'écran en haute densité. */
const COLLAGE_THUMB = 480

interface Props {
  child: Child
  initial?: Memory
  /** Valeurs proposées pour un nouveau souvenir (ex. depuis une étape franchie). */
  defaults?: Partial<Pick<Memory, 'title' | 'date' | 'milestoneId'>>
  onSubmit: (input: Omit<MemoryInput, 'mediaId'>, photo: PhotoChange) => Promise<void>
  footer?: ReactNode
}

export function MemoryForm({ child, initial, defaults, onSubmit, footer }: Props) {
  const { t } = useTranslation()
  const fileId = useId()
  const today = toISODate(new Date())
  const minDate = earliestMemoryDate(child)

  const [title, setTitle] = useState(initial?.title ?? defaults?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? defaults?.date ?? today)
  const [story, setStory] = useState(initial?.story ?? '')
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' })
  const [newPhotoUrl, setNewPhotoUrl] = useState<string>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const existingUrl = useMediaUrl(initial?.mediaId, 'blob')

  useEffect(() => {
    if (photo.kind !== 'new') return setNewPhotoUrl(undefined)
    const url = URL.createObjectURL(photo.thumb)
    setNewPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const shownPhoto = photo.kind === 'new' ? newPhotoUrl : photo.kind === 'keep' ? existingUrl : undefined
  const hasPhoto = photo.kind === 'new' || (photo.kind === 'keep' && !!initial?.mediaId)
  const words = countWords(story)
  const tooLong = words > MAX_STORY_WORDS

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    const { blob, thumb } = await compressPhoto(file, COLLAGE_THUMB)
    setPhoto({ kind: 'new', blob, thumb })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = t('memories.form.errors.title')
    if (!(date >= minDate && date <= today)) e.date = t('memories.form.errors.date')
    if (!hasPhoto && !story.trim()) e.content = t('memories.form.errors.content')
    if (tooLong) e.story = t('memories.form.tooLong', { max: MAX_STORY_WORDS })
    setErrors(e)
    if (Object.keys(e).length) return

    setBusy(true)
    try {
      await onSubmit(
        { childId: child.id, title: title.trim(), date, story: story.trim(), milestoneId: initial?.milestoneId ?? defaults?.milestoneId },
        photo,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label
          htmlFor={fileId}
          className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl border-2 border-dashed border-sun/40 bg-sun-soft font-bold text-sun"
        >
          {shownPhoto ? (
            <img src={shownPhoto} alt="" className="size-full object-cover" />
          ) : (
            <>
              <Icon name="camera" size={40} />
              {t('memories.form.photo')}
            </>
          )}
        </label>
        <input id={fileId} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        {hasPhoto && (
          <div className="mt-2 flex justify-between text-sm font-bold">
            <label htmlFor={fileId} className="cursor-pointer text-sky-brand">
              {t('memories.form.changePhoto')}
            </label>
            <button type="button" onClick={() => setPhoto({ kind: 'remove' })} className="text-ink-soft">
              {t('memories.form.removePhoto')}
            </button>
          </div>
        )}
      </div>

      <Field label={t('memories.form.title')} error={errors.title}>
        <input
          className={inputClass}
          value={title}
          maxLength={80}
          placeholder={t('memories.form.titlePlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field label={t('memories.form.date')} error={errors.date}>
        <input type="date" className={inputClass} value={date} min={minDate} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <label className="block">
        <span className="mb-1.5 flex items-baseline justify-between text-sm font-bold text-ink-soft">
          {t('memories.form.story')}
          <span className={tooLong ? 'text-red-600' : ''}>{t('memories.form.words', { count: words, max: MAX_STORY_WORDS })}</span>
        </span>
        <textarea
          rows={7}
          value={story}
          placeholder={t('memories.form.storyPlaceholder')}
          onChange={(e) => setStory(e.target.value)}
          className={`${inputClass} py-3 leading-relaxed ${tooLong ? 'border-red-400' : ''}`}
        />
        {errors.story && <span className="mt-1 block text-sm font-semibold text-red-600">{errors.story}</span>}
      </label>

      {errors.content && <p className="font-semibold text-red-600">{errors.content}</p>}
      <Button type="submit" disabled={busy || tooLong} className="bg-sun! disabled:bg-sun/50!">
        {t('common.save')}
      </Button>
      {footer}
    </form>
  )
}
