"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useI18n } from "../../../components/locale-provider"

type TrendMetric = "reach" | "followers" | "impressions" | "accounts_engaged" | "total_interactions"

type TrendPoint = { day: string; value: number }

type TrendApiResponse = {
  metric: TrendMetric
  days: number
  ig_account_id: string
  points: TrendPoint[]
}

type TrendUiStatus = "idle" | "loading" | "ready" | "empty" | "error"

type MetricOption = { metric: TrendMetric; labelKey: string }

const RANGE_OPTIONS: number[] = [7, 14, 30, 90]

const METRIC_OPTIONS: MetricOption[] = [
  { metric: "reach", labelKey: "results.trendBlock.metrics.reach" },
  { metric: "followers", labelKey: "results.trendBlock.metrics.followers" },
  { metric: "impressions", labelKey: "results.trendBlock.metrics.impressions" },
  { metric: "accounts_engaged", labelKey: "results.trendBlock.metrics.accountsEngaged" },
  { metric: "total_interactions", labelKey: "results.trendBlock.metrics.totalInteractions" },
]

const __trendCardCache = new Map<string, { at: number; value: TrendApiResponse }>()

function cacheKey(metric: TrendMetric, days: number) {
  return `${metric}:${days}`
}

function readCache(metric: TrendMetric, days: number): TrendApiResponse | null {
  const k = cacheKey(metric, days)
  const e = __trendCardCache.get(k)
  if (!e) return null
  // tiny client cache to avoid toggle refetch storms; keep it short
  if (Date.now() - e.at > 20_000) {
    __trendCardCache.delete(k)
    return null
  }
  return e.value
}

function writeCache(metric: TrendMetric, days: number, value: TrendApiResponse) {
  const k = cacheKey(metric, days)
  __trendCardCache.set(k, { at: Date.now(), value })
  if (__trendCardCache.size > 12) {
    const items = Array.from(__trendCardCache.entries())
    items.sort((a, b) => a[1].at - b[1].at)
    const removeN = Math.max(1, __trendCardCache.size - 12)
    for (let i = 0; i < removeN; i++) {
      const key = items[i]?.[0]
      if (key) __trendCardCache.delete(key)
    }
  }
}

function formatCompact(n: number) {
  const v = Number(n)
  if (!Number.isFinite(v)) return "—"
  try {
    return v.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })
  } catch {
    return v.toLocaleString()
  }
}

function computePolyline(points: number[], w: number, h: number, pad: number) {
  if (!points.length) return ""
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min
  const innerW = Math.max(1, w - pad * 2)
  const innerH = Math.max(1, h - pad * 2)

  return points
    .map((v, i) => {
      const x = pad + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
      const y = pad + (span === 0 ? innerH / 2 : (1 - (v - min) / span) * innerH)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

export default function TrendCard() {
  const { t, locale } = useI18n() as any
  const isZh = String(locale) === "zh-TW"

  const [days, setDays] = useState<number>(30)
  const [metric, setMetric] = useState<TrendMetric>("reach")

  const [status, setStatus] = useState<TrendUiStatus>("idle")
  const [errorCode, setErrorCode] = useState<string>("")
  const [points, setPoints] = useState<TrendPoint[]>([])

  const abortRef = useRef<AbortController | null>(null)

  const fetchTrend = useCallback(async (metric2: TrendMetric, days2: number) => {
    const cached = readCache(metric2, days2)
    if (cached) {
      const pts = Array.isArray(cached.points) ? cached.points : []
      setPoints(pts)
      setStatus(pts.length ? "ready" : "empty")
      setErrorCode("")
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setStatus("loading")
    setErrorCode("")

    try {
      const url = `/api/instagram/trend?metric=${encodeURIComponent(metric2)}&days=${encodeURIComponent(String(days2))}`
      const res = await fetch(url, { method: "GET", cache: "no-store", signal: ac.signal })
      const body = await res.json().catch(() => null)

      if (!res.ok) {
        const code = String(body?.error || "ERROR")
        setStatus("error")
        setErrorCode(code)
        setPoints([])
        return
      }

      const parsed: TrendApiResponse | null = body && typeof body === "object" ? (body as any) : null
      const pts = Array.isArray(parsed?.points) ? (parsed!.points as TrendPoint[]) : []

      if (parsed && parsed.metric && typeof parsed.days === "number") {
        writeCache(metric2, days2, parsed)
      }

      setPoints(pts)
      setStatus(pts.length ? "ready" : "empty")
      setErrorCode("")
    } catch (e: any) {
      if (e?.name === "AbortError") return
      setStatus("error")
      setErrorCode("NETWORK_ERROR")
      setPoints([])
    }
  }, [])

  useEffect(() => {
    fetchTrend(metric, days)
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [metric, days, fetchTrend])

  const title = t("results.trendBlock.title")
  const subtitle = t("results.trendBlock.subtitle")

  const selectedMetricLabel = useMemo(() => {
    const opt = METRIC_OPTIONS.find((x) => x.metric === metric)
    return opt ? t(opt.labelKey) : metric
  }, [metric, t])

  const values = useMemo(() => points.map((p) => p.value), [points])
  const total = useMemo(() => values.reduce((a, b) => a + b, 0), [values])
  const last = useMemo(() => (values.length ? values[values.length - 1] : null), [values])

  const chartW = 560
  const chartH = 140
  const pad = 10
  const polyline = useMemo(() => computePolyline(values, chartW, chartH, pad), [values])

  const monoNum = "tabular-nums whitespace-nowrap"

  const pillBase =
    "inline-flex items-center justify-center rounded-full border px-3 py-1 text-[12px] leading-none transition min-w-0"

  return (
    <div
      id="trend-section"
      className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.03] p-3 sm:p-4 lg:p-5 min-w-0 overflow-hidden"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0">
          <div className="text-xl font-bold text-white min-w-0 truncate">{title}</div>
          <div className="mt-0.5 text-[11px] text-white/60 leading-snug line-clamp-2 min-w-0">{subtitle}</div>
        </div>

        <div className="flex flex-col gap-2 sm:items-end shrink-0">
          <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
            {RANGE_OPTIONS.map((d) => {
              const active = d === days
              return (
                <button
                  key={`trend-range-${d}`}
                  type="button"
                  className={
                    pillBase +
                    " " +
                    (active
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                  onClick={() => setDays(d)}
                >
                  <span className="min-w-0 truncate">{isZh ? `${d} 天` : `${d}D`}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
            {METRIC_OPTIONS.map((opt) => {
              const active = opt.metric === metric
              return (
                <button
                  key={`trend-metric-${opt.metric}`}
                  type="button"
                  className={
                    pillBase +
                    " " +
                    (active
                      ? "border-white/25 bg-white/10 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
                  }
                  onClick={() => setMetric(opt.metric)}
                >
                  <span className="min-w-0 truncate">{t(opt.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3 min-w-0">
        <div className="lg:col-span-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 min-w-0 overflow-hidden">
          <div className="text-[11px] text-white/60 truncate">{t("results.trendBlock.summaryLabel", { metric: selectedMetricLabel })}</div>
          <div className={"mt-1 text-[clamp(18px,6vw,28px)] font-semibold text-white min-w-0 " + monoNum}>
            {status === "loading" ? "…" : formatCompact(total)}
          </div>
          <div className="mt-1 text-[11px] text-white/55 leading-tight line-clamp-2 min-w-0">
            {status === "error"
              ? t("results.trendBlock.error", { code: errorCode || "ERROR" })
              : status === "empty"
                ? t("results.trendBlock.empty")
                : t("results.trendBlock.hint", { days })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 min-w-0">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 min-w-0 overflow-hidden">
              <div className="text-[10px] text-white/60 truncate">{t("results.trendBlock.kpis.points")}</div>
              <div className={"mt-0.5 text-[clamp(14px,4.5vw,18px)] font-semibold text-white min-w-0 " + monoNum}>
                {status === "loading" ? "…" : String(points.length)}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 min-w-0 overflow-hidden">
              <div className="text-[10px] text-white/60 truncate">{t("results.trendBlock.kpis.last")}</div>
              <div className={"mt-0.5 text-[clamp(14px,4.5vw,18px)] font-semibold text-white min-w-0 " + monoNum}>
                {status === "loading" ? "…" : last == null ? "—" : formatCompact(last)}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-white/10 bg-white/[0.04] p-3 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="text-[11px] text-white/60 truncate">{t("results.trendBlock.chartTitle")}</div>
            <div className={"text-[11px] text-white/55 min-w-0 truncate " + monoNum}>
              {status === "ready" ? `${formatCompact(total)} / ${isZh ? `${days} 天` : `${days}D`}` : ""}
            </div>
          </div>

          <div className="mt-2 min-w-0 overflow-hidden">
            {status === "loading" ? (
              <div className="h-[140px] rounded-lg bg-white/5 animate-pulse" />
            ) : status === "error" ? (
              <div className="h-[140px] rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center text-[12px] text-white/70 px-3 text-center">
                {t("results.trendBlock.error", { code: errorCode || "ERROR" })}
              </div>
            ) : status === "empty" ? (
              <div className="h-[140px] rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-center text-[12px] text-white/70 px-3 text-center">
                {t("results.trendBlock.empty")}
              </div>
            ) : (
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[140px]">
                <defs>
                  <linearGradient id="trendLine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.6" />
                  </linearGradient>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.04" />
                  </linearGradient>
                </defs>

                <rect x="0" y="0" width={chartW} height={chartH} rx="12" fill="rgba(255,255,255,0.02)" />

                {polyline ? (
                  <>
                    <polygon
                      points={`${polyline} ${chartW - pad},${chartH - pad} ${pad},${chartH - pad}`}
                      fill="url(#trendFill)"
                    />
                    <polyline points={polyline} fill="none" stroke="url(#trendLine)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                  </>
                ) : null}
              </svg>
            )}
          </div>

          <div className="mt-2 text-[10px] text-white/45 leading-tight line-clamp-2 min-w-0">
            {t("results.trendBlock.dbOnlyNote")}
          </div>
        </div>
      </div>
    </div>
  )
}
