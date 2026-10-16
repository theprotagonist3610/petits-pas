import { useTranslation } from 'react-i18next'
import type { LmsSeries } from '@/lib/growth/lms'
import { lmsAt, PERCENTILE_LINES, valueAtZ } from '@/lib/growth/lms'
import type { GrowthPoint } from '@/lib/growth/assess'
import { formatNumber } from '@/lib/format'

const W = 360
const H = 300
const PAD = { left: 38, right: 28, top: 12, bottom: 34 }
const DAYS_PER_MONTH = 30.4375

interface Props {
  series: LmsSeries
  points: GrowthPoint[]
  /** Fenêtre affichée, en jours. */
  fromDays: number
  toDays: number
  selectedId?: string
  onSelect: (id: string) => void
  label: string
}

function niceStep(span: number, targetTicks: number) {
  const raw = span / targetTicks
  const mag = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw)!
}

export function GrowthChart({ series, points, fromDays, toDays, selectedId, onSelect, label }: Props) {
  const { t } = useTranslation()
  const start = Math.max(fromDays, series.start)
  const end = Math.min(toDays, series.start + series.m.length - 1)

  // Échantillonnage des courbes de référence (≈ 90 points suffisent pour une courbe lisse).
  const step = Math.max(1, Math.round((end - start) / 90))
  const days: number[] = []
  for (let d = start; d < end; d += step) days.push(d)
  days.push(end)
  const lines = PERCENTILE_LINES.map(({ p, z }) => ({ p, values: days.map((d) => valueAtZ(lmsAt(series, d)!, z)) }))

  const visible = points.filter((pt) => pt.ageDays >= fromDays && pt.ageDays <= toDays)
  const allValues = [...lines[0].values, ...lines[4].values, ...visible.map((pt) => pt.value)]
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const yStep = niceStep(rawMax - rawMin, 6)
  const yMin = Math.floor(rawMin / yStep) * yStep
  const yMax = Math.ceil(rawMax / yStep) * yStep

  const x = (d: number) => PAD.left + ((d - fromDays) / (toDays - fromDays)) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom)
  const path = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(days[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const band = (low: number[], high: number[]) =>
    `${path(high)}L${[...low].reverse().map((v, i) => `${x(days[days.length - 1 - i]).toFixed(1)},${y(v).toFixed(1)}`).join('L')}Z`

  const yTicks: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) yTicks.push(Math.round(v * 100) / 100)

  // Axe des âges : en mois jusqu'à 2 ans, en années au-delà.
  const spanMonths = (toDays - fromDays) / DAYS_PER_MONTH
  const inYears = spanMonths > 25
  const tickMonths = inYears ? 12 : ([1, 2, 3, 6].find((n) => spanMonths / n <= 8) ?? 6)
  const xTicks: number[] = []
  for (let mo = Math.ceil(fromDays / DAYS_PER_MONTH / tickMonths) * tickMonths; mo * DAYS_PER_MONTH <= toDays + 1; mo += tickMonths) xTicks.push(mo)

  const [p3, p15, p50, p85, p97] = lines

  // Étiquettes des percentiles en bout de courbe ; 15 et 85 sont masquées si elles chevauchent leurs voisines.
  const labels = lines
    .map((line) => ({ p: line.p, y: y(line.values.at(-1)!) }))
    .filter((label, _i, all) => (label.p !== 15 && label.p !== 85) || Math.abs(label.y - all[label.p === 15 ? 0 : 4].y) >= 10)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label={label}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-[10px]">
            {formatNumber(v)}
          </text>
        </g>
      ))}
      {xTicks.map((mo) => (
        <text key={mo} x={x(mo * DAYS_PER_MONTH)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-ink-soft text-[10px]">
          {inYears ? mo / 12 : mo}
        </text>
      ))}
      <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} textAnchor="middle" className="fill-ink-soft text-[10px] font-bold">
        {inYears ? t('growth.axisYears') : t('growth.axisMonths')}
      </text>

      <path d={band(p3.values, p15.values)} className="fill-honey-soft" />
      <path d={band(p15.values, p85.values)} className="fill-leaf-soft" />
      <path d={band(p85.values, p97.values)} className="fill-honey-soft" />
      <path d={path(p3.values)} fill="none" className="stroke-honey" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={path(p97.values)} fill="none" className="stroke-honey" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={path(p50.values)} fill="none" className="stroke-leaf" strokeWidth={2} />
      {labels.map((label) => (
        <text key={label.p} x={W - PAD.right + 4} y={label.y} dy="0.32em" className="fill-ink-soft text-[9px] font-bold">
          {label.p}
        </text>
      ))}

      {visible.length > 1 && (
        <path
          d={visible.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.ageDays).toFixed(1)},${y(pt.value).toFixed(1)}`).join('')}
          fill="none"
          className="stroke-sun"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}
      {visible.map((pt) => {
        const selected = pt.measurement.id === selectedId
        return (
          <g key={pt.measurement.id} onClick={() => onSelect(pt.measurement.id)} className="cursor-pointer">
            <circle cx={x(pt.ageDays)} cy={y(pt.value)} r={16} fill="transparent" />
            <circle cx={x(pt.ageDays)} cy={y(pt.value)} r={selected ? 7 : 5} className="fill-sun stroke-surface" strokeWidth={selected ? 3 : 2} />
          </g>
        )
      })}
    </svg>
  )
}
