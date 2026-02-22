"use client"

import { useState, useMemo } from "react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

// ── Types ────────────────────────────────────────────────────────────────────

export type TrendPoint = {
  t: string
  reach?: number
  impressions?: number
  interactions?: number
  engaged?: number
  followerDelta?: number
  ts?: number
}

export type TrendPointV2 = {
  date: string
  ts: number
  t: string
  reach: number
  impressions: number
  interactions: number
  engaged: number
  reach_ma7?: number
}

export type FollowerRow = {
  day: string
  followers_count: number
}

type MetricKey = "reach" | "impressions" | "interactions" | "engaged" | "followers" | "engagementRate"

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGE_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "7D", days: 7 },
  { label: "15D", days: 15 },
  { label: "30D", days: 30 },
  { label: "60D", days: 60 },
  { label: "90D", days: 90 },
  { label: "365D", days: 365 },
]

const METRIC_CONFIG: Array<{
  key: MetricKey
  labelZh: string
  labelEn: string
  color: string
}> = [
  { key: "reach",          labelZh: "觸及",       labelEn: "Reach",            color: "#38bdf8" },
  { key: "impressions",    labelZh: "曝光",       labelEn: "Impressions",      color: "#34d399" },
  { key: "interactions",   labelZh: "互動",       labelEn: "Interactions",     color: "#fb923c" },
  { key: "engagementRate", labelZh: "互動率",     labelEn: "Engagement Rate",  color: "#facc15" },
  { key: "followers",      labelZh: "粉絲數",     labelEn: "Followers",        color: "#a78bfa" },
]

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function formatFollowers(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString()
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

// ── MA7 helper ────────────────────────────────────────────────────────────────

function computeMa7(values: number[]): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - 6)
    const slice = values.slice(start, i + 1).filter(Number.isFinite)
    if (slice.length === 0) return 0
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  // New preferred props
  trendPointsV2?: TrendPointV2[]
  points?: Array<{ date: string; reach: number; impressions: number; interactions: number; engaged_accounts: number }>
  followersRows?: FollowerRow[]
  rangeDays?: number
  onChangeRangeDays?: (days: number) => void
  // Legacy compat props (still accepted)
  trendPoints?: TrendPoint[]
  followersDailyRows?: FollowerRow[]
  locale?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrendChartModule({
  trendPointsV2,
  points,
  followersRows,
  rangeDays,
  onChangeRangeDays,
  trendPoints,
  followersDailyRows,
  locale,
}: Props) {
  const isZh = !locale || locale.startsWith("zh")

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("reach")
  const [smoothing, setSmoothing] = useState(true)

  // Resolve effective data sources
  const effectiveFollowers: FollowerRow[] = followersRows ?? followersDailyRows ?? []
  const effectiveRangeDays: number = rangeDays ?? 90

  // Build the primary series from trendPointsV2 (preferred) or points fallback
  const v2Points: TrendPointV2[] = useMemo(() => {
    if (Array.isArray(trendPointsV2) && trendPointsV2.length > 0) return trendPointsV2
    if (Array.isArray(points) && points.length > 0) {
      return points
        .filter((p) => p?.date)
        .map((p) => {
          const ts = Date.parse(`${p.date}T00:00:00.000Z`)
          const d = new Date(ts)
          const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
          const dd = String(d.getUTCDate()).padStart(2, "0")
          return {
            date: p.date,
            ts,
            t: `${mm}/${dd}`,
            reach: p.reach ?? 0,
            impressions: p.impressions ?? 0,
            interactions: p.interactions ?? 0,
            engaged: p.engaged_accounts ?? 0,
            reach_ma7: undefined,
          }
        })
        .filter((p) => Number.isFinite(p.ts))
    }
    // Legacy trendPoints fallback
    if (Array.isArray(trendPoints) && trendPoints.length > 0) {
      return trendPoints
        .filter((p) => p?.t)
        .map((p) => ({
          date: p.t,
          ts: p.ts ?? 0,
          t: p.t,
          reach: p.reach ?? 0,
          impressions: p.impressions ?? 0,
          interactions: p.interactions ?? 0,
          engaged: p.engaged ?? 0,
          reach_ma7: undefined,
        }))
    }
    return []
  }, [trendPointsV2, points, trendPoints])

  // Slice to selected range (already fetched at correct days, but slice for local range buttons)
  const slicedV2 = useMemo(() => {
    const sorted = [...v2Points].sort((a, b) => a.ts - b.ts)
    return sorted.slice(-effectiveRangeDays)
  }, [v2Points, effectiveRangeDays])

  // Build chart data per metric
  const chartData = useMemo(() => {
    if (selectedMetric === "followers") {
      const sorted = [...effectiveFollowers].sort((a, b) => a.day.localeCompare(b.day))
      return sorted.slice(-effectiveRangeDays).map((r) => ({
        t: r.day.slice(5),
        value: r.followers_count,
      }))
    }

    if (selectedMetric === "engagementRate") {
      return slicedV2.map((p) => {
        const rate = p.impressions > 0 ? (p.interactions / p.impressions) * 100 : 0
        return { t: p.t, value: Math.round(rate * 10) / 10 }
      })
    }

    if (selectedMetric === "reach") {
      const useSmooth = smoothing
      if (useSmooth) {
        // Prefer server-computed reach_ma7; fall back to client MA7
        const hasServerMa7 = slicedV2.some((p) => typeof p.reach_ma7 === "number" && p.reach_ma7 > 0)
        if (hasServerMa7) {
          return slicedV2.map((p) => ({ t: p.t, value: p.reach_ma7 ?? p.reach }))
        }
        const rawValues = slicedV2.map((p) => p.reach)
        const ma7 = computeMa7(rawValues)
        return slicedV2.map((p, i) => ({ t: p.t, value: ma7[i] }))
      }
      return slicedV2.map((p) => ({ t: p.t, value: p.reach }))
    }

    return slicedV2.map((p) => {
      const value =
        selectedMetric === "impressions" ? p.impressions :
        selectedMetric === "interactions" ? p.interactions :
        selectedMetric === "engaged" ? p.engaged : 0
      return { t: p.t, value }
    })
  }, [selectedMetric, smoothing, slicedV2, effectiveFollowers, effectiveRangeDays])

  // KPI: sum interactions + avg engagement rate over sliced range
  const kpiTotalInteractions = useMemo(
    () => slicedV2.reduce((s, p) => s + (p.interactions ?? 0), 0),
    [slicedV2]
  )
  const kpiTotalImpressions = useMemo(
    () => slicedV2.reduce((s, p) => s + (p.impressions ?? 0), 0),
    [slicedV2]
  )
  const kpiEngagementRate: number | null = kpiTotalImpressions > 0
    ? (kpiTotalInteractions / kpiTotalImpressions) * 100
    : null

  const metricConfig = METRIC_CONFIG.find((m) => m.key === selectedMetric) ?? METRIC_CONFIG[0]
  const hasData = chartData.some((d) => typeof d.value === "number" && d.value > 0)
  const allEmpty = v2Points.length === 0 && effectiveFollowers.length === 0
  const emptyLabel = isZh ? "暫無資料" : "No data"

  const yTickFormatter = selectedMetric === "engagementRate"
    ? (v: number) => `${v.toFixed(1)}%`
    : selectedMetric === "followers"
    ? formatCompact
    : formatCompact

  const tooltipFormatter = (val: unknown): [string, string] => {
    const label = isZh ? metricConfig.labelZh : metricConfig.labelEn
    if (typeof val !== "number" || !Number.isFinite(val)) return ["—", label]
    if (selectedMetric === "engagementRate") return [formatPct(val), label]
    if (selectedMetric === "followers") return [formatFollowers(val), label]
    return [formatCompact(val), label]
  }

  const handleRangeClick = (days: number) => {
    if (onChangeRangeDays) onChangeRangeDays(days)
  }

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 sm:p-4">
        {allEmpty ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-white/35">
            {isZh ? "暫無資料 / No data available" : "No data available"}
          </div>
        ) : (
          <>
            {/* Tabs row: left=tabs, center=KPI pills, right=MA7 checkbox */}
            {/* PC: flex-row; mobile: flex-col */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pb-1">

              {/* Left: metric tabs — scrollable on mobile */}
              <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scrollbar-none">
                {METRIC_CONFIG.map((m) => {
                  const active = selectedMetric === m.key
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setSelectedMetric(m.key)}
                      className={
                        "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap " +
                        (active
                          ? "bg-white/15 text-white border border-white/20"
                          : "text-white/55 hover:text-white/80 border border-transparent")
                      }
                      style={active ? { borderColor: m.color + "55", color: m.color } : undefined}
                    >
                      {isZh ? m.labelZh : m.labelEn}
                    </button>
                  )
                })}
              </div>

              {/* Center: KPI pills */}
              <div className="flex-none flex items-center justify-center gap-2">
                {/* KPI 1: 區間總互動 */}
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                  <div className="text-[11px] text-white/60 leading-none mb-0.5">
                    {isZh ? "區間總互動" : "Total Interactions"}
                  </div>
                  <div className="text-lg font-semibold tabular-nums leading-tight text-white">
                    {kpiTotalInteractions.toLocaleString()}
                  </div>
                </div>
                {/* KPI 2: 平均互動率 */}
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                  <div className="text-[11px] text-white/60 leading-none mb-0.5">
                    {isZh ? "平均互動率" : "Avg Engagement"}
                  </div>
                  <div className="text-lg font-semibold tabular-nums leading-tight text-white">
                    {kpiEngagementRate !== null ? `${kpiEngagementRate.toFixed(2)}%` : "—"}
                  </div>
                </div>
              </div>

              {/* Right: MA7 toggle — only visible for Reach */}
              <div className="flex-none flex justify-end">
                {selectedMetric === "reach" ? (
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={smoothing}
                      onChange={(e) => setSmoothing(e.target.checked)}
                      className="w-3 h-3 accent-sky-400"
                    />
                    <span className="text-[11px] text-white/50 whitespace-nowrap">
                      {isZh ? "平滑(7日均線)" : "Smooth (7-day MA)"}
                    </span>
                  </label>
                ) : (
                  <div className="w-px" />
                )}
              </div>

            </div>

            {/* Chart — responsive height */}
            <div className="mt-3 w-full h-[200px] sm:h-[260px]">
              {!hasData ? (
                <div className="flex h-full items-center justify-center text-sm text-white/35">
                  {emptyLabel}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                      tickFormatter={yTickFormatter}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15,20,35,0.92)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "#fff",
                      }}
                      formatter={tooltipFormatter}
                      labelStyle={{ color: "rgba(255,255,255,0.55)", marginBottom: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={metricConfig.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: metricConfig.color }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Range selector — scrollable on mobile */}
            <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {RANGE_OPTIONS.map((r) => {
                const active = effectiveRangeDays === r.days
                return (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => handleRangeClick(r.days)}
                    className={
                      "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap " +
                      (active
                        ? "bg-white/15 text-white border border-white/20"
                        : "text-white/45 hover:text-white/70 border border-transparent")
                    }
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
