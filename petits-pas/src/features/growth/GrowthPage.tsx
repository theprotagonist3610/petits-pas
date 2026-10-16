import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Child, Measurement } from '@/data/types'
import { useActiveChild, useMeasurements } from '@/data/hooks'
import { chronologicalAge, correctedAge, toISODate } from '@/lib/age'
import { formatAge } from '@/lib/formatAge'
import { formatDate, formatNumber } from '@/lib/format'
import { growthAgeDays, INDICATORS, MAX_DAYS, type Indicator, type IndicatorId } from '@/lib/growth/indicators'
import { assess, growthPoints, type AssessmentKind, type GrowthPoint } from '@/lib/growth/assess'
import { PageHeader } from '@/components/PageHeader'
import { Icon } from '@/components/Icon'
import { GrowthChart } from './GrowthChart'
import { useGrowthTable } from './useGrowthTable'

const RANGES = [
  { key: 'r6', days: 183 },
  { key: 'r12', days: 365 },
  { key: 'r24', days: 730 },
  { key: 'r60', days: MAX_DAYS },
] as const

const ASSESSMENT_STYLE: Record<AssessmentKind, { tone: string; alert: boolean }> = {
  ok: { tone: 'bg-leaf-soft text-leaf', alert: false },
  low: { tone: 'bg-honey-soft text-ink', alert: true },
  high: { tone: 'bg-honey-soft text-ink', alert: true },
  drop: { tone: 'bg-honey-soft text-ink', alert: true },
  muacModerate: { tone: 'bg-sun-soft text-ink', alert: true },
  muacSevere: { tone: 'border border-red-200 bg-red-50 text-red-800', alert: true },
}

function formatValue(indicator: Indicator, value: number) {
  return `${formatNumber(value)} ${indicator.unit}`
}

function PointDetail({ child, indicator, point }: { child: Child; indicator: Indicator; point: GrowthPoint }) {
  const { t } = useTranslation()
  const age = formatAge(t, chronologicalAge(child.birthDate, point.measurement.date))
  const p = point.percentile
  return (
    <div className="rounded-2xl bg-cream p-3">
      <p className="text-sm text-ink-soft">
        {formatDate(point.measurement.date)} · {t('growth.atAge', { age })}
      </p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold">{formatValue(indicator, point.value)}</span>
        <span className="font-bold text-sky-brand">{t('growth.percentile', { p: formatNumber(p) })}</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">{t('growth.percentileHelp', { p: Math.min(99, Math.max(1, Math.round(p))) })}</p>
    </div>
  )
}

function Assessment({ kind }: { kind: AssessmentKind }) {
  const { t } = useTranslation()
  const style = ASSESSMENT_STYLE[kind]
  return (
    <div className={`rounded-2xl p-4 ${style.tone}`}>
      <p className="flex gap-2 font-semibold">
        <Icon name={style.alert ? 'chat' : 'check'} className="mt-0.5 shrink-0" size={20} />
        <span className="text-ink">{t(`growth.assessment.${kind}`)}</span>
      </p>
      {style.alert && (
        <Link to="/consultation" className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-surface font-bold text-sky-brand">
          {t('growth.talk')}
        </Link>
      )}
    </div>
  )
}

function MeasurementRow({ m }: { m: Measurement }) {
  const { t } = useTranslation()
  const parts = [
    m.weightKg !== undefined && `${formatNumber(m.weightKg)} kg`,
    m.heightCm !== undefined && `${formatNumber(m.heightCm)} cm`,
    m.headCm !== undefined && `${t('growth.indicators.head')} ${formatNumber(m.headCm)} cm`,
    m.muacCm !== undefined && `${t('growth.indicators.muac')} ${formatNumber(m.muacCm)} cm`,
  ].filter(Boolean)
  return (
    <Link to={`/croissance/${m.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-sky-soft">
      <span className="flex-1">
        <span className="block font-bold">{formatDate(m.date)}</span>
        <span className="block text-sm text-ink-soft">{parts.join(' · ')}</span>
      </span>
      <Icon name="chevronRight" size={20} className="text-ink-soft" />
    </Link>
  )
}

function GrowthView({ child, measurements }: { child: Child; measurements: Measurement[] }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const indicator = INDICATORS.find((i) => i.id === params.get('courbe')) ?? INDICATORS[0]
  const table = useGrowthTable(indicator)

  const todayDays = growthAgeDays(child, toISODate(new Date()))
  const defaultRange = RANGES.find((r) => r.days >= todayDays + 15) ?? RANGES[RANGES.length - 1]
  const [rangeDays, setRangeDays] = useState<number>(defaultRange.days)
  const [selectedId, setSelectedId] = useState<string>()

  const points = useMemo(
    () => (table ? growthPoints(indicator, table, child, measurements) : []),
    [indicator, table, child, measurements],
  )
  const kind = assess(indicator, child, points)
  const selected = points.find((p) => p.measurement.id === selectedId) ?? points.at(-1)
  const usesCorrectedAge = correctedAge(child.birthDate, child.gestationWeeks) !== null

  function selectIndicator(id: IndicatorId) {
    setParams({ courbe: id }, { replace: true })
    setSelectedId(undefined)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-surface p-1 shadow-sm" role="tablist">
        {INDICATORS.map((ind) => (
          <button
            key={ind.id}
            role="tab"
            aria-selected={ind.id === indicator.id}
            onClick={() => selectIndicator(ind.id)}
            className={`min-h-11 rounded-xl text-sm font-bold transition-colors ${
              ind.id === indicator.id ? 'bg-sky-brand text-white' : 'text-ink-soft'
            }`}
          >
            {t(`growth.indicators.${ind.id}`)}
          </button>
        ))}
      </div>

      <section className="rounded-3xl bg-surface p-4 shadow-sm">
        <h2 className="font-extrabold">{t(`growth.indicatorTitles.${indicator.id}`)}</h2>
        <div className="my-3 flex gap-2 overflow-x-auto">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeDays(r.days)}
              aria-pressed={rangeDays === r.days}
              className={`min-h-9 shrink-0 rounded-full px-3 text-sm font-bold ${
                rangeDays === r.days ? 'bg-sky-soft text-sky-brand' : 'text-ink-soft'
              }`}
            >
              {t(`growth.range.${r.key}`)}
            </button>
          ))}
        </div>

        {table ? (
          <GrowthChart
            series={table[child.sex]}
            points={points}
            fromDays={0}
            toDays={rangeDays}
            selectedId={selected?.measurement.id}
            onSelect={setSelectedId}
            label={t(`growth.indicatorTitles.${indicator.id}`)}
          />
        ) : (
          <div className="aspect-[6/5] animate-pulse rounded-2xl bg-cream" />
        )}

        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-sun" /> {child.firstName}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-leaf" /> {t('growth.legendMedian')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-leaf-soft" /> {t('growth.legendBand')}
          </li>
        </ul>

        <div className="mt-4 space-y-3">
          {selected && <PointDetail child={child} indicator={indicator} point={selected} />}
          {!selected && measurements.length > 0 && (
            <p className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
              {indicator.id === 'muac' ? t('growth.muacFrom3m') : t('growth.emptyIndicator')}
            </p>
          )}
          {kind && <Assessment kind={kind} />}
        </div>
        {todayDays > MAX_DAYS && <p className="mt-3 text-sm text-ink-soft">{t('growth.tooOld')}</p>}
        {usesCorrectedAge && <p className="mt-3 text-sm text-ink-soft">{t('growth.correctedNote')}</p>}
      </section>

      <Link
        to="/croissance/nouvelle"
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-sky-brand font-bold text-white shadow-sm"
      >
        <Icon name="plus" size={20} /> {measurements.length ? t('growth.add') : t('growth.addFirst')}
      </Link>

      {measurements.length === 0 ? (
        <p className="px-2 text-center text-ink-soft">{t('growth.empty')}</p>
      ) : (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">{t('growth.history')}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-sm">
            {[...measurements].reverse().map((m) => (
              <li key={m.id}>
                <MeasurementRow m={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-ink-soft">{t('growth.source')}</p>
    </div>
  )
}

export function GrowthPage() {
  const { t } = useTranslation()
  const { child, loading } = useActiveChild()
  const measurements = useMeasurements(child?.id)

  if (loading) return null
  if (!child) return <Navigate to="/enfants/nouveau" replace />

  return (
    <>
      <PageHeader title={t('growth.title')} back={false} />
      {measurements && <GrowthView key={child.id} child={child} measurements={measurements} />}
    </>
  )
}
