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

export type TrendPoint = {
  t: string
  reach?: number
  impressions?: number
  interactions?: number
  engaged?: number
  followerDelta?: number
  ts?: number
}

export type FollowerRow = {
  day: string
  followers_count: number
}

type MetricKey = "followers" | "reach" | "impressions" | "interactions" | "engaged"

const RANGE_OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: "ALL", days: null },
  { label: "365D", days: 365 },
  { label: "90D", days: 90 },
  { label: "60D", days: 60 },
  { label: "30D", days: 30 },
  { label: "15D", days: 15 },
  { label: "7D", days: 7 },
]

const METRIC_CONFIG: Array<{
  key: MetricKey
  labelZh: string
  labelEn: string
  color: string
}> = [
  { key: "followers", labelZh: "粉絲數", labelEn: "Followers", color: "#a78bfa" },
  { key: "reach", labelZh: "觸及", labelEn: "Reach", color: "#38bdf8" },
  { key: "impressions", labelZh: "曝光", labelEn: "Impressions", color: "#34d399" },
  { key: "interactions", labelZh: "互動", labelEn: "Interactions", color: "#fb923c" },
  { key: "engaged", labelZh: "帳號互動", labelEn: "Engaged", color: "#f472b6" },
]

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

type Props = {
  trendPoints: TrendPoint[]
  followersDailyRows: FollowerRow[]
  locale?: string
}

export default function TrendChartModule({ trendPoints, followersDailyRows, locale }: Props) {
  const isZh = !locale || locale === "zh-TW"

  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("reach")
  const [selectedDays, setSelectedDays] = useState<number | null>(90)

  const metricConfig = METRIC_CONFIG.find((m) => m.key === selectedMetric) ?? METRIC_CONFIG[0]

  const chartData = useMemo(() => {
    if (selectedMetric === "followers") {
      if (!Array.isArray(followersDailyRows) || followersDailyRows.length === 0) return []
      const sorted = [...followersDailyRows].sort((a, b) => a.day.localeCompare(b.day))
      const filtered =
        selectedDays == null
          ? sorted
          : sorted.slice(-selectedDays)
      return filtered.map((r) => ({
        t: r.day.slice(5),
        value: r.followers_count,
      }))
    }

    if (!Array.isArray(trendPoints) || trendPoints.length === 0) return []
    const sorted = [...trendPoints].sort((a, b) => {
      const ta = a.ts ?? 0
      const tb = b.ts ?? 0
      return ta !== tb ? ta - tb : a.t.localeCompare(b.t)
    })
    const filtered = selectedDays == null ? sorted : sorted.slice(-selectedDays)

    return filtered.map((p) => {
      let value: number | undefined
      if (selectedMetric === "reach") value = p.reach
      else if (selectedMetric === "impressions") value = p.impressions
      else if (selectedMetric === "interactions") value = p.interactions
      else if (selectedMetric === "engaged") value = p.engaged
      return { t: p.t, value }
    })
  }, [selectedMetric, selectedDays, trendPoints, followersDailyRows])

  const hasData = chartData.some((d) => typeof d.value === "number" && d.value > 0)
  const allEmpty = trendPoints.length === 0 && followersDailyRows.length === 0

  const emptyLabel = isZh ? "暫無資料" : "No data"

  return (
    <div className="mt-4">
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-3 sm:p-4">
      {allEmpty ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-white/35">
          {isZh ? "暫無資料 / No data available" : "No data available"}
        </div>
      ) : (<>
      {/* Metric selector — wraps on mobile */}
      <div className="flex flex-wrap gap-1.5 pb-1">
        {METRIC_CONFIG.map((m) => {
          const active = selectedMetric === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedMetric(m.key)}
              className={
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap " +
                (active
                  ? "bg-white/15 text-white border border-white/20"
                  : "text-white/55 hover:text-white/80 hover:bg-white/8 border border-transparent")
              }
              style={active ? { borderColor: m.color + "55", color: m.color } : undefined}
            >
              {isZh ? m.labelZh : m.labelEn}
            </button>
          )
        })}
      </div>

      {/* Chart — responsive height: shorter on mobile */}
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
                tickFormatter={formatCompact}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,20,35,0.92)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#fff",
                }}
                formatter={(val) => [typeof val === "number" ? formatCompact(val) : "—", isZh ? metricConfig.labelZh : metricConfig.labelEn]}
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
          const active = selectedDays === r.days
          return (
            <button
              key={r.label}
              type="button"
              onClick={() => setSelectedDays(r.days)}
              className={
                "shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap " +
                (active
                  ? "bg-white/15 text-white border border-white/20"
                  : "text-white/45 hover:text-white/70 hover:bg-white/8 border border-transparent")
              }
            >
              {r.label}
            </button>
          )
        })}
      </div>
      </>)}
      </div>
    </div>
  )
}
