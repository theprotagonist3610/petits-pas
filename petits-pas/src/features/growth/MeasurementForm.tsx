import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Child, HeightMethod, Measurement, MeasurementInput } from '@/data/types'
import { chronologicalAge, toISODate } from '@/lib/age'
import { formatNumber, parseDecimal } from '@/lib/format'
import { STANDING_FROM_DAYS } from '@/lib/growth/indicators'
import { Button } from '@/components/Button'
import { Field, Segmented, inputClass } from '@/components/Field'

type ValueField = 'weightKg' | 'heightCm' | 'headCm' | 'muacCm'

/** Plages plausibles de 0 à 5 ans : au-delà, on suspecte une faute de frappe. */
const LIMITS: Record<ValueField, { min: number; max: number; unit: string }> = {
  weightKg: { min: 0.5, max: 40, unit: 'kg' },
  heightCm: { min: 35, max: 130, unit: 'cm' },
  headCm: { min: 25, max: 60, unit: 'cm' },
  muacCm: { min: 7, max: 30, unit: 'cm' },
}

const toText = (n: number | undefined) => (n === undefined ? '' : formatNumber(n))

interface Props {
  child: Child
  initial?: Measurement
  onSubmit: (input: MeasurementInput) => Promise<void>
  footer?: ReactNode
}

export function MeasurementForm({ child, initial, onSubmit, footer }: Props) {
  const { t } = useTranslation()
  const today = toISODate(new Date())
  const [date, setDate] = useState(initial?.date ?? today)
  const [values, setValues] = useState<Record<ValueField, string>>({
    weightKg: toText(initial?.weightKg),
    heightCm: toText(initial?.heightCm),
    headCm: toText(initial?.headCm),
    muacCm: toText(initial?.muacCm),
  })
  const [method, setMethod] = useState<HeightMethod | undefined>(initial?.heightMethod)
  const [errors, setErrors] = useState<Partial<Record<ValueField | 'date' | 'form', string>>>({})
  const [busy, setBusy] = useState(false)

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= child.birthDate && date <= today
  const defaultMethod: HeightMethod =
    validDate && chronologicalAge(child.birthDate, date).totalDays >= STANDING_FROM_DAYS ? 'standing' : 'lying'
  const heightMethod = method ?? defaultMethod

  function input(field: ValueField, label: string, hint?: string) {
    return (
      <Field label={label} hint={hint} error={errors[field]}>
        <input
          type="text"
          inputMode="decimal"
          className={inputClass}
          value={values[field]}
          onChange={(e) => setValues({ ...values, [field]: e.target.value })}
        />
      </Field>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const next: typeof errors = {}
    const parsed: Partial<Record<ValueField, number>> = {}
    for (const field of Object.keys(LIMITS) as ValueField[]) {
      const n = parseDecimal(values[field])
      if (n === undefined) continue
      const { min, max, unit } = LIMITS[field]
      if (!(n >= min && n <= max)) next[field] = t('growth.form.errors.range', { min: formatNumber(min), max: formatNumber(max), unit })
      else parsed[field] = n
    }
    if (!validDate) next.date = t('growth.form.errors.date')
    if (Object.keys(next).length === 0 && Object.keys(parsed).length === 0) next.form = t('growth.form.errors.empty')
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await onSubmit({
        childId: child.id,
        date,
        ...parsed,
        heightMethod: parsed.heightCm !== undefined ? heightMethod : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-ink-soft">{t('growth.form.intro')}</p>

      <Field label={t('growth.form.date')} error={errors.date}>
        <input type="date" className={inputClass} value={date} min={child.birthDate} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {input('weightKg', t('growth.form.weight'))}

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        {input('heightCm', t('growth.form.height'))}
        <div>
          <span className="mb-1.5 block text-sm font-bold text-ink-soft">{t('growth.form.heightMethod')}</span>
          <Segmented
            value={heightMethod}
            onChange={setMethod}
            options={[
              { value: 'lying', label: t('growth.form.lying') },
              { value: 'standing', label: t('growth.form.standing') },
            ]}
          />
          <span className="mt-1 block text-sm text-ink-soft">{t('growth.form.heightHint')}</span>
        </div>
      </div>

      {input('headCm', t('growth.form.head'))}
      {input('muacCm', t('growth.form.muac'), t('growth.form.muacHint'))}

      {errors.form && <p className="font-semibold text-red-600">{errors.form}</p>}
      <Button type="submit" disabled={busy}>
        {t('common.save')}
      </Button>
      {footer}
    </form>
  )
}
