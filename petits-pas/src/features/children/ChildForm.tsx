import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Child, ChildInput, Sex } from '@/data/types'
import { useMediaUrl } from '@/data/hooks'
import { PRETERM_THRESHOLD_WEEKS, toISODate } from '@/lib/age'
import { compressPhoto } from '@/lib/image'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Field, Segmented, inputClass } from '@/components/Field'
import type { PhotoDraft } from './saveChild'

const FULL_TERM = 40
const MIN_WEEKS = 22

interface Props {
  initial?: Child
  submitLabel: string
  onSubmit: (input: ChildInput, photo: PhotoDraft | undefined) => Promise<void>
  footer?: ReactNode
}

export function ChildForm({ initial, submitLabel, onSubmit, footer }: Props) {
  const { t } = useTranslation()
  const fileId = useId()
  const today = toISODate(new Date())

  const [firstName, setFirstName] = useState(initial?.firstName ?? '')
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '')
  const [sex, setSex] = useState<Sex | undefined>(initial?.sex)
  const [premature, setPremature] = useState((initial?.gestationWeeks ?? FULL_TERM) < PRETERM_THRESHOLD_WEEKS)
  const [weeks, setWeeks] = useState(
    String(initial && initial.gestationWeeks < PRETERM_THRESHOLD_WEEKS ? initial.gestationWeeks : 34),
  )
  const [photo, setPhoto] = useState<PhotoDraft>()
  const [photoUrl, setPhotoUrl] = useState<string>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const existingPhotoUrl = useMediaUrl(initial?.avatarMediaId)

  useEffect(() => {
    if (!photo) return setPhotoUrl(undefined)
    const url = URL.createObjectURL(photo.thumb)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function pickPhoto(file: File | undefined) {
    if (file) setPhoto(await compressPhoto(file))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.firstName = t('child.errors.firstName')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) e.birthDate = t('child.errors.birthDate')
    else if (birthDate > today) e.birthDate = t('child.errors.birthFuture')
    if (!sex) e.sex = t('child.sexHint')
    const w = Number(weeks)
    if (premature && !(Number.isInteger(w) && w >= MIN_WEEKS && w < PRETERM_THRESHOLD_WEEKS)) {
      e.weeks = t('child.errors.gestation')
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!validate() || busy) return
    setBusy(true)
    try {
      await onSubmit(
        {
          firstName: firstName.trim(),
          birthDate,
          sex: sex!,
          gestationWeeks: premature ? Number(weeks) : FULL_TERM,
          avatarMediaId: initial?.avatarMediaId,
        },
        photo,
      )
    } finally {
      setBusy(false)
    }
  }

  const shownPhoto = photoUrl ?? existingPhotoUrl

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="flex flex-col items-center">
        <label
          htmlFor={fileId}
          className="relative flex size-28 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-sky-soft text-sky-brand shadow-sm ring-4 ring-surface"
        >
          {shownPhoto ? <img src={shownPhoto} alt="" className="size-full object-cover" /> : <Icon name="camera" size={36} />}
        </label>
        <label htmlFor={fileId} className="mt-2 cursor-pointer text-sm font-bold text-sky-brand">
          {shownPhoto ? t('child.changePhoto') : t('child.addPhoto')}{' '}
          <span className="font-normal text-ink-soft">({t('common.optional')})</span>
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
      </div>

      <Field label={t('child.firstName')} error={errors.firstName}>
        <input
          className={inputClass}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
        />
      </Field>

      <Field label={t('child.birthDate')} error={errors.birthDate}>
        <input type="date" className={inputClass} value={birthDate} max={today} onChange={(e) => setBirthDate(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-bold text-ink-soft">{t('child.sex')}</legend>
        <Segmented
          value={sex}
          onChange={setSex}
          options={[
            { value: 'female', label: t('child.female') },
            { value: 'male', label: t('child.male') },
          ]}
        />
        <span className={`mt-1 block text-sm ${errors.sex ? 'font-semibold text-red-600' : 'text-ink-soft'}`}>
          {t('child.sexHint')}
        </span>
      </fieldset>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={premature}
            onChange={(e) => setPremature(e.target.checked)}
            className="size-5 accent-sky-brand"
          />
          <span className="font-semibold">{t('child.premature')}</span>
        </label>
        {premature && (
          <div className="mt-3">
            <Field label={t('child.gestationWeeks')} hint={t('child.gestationHint')} error={errors.weeks}>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_WEEKS}
                max={PRETERM_THRESHOLD_WEEKS - 1}
                className={inputClass}
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
      {footer}
    </form>
  )
}
