"use client"

// Density pass: tighten common headings/blocks inside Results page (UI-only)

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { createClient } from "@supabase/supabase-js"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { ArrowLeft, Instagram, AtSign, Lock } from "lucide-react"
import { MonetizationSection } from "../../components/monetization-section"
import { ShareResults } from "../../components/share-results"
import { useRefetchTick } from "../lib/useRefetchTick"
import { extractLocaleFromPathname, localePathname } from "../lib/locale-path"
import { useInstagramMe } from "../lib/useInstagramMe"
import { useAuthNavigation } from "../lib/useAuthNavigation"
import { extractIgUserIdFromInsightsId } from "../lib/instagram"
import { getPostMetrics } from "../lib/postMetrics"
import { useFollowersMetrics } from "./hooks/useFollowersMetrics"
import { useRefreshController } from "./hooks/useRefreshController"
import { useResultsOrchestrator } from "./hooks/useResultsOrchestrator"
import { ResultsDebugPanel } from "./components/ResultsDebugPanel"
import ConnectedGateBase from "../[locale]/results/ConnectedGate"
import { mockAnalysis } from "../[locale]/results/mockData"
import { mergeToContinuousTrendPoints } from "./lib/mergeToContinuousTrendPoints"
import { PostsDebugPanel } from "./PostsDebugPanel"
import { CreatorCardShowcase } from "./CreatorCardShowcase"
import { toIgDirectMediaUrl } from "@/app/lib/ig/toIgDirectMediaUrl"
import { useCreatorCardPreviewData } from "../components/creator-card/useCreatorCardPreviewData"

// Dev StrictMode can mount/unmount/mount causing useRef to reset.
// Module-scope flag survives remount in the same session and prevents duplicate fetch.
let __resultsMediaFetchedOnce = false
let __resultsMeFetchedOnce = false

// Debug helper for Creator Card Preview refresh flow (dev-only)
const debugCreatorCard = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.debug("[CreatorCardPreview]", ...args)
  }
}

function toNum(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function normalizeStringArray(value: unknown, maxLen: number) {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= maxLen) break
  }
  return out
}

function getCookieValue(key: string): string {
  try {
    if (typeof document === "undefined") return ""
    const raw = document.cookie || ""
    const parts = raw.split(";")
    for (const p of parts) {
      const idx = p.indexOf("=")
      if (idx < 0) continue
      const k = p.slice(0, idx).trim()
      if (k !== key) continue
      const v = p.slice(idx + 1).trim()
      try {
        return decodeURIComponent(v)
      } catch {
        return v
      }
    }
    return ""
  } catch {
    return ""
  }
}

function getIgScope(): string {
  try {
    const igId = getCookieValue("ig_ig_id").trim()
    const pageId = getCookieValue("ig_page_id").trim()

    const base = igId || "session"
    const page = pageId || ""

    return `${base}|${page}`
  } catch {
    return "session|"
  }
}

function isAbortError(err: unknown): boolean {
  if (!isRecord(err)) return false
  const name = typeof err.name === "string" ? err.name : ""
  const msg = typeof err.message === "string" ? err.message : ""
  const s = `${name} ${msg}`.toLowerCase()
  return name === "AbortError" || s.includes("abort") || s.includes("canceled") || s.includes("cancelled")
}

type UnknownRecord = Record<string, unknown>
function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val)
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div 
      className={"animate-shimmer rounded-md bg-gradient-to-r from-white/15 via-white/35 to-white/15 " + (className || "")}
      style={{
        backgroundSize: '200% 100%',
        animationDuration: '1.2s',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  )
}

function StatsValueSkeleton() {
  return (
    <div className="mt-1 min-w-0">
      <Skeleton className="h-6 w-24 sm:h-7 sm:w-28" />
    </div>
  )
}

const shimmerStyles = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes shimmerFade {
    0% { opacity: 0.35; }
    50% { opacity: 0.65; }
    100% { opacity: 0.35; }
  }
  .animate-shimmer {
    animation: shimmer 1.2s ease-in-out infinite, shimmerFade 1.2s ease-in-out infinite;
  }
  .trend-today-pulse circle:first-child {
    transform-box: fill-box;
    transform-origin: center;
    animation: trendTodayPulse 1.8s ease-in-out infinite;
  }
  @keyframes trendTodayPulse {
    0% {
      opacity: 0.25;
      transform: scale(1);
    }
    50% {
      opacity: 0.55;
      transform: scale(1.18);
    }
    100% {
      opacity: 0.25;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .animate-shimmer {
      animation: none;
      opacity: 0.5;
      background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.05) 100%);
    }
    .trend-today-pulse circle:first-child {
      animation: none;
    }
  }
`

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}
function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined
}

type IgMeResponse = {
  connected: boolean
  provider?: string
  profile?: {
    id?: string
    username?: string
    name?: string
    profile_picture_url?: string
    followers_count?: number | null
    follows_count?: number | null
    media_count?: number | null
  }
  username?: string
  name?: string
  profile_picture_url?: string
  followers_count?: number
  follows_count?: number
  following_count?: number
  media_count?: number
  recent_media?: Array<{
    id: string
    media_type?: string
    like_count?: number
    comments_count?: number
    timestamp?: string
    permalink?: string
    thumbnail_url?: string
    media_url?: string
    caption?: string
  }>
}

type CreatorCardMeResponse = {
  ok: boolean
  error?: string
  me?: { igUserId?: string | null; igUsername?: string | null } | null
  card?: unknown
}

type FakeAnalysis = {
  platform: "instagram" | "threads"
  username: string
  accountType: string
  accountAge: string
  visibility: string
  postingFrequency: string
  recentActivityTrend: string
  contentConsistency: string
  engagementQuality: string
  interactionPattern: string
  automationLikelihood: string
  abnormalBehaviorRisk: string
  notes: string[]
  confidenceScore: number
  analysisType: string
  disclaimer: string
}

type GateState = "loading" | "needs_connect" | "needs_setup" | "ready"

type AccountTrendPoint = {
  t: string
  reach?: number
  impressions?: number
  interactions?: number
  engaged?: number
  followerDelta?: number
  ts?: number
}

const MOCK_ACCOUNT_TREND_7D: AccountTrendPoint[] = [
  { t: "12/22", reach: 18200, interactions: 25400, engaged: 890, followerDelta: 12 },
  { t: "12/23", reach: 20150, interactions: 27800, engaged: 960, followerDelta: 18 },
  { t: "12/24", reach: 17500, interactions: 24100, engaged: 820, followerDelta: -3 },
  { t: "12/25", reach: 22300, interactions: 30500, engaged: 1100, followerDelta: 25 },
  { t: "12/26", reach: 21000, interactions: 28950, engaged: 1025, followerDelta: 9 },
  { t: "12/27", reach: 23800, interactions: 33000, engaged: 1210, followerDelta: 31 },
  { t: "12/28", reach: 25150, interactions: 34800, engaged: 1290, followerDelta: 22 },
]

type ResultsCachePayloadV1 = {
  ts: number
  igMe: IgMeResponse | null
  media: Array<{
    id: string
    like_count?: number
    comments_count?: number
    timestamp?: string
    media_type?: string
    permalink?: string
    media_url?: string
    thumbnail_url?: string
    caption?: string
  }>
  trendPoints: AccountTrendPoint[]
  trendFetchedAt: number | null
}

function LatestReachTileBridge(props: {
  v: number | null
  day: string | null
  setV: (v: number | null) => void
  setDay: (d: string | null) => void
}) {
  useEffect(() => {
    props.setV(props.v)
    props.setDay(props.day)
  }, [props.day, props.setDay, props.setV, props.v])
  return null
}

const RESULTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const __resultsCacheMem: Record<string, ResultsCachePayloadV1> = {}

function saReadResultsCache(key: string): ResultsCachePayloadV1 | null {
  try {
    const mem = __resultsCacheMem[key]
    if (mem && typeof mem.ts === "number" && Date.now() - mem.ts <= RESULTS_CACHE_TTL_MS) return mem
  } catch {
    // ignore
  }

  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.ts !== "number") return null
    if (Date.now() - parsed.ts > RESULTS_CACHE_TTL_MS) return null
    return parsed as ResultsCachePayloadV1
  } catch {
    return null
  }
}

function saWriteResultsCache(key: string, payload: ResultsCachePayloadV1) {
  try {
    __resultsCacheMem[key] = payload
  } catch {
    // ignore
  }
  try {
    if (typeof window === "undefined") return
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function TopPostThumb({ src, alt, mediaType }: { src?: string; alt: string; mediaType?: string }) {
  const FALLBACK_IMG = "/window.svg"
  const [currentSrc, setCurrentSrc] = useState<string>(src && src.length > 0 ? src : FALLBACK_IMG)
  const [broken, setBroken] = useState(false)
  const fallbackAttemptedRef = useRef(false)
  const lastFailedSrcRef = useRef<string>("")

  // DEV-only: Extract hostname from original src URL
  const getDebugHostname = (srcUrl?: string): string => {
    if (!srcUrl) return ""
    try {
      // If proxied URL, extract the url parameter
      if (srcUrl.includes("/api/ig/thumbnail?")) {
        const params = new URLSearchParams(srcUrl.split("?")[1])
        const originalUrl = params.get("url")
        if (originalUrl) {
          return new URL(originalUrl).hostname
        }
      }
      // Direct URL
      return new URL(srcUrl).hostname
    } catch {
      return "invalid-url"
    }
  }

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const next = src && src.length > 0 ? src : FALLBACK_IMG
      if (src && src.length > 0 && lastFailedSrcRef.current && src === lastFailedSrcRef.current) {
        setBroken(true)
        fallbackAttemptedRef.current = false
        setCurrentSrc(next)
        return
      }
      setBroken(false)
      fallbackAttemptedRef.current = false
      setCurrentSrc(next)
    })
    return () => cancelAnimationFrame(raf)
  }, [src])

  const isVideoUrl = useMemo(() => {
    // Use media_type if available (most reliable)
    if (mediaType) {
      const mt = mediaType.toUpperCase()
      if (mt === "VIDEO" || mt === "REELS" || mt.includes("VIDEO")) {
        return true
      }
    }
    // Fallback: check if URL ends with .mp4
    const u = typeof currentSrc === "string" ? currentSrc.trim() : ""
    if (!u) return false
    return /\.mp4(\?|$)/i.test(u)
  }, [currentSrc, mediaType])

  const handleError = useCallback(() => {
    if (src && src.length > 0) {
      lastFailedSrcRef.current = src
    }
    // If proxy failed and we haven't tried direct URL yet, try it
    if (!fallbackAttemptedRef.current && src && src.length > 0) {
      fallbackAttemptedRef.current = true
      // Extract original URL from proxy if it's a proxied URL
      if (currentSrc.includes("/api/ig/thumbnail?url=")) {
        try {
          const params = new URLSearchParams(currentSrc.split("?")[1])
          const originalUrl = params.get("url")
          if (originalUrl) {
            // Check if originalUrl is from instagram.com - if so, don't use it
            // (instagram.com URLs often redirect to login/non-image pages)
            try {
              const originalUrlObj = new URL(originalUrl)
              const hostname = originalUrlObj.hostname.toLowerCase()
              if (hostname === "instagram.com" || hostname === "www.instagram.com") {
                // Skip fallback for instagram.com URLs
                setBroken(true)
                return
              }
            } catch {
              // If URL parsing fails, skip fallback
              setBroken(true)
              return
            }
            setCurrentSrc(originalUrl)
            return
          }
        } catch {
          // Fall through to broken state
        }
      }
    }
    // Second failure or no fallback available - mark as broken
    setBroken(true)
  }, [currentSrc, src])

  if (broken) {
    const hostname = process.env.NODE_ENV !== "production" && broken ? getDebugHostname(src) : ""

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-[11px] font-semibold text-white/70 min-h-[72px]" aria-label={alt}>
        <div className="flex flex-col items-center gap-1">
          {process.env.NODE_ENV !== "production" ? (
            <>
              <span className="text-[9px] text-red-400 font-bold">THUMB FAIL</span>
              <span className="text-[8px] text-red-300 px-1 text-center max-w-full truncate">{hostname}</span>
            </>
          ) : (
            <span>{isVideoUrl ? "Video" : "Image"}</span>
          )}
        </div>
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={currentSrc}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  )
}

function SafeIgThumb(props: { src?: string; alt: string; className: string }) {
  const { src, alt, className } = props
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setBroken(false)
    })
    return () => cancelAnimationFrame(raf)
  }, [src])

  const isVideoUrl = useMemo(() => {
    const u = typeof src === "string" ? src.trim() : ""
    if (!u) return false
    return /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)
  }, [src])

  if (!src || broken || isVideoUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-white/5 text-[11px] font-semibold text-white/70`} aria-label={alt}>
        Video
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}

type TrendPoint = {
  date: string;        // e.g. "2026-01-15"
  value: number | null; // followers count
  capturedAt?: string; // ISO timestamp (optional)
};

function FollowersTrendFallback(props: {
  point: TrendPoint;
  updatedAtLabel?: string; // e.g. "2026/01/15 12:13:30" (optional)
  rangeLabel?: string;     // e.g. "2025/10/18 – 2026/01/15" (optional)
}) {
  const { point, updatedAtLabel, rangeLabel } = props;

  const followersText =
    typeof point.value === "number" ? point.value.toLocaleString() : "—";

  // Prefer point.capturedAt if present; otherwise show updatedAtLabel if available.
  const timeText =
    (point.capturedAt ? new Date(point.capturedAt).toLocaleString() : undefined) ??
    updatedAtLabel ??
    "";

  return (
    <div className="rounded-xl border border-white/10 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-lg font-semibold">粉絲 Followers</div>
        {(timeText || rangeLabel) && (
          <div className="text-xs text-white/60">
            {rangeLabel ? <span>{rangeLabel}</span> : null}
            {rangeLabel && timeText ? <span className="mx-2">·</span> : null}
            {timeText ? <span>Updated {timeText}</span> : null}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold tabular-nums">{followersText}</div>
          <div className="mt-1 text-sm text-white/60">
            目前僅有 1 筆資料，需累積更多天數才會顯示趨勢圖。<br />
            Only 1 snapshot collected—trend will appear after more data is collected.
          </div>
        </div>

        <div className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">
          1 point / 1 筆
        </div>
      </div>
    </div>
  );
}

function GateShell(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="w-full bg-[#0b1220] px-4 py-12 overflow-x-hidden">
      <div className="mx-auto w-full max-w-3xl">
        <Card className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl sm:text-2xl font-bold text-white min-w-0 break-words leading-tight">
              {props.title}
            </CardTitle>
            {props.subtitle ? (
              <div className="text-sm text-slate-300 mt-2 min-w-0 break-words leading-snug">{props.subtitle}</div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">{props.children}</CardContent>
        </Card>
      </div>
    </section>
  )
}

function LoadingCard(props: {
  t: (key: string) => string
  isSlow: boolean
  onRetry: () => void
  onRefresh: () => void
  onBack: () => void
}) {
  return (
    <GateShell title={props.t("results.syncingTitle")} subtitle={props.t("results.syncingHint")}>
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        <div className="text-sm text-white/70">{props.t("results.updating")}</div>
      </div>

      {props.isSlow ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-start">
          <Button
            type="button"
            variant="outline"
            className="border-white/15 text-slate-200 hover:bg-white/5"
            onClick={props.onRetry}
          >
            {props.t("results.retry")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-white/15 text-slate-200 hover:bg-white/5"
            onClick={props.onRefresh}
          >
            {props.t("results.retry")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-white/15 text-slate-200 hover:bg-white/5"
            onClick={props.onBack}
          >
            {props.t("results.back")}
          </Button>
        </div>
      ) : null}
    </GateShell>
  )
}

function ConnectCard(props: {
  t: (key: string) => string
  onConnect: () => void
  onBack: () => void
  connectEnvError: "missing_env" | null
  connecting?: boolean
}) {
  return (
    <GateShell
      title={props.t("results.gates.connect.title")}
      subtitle={props.t("results.gates.connect.subtitle")}
    >
      {props.connectEnvError === "missing_env" ? (
        <Alert>
          <AlertTitle>{props.t("results.gates.connect.missingEnv.title")}</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <div>
                {props.t("results.gates.connect.missingEnv.desc")}
              </div>
              <div className="font-mono text-xs break-all">APP_BASE_URL / META_APP_ID / META_APP_SECRET</div>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full sm:w-auto min-h-[44px]"
          onClick={props.onConnect}
          disabled={props.connecting}
          aria-busy={props.connecting ? true : undefined}
        >
          {props.connecting ? (
            <span className="inline-flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{props.t("results.gates.connect.cta")}</span>
            </span>
          ) : (
            props.t("results.gates.connect.cta")
          )}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg w-full sm:w-auto min-h-[44px]"
          onClick={props.onBack}
          disabled={props.connecting}
        >
          {props.t("results.gates.common.back")}
        </Button>
      </div>

      <div className="text-xs text-white/55 leading-snug min-w-0 break-words">
        {props.t("results.gates.connect.tip")}
      </div>
    </GateShell>
  )
}

function SetupHelpCard(props: { t: (key: string) => string; onRetry: () => void; onReconnect: () => void }) {
  return (
    <GateShell
      title={props.t("results.gates.setup.title")}
      subtitle={props.t("results.gates.setup.subtitle")}
    >
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
        <div className="font-medium mb-2">{props.t("results.gates.setup.stepsTitle")}</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>{props.t("results.gates.setup.steps.1")}</li>
          <li>{props.t("results.gates.setup.steps.2")}</li>
          <li>{props.t("results.gates.setup.steps.3")}</li>
          <li>{props.t("results.gates.setup.steps.4")}</li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onRetry}
        >
          {props.t("results.gates.setup.retry")}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onReconnect}
        >
          {props.t("results.gates.setup.reconnect")}
        </Button>
      </div>

      <div className="text-xs text-white/55 leading-snug min-w-0 break-words">
        {props.t("results.gates.setup.tip")}
      </div>
    </GateShell>
  )
}

function ConnectedGate(props: ComponentProps<typeof ConnectedGateBase>) {
  return <ConnectedGateBase {...props} />
}

function ProgressRing({
  value,
  label,
  subLabel,
  centerText,
}: {
  value: number
  label: string
  subLabel?: ReactNode
  centerText?: string
}) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
      <div
        className="h-10 w-10 rounded-full shrink-0"
        style={{
          background: `conic-gradient(#34d399 ${v}%, rgba(255,255,255,0.12) ${v}%)`,
        }}
      >
        <div className="m-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-full bg-[#0b1220]/90 flex items-center justify-center">
          <span className="text-[11px] sm:text-xs font-semibold text-white tabular-nums whitespace-nowrap">
            {typeof centerText === "string" ? centerText : Math.round(v)}
          </span>
        </div>
      </div>
      <div className="leading-snug min-w-0">
        <div className="text-[11px] leading-tight sm:text-xs font-semibold text-white truncate">{label}</div>
        {subLabel ? <div className="text-[11px] leading-tight sm:text-xs text-white/60 truncate">{subLabel}</div> : null}
      </div>
    </div>
  )
}

function normalizeMedia(raw: unknown):
  Array<{
    id: string
    like_count?: number
    comments_count?: number
    timestamp?: string
    media_type?: string
    permalink?: string
    media_url?: string
    thumbnail_url?: string
    caption?: string
    views?: number
  }> {
  const src = Array.isArray(raw) ? raw : (isRecord(raw) && Array.isArray(raw.data)) ? raw.data : []

  return src
    .map((m: unknown) => {
      if (!isRecord(m)) return null
      const id = typeof m?.id === "string" ? m.id : String(m?.id ?? "")
      if (!id) return null

      const like_count = Number(m?.like_count ?? m?.likeCount ?? m?.likes_count ?? m?.likesCount ?? m?.likes)
      const comments_count = Number(m?.comments_count ?? m?.commentsCount ?? m?.comment_count ?? m?.commentCount ?? m?.comments)
      // Read views from server-side API response only (no client-side guessing)
      const views = typeof m?.views === "number" ? m.views : undefined

      return {
        id,
        like_count: Number.isFinite(like_count) ? like_count : undefined,
        comments_count: Number.isFinite(comments_count) ? comments_count : undefined,
        timestamp: typeof m?.timestamp === "string" ? m.timestamp : undefined,
        media_type: typeof (m?.media_type ?? m?.mediaType) === "string" ? String(m?.media_type ?? m?.mediaType) : undefined,
        permalink: typeof m?.permalink === "string" ? m.permalink : undefined,
        media_url: typeof (m?.media_url ?? m?.mediaUrl) === "string" ? String(m?.media_url ?? m?.mediaUrl) : undefined,
        thumbnail_url: typeof (m?.thumbnail_url ?? m?.thumbnailUrl) === "string" ? String(m?.thumbnail_url ?? m?.thumbnailUrl) : undefined,
        caption: typeof m?.caption === "string" ? m.caption : undefined,
        views: Number.isFinite(views) ? views : undefined,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null) as Array<{
      id: string
      like_count?: number
      comments_count?: number
      timestamp?: string
      media_type?: string
      permalink?: string
      media_url?: string
      thumbnail_url?: string
      caption?: string
      views?: number
    }>
}

const normalizeMe = (raw: unknown): IgMeResponse | null => {
  const isRec = (v: unknown): v is UnknownRecord => Boolean(v && typeof v === "object" && !Array.isArray(v))
  const toNumOrNull = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const pickStr = (...vals: unknown[]): string | undefined => {
    for (const v of vals) {
      if (typeof v === "string" && v.trim()) return v.trim()
    }
    return undefined
  }

  if (!isRec(raw)) return null

  // Accept multiple wrappers: {data:{...}}, {me:{...}}, or direct.
  const base: UnknownRecord = (isRec(raw.data) ? raw.data : isRec(raw.me) ? raw.me : raw)
  const connected = Boolean(isRecord(raw) && raw.connected !== undefined ? raw.connected : base?.connected)

  const profileRaw: UnknownRecord | null =
    (isRec(base?.profile) ? base.profile : null) ||
    (isRecord(base?.data) && isRec(base.data.profile) ? base.data.profile : null) ||
    (isRecord(raw) && isRec(raw.profile) ? raw.profile : null)

  // If backend returns flat fields, synthesize a profile object.
  const flatHasAny =
    typeof base?.profile_picture_url === "string" ||
    typeof base?.username === "string" ||
    typeof base?.followers_count !== "undefined" ||
    typeof base?.follows_count !== "undefined" ||
    typeof base?.media_count !== "undefined"

  const p = (profileRaw ?? (flatHasAny ? base : null))
  if (!p && !connected) return null

  const profile = p
    ? {
        id: pickStr(p?.id),
        username: pickStr(isRecord(p) ? p.username : undefined, base?.username, isRecord(raw) ? raw.username : undefined),
        name: pickStr(isRecord(p) ? p.name : undefined, base?.name, isRecord(raw) ? raw.name : undefined, base?.display_name),
        profile_picture_url: pickStr(p?.profile_picture_url, base?.profile_picture_url),
        followers_count: toNumOrNull(p?.followers_count),
        follows_count: toNumOrNull(p?.follows_count ?? p?.following_count),
        media_count: toNumOrNull(p?.media_count),
      }
    : undefined

  return {
    connected,
    provider: isRecord(raw) && typeof raw.provider === "string" ? raw.provider : undefined,
    profile,
    username: profile?.username,
    name: profile?.name,
    profile_picture_url: profile?.profile_picture_url,
    followers_count: typeof profile?.followers_count === "number" ? profile.followers_count : undefined,
    follows_count: typeof profile?.follows_count === "number" ? profile.follows_count : undefined,
    media_count: typeof profile?.media_count === "number" ? profile.media_count : undefined,
    recent_media: Array.isArray(base?.recent_media) ? base.recent_media : (isRecord(raw) && Array.isArray(raw.recent_media) ? raw.recent_media : undefined),
  }
}

export default function ResultsClient({ initialDailySnapshot }: { initialDailySnapshot?: unknown }) {
  const __DEV__ = process.env.NODE_ENV !== "production"
  const __DEBUG_RESULTS__ = process.env.NEXT_PUBLIC_DEBUG_RESULTS === "1"
  const [showMediaErrorDetails, setShowMediaErrorDetails] = useState(false)

  type DevErrorEntry = {
    id: string
    at: number
    type: "window_error" | "unhandled_rejection" | "console_error"
    message: string
    stack?: string
  }

  const [devErrorPanelOpen, setDevErrorPanelOpen] = useState(false)
  const [devErrors, setDevErrors] = useState<DevErrorEntry[]>([])
  const devConsoleErrorOrigRef = useRef<((...args: unknown[]) => void) | null>(null)

  const pushDevError = useCallback(
    (next: Omit<DevErrorEntry, "id" | "at"> & { stack?: string }) => {
      if (!__DEV__) return
      const entry: DevErrorEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: Date.now(),
        type: next.type,
        message: next.message,
        stack: next.stack,
      }
      setDevErrors((prev) => {
        const merged = [entry, ...prev]
        return merged.length > 20 ? merged.slice(0, 20) : merged
      })
    },
    [__DEV__],
  )

  useEffect(() => {
    if (!__DEV__) return
    if (typeof window === "undefined") return

    const onError = (event: ErrorEvent) => {
      pushDevError({
        type: "window_error",
        message: String(event?.message ?? "(window.onerror)"),
        stack: typeof event?.error?.stack === "string" ? event.error.stack : undefined,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: any = (event as any)?.reason
      pushDevError({
        type: "unhandled_rejection",
        message: typeof reason?.message === "string" ? reason.message : String(reason ?? "(unhandledrejection)"),
        stack: typeof reason?.stack === "string" ? reason.stack : undefined,
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)

    if (!devConsoleErrorOrigRef.current) {
      devConsoleErrorOrigRef.current = console.error
      console.error = (...args: unknown[]) => {
        try {
          const msg = args
            .map((a) => {
              if (typeof a === "string") return a
              try {
                return JSON.stringify(a)
              } catch {
                return String(a)
              }
            })
            .join(" ")
          pushDevError({ type: "console_error", message: msg })
        } catch {
          // ignore
        }
        devConsoleErrorOrigRef.current?.(...args)
      }
    }

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
      if (devConsoleErrorOrigRef.current) {
        console.error = devConsoleErrorOrigRef.current
        devConsoleErrorOrigRef.current = null
      }
    }
  }, [__DEV__, pushDevError])
  const thumbProxyUrlCacheRef = useRef<Map<string, string>>(new Map())
  const dlog = useCallback(
    (...args: unknown[]) => {
      if (__DEV__) console.debug(...args)
    },
    [__DEV__]
  )

  const toThumbProxyUrl = useCallback((rawUrl: string): string => {
    const raw = typeof rawUrl === "string" ? rawUrl.trim() : ""
    if (!raw) return ""
    if (!raw.startsWith("http")) return raw
    const finalUrl = toIgDirectMediaUrl(raw) ?? raw
    const cached = thumbProxyUrlCacheRef.current.get(finalUrl)
    if (cached) return cached
    const proxy = `/api/ig/thumbnail?url=${encodeURIComponent(finalUrl)}`
    thumbProxyUrlCacheRef.current.set(finalUrl, proxy)
    return proxy
  }, [])

  useEffect(() => {
    if (!__DEV__) return
    try {
      if (typeof window === "undefined") return
      const host = window.location.host || ""
      const publicBase = (process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim()
      const isTunnel = host.includes("trycloudflare.com")
      const baseLooksLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(publicBase)
      if (isTunnel && baseLooksLocal) {
        dlog("[env] NEXT_PUBLIC_APP_BASE_URL looks local while running behind trycloudflare", {
          host,
          publicBase,
        })
      }
    } catch {
      // ignore
    }
  }, [__DEV__, dlog])

  useEffect(() => {
    console.log("[DEPLOY]", "c4885e6")
  }, [])

  const router = useRouter()
  const pathname = usePathname() || "/"
  const searchParams = useSearchParams()
  const r = searchParams?.get("r") || ""
  const { t } = useI18n()

  const safeT = (key: string) => {
    const v = t(key)
    return v === key ? "" : v
  }

  const isPro = false

  const getPostPermalink = (post: unknown): string => {
    if (!isRecord(post)) return ""
    return (
      (typeof post.permalink === "string" ? post.permalink : "") ||
      (typeof post.url === "string" ? post.url : "") ||
      (typeof post.link === "string" ? post.link : "") ||
      (typeof post.post_url === "string" ? post.post_url : "") ||
      ""
    )
  }

  const safeCopyToClipboard = async (text: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      try {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        ta.style.top = "-9999px"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      } catch {
        // ignore
      }
    }
  }

  /**
   * NOTE (Hard constraints)
   * - Only edit this file: app/results/page.tsx
   * - UI-only: DO NOT change fetch/state/sort/calculation logic for posts
   * - DO NOT modify i18n message files
   * - MUST be responsive (mobile) + avoid overflow for zh/en and numbers:
   *   use min-w-0, truncate, whitespace-nowrap, tabular-nums, max-w clamps.
   *
   * Goal:
   * - Sync "Free remaining X / 3" display with post-analysis page quota.
   * - We can't guarantee the exact storage key name here, so we read from a
   *   small set of candidate keys (fallback strategy). This keeps risk low.
   */

  const upgradeCardRef = useRef<HTMLDivElement | null>(null)
  const [upgradeCardInView, setUpgradeCardInView] = useState(false)

  useEffect(() => {
    const el = upgradeCardRef.current
    if (!el || upgradeCardInView) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setUpgradeCardInView(true)
          obs.disconnect()
        }
      },
      { threshold: 0.15 }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [upgradeCardInView])

  const [result, setResult] = useState<FakeAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [igMe, setIgMe] = useState<IgMeResponse | null>(null)
  const [igMeLoading, setIgMeLoading] = useState(true)
  const [igMeUnauthorized, setIgMeUnauthorized] = useState(false)
  const [dashSummary, setDashSummary] = useState<unknown>(null)
  const [dashSummaryLoading, setDashSummaryLoading] = useState<boolean>(true)
  const [dashSummaryEtag, setDashSummaryEtag] = useState<string | null>(null)
  const [connectEnvError, setConnectEnvError] = useState<"missing_env" | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [headerCopied, setHeaderCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeKpi, setActiveKpi] = useState<"authenticity" | "engagement" | "automation" | null>(null)
  const [activeNextId, setActiveNextId] = useState<"next-1" | "next-2" | "next-3" | null>(null)
  const [isProModalOpen, setIsProModalOpen] = useState(false)
  const [upgradeHighlight, setUpgradeHighlight] = useState(false)

  const [cardTasks, setCardTasks] = useState({
    profileBasics: false,
    pin3: false,
    pickOneTheme: false,

    hookOpen: false,
    cutDeadTime: false,
    endWithCTA: false,

    askAB: false,
    reply10: false,
    repeatFormat: false,
  })

  const totalTasks = 9
  const doneTasks =
    (cardTasks.profileBasics ? 1 : 0) +
    (cardTasks.pin3 ? 1 : 0) +
    (cardTasks.pickOneTheme ? 1 : 0) +
    (cardTasks.hookOpen ? 1 : 0) +
    (cardTasks.cutDeadTime ? 1 : 0) +
    (cardTasks.endWithCTA ? 1 : 0) +
    (cardTasks.askAB ? 1 : 0) +
    (cardTasks.reply10 ? 1 : 0) +
    (cardTasks.repeatFormat ? 1 : 0)

  const completionPct = Math.round((doneTasks / totalTasks) * 100)

  const isCardReady = completionPct >= 70

  const [mediaError, setMediaError] = useState<string | null>(null)

  const [media, setMedia] = useState<Array<ReturnType<typeof normalizeMedia>[number]>>([])
  const [mediaLoaded, setMediaLoaded] = useState(false)

  const [trendPoints, setTrendPoints] = useState<AccountTrendPoint[]>([])
  const [dailySnapshotTotals, setDailySnapshotTotals] = useState<{
    reach: number | null
    interactions: number | null
    engaged: number | null
    profileViews: number | null
    impressionsTotal: number | null
  } | null>(null)
  const [dailySnapshotData, setDailySnapshotData] = useState<unknown>(initialDailySnapshot ?? null)
  const [dailySnapshotAvailableDays, setDailySnapshotAvailableDays] = useState<number | null>(null)
  const [trendFetchStatus, setTrendFetchStatus] = useState<{ loading: boolean; error: string; lastDays: number | null }>({
    loading: false,
    error: "",
    lastDays: null,
  })
  const [selectedTrendRangeDays, setSelectedTrendRangeDays] = useState<90 | 60 | 30 | 14 | 7>(90)
  const [renderedTrendRangeDays, setRenderedTrendRangeDays] = useState<90 | 60 | 30 | 14 | 7>(90)
  const [isChangingRange, setIsChangingRange] = useState(false)
  const [showRangeOverlay, setShowRangeOverlay] = useState(false)
  const [rangeOverlayError, setRangeOverlayError] = useState(false)
  const [rangeChangeRequestId, setRangeChangeRequestId] = useState(0)
  
  // Refs for safety and cleanup
  const rangeChangeRequestIdRef = useRef(0)
  const rangeOverlayInFlightRef = useRef<{ requestId: number; days: 90 | 60 | 30 | 14 | 7 } | null>(null)
  const rangeOverlayErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rangeSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userScopeKeyRef = useRef<string>("session")
  const prefetchCleanupRef = useRef<(() => void) | null>(null)
  const isMountedRef = useRef(true)
  
  // Helper: clear range switch timeout
  const clearRangeSwitchTimeout = useCallback(() => {
    if (rangeSwitchTimeoutRef.current) {
      clearTimeout(rangeSwitchTimeoutRef.current)
      rangeSwitchTimeoutRef.current = null
    }
  }, [])

  const clearRangeOverlayErrorTimer = useCallback(() => {
    if (rangeOverlayErrorTimerRef.current) {
      clearTimeout(rangeOverlayErrorTimerRef.current)
      rangeOverlayErrorTimerRef.current = null
    }
  }, [])

  const failLatestRangeSwitch = useCallback(
    (days: 90 | 60 | 30 | 14 | 7) => {
      const inflight = rangeOverlayInFlightRef.current
      if (!inflight) return
      if (inflight.days !== days) return
      if (inflight.requestId !== rangeChangeRequestIdRef.current) return

      clearRangeSwitchTimeout()
      setShowRangeOverlay(false)
      setIsChangingRange(false)
      setRangeOverlayError(true)
      rangeOverlayInFlightRef.current = null

      clearRangeOverlayErrorTimer()
      rangeOverlayErrorTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return
        setRangeOverlayError(false)
      }, 2500)
    },
    [clearRangeOverlayErrorTimer, clearRangeSwitchTimeout],
  )
  
  // Helper: arm range switch timeout (safety net)
  const armRangeSwitchTimeout = useCallback((requestId: number) => {
    clearRangeSwitchTimeout()
    rangeSwitchTimeoutRef.current = setTimeout(() => {
      // Only clear loading for the latest request to avoid race conditions
      if (isMountedRef.current && requestId === rangeChangeRequestIdRef.current) {
        setIsChangingRange(false)
        setShowRangeOverlay(false)
      }
    }, 12000) // 12s safety timeout
  }, [clearRangeSwitchTimeout])
  
  const [trendFetchedAt, setTrendFetchedAt] = useState<number | null>(null)
  const [trendHasNewDay, setTrendHasNewDay] = useState(false)
  const [trendNeedsConnectHint, setTrendNeedsConnectHint] = useState(false)
  const [manualRefreshOverlay, setManualRefreshOverlay] = useState(false)
  const hasSeenTrendLoadingRef = useRef(false)
  const manualRefreshFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualRefreshOverlayRef = useRef(false)
  const trendLoadingRef = useRef(false)

  const scope = getIgScope()

  const LS_COMPARE_ENABLED = `results:trendCompareEnabled:${scope}`
  const LS_COMPARE_DAYS = `results:trendCompareDays:${scope}`
  const LS_COMPARE_OPACITY = `results:trendCompareOpacity:${scope}`

  const LS_COMPARE_ENABLED_LEGACY = "results:trendCompareEnabled"
  const LS_COMPARE_DAYS_LEGACY = "results:trendCompareDays"
  const LS_COMPARE_OPACITY_LEGACY = "results:trendCompareOpacity"

  const [compareEnabled, setCompareEnabled] = useState(() => {
    try {
      if (typeof window === "undefined") return false
      return (
        window.localStorage.getItem(LS_COMPARE_ENABLED) ??
        window.localStorage.getItem(LS_COMPARE_ENABLED_LEGACY)
      ) === "1"
    } catch {
      return false
    }
  })
  const [isCompareLoading, setIsCompareLoading] = useState(false)
  const [compareRangeDays, setCompareRangeDays] = useState<90 | 60 | 30 | 14 | 7>(() => {
    try {
      if (typeof window === "undefined") return 30
      const raw = Number(
        window.localStorage.getItem(LS_COMPARE_DAYS) ??
          window.localStorage.getItem(LS_COMPARE_DAYS_LEGACY),
      )
      if (raw === 90 || raw === 60 || raw === 30 || raw === 14 || raw === 7) return raw
      return 30
    } catch {
      return 30
    }
  })
  const [compareOpacity, setCompareOpacity] = useState<number>(() => {
    try {
      if (typeof window === "undefined") return 0.5
      const raw = Number(
        window.localStorage.getItem(LS_COMPARE_OPACITY) ??
          window.localStorage.getItem(LS_COMPARE_OPACITY_LEGACY) ??
          "0.5",
      )
      if (!Number.isFinite(raw)) return 0.5
      return Math.max(0.2, Math.min(0.9, raw))
    } catch {
      return 0.5
    }
  })
  const [comparePanelOpen, setComparePanelOpen] = useState(false)

  const trendCacheKey = useCallback((metric: "reach" | "followers", days: 90 | 60 | 30 | 14 | 7) => {
    return `${userScopeKeyRef.current}::${metric}:${days}`
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      clearRangeSwitchTimeout()
      clearRangeOverlayErrorTimer()
      if (manualRefreshFallbackTimerRef.current) {
        clearTimeout(manualRefreshFallbackTimerRef.current)
        manualRefreshFallbackTimerRef.current = null
      }
      if (prefetchCleanupRef.current) {
        prefetchCleanupRef.current()
        prefetchCleanupRef.current = null
      }
    }
  }, [clearRangeOverlayErrorTimer, clearRangeSwitchTimeout])

  const trendPointsByDaysRef = useRef(
    new Map<
      string,
      {
        points: AccountTrendPoint[]
        fetchedAt: number | null
        sig: string
      }
    >(),
  )
  const fetchedByDaysRef = useRef(new Map<90 | 60 | 30 | 14 | 7, boolean>())
  const inFlightTrendDaysRef = useRef<null | (90 | 60 | 30 | 14 | 7)>(null)
  const lastFetchAtByDaysRef = useRef(new Map<90 | 60 | 30 | 14 | 7, number>())
  const hasRestoredTrendFromCacheRef = useRef(false)
  const hasRestoredResultsCacheRef = useRef(false)
  const displayedTrendSigRef = useRef<string>("")

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      window.localStorage.setItem(LS_COMPARE_ENABLED, compareEnabled ? "1" : "0")
    } catch {
      // ignore
    }
  }, [LS_COMPARE_ENABLED, compareEnabled])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      window.localStorage.setItem(LS_COMPARE_DAYS, String(compareRangeDays))
    } catch {
      // ignore
    }
  }, [LS_COMPARE_DAYS, compareRangeDays])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      window.localStorage.setItem(LS_COMPARE_OPACITY, String(compareOpacity))
    } catch {
      // ignore
    }
  }, [LS_COMPARE_OPACITY, compareOpacity])

  const [followersDailyRows, setFollowersDailyRows] = useState<
    Array<{ day: string; followers_count: number }>
  >([])
  const [followersLastWriteAt, setFollowersLastWriteAt] = useState<string | null>(null)

  const trendPointsHashRef = useRef<string>("")
  const hashTrendPoints = useCallback((pts: AccountTrendPoint[]) => {
    const list = Array.isArray(pts) ? pts : []
    try {
      return JSON.stringify(
        list.map((p) => [
          typeof p?.ts === "number" && Number.isFinite(p.ts) ? p.ts : null,
          typeof p?.reach === "number" && Number.isFinite(p.reach) ? p.reach : 0,
          typeof p?.impressions === "number" && Number.isFinite(p.impressions) ? p.impressions : 0,
          typeof p?.interactions === "number" && Number.isFinite(p.interactions) ? p.interactions : 0,
          typeof p?.engaged === "number" && Number.isFinite(p.engaged) ? p.engaged : 0,
        ]),
      )
    } catch {
      return String(Date.now())
    }
  }, [])

  const trendSigFor = useCallback((days: 90 | 60 | 30 | 14 | 7, pts: AccountTrendPoint[]) => {
    const list = Array.isArray(pts) ? pts : []
    const len = list.length
    const firstTs = len > 0 && typeof list[0]?.ts === "number" && Number.isFinite(list[0].ts) ? (list[0].ts as number) : 0
    const lastTs = len > 0 && typeof list[len - 1]?.ts === "number" && Number.isFinite(list[len - 1].ts) ? (list[len - 1].ts as number) : 0

    let sumReach = 0
    let countReach = 0
    let sumImpr = 0
    let countImpr = 0
    let sumFollowers = 0
    let countFollowers = 0
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      const r = p?.reach
      if (typeof r === "number" && Number.isFinite(r)) {
        sumReach += r
        countReach += 1
      }
      const im = p?.impressions
      if (typeof im === "number" && Number.isFinite(im)) {
        sumImpr += im
        countImpr += 1
      }

      const f = p?.followerDelta
      if (typeof f === "number" && Number.isFinite(f)) {
        sumFollowers += f
        countFollowers += 1
      }
    }

    return `${days}|${len}|${firstTs}|${lastTs}|r:${Math.round(sumReach)}:${countReach}|i:${Math.round(sumImpr)}:${countImpr}|f:${Math.round(sumFollowers)}:${countFollowers}`
  }, [])

  const setTrendPointsDeduped = useCallback(
    (next: AccountTrendPoint[]) => {
      const pts = Array.isArray(next) ? next : []
      const h = hashTrendPoints(pts)
      if (h === trendPointsHashRef.current) return
      trendPointsHashRef.current = h
      setTrendPoints(pts)
    },
    [hashTrendPoints],
  )

  const applyTrendSeries = useCallback(
    ({
      days,
      points,
      fetchedAt,
    }: {
      days: 90 | 60 | 30 | 14 | 7
      points: AccountTrendPoint[]
      fetchedAt: number | null
    }) => {
      const pts = Array.isArray(points) ? points : ([] as AccountTrendPoint[])
      const sig = trendSigFor(days, pts)
      if (sig === displayedTrendSigRef.current) return

      setTrendPointsDeduped(pts)
      if (fetchedAt !== null) setTrendFetchedAt(fetchedAt)
      displayedTrendSigRef.current = sig

      // Only advance the rendered range when we actually commit the new series.
      setRenderedTrendRangeDays(days)

      // Range switching UX: only the latest in-flight request is allowed to clear the overlay.
      const inflight = rangeOverlayInFlightRef.current
      if (inflight && inflight.days === days && inflight.requestId === rangeChangeRequestIdRef.current) {
        clearRangeSwitchTimeout()
        setRangeOverlayError(false)
        setShowRangeOverlay(false)
        setIsChangingRange(false)
        rangeOverlayInFlightRef.current = null
      }
    },
    [clearRangeSwitchTimeout, setTrendPointsDeduped, setTrendFetchedAt, trendSigFor],
  )

  const applyCachedTrendSeriesDirect = useCallback(
    ({
      days,
      cached,
    }: {
      days: 90 | 60 | 30 | 14 | 7
      cached: { points: AccountTrendPoint[]; fetchedAt: number | null; sig: string }
    }) => {
      if (cached.sig === displayedTrendSigRef.current) return

      setTrendPoints(cached.points)
      if (cached.fetchedAt !== null) setTrendFetchedAt(cached.fetchedAt)
      displayedTrendSigRef.current = cached.sig

      // Cache hit: we can immediately render the requested range.
      setRenderedTrendRangeDays(days)

      // Range switching UX: only the latest in-flight request is allowed to clear the overlay.
      const inflight = rangeOverlayInFlightRef.current
      if (inflight && inflight.days === days && inflight.requestId === rangeChangeRequestIdRef.current) {
        clearRangeSwitchTimeout()
        setRangeOverlayError(false)
        setShowRangeOverlay(false)
        setIsChangingRange(false)
        rangeOverlayInFlightRef.current = null
      }
    },
    [clearRangeSwitchTimeout, setTrendPoints, setTrendFetchedAt],
  )

  const [hasCachedData, setHasCachedData] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateSlow, setUpdateSlow] = useState(false)
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [freePostRemaining, setFreePostRemaining] = useState<number>(2)
  const [freePostLimit, setFreePostLimit] = useState<number>(3)

  const [selectedGoal, setSelectedGoal] = useState<
    | null
    | "growthStageAccount"
    | "personalBrandBuilder"
    | "trafficFocusedCreator"
    | "highEngagementCommunity"
    | "serviceClientReady"
    | "brandCollaborationProfile"
    | "fullTimeCreator"
    | "monetizationFocusedAccount"
  >(null)

  type AccountTrendMetricKey = "reach" | "followers" | "interactions" | "impressions" | "engaged" | "followerDelta"
  const [selectedAccountTrendMetrics, setSelectedAccountTrendMetrics] = useState<AccountTrendMetricKey[]>([
    "reach",
    "interactions",
    "engaged",
    "followerDelta",
  ])
  const [focusedAccountTrendMetric, setFocusedAccountTrendMetric] = useState<AccountTrendMetricKey>("reach")
  const [hoveredAccountTrendIndex, setHoveredAccountTrendIndex] = useState<number | null>(null)

  const [latestReachForTile, setLatestReachForTile] = useState<number | null>(null)
  const [latestReachDayForTile, setLatestReachDayForTile] = useState<string | null>(null)

  const trendRangeSwitchStartRef = useRef<{ at: number; days: 90 | 60 | 30 | 14 | 7 } | null>(null)

  useEffect(() => {
    // Range switching can change series lengths; clear hover to avoid stale index reads.
    setHoveredAccountTrendIndex(null)
  }, [selectedTrendRangeDays])

  const hoverRafRef = useRef<number | null>(null)
  const lastHoverIdxRef = useRef<number | null>(null)

  const followersMetrics = useFollowersMetrics({
    focusedMetric: focusedAccountTrendMetric,
    followersDailyRows,
    followersLastWriteAt,
  })

  const {
    isFollowersFocused,
    seriesValues: followersSeriesValues,
    totalFollowers,
    deltaYesterday,
    growth7d,
    growth30d,
    deltasByIndex,
    lastDataDay,
  } = followersMetrics

  const committedStatValues = useMemo(() => {
    const pickFinite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

    const compute = (values: Array<number | null>) => {
      const finite = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      if (finite.length < 1) {
        return { latest: null as number | null, prev: null as number | null, start: null as number | null }
      }
      const latest = finite[finite.length - 1]
      const prev = finite.length >= 2 ? finite[finite.length - 2] : null
      const start = finite[0]
      return { latest, prev, start }
    }

    const reachSeriesCommitted: AccountTrendPoint[] = Array.isArray(trendPoints) ? trendPoints : ([] as AccountTrendPoint[])

    const reachBase = compute(
      reachSeriesCommitted.map((p) => {
        if (!isRecord(p)) return null
        return pickFinite((p as any).reach)
      }),
    )

    const followersBase = compute(
      (Array.isArray(followersSeriesValues) ? followersSeriesValues : []).map((v) => pickFinite(v)),
    )

    const deltaDay = (b: { latest: number | null; prev: number | null }) =>
      typeof b.latest === "number" && typeof b.prev === "number" ? b.latest - b.prev : null
    const deltaRange = (b: { latest: number | null; start: number | null }) =>
      typeof b.latest === "number" && typeof b.start === "number" ? b.latest - b.start : null

    return {
      reach: {
        latest: reachBase.latest,
        deltaDay: deltaDay(reachBase),
        deltaRange: deltaRange(reachBase),
      },
      followers: {
        latest: followersBase.latest,
        deltaDay: deltaDay(followersBase),
        deltaRange: deltaRange(followersBase),
      },
    }
  }, [followersSeriesValues, trendPoints])

  // UI state flags for loading skeleton and empty-state
  const hasCommittedTrend = Array.isArray(trendPoints) && trendPoints.length > 0
  const hasCommittedFollowers = Array.isArray(followersSeriesValues) && followersSeriesValues.length > 0
  const isMetricFollowers = focusedAccountTrendMetric === "followers"
  const hasCommittedSeriesForSelectedMetric = isMetricFollowers ? hasCommittedFollowers : hasCommittedTrend
  const isLoadingOverlay = Boolean(showRangeOverlay) || Boolean(isChangingRange) || Boolean(trendFetchStatus.loading) || Boolean(manualRefreshOverlay)
  const shouldShowEmptyState = !isLoadingOverlay && !hasCommittedSeriesForSelectedMetric

  useEffect(() => {
    manualRefreshOverlayRef.current = manualRefreshOverlay
  }, [manualRefreshOverlay])

  useEffect(() => {
    trendLoadingRef.current = trendFetchStatus.loading
  }, [trendFetchStatus.loading])

  useEffect(() => {
    if (!manualRefreshOverlay) return
    if (trendFetchStatus.loading) {
      hasSeenTrendLoadingRef.current = true
      return
    }

    if (hasSeenTrendLoadingRef.current) {
      setManualRefreshOverlay(false)
      if (manualRefreshFallbackTimerRef.current) {
        clearTimeout(manualRefreshFallbackTimerRef.current)
        manualRefreshFallbackTimerRef.current = null
      }
    }
  }, [manualRefreshOverlay, trendFetchStatus.loading])

  // Stable lengths for useEffect deps (avoid conditional/spread deps changing array size)
  const igRecentLen = isRecord(igMe) && Array.isArray(igMe.recent_media) ? igMe.recent_media.length : 0
  const mediaLen = Array.isArray(media) ? media.length : 0
  const effectiveRecentMedia = useMemo(() => {
    // ALWAYS prefer full media list from /api/instagram/media
    if (Array.isArray(media) && media.length > 0) {
      return media
    }

    // fallback only if media empty
    if (Array.isArray(igMe?.recent_media) && igMe.recent_media.length > 0) {
      return igMe.recent_media
    }

    return []
  }, [igMe, media])

  const effectiveRecentLen = Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia.length : 0
  const topPostsLen = effectiveRecentLen
  const formatCompact = (n?: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    try {
      return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    } catch {
      return String(Math.round(n))
    }
  }

  const compareSeriesReach = useMemo(() => {
    if (!compareEnabled) return null
    const cached = trendPointsByDaysRef.current.get(trendCacheKey("reach", compareRangeDays))
    if (!cached || !Array.isArray(cached.points) || cached.points.length < 1) return null
    return cached.points
  }, [compareEnabled, compareRangeDays, trendCacheKey])

  const compareSeriesFollowers = useMemo(() => {
    if (!compareEnabled) return null
    const cached = trendPointsByDaysRef.current.get(trendCacheKey("followers", compareRangeDays))
    if (!cached || !Array.isArray(cached.points) || cached.points.length < 1) return null
    return cached.points
  }, [compareEnabled, compareRangeDays, trendCacheKey])

  useEffect(() => {
    if (!Array.isArray(followersDailyRows) || followersDailyRows.length < 1) return

    const sorted = [...followersDailyRows]
      .filter((r) => typeof r?.day === "string" && typeof r?.followers_count === "number" && Number.isFinite(r.followers_count))
      .sort((a, b) => String(a.day).localeCompare(String(b.day)))

    if (sorted.length < 1) return

    const mkLabel = (day: string) => {
      const ts = Date.parse(`${day}T00:00:00.000Z`)
      if (!Number.isFinite(ts)) return String(day)
      const d = new Date(ts)
      try {
        return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(d)
      } catch {
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        return `${m}/${dd}`
      }
    }

    const allRanges = [90, 60, 30, 14, 7] as const
    for (const days of allRanges) {
      const slice = sorted.slice(Math.max(0, sorted.length - days))
      const points: AccountTrendPoint[] = slice
        .map((r) => {
          const day = String(r.day)
          const ts = Date.parse(`${day}T00:00:00.000Z`)
          if (!Number.isFinite(ts)) return null
          return { t: mkLabel(day), ts, followerDelta: r.followers_count }
        })
        .filter(Boolean) as AccountTrendPoint[]

      if (points.length < 1) continue
      const sig = trendSigFor(days, points)
      trendPointsByDaysRef.current.set(trendCacheKey("followers", days), { points, fetchedAt: null, sig })
    }
  }, [followersDailyRows, trendCacheKey, trendSigFor])

  const TrendHoverTooltip = memo(function TrendHoverTooltip({
    title,
    items,
  }: {
    title: string
    items: Array<{ label: string; color: string; value: string }>
  }) {
    return (
      <div
        className={
          "pointer-events-none absolute top-2 left-2 rounded-lg border border-white/10 bg-[#0b1220]/85 backdrop-blur px-3 py-2 shadow-xl max-w-[min(280px,70vw)]"
        }
      >
        <div className="text-[11px] text-white/70 tabular-nums whitespace-nowrap truncate min-w-0">{title}</div>
        <div className="mt-1 space-y-1">
          {items.map((it, i) => (
            <div key={`trend-tip-${i}`} className="flex items-center justify-between gap-3 text-[11px] text-white/80">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                <span className="truncate min-w-0">{it.label}</span>
              </div>
              <span className="tabular-nums whitespace-nowrap">{it.value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  })

  const updateHoveredTrendIndex = useCallback((nextIdx: number | null) => {
    if (nextIdx === lastHoverIdxRef.current) return
    lastHoverIdxRef.current = nextIdx
    setHoveredAccountTrendIndex(nextIdx)
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const m = trendRangeSwitchStartRef.current
    if (!m) return
    if (m.days !== selectedTrendRangeDays) return
    const start = m.at
    trendRangeSwitchStartRef.current = null
    requestAnimationFrame(() => {
      const ms = typeof performance !== "undefined" ? performance.now() - start : Date.now() - start
      console.debug("[trend][ui] range_switch_paint", { days: m.days, ms: Math.round(ms) })
    })
  }, [selectedTrendRangeDays])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    if (!compareEnabled) return
    const metric = focusedAccountTrendMetric === "followers" ? "followers" : "reach"
    const cachedOk = metric === "followers" ? Boolean(compareSeriesFollowers) : Boolean(compareSeriesReach)
    console.debug("[trend][ui] compare_cache", { metric, days: compareRangeDays, cached: cachedOk })
  }, [compareEnabled, compareRangeDays, compareSeriesFollowers, compareSeriesReach, focusedAccountTrendMetric])

  // Determine whether "recent_media" looks like real IG media (numeric id) — DEV logging only
  const recentFirstId = (() => {
    if (!isRecord(igMe) || !Array.isArray(igMe.recent_media) || igMe.recent_media.length === 0) return ""
    const first = igMe.recent_media[0]
    if (!isRecord(first)) return ""
    return String(first.id ?? "")
  })()
  const topPostsFirstId = recentFirstId
  const topPostsHasReal = igRecentLen > 0 && /^\d+$/.test(recentFirstId)

  const hasFetchedMediaRef = useRef(false)
  const hasFetchedMeRef = useRef(false)
  const lastMediaFetchTickRef = useRef<string | null>(null)
  const mediaReqIdRef = useRef(0)
  const hasSuccessfulMePayloadRef = useRef(false)
  const lastMeFetchTickRef = useRef<number | null>(null)
  const lastSnapshotRevalidateSeqRef = useRef<number>(0)
  const lastTrendRevalidateSeqRef = useRef<number>(0)
  const lastRevalidateAtRef = useRef(0)
  const lastDailySnapshotFetchAtRef = useRef(0)
  const hasFetchedDailySnapshotRef = useRef(false)
  const hasAppliedDailySnapshotTrendRef = useRef(false)
  const dailySnapshotAbortRef = useRef<AbortController | null>(null)
  const dailySnapshotRequestSeqRef = useRef(0)
  const lastDailySnapshotPointsSourceRef = useRef<string>("")
  const hasRestoredResultsScrollRef = useRef(false)
  const loggedMissingTopPostPreviewRef = useRef<Record<string, true>>({})
  const loggedEmptySnapshotTopPostsRef = useRef(false)
  const loggedMissingVideoThumbRef = useRef<Record<string, true>>({})
  const videoThumbDebugLogCountRef = useRef(0)
  const videoThumbDebugSuppressedRef = useRef(false)

  const isThumbDebugEnabled = useMemo(() => {
    try {
      if (typeof window === "undefined") return false
      const qs = new URLSearchParams(window.location.search)
      return qs.get("debugThumb") === "1" || window.localStorage.getItem("debugThumb") === "1"
    } catch {
      return false
    }
  }, [])

  const extractShortcodeFromUrl = (url: string): string => {
    const s = typeof url === "string" ? url.trim() : ""
    if (!s) return ""
    try {
      const u = new URL(s)
      const parts = u.pathname.split("/").filter(Boolean)
      if (parts.length >= 2 && (parts[0] === "p" || parts[0] === "reel")) {
        return String(parts[1] || "").trim()
      }
    } catch {
      // ignore
    }
    try {
      const m = /\/(p|reel)\/([^\/\?\#]+)/i.exec(s)
      return m && m[2] ? String(m[2]).trim() : ""
    } catch {
      return ""
    }
  }

  const deriveVideoThumbUrl = (permalinkRaw: string, shortcodeRaw: string, fallbackUrlRaw?: string): string => {
    const pl = typeof permalinkRaw === "string" ? permalinkRaw.trim() : ""
    if (pl && pl.startsWith("http")) {
      const base = pl.replace(/\/?$/, "/")
      return `${base}media/?size=l`
    }
    const sc = typeof shortcodeRaw === "string" ? shortcodeRaw.trim() : ""
    if (sc) return `https://www.instagram.com/p/${sc}/media/?size=l`
    const sc2 = extractShortcodeFromUrl(typeof fallbackUrlRaw === "string" ? fallbackUrlRaw : "")
    if (sc2) return `https://www.instagram.com/p/${sc2}/media/?size=l`
    return ""
  }

  const getStableVideoThumbLogKey = (input: { id?: unknown; permalink?: unknown; shortcode?: unknown }): string => {
    const idRaw = typeof input.id === "string" ? input.id : typeof input.id === "number" ? String(input.id) : ""
    const id = String(idRaw || "").trim()
    if (id) return id
    const pl = typeof input.permalink === "string" ? String(input.permalink).trim() : ""
    if (pl) return pl
    const sc = typeof input.shortcode === "string" ? String(input.shortcode).trim() : ""
    if (sc) return sc
    return ""
  }

  const maybeLogMissingVideoThumb = (payload: {
    stableKey: string
    idOrPermalink: string | null
    hasPermalink: boolean
    hasShortcode: boolean
  }) => {
    if (!isThumbDebugEnabled) return

    const key = payload.stableKey || "unknown"
    if (loggedMissingVideoThumbRef.current[key]) return
    loggedMissingVideoThumbRef.current[key] = true

    if (videoThumbDebugSuppressedRef.current) return
    if (videoThumbDebugLogCountRef.current >= 10) {
      videoThumbDebugSuppressedRef.current = true
      // eslint-disable-next-line no-console
      console.debug("[video thumb] further logs suppressed")
      return
    }

    videoThumbDebugLogCountRef.current += 1
    // eslint-disable-next-line no-console
    console.debug("[video thumb] missing after derived fallback", {
      idOrPermalink: payload.idOrPermalink,
      hasPermalink: payload.hasPermalink,
      hasShortcode: payload.hasShortcode,
    })
  }

  const [forceReloadTick, setForceReloadTick] = useState(0)

  const tick = forceReloadTick ?? 0

  const activeLocale = (extractLocaleFromPathname(pathname).locale ?? "en") as "zh-TW" | "en"
  const isZh = activeLocale === "zh-TW"

  const cookieConnected = useMemo(() => {
    try {
      return typeof document !== "undefined" && document.cookie.includes("ig_connected=1")
    } catch {
      return false
    }
  }, [])

  const normalizeTotalsFromInsightsDaily = useCallback(
    (insightsDaily: unknown[]): {
      reach: number | null
      interactions: number | null
      engaged: number | null
      profileViews: number | null
      impressionsTotal: number | null
    } | null => {
    const list = Array.isArray(insightsDaily) ? insightsDaily : []
    const pickMetric = (metricName: string): number | null => {
      const it = list.find((x) => {
        if (!isRecord(x)) return false
        return String(x.name || "").trim() === metricName
      })
      if (!isRecord(it)) return null
      const totalValue = isRecord(it.total_value) ? it.total_value : null
      const v = totalValue?.value
      const n = typeof v === "number" ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }
    const reach = pickMetric("reach")

    const interactions = pickMetric("total_interactions")
    const engaged = pickMetric("accounts_engaged")
    const profileViews = pickMetric("profile_views")
    const impressionsTotal = pickMetric("impressions_total")
    if (reach === null && interactions === null && engaged === null && profileViews === null && impressionsTotal === null) return null
    return { reach, interactions, engaged, profileViews, impressionsTotal }
  },
    [],
  )

  const igCacheId = String((isRecord(igMe) && isRecord(igMe.profile) ? (igMe.profile.id ?? igMe.profile.username) : isRecord(igMe) ? igMe.username : "me") || "me")
  const resultsCacheKey = `results_cache:${igCacheId}:7`

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = `results:scrollY:${scope}`
    const legacyKey = "results:scrollY"

    const save = () => {
      try {
        sessionStorage.setItem(key, String(Math.max(0, Math.floor(window.scrollY || 0))))
      } catch {
        // ignore
      }
    }

    window.addEventListener("beforeunload", save)
    window.addEventListener("pagehide", save)
    return () => {
      window.removeEventListener("beforeunload", save)
      window.removeEventListener("pagehide", save)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (hasRestoredResultsScrollRef.current) return
    const key = `results:scrollY:${scope}`
    const legacyKey = "results:scrollY"
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(key) ?? sessionStorage.getItem(legacyKey)
    } catch {
      raw = null
    }

    const saved = raw !== null ? Number(raw) : null
    if (saved === null || !Number.isFinite(saved) || saved < 1) return

    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
    const tryRestore = () => {
      if (hasRestoredResultsScrollRef.current) return
      const maxScroll = Math.max(0, (document.documentElement?.scrollHeight ?? 0) - window.innerHeight)
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()

      if (maxScroll >= saved - 2 || now - startedAt > 1200) {
        try {
          window.scrollTo({ top: saved, behavior: "auto" })
        } finally {
          hasRestoredResultsScrollRef.current = true
          try {
            sessionStorage.removeItem(key)
            sessionStorage.removeItem(legacyKey)
          } catch {
            // ignore
          }
        }
        return
      }
      window.requestAnimationFrame(tryRestore)
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(tryRestore)
    })
  }, [])

  useEffect(() => {
    if (hasRestoredResultsCacheRef.current) return

    const legacyKeySameLocale = `results_cache:${igCacheId}:7:${activeLocale}`
    const legacyKeyOtherLocale = `results_cache:${igCacheId}:7:${activeLocale === "zh-TW" ? "en" : "zh-TW"}`

    const cached =
      saReadResultsCache(resultsCacheKey) ??
      saReadResultsCache(legacyKeySameLocale) ??
      saReadResultsCache(legacyKeyOtherLocale)

    try {
      if (!cached) {
        setHasCachedData(false)
        return
      }

      setHasCachedData(true)
      if (cached.igMe) setIgMe(cached.igMe)
      if (Array.isArray(cached.media)) {
        setMedia(cached.media)
        if (cached.media.length > 0) setMediaLoaded(true)
      }
      if (Array.isArray(cached.trendPoints)) {
        if (!hasRestoredTrendFromCacheRef.current) {
          const cachedLen = cached.trendPoints.length
          const curLen = Array.isArray(trendPoints) ? trendPoints.length : 0
          if (cachedLen >= 1 || (curLen < 1 && !hasAppliedDailySnapshotTrendRef.current)) {
            applyTrendSeries({
              days: selectedTrendRangeDays,
              points: cached.trendPoints,
              fetchedAt: typeof cached.trendFetchedAt === "number" ? cached.trendFetchedAt : null,
            })
          }
          hasRestoredTrendFromCacheRef.current = true
        }
      }

      // Migrate legacy locale-specific cache to the locale-agnostic key.
      saWriteResultsCache(resultsCacheKey, cached)
    } finally {
      hasRestoredResultsCacheRef.current = true
    }
  }, [
    activeLocale,
    applyTrendSeries,
    igCacheId,
    resultsCacheKey,
    saReadResultsCache,
    saWriteResultsCache,
    selectedTrendRangeDays,
    trendPoints.length,
  ])

  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() || "")
    const hadTransient =
      params.has("connected") || params.has("sync") || params.has("next") || params.has("fromOAuth")
    if (!hadTransient) return

    // Once we have data (cache or loaded), drop transient params so they can't re-trigger gating.
    const hasDataNow = Boolean(
      igMe ||
        (Array.isArray(media) && media.length > 0) ||
        (Array.isArray(trendPoints) && trendPoints.length > 0)
    )
    if (!hasDataNow && igMeLoading) return

    params.delete("connected")
    params.delete("sync")
    params.delete("next")
    params.delete("fromOAuth")
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`)
  }, [igMe, igMeLoading, media, pathname, router, searchParams, trendPoints])

  useEffect(() => {
    if (!mediaLoaded && !igMe && trendPoints.length === 0) return

    const payload: ResultsCachePayloadV1 = {
      ts: Date.now(),
      igMe: igMe ?? null,
      media: Array.isArray(media) ? media : [],
      trendPoints: Array.isArray(trendPoints) ? trendPoints : [],
      trendFetchedAt: trendFetchedAt ?? null,
    }
    saWriteResultsCache(resultsCacheKey, payload)
  }, [resultsCacheKey, igMe, media, mediaLoaded, trendFetchedAt, trendPoints])

  const uiCopy = {
    avgLikesLabel: t("results.ui.avgLikesLabel"),
    avgCommentsLabel: t("results.ui.avgCommentsLabel"),
    perPostLast25: t("results.ui.perPostLast25"),
    topPostsSortHint: t("results.ui.topPostsSortHint"),
  }

  const safeFlexRow = "flex min-w-0 items-center gap-2"
  const safeText = "min-w-0 overflow-hidden"
  const clampTitleMobile = "min-w-0 overflow-hidden line-clamp-2"
  const clampBodyMobile = "min-w-0 overflow-hidden line-clamp-2 text-[11px] leading-snug"
  const numMono = "tabular-nums whitespace-nowrap"

  const CARD_SHELL = "rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm text-slate-100 overflow-hidden"
  const CARD_SHELL_HOVER =
    CARD_SHELL + " transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg"
  const CARD_HEADER_ROW =
    "border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 flex items-start sm:items-center justify-between gap-3 min-w-0"
  const HEADER_RIGHT = "text-[11px] sm:text-sm text-slate-400 min-w-0 overflow-hidden max-w-[45%] text-left sm:text-right"
  const HEADER_RIGHT_ZH = "min-w-0 truncate"
  const HEADER_RIGHT_EN = "hidden sm:block min-w-0 truncate"

  const igProfile = isRecord(igMe) && isRecord(igMe.profile) ? igMe.profile : (isRecord(igMe) ? igMe : null)
  const isConnected =
    cookieConnected ||
    Boolean(isRecord(igMe) && igMe.connected === true) ||
    Boolean(isRecord(igMe) && igMe.connected ? (isRecord(igProfile) ? igProfile.username : undefined) : (isRecord(igMe) ? igMe.username : undefined))
  const isConnectedInstagram = cookieConnected || Boolean(isRecord(igMe) && igMe.connected === true) || isConnected

  const creatorCardPreviewData = useCreatorCardPreviewData({ enabled: isConnectedInstagram })

  // Profile stats (UI-only)
  // Source of truth: DB (creator_stats). If DB stats missing, show placeholder.
  const followersCount = (() => {
    const db = typeof creatorCardPreviewData?.followers === "number" && Number.isFinite(creatorCardPreviewData.followers) ? creatorCardPreviewData.followers : undefined
    if (typeof db === "number" && Number.isFinite(db)) return db
    return undefined
  })()
  const followsCount = (() => {
    const db = typeof creatorCardPreviewData?.following === "number" && Number.isFinite(creatorCardPreviewData.following) ? creatorCardPreviewData.following : undefined
    if (typeof db === "number" && Number.isFinite(db)) return db
    return undefined
  })()
  const mediaCount = (() => {
    const db = typeof creatorCardPreviewData?.posts === "number" && Number.isFinite(creatorCardPreviewData.posts) ? creatorCardPreviewData.posts : undefined
    if (typeof db === "number" && Number.isFinite(db)) return db
    void mediaLoaded
    void media
    return undefined
  })()

  const hasTriggeredPrefetchRef = useRef(false)
  const prefetchInFlightDaysRef = useRef<Set<90 | 60 | 30 | 14 | 7>>(new Set())
  const triggerPrefetchCommonRanges = useCallback(() => {
    if (hasTriggeredPrefetchRef.current) return
    if (typeof window === "undefined" || !isConnectedInstagram) return

    const connection = (navigator as any).connection
    if (connection && connection.effectiveType && connection.effectiveType === "slow-2g") {
      return
    }

    hasTriggeredPrefetchRef.current = true

    const ranges: (90 | 60 | 30 | 14 | 7)[] = [7, 14, 30, 60, 90]
    const currentRange = selectedTrendRangeDays

    const scheduleFn = window.requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 500))
    scheduleFn(() => {
      for (const days of ranges) {
        if (!isMountedRef.current) return
        if (days === currentRange) continue
        if (trendPointsByDaysRef.current.has(trendCacheKey("reach", days))) continue
        if (fetchedByDaysRef.current.get(days)) continue
        if (prefetchInFlightDaysRef.current.has(days)) continue

        prefetchInFlightDaysRef.current.add(days)

        ;(async () => {
          try {
            const url = new URL(window.location.href)
            url.pathname = `/api/instagram/daily-snapshot`
            url.searchParams.set("days", String(days))

            const res = await fetch(url.toString(), {
              method: "POST",
              cache: "no-store",
              credentials: "include",
              headers: {
                Accept: "application/json",
              },
            })

            const ct = (res.headers.get("content-type") ?? "").toLowerCase()
            if (!res.ok || !ct.includes("application/json")) return
            const body = await res.json().catch(() => null)
            if (!body || body.ok !== true) return
          } catch {
            // ignore
          } finally {
            prefetchInFlightDaysRef.current.delete(days)
          }
        })()
      }
    })
  }, [isConnectedInstagram, selectedTrendRangeDays, trendCacheKey])

  const hasAnyResultsData = Boolean(effectiveRecentLen > 0 || trendPoints.length > 0 || igMe)

  const refetchTick = useRefetchTick({ enabled: isConnectedInstagram, throttleMs: 900 })

  const { refreshSeq, fireRefresh, refreshDebug } = useRefreshController({ throttleMs: 10_000, enableFocus: true, enableVisibility: true })

  const retryMediaFetch = useCallback(() => {
    setGateIsSlow(false)
    setLoadTimedOut(false)
    setLoadError(false)
    setMediaError(null)
    setShowMediaErrorDetails(false)
    hasFetchedMediaRef.current = false
    __resultsMediaFetchedOnce = false
    setMediaLoaded(false)
    fireRefresh("manual")
  }, [fireRefresh])

  const renderMediaErrorBanner = useCallback(() => {
    if (!mediaError) return null
    const raw = String(mediaError || "")
    const code = raw.split(":")[0]
    const title =
      code.startsWith("missing_cookie")
        ? "Not connected"
        : code === "upstream_timeout"
          ? "Instagram is slow"
          : "Failed to load"

    return (
      <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-white/85 leading-snug">{title}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowMediaErrorDetails((v) => !v)}
              className="text-[11px] font-semibold text-white/70 hover:text-white whitespace-nowrap"
            >
              {showMediaErrorDetails ? "Hide details" : "Details"}
            </button>
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 border-white/15 text-slate-200 hover:bg-white/5"
              onClick={retryMediaFetch}
            >
              {t("results.retry")}
            </Button>
          </div>
        </div>
        {showMediaErrorDetails ? (
          <div className="mt-2 text-[11px] text-white/55 leading-snug break-words">{raw}</div>
        ) : null}
      </div>
    )
  }, [mediaError, retryMediaFetch, showMediaErrorDetails, t])

  const { orchestratorDebug, mediaRevalidateSeq, trendRevalidateSeq, snapshotRevalidateSeq } = useResultsOrchestrator({
    isConnectedInstagram,
    refreshSeq,
    fetchMedia: async () => {},
    fetchTrend: async () => {},
    fetchSnapshot: async () => {},
    enableTrend: true,
    enableSnapshot: true,
  })

  useEffect(() => {
    if (!__DEV__) return
    if (mediaRevalidateSeq <= 0 && trendRevalidateSeq <= 0 && snapshotRevalidateSeq <= 0) return
    dlog("[orchestrator] revalidate_seq", {
      mediaRevalidateSeq,
      trendRevalidateSeq,
      snapshotRevalidateSeq,
    })
  }, [__DEV__, dlog, mediaRevalidateSeq, snapshotRevalidateSeq, trendRevalidateSeq])

  useEffect(() => {
    if (!cookieConnected) return
    setIgMe((prev) => {
      if (isRecord(prev) && prev.connected === true) return prev
      return { ...(isRecord(prev) ? prev : {}), connected: true }
    })
  }, [cookieConnected])

  useEffect(() => {
    if (!isConnectedInstagram) return
    // Keep existing behavior but avoid request spam by guarding the actual fetch effects.
    setForceReloadTick((x) => x + 1)
  }, [isConnectedInstagram, refetchTick])

  const formatDateTW = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
  const formatTimeTW = (ms: number) => new Date(ms).toLocaleString("zh-TW", { hour12: false })

  const normalizeDailyInsightsToTrendPoints = useCallback((insightsDaily: unknown[]): AccountTrendPoint[] => {
    const toNum = (v: unknown) => {
      const n = typeof v === "number" ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }

    const fmtLabel = (ts: number) => {
      try {
        return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(ts))
      } catch {
        const d = new Date(ts)
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        return `${m}/${dd}`
      }
    }

    const startOfDayMs = (ms: number) => {
      const d = new Date(ms)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }

    const byDay = new Map<number, AccountTrendPoint>()
    const ensure = (ts: number) => {
      const key = startOfDayMs(ts)
      const ex = byDay.get(key)
      if (ex) return ex
      const init: AccountTrendPoint = { t: fmtLabel(key), ts: key }
      byDay.set(key, init)
      return init
    }

    const list = Array.isArray(insightsDaily) ? insightsDaily : []
    for (const item of list) {
      if (!isRecord(item)) continue
      const name = String(item.name || "").trim()
      const values = Array.isArray(item.values) ? item.values : []
      for (const v of values) {
        if (!isRecord(v)) continue
        const endTime = typeof v.end_time === "string" ? v.end_time : ""
        const ms = endTime ? Date.parse(endTime) : NaN
        if (!Number.isFinite(ms)) continue
        const p = ensure(ms)
        const num = toNum(v?.value)
        if (name === "reach") p.reach = num === null ? undefined : num
        else if (name === "total_interactions") p.interactions = num === null ? undefined : num
        else if (name === "accounts_engaged") p.engaged = num === null ? undefined : num
      }
    }

    const out = Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, p]) => p)
    return out
  }, [])

  // Extracted to app/results/lib/mergeToContinuousTrendPoints.ts

  const supabaseBrowser = useMemo(() => {
    try {
      const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
      const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()
      if (!url || !anon) return null
      return createClient(url, anon, { auth: { persistSession: false } })
    } catch {
      return null
    }
  }, [])

  function coerceDailySnapshotPointsToArray(points: unknown): unknown[] {
    if (Array.isArray(points)) return points
    if (!points || typeof points !== "object") return []

    const parseKeyMs = (k: string): number | null => {
      const key = String(k || "").trim()
      if (!key) return null

      if (/^\d+$/.test(key)) {
        const n = Number(key)
        if (!Number.isFinite(n)) return null
        // 10-digit seconds or 13-digit ms
        if (n > 1e12) return n
        if (n > 1e9) return n * 1000
        return null
      }

      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        const ms = Date.parse(`${key}T00:00:00.000Z`)
        return Number.isFinite(ms) ? ms : null
      }

      const ms = Date.parse(key)
      return Number.isFinite(ms) ? ms : null
    }

    const parseValueMs = (v: unknown): number | null => {
      if (!isRecord(v)) return null
      if (typeof v.ts === "number" && Number.isFinite(v.ts)) return v.ts
      const dateRaw =
        (typeof v.timestamp === "string" ? v.timestamp : null) ??
        (typeof v.date === "string" ? v.date : null) ??
        (typeof v.day === "string" ? v.day : null)
      if (!dateRaw) return null
      const ms = Date.parse(String(dateRaw))
      return Number.isFinite(ms) ? ms : null
    }

    const looksLikePoint = (v: unknown): boolean => {
      if (!isRecord(v)) return false
      const hasTime =
        (typeof v.date === "string" && v.date.trim()) ||
        (typeof v.day === "string" && v.day.trim()) ||
        (typeof v.timestamp === "string" && v.timestamp.trim()) ||
        (typeof v.ts === "number" && Number.isFinite(v.ts))

      const hasMetric =
        v.reach !== undefined ||
        v.impressions !== undefined ||
        v.interactions !== undefined ||
        v.total_interactions !== undefined ||
        v.engaged_accounts !== undefined ||
        v.accounts_engaged !== undefined

      return Boolean(hasTime || hasMetric)
    }

    const entries = Object.entries(points as Record<string, unknown>).filter(([, v]) => looksLikePoint(v))
    if (entries.length < 1) return []

    const keyMsList = entries.map(([k]) => parseKeyMs(k))
    const keyMsOk = keyMsList.filter((x) => typeof x === "number").length
    const useKeyOrder = keyMsOk >= Math.max(2, Math.ceil(entries.length * 0.6))

    const sorted = entries
      .map(([k, v], i) => ({ k, v, i, keyMs: parseKeyMs(k), valMs: parseValueMs(v) }))
      .sort((a, b) => {
        const ams = useKeyOrder ? a.keyMs : a.valMs
        const bms = useKeyOrder ? b.keyMs : b.valMs
        if (typeof ams === "number" && typeof bms === "number") return ams - bms
        if (typeof ams === "number") return -1
        if (typeof bms === "number") return 1
        return a.i - b.i
      })

    return sorted.map((x) => x.v)
  }

  const normalizeDailySnapshotPointsToTrendPoints = useCallback((pointsRaw: unknown[]): AccountTrendPoint[] => {
    const toNum = (v: unknown) => {
      const n = typeof v === "number" ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }

    const fmtLabel = (ts: number) => {
      try {
        return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(ts))
      } catch {
        const d = new Date(ts)
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        return `${m}/${dd}`
      }
    }

    const list = Array.isArray(pointsRaw) ? pointsRaw : []
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const out: AccountTrendPoint[] = []

    for (let idx = 0; idx < list.length; idx++) {
      const it = list[idx]
      if (!isRecord(it)) continue
      const dateRaw =
        (typeof it.date === "string" ? it.date : null) ??
        (typeof it.day === "string" ? it.day : null) ??
        (typeof it.t === "string" ? it.t : null)

      const ts = (() => {
        if (typeof it?.ts === "number" && Number.isFinite(it.ts)) return it.ts
        if (typeof it?.timestamp === "string") {
          const ms = Date.parse(it.timestamp)
          if (Number.isFinite(ms)) return ms
        }
        if (dateRaw) {
          const ms = Date.parse(String(dateRaw))
          if (Number.isFinite(ms)) return ms
        }
        return now - (list.length - 1 - idx) * dayMs
      })()

      const reach = toNum(it.reach)
      const impressions = toNum(it.impressions)
      const interactions = toNum(it.interactions) ?? toNum(it.total_interactions)
      const engaged = toNum(it.engaged_accounts) ?? toNum(it.accounts_engaged)

      const p: AccountTrendPoint = {
        t: fmtLabel(ts),
        ts,
        reach: typeof reach === "number" ? reach : undefined,
        impressions: typeof impressions === "number" ? impressions : undefined,
        interactions: typeof interactions === "number" ? interactions : undefined,
        engaged: typeof engaged === "number" ? engaged : undefined,
      }
      out.push(p)
    }

    return out
  }, [])

  useEffect(() => {
    if (!isConnectedInstagram) {
      setTrendNeedsConnectHint(false)
      return
    }

    const cooldownMs = 90_000
    const now = Date.now()
    const daysForRequest = selectedTrendRangeDays

    const isRangeSwitching =
      Boolean(isChangingRange) ||
      Boolean(rangeOverlayInFlightRef.current && rangeOverlayInFlightRef.current.days === daysForRequest)

    const shouldStartTrendFetch = (d: 90 | 60 | 30 | 14 | 7, t: number) => {
      if (inFlightTrendDaysRef.current === d) return false
      const lastAt = lastFetchAtByDaysRef.current.get(d) ?? 0
      if (!isRangeSwitching && t - lastAt < cooldownMs) return false
      if (!isRangeSwitching && fetchedByDaysRef.current.get(d) === true) return false
      return true
    }

    if (process.env.NODE_ENV !== "production" && isRangeSwitching) {
      const lastAt = lastFetchAtByDaysRef.current.get(daysForRequest) ?? 0
      const isCooldown = now - lastAt < cooldownMs
      const isFetched = fetchedByDaysRef.current.get(daysForRequest) === true
      if (isCooldown || isFetched) {
        console.debug("[trend][fetch] bypass_gate_for_switch", { days: daysForRequest, isCooldown, isFetched })
      }
    }

    if (!shouldStartTrendFetch(daysForRequest, now)) return

    // Mutations only after we are sure we are starting a request.
    inFlightTrendDaysRef.current = daysForRequest
    lastFetchAtByDaysRef.current.set(daysForRequest, now)

    setTrendFetchStatus({ loading: true, error: "", lastDays: daysForRequest })
    setTrendNeedsConnectHint(false)
    lastDailySnapshotPointsSourceRef.current = ""

    const nextReqId = (dailySnapshotRequestSeqRef.current += 1)
    if (dailySnapshotAbortRef.current) {
      try {
        if (__DEV__) console.debug("[daily-snapshot] abort: replaced_by_new_request", { reqId: nextReqId })
        dailySnapshotAbortRef.current.abort()
      } catch {
        // ignore
      }
    }
    const ac = new AbortController()
    dailySnapshotAbortRef.current = ac

    ;(async () => {
      try {
        const igReq = fetch(`/api/instagram/daily-snapshot?days=${daysForRequest}`, {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
          signal: ac.signal,
        })

        const igRes = await igReq

        if (dailySnapshotRequestSeqRef.current !== nextReqId) return
        if (selectedTrendRangeDays !== daysForRequest) return

        if (igRes.status === 401 || igRes.status === 403) {
          setTrendNeedsConnectHint(true)
          setTrendFetchStatus({ loading: false, error: "", lastDays: daysForRequest })
          failLatestRangeSwitch(daysForRequest)
          return
        }

        const ct = (igRes.headers.get("content-type") ?? "").toLowerCase()
        if (!ct.includes("application/json")) {
          throw new Error(`daily_snapshot_non_json status=${igRes.status} url=/api/instagram/daily-snapshot?days=${daysForRequest}`)
        }

        const json7 = await igRes.json().catch(() => null)
        if (dailySnapshotRequestSeqRef.current !== nextReqId) return
        if (selectedTrendRangeDays !== daysForRequest) return
        if (!igRes.ok || !json7?.ok) {
          setDailySnapshotData(null)
          setTrendFetchStatus({ loading: false, error: "", lastDays: daysForRequest })
          failLatestRangeSwitch(daysForRequest)
          return
        }

        setDailySnapshotData(json7)

        const availableDaysFromApi = typeof json7?.available_days === "number" && Number.isFinite(json7.available_days) ? (json7.available_days as number) : null
        if (availableDaysFromApi !== null) setDailySnapshotAvailableDays(availableDaysFromApi)

        const pointsSource = typeof json7?.points_source === "string" ? json7.points_source : ""
        lastDailySnapshotPointsSourceRef.current = pointsSource

        if (pointsSource === "empty") {
          setTrendFetchStatus({ loading: false, error: "", lastDays: daysForRequest })
          failLatestRangeSwitch(daysForRequest)
          return
        }

        const totalsRaw = Array.isArray(json7?.insights_daily) ? json7.insights_daily : []
        setDailySnapshotTotals(normalizeTotalsFromInsightsDaily(totalsRaw))
        const merged = mergeToContinuousTrendPoints({
          days: daysForRequest,
          baseDbRowsRaw: [],
          overridePointsRaw: json7?.points,
        })

        if (merged.length >= 1) {
          if (dailySnapshotRequestSeqRef.current !== nextReqId) return
          if (selectedTrendRangeDays !== daysForRequest) return
          const sig = trendSigFor(daysForRequest, merged)
          const fetchedAt = Date.now()
          hasAppliedDailySnapshotTrendRef.current = true
          trendPointsByDaysRef.current.set(trendCacheKey("reach", daysForRequest), { points: merged, fetchedAt, sig })
          fetchedByDaysRef.current.set(daysForRequest, true)
          applyTrendSeries({ days: daysForRequest, points: merged, fetchedAt })
        }

        setTrendFetchStatus({ loading: false, error: "", lastDays: daysForRequest })
      } catch (e: unknown) {
        if (!(isRecord(e) && e.name === "AbortError")) {
          if (__DEV__) {
            console.debug("[daily-snapshot] fetch_failed", {
              message: isRecord(e) && typeof e.message === "string" ? e.message : String(e),
              days: daysForRequest,
              reqId: nextReqId,
            })
          }
          setDailySnapshotData(null)
          setTrendFetchStatus({ loading: false, error: "", lastDays: daysForRequest })
          failLatestRangeSwitch(daysForRequest)
        }
      } finally {
        if (inFlightTrendDaysRef.current === daysForRequest) inFlightTrendDaysRef.current = null
      }
    })()

    return () => {
      // Do not abort here. React effect cleanup can run due to unrelated state/dep changes
      // and would prematurely cancel an in-flight request. Abort is handled only when a
      // new request starts (above) or on component unmount (separate effect).
    }
  }, [
    isConnectedInstagram,
    mergeToContinuousTrendPoints,
    normalizeTotalsFromInsightsDaily,
    selectedTrendRangeDays,
    applyTrendSeries,
    trendSigFor,
  ])

  useEffect(() => {
    return () => {
      if (dailySnapshotAbortRef.current) {
        try {
          if (__DEV__) console.debug("[daily-snapshot] abort: unmount")
          dailySnapshotAbortRef.current.abort()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  const allAccountTrend = useMemo<AccountTrendPoint[]>(() => {
    const isRec = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object")
    const toNum = (v: unknown) => {
      const n = typeof v === "number" ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }

    const fmtLabel = (ts: number) => {
      try {
        return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(ts))
      } catch {
        const d = new Date(ts)
        const m = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        return `${m}/${dd}`
      }
    }

    const getPath = (obj: unknown, path: string): unknown => {
      if (!isRec(obj)) return undefined
      const parts = path.split(".").filter(Boolean)
      let cur: unknown = obj
      for (const p of parts) {
        if (!isRec(cur)) return undefined
        cur = (cur as Record<string, unknown>)[p]
      }
      return cur
    }

    if (Array.isArray(trendPoints) && trendPoints.length >= 1) {
      return trendPoints
    }

    const candidates: unknown[] = [
      getPath(result, "account_timeline"),
      getPath(result, "accountTimeline"),
      getPath(result, "insights_daily"),
      getPath(result, "insightsDaily"),
      getPath(result, "insights.daily"),
      getPath(result, "timeseries.daily"),
      getPath(igMe, "account_timeline"),
      getPath(igMe, "accountTimeline"),
      getPath(igMe, "insights_daily"),
      getPath(igMe, "insightsDaily"),
      getPath(igMe, "insights.daily"),
      getPath(igMe, "timeseries.daily"),
      getPath(igProfile, "insights.daily"),
    ]

    const raw = candidates.find((c) => Array.isArray(c))
    const arr = Array.isArray(raw) ? raw : null
    if (!arr || arr.length < 1) {
      return __DEV__ ? MOCK_ACCOUNT_TREND_7D : []
    }

    const points: Array<{ ts: number | null; p: AccountTrendPoint }> = arr
      .map((it: unknown, idx: number) => {
        if (!isRec(it)) return null

        const dateRaw =
          (typeof it.t === "string" ? it.t : null) ??
          (typeof it.date === "string" ? it.date : null) ??
          (typeof it.day === "string" ? it.day : null) ??
          (typeof it.timestamp === "string" ? it.timestamp : null) ??
          (typeof it.ts === "string" ? it.ts : null)

        const ts = (() => {
          if (!dateRaw) {
            const n = toNum((it as Record<string, unknown>).ts)
            if (typeof n === "number") return n
            return null
          }
          const ms = Date.parse(String(dateRaw))
          return Number.isFinite(ms) ? ms : null
        })()

        const label = ts !== null ? fmtLabel(ts) : String(idx + 1)

        const reach = toNum((it as Record<string, unknown>).reach) ??
          toNum((it as Record<string, unknown>).accounts_reached) ??
          toNum((it as Record<string, unknown>).reachTotal) ??
          null

        const impressions = toNum((it as Record<string, unknown>).impressions) ??
          toNum((it as Record<string, unknown>).views) ??
          toNum((it as Record<string, unknown>).impressionsTotal) ??
          null

        const interactions = toNum((it as Record<string, unknown>).interactions) ??
          toNum((it as Record<string, unknown>).total_interactions) ??
          toNum((it as Record<string, unknown>).totalInteractions) ??
          null

        const engaged = toNum((it as Record<string, unknown>).engaged) ??
          toNum((it as Record<string, unknown>).engaged_accounts) ??
          toNum((it as Record<string, unknown>).accounts_engaged) ??
          toNum((it as Record<string, unknown>).engagedAccounts) ??
          null

        const followerDelta = toNum((it as Record<string, unknown>).followerDelta) ??
          toNum((it as Record<string, unknown>).followers_delta) ??
          toNum((it as Record<string, unknown>).followersDelta) ??
          toNum((it as Record<string, unknown>).delta_followers) ??
          null

        const p: AccountTrendPoint = {
          t: label,
          reach: typeof reach === "number" ? reach : undefined,
          impressions: typeof impressions === "number" ? impressions : undefined,
          interactions: typeof interactions === "number" ? interactions : undefined,
          engaged: typeof engaged === "number" ? engaged : undefined,
          followerDelta: typeof followerDelta === "number" ? followerDelta : undefined,
        }

        return { ts, p }
      })
      .filter(Boolean) as Array<{ ts: number | null; p: AccountTrendPoint }>

    const sorted = [...points].sort((a, b) => {
      if (a.ts === null && b.ts === null) return 0
      if (a.ts === null) return 1
      if (b.ts === null) return -1
      return a.ts - b.ts
    })

    const all = sorted.map((x) => x.p)
    return all.length >= 1 ? all : (__DEV__ ? MOCK_ACCOUNT_TREND_7D : [])
  }, [__DEV__, igMe, igProfile, result, trendPoints])

  const accountTrend = useMemo<AccountTrendPoint[]>(() => {
    const data = allAccountTrend
    if (!data.length) return []
    return data.slice(-7)
  }, [allAccountTrend])

  const hasFallback =
    (Array.isArray(trendPoints) && trendPoints.length > 0) ||
    (Array.isArray(accountTrend) && accountTrend.length > 0)
  const shouldShowEmptySeriesHint =
    lastDailySnapshotPointsSourceRef.current === "empty" &&
    !hasFallback &&
    !(
      focusedAccountTrendMetric === "followers" &&
      followersDailyRows.length >= 1
    )

  const trendMeta = useMemo(() => {
    if (!trendPoints || trendPoints.length === 0) return null
    const first = trendPoints[0]
    const last = trendPoints[trendPoints.length - 1]
    const firstTs = typeof first?.ts === "number" && Number.isFinite(first.ts) ? first.ts : null
    const lastTs = typeof last?.ts === "number" && Number.isFinite(last.ts) ? last.ts : null
    if (firstTs === null || lastTs === null) return null

    const firstDate = new Date(firstTs)
    const lastDate = new Date(lastTs)
    if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastDate.getTime())) return null

    const endKey = `${lastDate.getFullYear()}-${lastDate.getMonth() + 1}-${lastDate.getDate()}`
    const today = new Date()
    const isToday =
      lastDate.getFullYear() === today.getFullYear() &&
      lastDate.getMonth() === today.getMonth() &&
      lastDate.getDate() === today.getDate()

    return {
      startLabel: formatDateTW(firstDate),
      endLabel: formatDateTW(lastDate),
      endKey,
      isToday,
    }
  }, [trendPoints])

  useEffect(() => {
    if (!trendMeta?.endKey) return
    try {
      const key = "ig_analyzer:last_trend_end_key"
      const prev = localStorage.getItem(key)
      if (prev && prev !== trendMeta.endKey) {
        setTrendHasNewDay(true)
      } else {
        setTrendHasNewDay(false)
      }
      localStorage.setItem(key, trendMeta.endKey)
    } catch {
      // ignore
    }
  }, [trendMeta?.endKey])

  const hasConnectedFlag = isRecord(igMe) && igMe.connected === true
  const hasRealProfile = Boolean(isConnected)
  const allowDemoProfile = !hasConnectedFlag && !hasRealProfile && !igMeLoading

  const recentPosts = effectiveRecentMedia

  const snapshotTopPosts = useMemo(() => {
    if (!isRecord(dailySnapshotData)) return [] as unknown[]

    const candidates = ["top_posts", "topPosts", "top_performing_posts", "topPerformingPosts"]
    for (const k of candidates) {
      const v = dailySnapshotData[k]
      if (Array.isArray(v) && v.length > 0) return v
    }

    if (__DEV__ && !loggedEmptySnapshotTopPostsRef.current) {
      loggedEmptySnapshotTopPostsRef.current = true
      try {
        // eslint-disable-next-line no-console
        console.debug("[daily-snapshot] snapshotTopPosts empty", {
          keys: Object.keys(dailySnapshotData).slice(0, 80),
        })
      } catch {
        // ignore
      }
    }

    return [] as unknown[]
  }, [dailySnapshotData])

  const needsDataRefetch = useMemo(() => {
    const hasProfile = Boolean(igProfile && (igProfile.username))
    const hasMedia = Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0
    const hasTopPosts = Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0
    return !hasProfile || !hasMedia || !hasTopPosts
  }, [effectiveRecentLen, effectiveRecentMedia, igProfile])

  useEffect(() => {
    if (!isConnected) return
    if (!needsDataRefetch) return
    if (mediaLen > 0 || hasFetchedMediaRef.current || __resultsMediaFetchedOnce) return

    const now = Date.now()
    if (now - lastRevalidateAtRef.current < 2500) return
    lastRevalidateAtRef.current = now

    setForceReloadTick((x) => x + 1)
  }, [isConnected, mediaLen, needsDataRefetch, pathname, router])

  // focus/visibility handling is centralized in useRefreshController + useResultsOrchestrator

  // -------------------------------------------------
  // DEV-ONLY: Verify Top Posts data source decision
  // (Do NOT change logic; only log which branch is being used)
  // -------------------------------------------------
  useEffect(() => {
    const source = topPostsHasReal ? "topPosts(from /api/instagram/media)" : "igMe.recent_media(fallback)"
    dlog(
      "[top-posts] source:",
      source,
      "| topPosts.length:",
      topPostsLen,
      "| igMe.recent_media.length:",
      igRecentLen,
      "| mediaLength:",
      mediaLen,
      "| isConnected:",
      isConnected,
      "| isConnectedInstagram:",
      isConnectedInstagram,
    )
  }, [__DEV__, dlog, isConnected, isConnectedInstagram, topPostsLen, igRecentLen, mediaLen, topPostsHasReal])

  useEffect(() => {
    // Allow refetch when media is still empty but the refresh tick changes (e.g. after OAuth sets cookies).
    if (mediaLen > 0) {
      hasFetchedMediaRef.current = true
      __resultsMediaFetchedOnce = true
      return
    }

    const nextKey = `${String(forceReloadTick)}:${String(mediaRevalidateSeq)}`
    if (lastMediaFetchTickRef.current === nextKey) return
    lastMediaFetchTickRef.current = nextKey

    let cancelled = false
    mediaReqIdRef.current += 1
    const reqId = mediaReqIdRef.current

    dlog("[media] fetch (from ConnectedGate)")
    fetch("/api/instagram/media", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        let body: unknown = null
        try {
          body = await res.json()
        } catch {
          body = null
        }

        if (!res.ok) {
          throw { status: res.status, body }
        }

        return body
      })
      .then((json) => {
        if (cancelled) return
        if (reqId !== mediaReqIdRef.current) return

        setMediaError(null)

        // Accept both shapes:
        // - { data: [...] }
        // - [...] (raw array)
        const rawMedia = isRecord(json) && Array.isArray(json.data)
          ? json.data
          : Array.isArray(json)
            ? json
            : []

        const items = normalizeMedia(rawMedia)

        dlog("[media] response received:", {
          hasDataArray: isRecord(json) && Array.isArray(json.data),
          dataLength: isRecord(json) && Array.isArray(json.data) ? json.data.length : Array.isArray(json) ? json.length : 0,
          hasPaging: isRecord(json) && !!json.paging,
          normalizedLen: items.length,
        })

        if (__DEBUG_RESULTS__) {
          try {
            const dataArr = Array.isArray(rawMedia) ? rawMedia : []
            const first = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr[0] : null
            const firstKeys = isRecord(first) ? Object.keys(first).slice(0, 50) : []
            const byType: Record<string, number> = {}
            for (const it of Array.isArray(dataArr) ? dataArr : []) {
              if (!isRecord(it)) continue
              const mt = String(it.media_type ?? it.mediaType ?? "") || "(unknown)"
              byType[mt] = (byType[mt] ?? 0) + 1
            }

            const previewHost = (() => {
              if (!first) return ""
              const mt = String(first?.media_type ?? first?.mediaType ?? "")
              const mu = String(first?.media_url ?? first?.mediaUrl ?? "")
              const tu = String(first?.thumbnail_url ?? first?.thumbnailUrl ?? "")
              const isV = mt === "VIDEO" || mt === "REELS"
              const preview = isV ? (tu || "") : (mu || tu || "")
              if (!preview) return ""
              const noQs = preview.split("?")[0]
              try {
                return new URL(noQs).hostname
              } catch {
                return ""
              }
            })()

            // eslint-disable-next-line no-console
            console.debug("[DEBUG_RESULTS] /api/instagram/media", {
              hasData: Array.isArray(dataArr),
              dataLen: Array.isArray(dataArr) ? dataArr.length : 0,
              firstKeys,
              previewHost,
              byType,
            })
          } catch {
            // ignore
          }
        }

        setMedia((prev) => {
          if (Array.isArray(prev) && prev.length > 0 && items.length === 0) return prev
          return items
        })

        setIgMe((prev) => {
          if (prev && isRecord(prev) && Array.isArray(prev.recent_media) && prev.recent_media.length > 0 && items.length === 0) return prev
          return { ...(prev ?? {}), recent_media: items } as IgMeResponse
        })

        setMediaLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        if (reqId !== mediaReqIdRef.current) return

        const status = isRecord(err) ? err.status : undefined
        const body = isRecord(err) ? err.body : undefined

        const bodyError = isRecord(body) && typeof body.error === "string" ? body.error : ""
        const isExpectedAuthFailure =
          status === 401 ||
          (status === 403 && (bodyError.startsWith("missing_cookie") || bodyError.startsWith("missing_token")))
        if (isExpectedAuthFailure) {
          // UI-only: unauthenticated visitors can still view demo content.
          // Do not show an error banner for expected auth failures.
          setMediaLoaded(true)
          return
        }

        const reason = bodyError ? bodyError : `http_${typeof status === "number" ? status : 0}`
        const detail = isRecord(body) && typeof body.detail === "string" && body.detail ? `: ${body.detail}` : ""
        setMediaError(`${reason}${detail}`)

        if (__DEV__) {
          const reason = bodyError || null
          const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : null
          dlog("[media] fetch failed", { status, reason, detail })
        }

        setLoadError(true)

        // Avoid infinite loading when fetch fails.
        setMediaLoaded(true)
      })

    return () => {
      cancelled = true
      // Do not reset hasFetchedMediaRef here; cleanup can run during dev re-renders.
    }
  }, [forceReloadTick, mediaLen, mediaRevalidateSeq])

  // focus handling is centralized in useRefreshController

  // -------------------------------------------------
  // DEV-ONLY: Observe media state length after normalize + setMedia
  // (No logic changes; helps confirm we actually stored media data)
  // -------------------------------------------------
  useEffect(() => {
    dlog("[media] state:", { mediaLoaded, mediaLength: mediaLen })
  }, [__DEV__, dlog, mediaLoaded, mediaLen])

  useEffect(() => {
    // Dev-only: do not rely on any `topPosts` variable existing in this file scope.
    // We only log whether recent_media looks real.
    const firstId = (() => {
      if (!isRecord(igMe) || !Array.isArray(igMe.recent_media) || igMe.recent_media.length === 0) return ""
      const first = igMe.recent_media[0]
      if (!isRecord(first)) return ""
      return String(first.id ?? "")
    })()
    const hasRealTopPosts = igRecentLen > 0 && /^\d+$/.test(firstId)

    dlog("[top-posts][compute] enter", {
      isConnected,
      isConnectedInstagram,
      mediaLen,
      topPostsLen,
      firstId,
      hasRealTopPosts,
    })
  }, [__DEV__, dlog, igMe, igRecentLen, isConnected, isConnectedInstagram, topPostsLen, mediaLen])

  const displayUsername = hasRealProfile
    ? (isRecord(igProfile) && typeof igProfile.username === "string" ? String(igProfile.username).trim() : "")
    : ""

  const dbAvatarUrl = typeof creatorCardPreviewData?.creatorCard?.avatarUrl === "string" ? String(creatorCardPreviewData.creatorCard.avatarUrl).trim() : ""
  const dbDisplayName = typeof creatorCardPreviewData?.creatorCard?.displayName === "string" ? String(creatorCardPreviewData.creatorCard.displayName).trim() : ""
  const dbIgUsername = typeof creatorCardPreviewData?.creatorCard?.username === "string" ? String(creatorCardPreviewData.creatorCard.username).trim() : ""

  const displayName = (() => {
    if (allowDemoProfile) return mockAnalysis.profile.displayName
    if (dbDisplayName) return dbDisplayName
    const raw = isRecord(igProfile) && typeof igProfile.name === "string" ? igProfile.name : null
    if (typeof raw === "string" && raw.trim()) return raw.trim()
    return displayUsername ? displayUsername : "—"
  })()

  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null

  const finiteNumOrNull = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }

  const computedMetrics = (() => {
    if (!isConnected) return null

    const followers = finiteNumOrNull(igProfile?.followers_count)
    if (followers === null || followers <= 0) {
      return {
        engagementRatePct: null as number | null,
        avgLikes: null as number | null,
        avgComments: null as number | null,
        engagementVolume: null as number | null,
        postsPerWeek: null as number | null,
      }
    }

    if (!Array.isArray(effectiveRecentMedia) || effectiveRecentMedia.length === 0) {
      return {
        engagementRatePct: null as number | null,
        avgLikes: null as number | null,
        avgComments: null as number | null,
        engagementVolume: null as number | null,
        postsPerWeek: null as number | null,
      }
    }

    const posts = effectiveRecentMedia
      .slice(0, 25)
      .map((p) => {
        if (!isRecord(p)) return { likes: 0, comments: 0, timestamp: null, media_type: null }
        const likes = finiteNumOrNull(p.like_count) ?? 0
        const comments = finiteNumOrNull(p.comments_count) ?? 0
        const timestamp = typeof p.timestamp === "string" ? String(p.timestamp) : null
        const media_type = typeof p.media_type === "string" ? String(p.media_type).toUpperCase() : null
        return { likes, comments, timestamp, media_type }
      })

    if (posts.length === 0) {
      return {
        engagementRatePct: null as number | null,
        avgLikes: null as number | null,
        avgComments: null as number | null,
        engagementVolume: null as number | null,
        postsPerWeek: null as number | null,
      }
    }

    const avgLikes = posts.reduce((a, b) => a + b.likes, 0) / posts.length
    const avgComments = posts.reduce((a, b) => a + b.comments, 0) / posts.length
    const avgEngagement = avgLikes + avgComments
    const engagementRatePct = (avgEngagement / followers) * 100

    const engagementVolume = posts.reduce((a, b) => a + b.likes + b.comments, 0)

    // Calculate current calendar week (Mon-Sun) in Asia/Taipei timezone
    const now = new Date()
    const taipeiOffset = 8 * 60 // UTC+8 in minutes
    const localOffset = now.getTimezoneOffset()
    const offsetDiff = (taipeiOffset + localOffset) * 60 * 1000
    const taipeiNow = new Date(now.getTime() + offsetDiff)
    
    // Get Monday 00:00 of current week in Asia/Taipei
    const dayOfWeek = taipeiNow.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Sunday counts as 6 days from Monday
    const weekStart = new Date(taipeiNow)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - daysFromMonday)
    const weekStartMs = weekStart.getTime() - offsetDiff // Convert back to UTC
    
    // Next Monday 00:00 in Asia/Taipei
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndMs = weekEnd.getTime() - offsetDiff // Convert back to UTC
    
    let postsPerWeek: number | null = 0
    let hasValidTs = false
    // Count posts within current calendar week (Mon-Sun Asia/Taipei) with valid media types
    // Note: estimate based on fetched recent media list (may be limited by API)
    const validMediaTypes = ["IMAGE", "CAROUSEL_ALBUM", "VIDEO", "REELS"]
    for (const p of posts) {
      if (!p.timestamp) continue
      const tms = new Date(p.timestamp).getTime()
      if (Number.isNaN(tms)) continue
      hasValidTs = true
      // Count if within current week AND has valid media type
      if (tms >= weekStartMs && tms < weekEndMs && p.media_type && validMediaTypes.includes(p.media_type)) {
        postsPerWeek += 1
      }
    }
    if (!hasValidTs) postsPerWeek = null

    return {
      engagementRatePct: Number.isFinite(engagementRatePct) ? engagementRatePct : null,
      avgLikes: Number.isFinite(avgLikes) ? avgLikes : null,
      avgComments: Number.isFinite(avgComments) ? avgComments : null,
      engagementVolume: Number.isFinite(engagementVolume) ? engagementVolume : null,
      postsPerWeek,
    }
  })()

  const formatPct2 = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}%`)
  const formatInt = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString())

  const engagementRatePctFormatted = isConnected ? formatPct2(computedMetrics?.engagementRatePct ?? null) : "—"
  const avgLikesFormatted = isConnected ? formatInt(computedMetrics?.avgLikes ?? null) : "—"
  const avgCommentsFormatted = isConnected ? formatInt(computedMetrics?.avgComments ?? null) : "—"

  const displayHandle = (() => {
    if (allowDemoProfile) return `@${mockAnalysis.profile.username}`
    if (dbIgUsername) return `@${dbIgUsername}`
    return displayUsername ? `@${displayUsername}` : "—"
  })()

  const formatNum = (n: number | null) => (n === null ? "—" : n.toLocaleString())

  const isPreview = (n: number | null) => isConnected && n === null

  const hasOwn = (obj: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

  const readUnknown = (obj: unknown, key: string): unknown => {
    if (!isRecord(obj)) return undefined
    if (!hasOwn(obj, key)) return undefined
    return obj[key]
  }

  const readString = (obj: unknown, key: string): string => {
    const v = readUnknown(obj, key)
    return typeof v === "string" ? v : ""
  }

  const readNumber = (obj: unknown, key: string): number | null => {
    const v = readUnknown(obj, key)
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }

  const readIdLike = (obj: unknown, key: string): string => {
    const v = readUnknown(obj, key)
    if (typeof v === "string") return v
    if (typeof v === "number" && Number.isFinite(v)) return String(v)
    return ""
  }

  const getStablePostIdentity = (obj: unknown): { id: string; permalink: string; shortcode: string } => {
    return {
      id: readIdLike(obj, "id"),
      permalink: readString(obj, "permalink"),
      shortcode: readString(obj, "shortcode"),
    }
  }

  const getBasicMediaFields = (obj: unknown): {
    likeCount: number
    commentsCount: number
    mediaType: string
    timestamp: string
    permalink: string
    caption: string
    thumbnailUrl: string
    mediaUrl: string
    shortcode: string
    id: string
  } => {
    const likeCount = readNumber(obj, "like_count") ?? 0
    const commentsCount = readNumber(obj, "comments_count") ?? 0
    const mediaType = readString(obj, "media_type")
    const timestamp = readString(obj, "timestamp")
    const permalink = readString(obj, "permalink")
    const caption = readString(obj, "caption")
    const thumbnailUrl = readString(obj, "thumbnail_url")
    const mediaUrl = readString(obj, "media_url")
    const shortcode = readString(obj, "shortcode")
    const id = readIdLike(obj, "id")
    return { likeCount, commentsCount, mediaType, timestamp, permalink, caption, thumbnailUrl, mediaUrl, shortcode, id }
  }

  // KPI numbers should accept numeric strings from API responses.
  const dashKpis = isRecord(dashSummary) && isRecord(dashSummary.kpis) ? (dashSummary.kpis as Record<string, unknown>) : null
  void dashKpis

  const kpiFollowers = typeof creatorCardPreviewData?.followers === "number" && Number.isFinite(creatorCardPreviewData.followers) ? creatorCardPreviewData.followers : null
  const kpiFollowing = null as number | null
  const kpiPosts = null as number | null

  // Treat any non-empty media array as real media; do NOT require like/comment metrics.
  const hasRealMedia = Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0

  type PostsSectionStatus = "loading" | "error" | "empty" | "content"

  const topPerformingPosts = useMemo(() => {
    if (!hasRealMedia) return []

    const copy = [...effectiveRecentMedia]
    copy.sort((a, b) => {
      const al = isRecord(a) ? (toNum(a.like_count) ?? 0) : 0
      const ac = isRecord(a) ? (toNum(a.comments_count) ?? 0) : 0
      const bl = isRecord(b) ? (toNum(b.like_count) ?? 0) : 0
      const bc = isRecord(b) ? (toNum(b.comments_count) ?? 0) : 0
      return (bl + bc) - (al + ac)
    })
    return copy.slice(0, 3)
  }, [effectiveRecentMedia, hasRealMedia])

  const latestPosts = useMemo(() => {
    if (!Array.isArray(effectiveRecentMedia) || effectiveRecentMedia.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[latest-posts] empty input", {
          isArray: Array.isArray(effectiveRecentMedia),
          length: Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia.length : 0,
        })
      }
      return []
    }

    const validPosts = effectiveRecentMedia.filter((p) => {
      const isRec = isRecord(p)
      const hasId = isRec && Boolean(p.id)
      const hasTs = isRec && Boolean(p.timestamp)
      
      if (process.env.NODE_ENV !== "production" && !isRec) {
        // eslint-disable-next-line no-console
        console.debug("[latest-posts] filtered out: not a record")
      }
      
      if (!isRec) return false
      if (!hasId) return false
      if (!hasTs) return false
      // Do NOT filter out posts just because thumbnail/media_url is missing
      return true
    })

    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[latest-posts] filter results", {
        rawCount: effectiveRecentMedia.length,
        afterFilter: validPosts.length,
        dropped: effectiveRecentMedia.length - validPosts.length,
      })
    }

    const copy = [...validPosts]
    copy.sort((a, b) => {
      const aTime = typeof a.timestamp === "string" ? Date.parse(a.timestamp) : 0
      const bTime = typeof b.timestamp === "string" ? Date.parse(b.timestamp) : 0
      return bTime - aTime
    })

    return copy.slice(0, 3)
  }, [effectiveRecentMedia])

  const resolveTopPostsStatus = useCallback((): PostsSectionStatus => {
    if (!isConnected) return "content"
    if (!mediaLoaded && !hasRealMedia) return "loading"
    if (mediaLoaded && !hasRealMedia) return "empty"
    return "content"
  }, [hasRealMedia, isConnected, mediaLoaded])

  const resolveLatestPostsStatus = useCallback((): PostsSectionStatus => {
    if (!isConnected) return "content"
    if (!mediaLoaded) return "loading"
    if (hasRealMedia && latestPosts.length === 0) return "empty"
    return "content"
  }, [hasRealMedia, isConnected, latestPosts.length, mediaLoaded])

  // Helper to extract debug info from posts
  const extractPostDebugInfo = useCallback((posts: unknown[]) => {
    return posts.slice(0, 3).map((p) => {
      if (!isRecord(p)) {
        return {
          id: "invalid",
          media_type: "unknown",
          hasThumb: false,
          hasMediaUrl: false,
          thumbHost: "",
          mediaHost: "",
        }
      }
      const thumbUrl = typeof p.thumbnail_url === "string" ? p.thumbnail_url : ""
      const mediaUrl = typeof p.media_url === "string" ? p.media_url : ""
      const thumbHost = thumbUrl ? (() => { try { return new URL(thumbUrl).hostname } catch { return "invalid" } })() : ""
      const mediaHost = mediaUrl ? (() => { try { return new URL(mediaUrl).hostname } catch { return "invalid" } })() : ""
      
      return {
        id: String(p.id ?? "unknown"),
        media_type: String(p.media_type ?? "unknown"),
        hasThumb: Boolean(thumbUrl),
        hasMediaUrl: Boolean(mediaUrl),
        thumbHost,
        mediaHost,
      }
    })
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const first = hasRealMedia && Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0 ? effectiveRecentMedia[0] : null
    
    // Enhanced debug logging for posts rendering diagnosis
    const thumbUrl = first && typeof first.thumbnail_url === "string" ? first.thumbnail_url : ""
    const mediaUrl = first && typeof first.media_url === "string" ? first.media_url : ""
    const thumbHost = thumbUrl ? (() => { try { return new URL(thumbUrl).hostname } catch { return "invalid" } })() : ""
    const mediaHost = mediaUrl ? (() => { try { return new URL(mediaUrl).hostname } catch { return "invalid" } })() : ""
    
    // eslint-disable-next-line no-console
    console.log("[top-posts] data source", {
      mediaLen: Array.isArray(media) ? media.length : 0,
      effectiveRecentLen: Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia.length : 0,
      hasRealMedia,
      topPostsLen: Array.isArray(topPerformingPosts) ? topPerformingPosts.length : 0,
      latestPostsLen: Array.isArray(latestPosts) ? latestPosts.length : 0,
      firstPost: first
        ? {
            id: String(first.id ?? "").slice(0, 12),
            media_type: first.media_type,
            hasMediaUrl: Boolean(mediaUrl),
            hasThumb: Boolean(thumbUrl),
            thumbHost,
            mediaHost,
            hasLike: typeof first.like_count === "number",
            hasComments: typeof first.comments_count === "number",
          }
        : null,
    })
  }, [hasRealMedia, effectiveRecentMedia, topPerformingPosts, latestPosts, media])

  useEffect(() => {
    if (!__DEV__) return
    try {
      const first = Array.isArray(topPerformingPosts) && topPerformingPosts.length > 0 ? topPerformingPosts[0] : null
      dlog("[top-posts] computed", {
        mediaLen,
        effectiveRecentLen,
        isConnected,
        topPostsLen: Array.isArray(topPerformingPosts) ? topPerformingPosts.length : 0,
        first: first
          ? {
              id: String(first?.id ?? "").slice(0, 12),
              media_type: String(first?.media_type ?? ""),
              has_media_url: Boolean(first?.media_url),
              has_thumbnail_url: Boolean(first?.thumbnail_url),
              has_like_count: typeof first?.like_count === "number",
              has_comments_count: typeof first?.comments_count === "number",
            }
          : null,
      })
    } catch {
      // ignore
    }
  }, [__DEV__, dlog, effectiveRecentLen, isConnected, mediaLen, topPerformingPosts])

  useEffect(() => {
    if (!__DEBUG_RESULTS__) return
    try {
      const arr = Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia : []
      const first = arr[0] || null
      if (!first) {
        // eslint-disable-next-line no-console
        console.debug("[DEBUG_RESULTS] media: empty")
        return
      }

      const mediaType = isRecord(first) ? String(first.media_type ?? "") : ""
      const mediaUrl = isRecord(first) ? String(first.media_url ?? "") : ""
      const thumbUrl = isRecord(first) ? String(first.thumbnail_url ?? "") : ""
      const isVideo = mediaType === "VIDEO" || mediaType === "REELS"
      const previewUrl = isVideo ? (thumbUrl || "") : (mediaUrl || thumbUrl || "")
      const mediaExt = (() => {
        const m = mediaUrl.toLowerCase()
        const u = m.split("?")[0]
        const dot = u.lastIndexOf(".")
        return dot >= 0 ? u.slice(dot) : ""
      })()
      const previewHost = (() => {
        try {
          return previewUrl ? new URL(previewUrl).hostname : ""
        } catch {
          return ""
        }
      })()

      // eslint-disable-next-line no-console
      console.debug("[DEBUG_RESULTS] first media", {
        media_type: mediaType,
        media_url_ext: mediaExt,
        has_thumbnail_url: Boolean(thumbUrl),
        preview_host: previewHost,
        has_like_count: isRecord(first) && typeof first.like_count !== "undefined",
        has_comments_count: isRecord(first) && typeof first.comments_count !== "undefined",
      })
    } catch {
      // ignore
    }
  }, [__DEBUG_RESULTS__, effectiveRecentMedia])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      if (!Array.isArray(topPerformingPosts) || topPerformingPosts.length === 0) return
      const top3 = topPerformingPosts.slice(0, 3).map((p: unknown) => {
        if (!isRecord(p)) return { id: "", media_type: "", thumbnail_url: "", media_url: "", permalink: "", like_count: null, comments_count: null, engagement: null, timestamp: "" }
        return {
          id: typeof p.id === "string" ? p.id : "",
          media_type: typeof p.media_type === "string" ? p.media_type : "",
          thumbnail_url: typeof p.thumbnail_url === "string" ? p.thumbnail_url : "",
          media_url: typeof p.media_url === "string" ? p.media_url : "",
          permalink: getPostPermalink(p),
          like_count: typeof p.like_count === "number" ? p.like_count : (typeof p.likeCount === "number" ? p.likeCount : null),
          comments_count: typeof p.comments_count === "number" ? p.comments_count : (typeof p.commentsCount === "number" ? p.commentsCount : null),
          engagement: typeof p.engagement === "number" ? p.engagement : null,
          timestamp: typeof p.timestamp === "string" ? p.timestamp : "",
        }
      })
      window.localStorage.setItem(
        "sa_top_posts_snapshot_v1",
        JSON.stringify({
          ts: Date.now(),
          source: "results",
          items: top3,
        })
      )

      // Legacy compatibility: keep old key as plain array so older quick-pick builds still work
      window.localStorage.setItem("sa_top_posts_v1", JSON.stringify(top3))
    } catch {
      // ignore
    }
  }, [topPerformingPosts])

  const clamp0to100 = (n: number) => Math.max(0, Math.min(100, n))
  const safePercent = (n: number | null) => (n === null ? 0 : clamp0to100(n))
  const formatPct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`)

  const engagementRate = (() => {
    if (!isConnected) return null
    const db = typeof creatorCardPreviewData?.engagementRate === "number" && Number.isFinite(creatorCardPreviewData.engagementRate) ? creatorCardPreviewData.engagementRate : null
    return typeof db === "number" && Number.isFinite(db) ? db : null
  })()

  const cadenceScore = (() => {
    if (!isConnected) return null
    if (!Array.isArray(media) || media.length === 0) return null

    const now = Date.now()
    const days30 = 30 * 24 * 60 * 60 * 1000

    let c30 = 0
    for (const m of media) {
      if (!isRecord(m)) continue
      const ts = m.timestamp
      if (!ts) continue
      const tms = new Date(ts).getTime()
      if (Number.isNaN(tms)) continue
      if (now - tms <= days30) c30 += 1
    }

    const score = Math.round((Math.min(c30, 8) / 8) * 100)
    return score
  })()

  const topPerformanceScore = (() => {
    if (!isConnected) return null
    if (!Array.isArray(media) || media.length === 0) return null

    const sample = media.slice(0, 12)
    const vals: number[] = []

    for (const m of sample) {
      if (!isRecord(m)) continue
      const likes = numOrNull(m.like_count) ?? 0
      const comments = numOrNull(m.comments_count) ?? 0
      const v = likes + comments
      if (v > 0) vals.push(v)
    }

    if (vals.length < 2) return null

    const maxV = Math.max(...vals)
    const avgV = vals.reduce((a, b) => a + b, 0) / vals.length
    if (avgV <= 0) return null

    const ratio = maxV / avgV
    const score = Math.round(Math.max(35, Math.min(100, ratio * 50)))
    return score
  })()

  const followers = allowDemoProfile ? mockAnalysis.profile.followers : kpiFollowers
  const following = allowDemoProfile ? mockAnalysis.profile.following : kpiFollowing
  const posts = allowDemoProfile ? mockAnalysis.profile.posts : kpiPosts

  const shouldShowStatsSkeleton = !allowDemoProfile && dashSummaryLoading && (followers == null || following == null || posts == null)

  const accountTypeLabel = (value: string) => {
    if (value === "Personal Account") return t("results.values.accountType.personal")
    if (value === "Creator Account") return t("results.values.accountType.creator")
    if (value === "Business Account") return t("results.values.accountType.business")
    return value
  }

  const focusKpi = (kpi: "authenticity" | "engagement" | "automation") => {
    setActiveKpi(kpi)
    window.setTimeout(() => {
      const el = document.getElementById(`account-scores-kpi-${kpi}`)
      el?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  const scrollToId = (id: string, block: ScrollLogicalPosition = "start") => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: "smooth", block })
  }

  const flashUpgradeHighlight = () => {
    setUpgradeHighlight(true)
    window.setTimeout(() => setUpgradeHighlight(false), 1200)
  }

  const accountAgeLabel = (value: string) => {
    if (value === "New account") return t("results.values.accountAge.new")
    if (value === "Growing account") return t("results.values.accountAge.growing")
    if (value === "Established account") return t("results.values.accountAge.established")
    return value
  }

  const visibilityLabel = (value: string) => {
    if (value === "Public") return t("results.values.visibility.public")
    if (value === "Limited visibility (simulated)") return t("results.values.visibility.limited")
    return value
  }

  const postingFrequencyLabel = (value: string) => {
    if (value === "High") return t("results.values.level.high")
    if (value === "Medium") return t("results.values.level.medium")
    if (value === "Low") return t("results.values.level.low")
    return value
  }

  const noteLabel = (value: string) => {
    if (value === "Content cadence aligns with human posting windows.") return t("results.demoNotes.1")
    if (value === "Engagement appears organic and consistent.") return t("results.demoNotes.2")
    if (value === "No signs of automation detected.") return t("results.demoNotes.3")
    return value
  }

  useEffect(() => {
    if (isConnected) {
      setLoading(false)
      return
    }

    const timer = setTimeout(() => {
      setResult({
        platform: (searchParams.get("platform") as "instagram" | "threads") || "instagram",
        username: searchParams.get("username") || "",
        accountType: searchParams.get("accountType") || "Personal Account",
        accountAge: "Established account",
        visibility: "Public",
        postingFrequency: "High",
        recentActivityTrend: "Stable",
        contentConsistency: "Consistent",
        engagementQuality: "High",
        interactionPattern: "Mostly organic",
        automationLikelihood: "Low",
        abnormalBehaviorRisk: "Low",
        notes: [
          "Content cadence aligns with human posting windows.",
          "Engagement appears organic and consistent.",
          "No signs of automation detected.",
        ],
        confidenceScore: 92,
        analysisType: t("results.demo.analysisType"),
        disclaimer: t("results.demo.disclaimer"),
      })
      setLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [isConnected, searchParams, t])

  const meQuery = useInstagramMe({ enabled: isConnectedInstagram })

  const [creatorCard, setCreatorCard] = useState<unknown>(null)
  const [isCreatorCardLoading, setIsCreatorCardLoading] = useState(false)
  const [creatorStats, setCreatorStats] = useState<unknown>(null)
  const [creatorIdFromCardMe, setCreatorIdFromCardMe] = useState<string | null>(null)
  const [creatorCardReload, setCreatorCardReload] = useState(0)
  const creatorCardFetchedRef = useRef(false)
  const didTriggerCreatorCardOnThisEntryRef = useRef(false)
  const creatorStatsUpsertKeyRef = useRef<string>("")
  const reloadCardInFlightRef = useRef(false)
  const reloadCardLastAtRef = useRef(0)
  const lastReloadKeyRef = useRef<string>("")

  const normalizeCreatorCardForResults = useCallback((row: unknown): Record<string, unknown> | null => {
    if (!isRecord(row)) return null
    const out: Record<string, unknown> = { ...row }

    const isPublicRaw = out.isPublic ?? out.is_public ?? false
    out.isPublic = typeof isPublicRaw === "boolean" ? isPublicRaw : Boolean(isPublicRaw)

    const themeTypesRaw = out.themeTypes ?? out.theme_types ?? []
    out.themeTypes = Array.isArray(themeTypesRaw) ? themeTypesRaw : []

    const audienceProfilesRaw = out.audienceProfiles ?? out.audience_profiles ?? []
    out.audienceProfiles = Array.isArray(audienceProfilesRaw) ? audienceProfilesRaw : []

    const collabNichesRaw = out.collaborationNiches ?? out.collaboration_niches ?? []
    out.collaborationNiches = Array.isArray(collabNichesRaw) ? collabNichesRaw : []

    const pastCollabsRaw = out.pastCollaborations ?? out.past_collaborations ?? []
    out.pastCollaborations = Array.isArray(pastCollabsRaw) ? pastCollabsRaw : []

    out.portfolio = Array.isArray(out.portfolio) ? out.portfolio : []

    if (typeof out.contact === "string") {
      const contactStr = out.contact
      try {
        const parsed: unknown = JSON.parse(contactStr)
        if (isRecord(parsed)) {
          out.contact = parsed
        }
      } catch {
        out.contact = {}
      }
    }

    const contactObj = isRecord(out.contact) ? out.contact : {}
    const readStr = (v: unknown) => (typeof v === "string" ? v.trim() : "")
    const readStrArr = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => readStr(x)).filter(Boolean) : ([] as string[])

    const email1 = readStr((contactObj as any).email) || readStr((contactObj as any).contactEmail)
    const phone1 = readStr((contactObj as any).phone) || readStr((contactObj as any).contactPhone)
    const line1 = readStr((contactObj as any).line) || readStr((contactObj as any).contactLine)
    const other1 = readStr((contactObj as any).other) || readStr((contactObj as any).contactOther)

    const emails = readStrArr((contactObj as any).emails)
    const phones = readStrArr((contactObj as any).phones)
    const lines = readStrArr((contactObj as any).lines)
    const legacyOthers = readStrArr((contactObj as any).others)

    const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).slice(0, 20)

    const finalEmails = uniq([...(email1 ? [email1] : []), ...emails])
    const finalPhones = uniq([...(phone1 ? [phone1] : []), ...phones])
    const finalLines = (() => {
      const merged = uniq([...(line1 ? [line1] : []), ...lines])
      if (merged.length > 0) return merged
      return uniq([...(other1 ? [other1] : []), ...legacyOthers])
    })()

    const pcmRaw = readStr((contactObj as any).primaryContactMethod)
    const primaryContactMethod = pcmRaw === "email" || pcmRaw === "phone" || pcmRaw === "line" ? pcmRaw : ""

    out.emails = finalEmails
    out.phones = finalPhones
    out.lines = finalLines
    out.primaryContactMethod = primaryContactMethod

    out.contactEmail = finalEmails[0] ?? ""
    out.contactPhone = finalPhones[0] ?? ""
    out.contactLine = finalLines[0] ?? ""

    ;(contactObj as any).emails = finalEmails
    ;(contactObj as any).phones = finalPhones
    ;(contactObj as any).lines = finalLines
    ;(contactObj as any).primaryContactMethod = primaryContactMethod

    out.contact = contactObj

    return out
  }, [])

  const reloadCreatorCard = useCallback(async (refreshKey?: string) => {
    debugCreatorCard("reloadCreatorCard called", {
      refreshKey,
      time: Date.now(),
    })
    
    setIsCreatorCardLoading(true)
    try {
      const timestamp = refreshKey || Date.now().toString()
      const res = await fetch(`/api/creator-card/me?t=${timestamp}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      })

      if (!res.ok) throw new Error("failed to load creator card")
      const json = await res.json()

      // Support multiple response shapes
      const card = json?.card ?? json?.data?.card ?? json?.creatorCard ?? null

      setCreatorCard(normalizeCreatorCardForResults(card))
      
      debugCreatorCard("reloadCreatorCard success", {
        refreshKey,
      })
      
      // Clear storage flags after successful DB reload
      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("creatorCard:updated")
          sessionStorage.removeItem("creatorCardUpdated")
        } catch {
          // Ignore sessionStorage errors
        }
        try {
          localStorage.removeItem("creatorCardUpdated")
        } catch {
          // Ignore localStorage errors
        }
      }
    } catch {
      // Set card to null on error so CTA shows
      setCreatorCard(null)
    } finally {
      setIsCreatorCardLoading(false)
    }
  }, [normalizeCreatorCardForResults])

  const reloadCreatorCardOnce = useCallback((key?: string) => {
    const k = key || ""
    if (k && lastReloadKeyRef.current === k) return
    if (k) lastReloadKeyRef.current = k
    void reloadCreatorCard(k || undefined)
  }, [reloadCreatorCard])

  const safeReloadCreatorCard = useCallback(() => {
    const now = Date.now()

    // throttle: 800ms 內不重複觸發（避免 focus + visibilitychange 連發）
    if (now - reloadCardLastAtRef.current < 800) return

    // in-flight: 上一個請求尚未結束就不再發第二個（避免 request 被 canceled）
    if (reloadCardInFlightRef.current) return

    reloadCardLastAtRef.current = now
    reloadCardInFlightRef.current = true

    Promise.resolve(reloadCreatorCard())
      .catch(() => {})
      .finally(() => {
        reloadCardInFlightRef.current = false
      })
  }, [reloadCreatorCard])

  const checkCreatorCardUpdates = useCallback(() => {
    if (typeof window === "undefined") return

    const storageTimestamp = sessionStorage.getItem("creatorCardUpdated") || localStorage.getItem("creatorCardUpdated") || ""

    debugCreatorCard("focus/visibility check", {
      storageTimestamp,
      lastSeenTimestamp: lastReloadKeyRef.current,
    })

    if (storageTimestamp && storageTimestamp !== lastReloadKeyRef.current) {
      debugCreatorCard("storage timestamp changed → reload", {
        storageTimestamp,
      })
      reloadCreatorCardOnce(storageTimestamp)
    }
  }, [reloadCreatorCardOnce])

  useEffect(() => {
    if (refreshSeq <= 0) return
    checkCreatorCardUpdates()
  }, [checkCreatorCardUpdates, refreshSeq])

  const resolvedCreatorId = useMemo(() => {
    const igUserIdFromSnapshot = (() => {
      if (!isRecord(dailySnapshotData)) return ""
      const series = isRecord(dailySnapshotData.insights_daily_series) || Array.isArray(dailySnapshotData.insights_daily_series) ? dailySnapshotData.insights_daily_series : null
      const firstItem = Array.isArray(series) && series.length > 0 ? series[0] : null
      const insightId = isRecord(firstItem) && typeof firstItem.id === "string" ? firstItem.id : ""
      return extractIgUserIdFromInsightsId(insightId)
    })()
    const igUserIdFromCookie = getCookieValue("ig_ig_id").trim()
    const igUserIdStr = (creatorIdFromCardMe || igUserIdFromSnapshot || igUserIdFromCookie).trim()
    return igUserIdStr || null
  }, [creatorIdFromCardMe, dailySnapshotData])

  const userScopeKey = useMemo(() => {
    const meIg = isRecord(meQuery.data) && typeof meQuery.data.igId === "string" ? String(meQuery.data.igId).trim() : ""
    const cookieIg = getCookieValue("ig_ig_id").trim()
    const cookiePage = getCookieValue("ig_page_id").trim()
    const base = (resolvedCreatorId || meIg || cookieIg).trim()
    const page = cookiePage.trim()
    return `${base || "session"}|${page || ""}`
  }, [meQuery.data, resolvedCreatorId])

  useEffect(() => {
    const prev = userScopeKeyRef.current
    if (prev === userScopeKey) return

    userScopeKeyRef.current = userScopeKey

    trendPointsByDaysRef.current.clear()
    fetchedByDaysRef.current.clear()
    lastFetchAtByDaysRef.current.clear()
    inFlightTrendDaysRef.current = null
    displayedTrendSigRef.current = ""
    trendPointsHashRef.current = ""
    hasAppliedDailySnapshotTrendRef.current = false
    hasTriggeredPrefetchRef.current = false

    setTrendPoints([])
    setTrendFetchedAt(null)
    setDailySnapshotData(null)
    setTrendFetchStatus({ loading: false, error: "", lastDays: null })
    setShowRangeOverlay(false)
    setIsChangingRange(false)
    clearRangeSwitchTimeout()

    if (process.env.NODE_ENV !== "production") {
      console.debug("[trend][scope] reset client caches", { prev, next: userScopeKey })
    }
  }, [clearRangeSwitchTimeout, userScopeKey])

  useEffect(() => {
    if (!isConnectedInstagram) {
      setFollowersDailyRows([])
      setFollowersLastWriteAt(null)
      return
    }

    const ok = isRecord(dailySnapshotData) && (dailySnapshotData as any).ok === true
    if (!ok) {
      setFollowersDailyRows([])
      setFollowersLastWriteAt(null)
      return
    }

    const rowsRaw = isRecord(dailySnapshotData) && Array.isArray((dailySnapshotData as any).followers_daily_rows)
      ? ((dailySnapshotData as any).followers_daily_rows as unknown[])
      : []

    const rows = rowsRaw
      .map((r) => {
        if (!isRecord(r)) return null
        const day = typeof r.day === "string" ? r.day : ""
        const n = typeof r.followers_count === "number" ? r.followers_count : Number((r as any).followers_count)
        if (!day || !Number.isFinite(n)) return null
        return { day, followers_count: Math.floor(n) }
      })
      .filter((x): x is { day: string; followers_count: number } => x !== null)

    const lastWriteAt =
      isRecord(dailySnapshotData) && typeof (dailySnapshotData as any).followers_last_write_at === "string"
        ? String((dailySnapshotData as any).followers_last_write_at).trim() || null
        : null

    setFollowersDailyRows(rows)
    setFollowersLastWriteAt(lastWriteAt)

    if (__DEBUG_RESULTS__) {
      const firstDay = rows[0]?.day ?? ""
      const lastDay = rows[rows.length - 1]?.day ?? ""
      dlog("[followers] snapshot applied", {
        rows: rows.length,
        firstDay,
        lastDay,
        lastWriteAt,
        fetchedAt: new Date().toISOString(),
      })
    }
  }, [__DEBUG_RESULTS__, dailySnapshotData, dlog, isConnectedInstagram])

  useEffect(() => {
    if (typeof window === "undefined") return

    if (window.location.hash !== "#creator-card") return

    let allowOnce = false
    try {
      allowOnce = sessionStorage.getItem("creatorCard:updated") === "1"
      if (allowOnce) {
        sessionStorage.removeItem("creatorCard:updated")
      }
    } catch {
      allowOnce = false
    }

    if (allowOnce) return

    try {
      const newUrl = window.location.pathname + window.location.search
      window.history.replaceState({}, "", newUrl)
    } catch {
      // ignore
    }

    try {
      window.scrollTo({ top: 0, behavior: "auto" })
    } catch {
      // ignore
    }
  }, [])

  // Mount-time check: reload if hash includes creator-card AND storage has timestamp
  // This handles router.back() navigation where ccUpdated param is not present
  useEffect(() => {
    if (typeof window === "undefined") return
    
    const hash = window.location.hash
    const hasCreatorCardHash = hash.includes("creator-card")
    const storageTimestamp = sessionStorage.getItem("creatorCardUpdated") || localStorage.getItem("creatorCardUpdated")
    
    debugCreatorCard("mount-time check", {
      hasCreatorCardHash,
      storageTimestamp,
      hash,
    })
    
    if (hasCreatorCardHash && storageTimestamp) {
      debugCreatorCard("mount-time reload triggered", {
        storageTimestamp,
      })
      reloadCreatorCardOnce(storageTimestamp)
    }
  }, [reloadCreatorCardOnce])

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check for ccUpdated query param or storage timestamp
      const params = new URLSearchParams(window.location.search)
      const ccUpdatedParam = params.get("ccUpdated")
      const storageTimestamp = sessionStorage.getItem("creatorCardUpdated") || localStorage.getItem("creatorCardUpdated")
      
      debugCreatorCard("hydration check", {
        ccUpdatedParam,
        storageTimestamp,
      })
      
      if (ccUpdatedParam || storageTimestamp) {
        const refreshKey = ccUpdatedParam || storageTimestamp || Date.now().toString()
        
        // Try to hydrate from localStorage for immediate sync
        let hydrated = false
        try {
          const draftJson = localStorage.getItem("creator_card_draft_v1")
          const updatedAt = localStorage.getItem("creator_card_updated_at")
          
          if (process.env.NODE_ENV !== "production") {
            console.log("[CreatorCard Hydration] localStorage data:", {
              hasDraft: !!draftJson,
              updatedAt,
              refreshKey,
              age: updatedAt ? Date.now() - Number(updatedAt) : null,
            })
          }
          
          if (draftJson && updatedAt) {
            const draft = JSON.parse(draftJson)
            const timestamp = Number(updatedAt)
            
            // Only hydrate if timestamp is recent (within last 5 minutes)
            if (Number.isFinite(timestamp) && Date.now() - timestamp < 5 * 60 * 1000) {
              setCreatorCard(normalizeCreatorCardForResults(draft))
              hydrated = true
              
              if (process.env.NODE_ENV !== "production") {
                console.log("[CreatorCard Hydration] ✅ Hydrated from localStorage")
              }
            } else if (process.env.NODE_ENV !== "production") {
              console.log("[CreatorCard Hydration] ⏰ localStorage data too old, skipping")
            }
          }
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[CreatorCard Hydration] ❌ Error reading localStorage:", err)
          }
        }
        
        // Remove ccUpdated query param while preserving hash
        if (ccUpdatedParam) {
          params.delete("ccUpdated")
          const newSearch = params.toString()
          const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash
          window.history.replaceState({}, "", newUrl)
        }
        
        debugCreatorCard("hydration-triggered reload", {
          refreshKey,
        })
        
        // Trigger reload to fetch latest from API with refreshKey (non-blocking background refresh)
        reloadCreatorCardOnce(refreshKey)
      }
    }
  }, [normalizeCreatorCardForResults, reloadCreatorCardOnce])

  useEffect(() => {
    if (!isConnectedInstagram) {
      setCreatorCard(null)
      creatorCardFetchedRef.current = false
      setCreatorStats(null)
      setCreatorIdFromCardMe(null)
      creatorStatsUpsertKeyRef.current = ""
      return
    }

    // Preview data is now owned by useCreatorCardPreviewData (via /api/creator-card/preview).
    // Keep legacy state/reset behavior only; avoid duplicate fetches here.
    if (creatorCardFetchedRef.current && creatorCardReload === 0) return
    creatorCardFetchedRef.current = true
  }, [creatorCardReload, isConnectedInstagram])

  // Scroll to hash anchor after page loads (for Back navigation from Creator Card)
  useEffect(() => {
    if (typeof window === "undefined") return
    const hash = window.location.hash
    if (!hash) return
    
    // Wait for content to render, then scroll
    const timer = setTimeout(() => {
      const targetId = hash.slice(1) // Remove #
      const element = document.getElementById(targetId)
      if (element) {
        requestAnimationFrame(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }
    }, 150)
    
    return () => clearTimeout(timer)
  }, [creatorCard]) // Re-run when creator card loads

  // Handle #creator-card hash navigation
  useEffect(() => {
    if (typeof window === "undefined") return

    const run = () => {
      if (window.location.hash !== "#creator-card") return

      // Ensure the correct section/tab is visible
      setSelectedGoal("brandCollaborationProfile")

      // After React paints the section, scroll to it
      requestAnimationFrame(() => {
        const el = document.getElementById("creator-card")
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" })
      })
    }

    run()
    window.addEventListener("hashchange", run)
    return () => window.removeEventListener("hashchange", run)
  }, [])

  // Trigger creator card fetch when goal changes to brandCollaborationProfile
  useEffect(() => {
    const isTarget = selectedGoal === "brandCollaborationProfile"
    if (!isTarget) {
      didTriggerCreatorCardOnThisEntryRef.current = false
      return
    }
    if (!isConnectedInstagram) return
    if (didTriggerCreatorCardOnThisEntryRef.current) return
    didTriggerCreatorCardOnThisEntryRef.current = true
    setCreatorCardReload((v) => v + 1)
  }, [selectedGoal, isConnectedInstagram])

  useEffect(() => {
    if (refreshSeq <= 0) return
    if (!isConnectedInstagram) return
    if (selectedGoal !== "brandCollaborationProfile") return
    // Preview data is now fetched by the preview hook; avoid duplicate reloads here.
  }, [isConnectedInstagram, refreshSeq, selectedGoal])

  useEffect(() => {
    // Stats for the preview are now returned by /api/creator-card/preview.
    // Avoid duplicate stats fetches here.
    if (!isConnectedInstagram || !resolvedCreatorId) {
      setCreatorStats(null)
      return
    }
  }, [isConnectedInstagram, resolvedCreatorId])

  useEffect(() => {
    if (!isConnectedInstagram || !resolvedCreatorId) return
    if (!computedMetrics) return

    const engagementRatePct = computedMetrics?.engagementRatePct
    const avgLikes = computedMetrics?.avgLikes
    const avgComments = computedMetrics?.avgComments
    const followers = finiteNumOrNull(isRecord(igProfile) ? igProfile.followers_count : null)

    const nextKey = JSON.stringify({ resolvedCreatorId, engagementRatePct, avgLikes, avgComments, followers })
    if (creatorStatsUpsertKeyRef.current === nextKey) return
    creatorStatsUpsertKeyRef.current = nextKey

    ;(async () => {
      try {
        await fetch("/api/creator-stats/upsert", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            engagementRatePct,
            followers,
            avgLikes,
            avgComments,
          }),
        })
      } catch {
        // best-effort
      }
    })()
  }, [computedMetrics, finiteNumOrNull, igProfile, isConnectedInstagram, resolvedCreatorId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const url = new URL("/api/dashboard/summary", window.location.origin)

        const headers: Record<string, string> = { accept: "application/json" }
        if (dashSummaryEtag) headers["if-none-match"] = dashSummaryEtag

        const res = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          headers,
        })

        if (cancelled) return

        if (res.status === 304) {
          setDashSummaryLoading(false)
          return
        }

        const ct = (res.headers.get("content-type") ?? "").toLowerCase()
        if (!ct.includes("application/json")) {
          setDashSummaryLoading(false)
          return
        }

        const etag = res.headers.get("etag")
        if (etag) setDashSummaryEtag(etag)

        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && isRecord(json) && json.ok) {
          setDashSummary(json)
        }
      } catch (e) {
        if (cancelled) return
        if (isAbortError(e)) return
      } finally {
        if (cancelled) return
        setDashSummaryLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isConnectedInstagram) return
    if (hasFetchedMeRef.current && lastMeFetchTickRef.current === tick) return
    lastMeFetchTickRef.current = tick
    hasFetchedMeRef.current = true
    __resultsMeFetchedOnce = true
  }, [isConnectedInstagram, tick])

  useEffect(() => {
    setIgMeLoading(Boolean(meQuery.loading))
  }, [meQuery.loading])

  useEffect(() => {
    if (!isConnectedInstagram) return
    if (meQuery.status === 401) {
      setIgMe(null)
      setIgMeUnauthorized(true)
      hasSuccessfulMePayloadRef.current = false
      return
    }
    if (meQuery.error) {
      setLoadError(true)
      return
    }
    if (!meQuery.data) return

    const normalized = normalizeMe(meQuery.data)
    if (!normalized) return

    setIgMeUnauthorized(false)
    setConnectEnvError(null)
    hasSuccessfulMePayloadRef.current = true
    setIgMe(normalized)
  }, [isConnectedInstagram, meQuery.data, meQuery.error, meQuery.status])

  const [gateIsSlow, setGateIsSlow] = useState(false)

  useEffect(() => {
    if (!(igMeLoading || (isConnected && !mediaLoaded))) {
      setGateIsSlow(false)
      setLoadTimedOut(false)
      return
    }

    setGateIsSlow(false)
    const t = window.setTimeout(() => setGateIsSlow(true), 12_000)
    return () => window.clearTimeout(t)
  }, [igMeLoading, isConnected, mediaLoaded])

  useEffect(() => {
    if (!(igMeLoading || (isConnected && !mediaLoaded))) {
      setLoadTimedOut(false)
      return
    }
    if (hasAnyResultsData) {
      setLoadTimedOut(false)
      return
    }
    setLoadTimedOut(false)
    const tt = window.setTimeout(() => setLoadTimedOut(true), 12_000)
    return () => window.clearTimeout(tt)
  }, [igMeLoading, isConnected, mediaLoaded, hasAnyResultsData])

  useEffect(() => {
    const hasEffectiveMedia = effectiveRecentLen > 0
    const active =
      ((igMeLoading && !hasEffectiveMedia) || trendFetchStatus.loading || (isConnected && !mediaLoaded && !hasEffectiveMedia)) &&
      hasAnyResultsData
    setIsUpdating(active)
  }, [effectiveRecentLen, hasAnyResultsData, igMeLoading, isConnected, mediaLoaded, trendFetchStatus.loading])

  useEffect(() => {
    if (!isUpdating) {
      setUpdateSlow(false)
      return
    }
    setUpdateSlow(false)
    const tt = window.setTimeout(() => setUpdateSlow(true), 12_000)
    return () => window.clearTimeout(tt)
  }, [isUpdating])

  // Reset range loading state when fetch completes (terminal states)
  useEffect(() => {
    // Terminal states: loading is false (success, error, or idle)
    if (!trendFetchStatus.loading && showRangeOverlay && isChangingRange) {
      if (rangeOverlayInFlightRef.current?.requestId === rangeChangeRequestIdRef.current) {
        clearRangeSwitchTimeout()
        setIsChangingRange(false)
        setShowRangeOverlay(false)
      }
    }
  }, [trendFetchStatus.loading, showRangeOverlay, isChangingRange, clearRangeSwitchTimeout])

  // Prefetch (silent): trigger once after first successful fetch / first interaction.
  useEffect(() => {
    if (!isConnectedInstagram) return
    if (trendFetchStatus.loading) return
    if (!hasAppliedDailySnapshotTrendRef.current) return
    triggerPrefetchCommonRanges()
  }, [isConnectedInstagram, trendFetchStatus.loading, triggerPrefetchCommonRanges])

  const hasResult = Boolean(result)
  const safeResult: FakeAnalysis = result ?? {
    platform: "instagram",
    username: "",
    accountType: "Personal Account",
    accountAge: "Established account",
    visibility: "Public",
    postingFrequency: "High",
    recentActivityTrend: "Stable",
    contentConsistency: "Consistent",
    engagementQuality: "High",
    interactionPattern: "Mostly organic",
    automationLikelihood: "Low",
    abnormalBehaviorRisk: "Low",
    notes: [],
    confidenceScore: 0,
    analysisType: "",
    disclaimer: "",
  }

  const engagementPercent = (() => {
    const v = (safeResult.engagementQuality || "Medium").toLowerCase()
    if (v === "high") return 90
    if (v === "low") return 55
    return 75
  })()

  const automationRiskPercent = (() => {
    const v = (safeResult.automationLikelihood || "Medium").toLowerCase()
    if (v === "high") return 65
    if (v === "low") return 18
    return 40
  })()

  const metricTone = (
    status: "good" | "warning" | "risk"
  ): { border: string; bg: string; text: string; label: string } => {
    if (status === "risk") {
      return {
        border: "border-red-500/25",
        bg: "bg-red-500/10",
        text: "text-red-200",
        label: "Risk",
      }
    }
    if (status === "warning") {
      return {
        border: "border-amber-500/25",
        bg: "bg-amber-500/10",
        text: "text-amber-200",
        label: "Warning",
      }
    }
    return {
      border: "border-emerald-500/25",
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
      label: "Good",
    }
  }

  const authenticityStatus =
    safeResult.confidenceScore >= 80 ? "good" : safeResult.confidenceScore >= 70 ? "warning" : "risk"
  const engagementStatus =
    safeResult.engagementQuality === "High"
      ? "good"
      : safeResult.engagementQuality === "Medium"
      ? "warning"
      : "risk"
  const automationStatus =
    safeResult.automationLikelihood === "High"
      ? "risk"
      : safeResult.automationLikelihood === "Medium"
      ? "warning"
      : "good"

  const toneLabel = (label: string) => {
    if (label === "Risk") return t("results.tone.risk")
    if (label === "Warning") return t("results.tone.warning")
    return t("results.tone.good")
  }

  const headerInsight = (() => {
    const growth =
      safeResult.engagementQuality === "High"
        ? t("results.insights.growthStrong")
        : t("results.insights.growthUneven")
    const monetization = isSubscribed
      ? t("results.insights.monetizationClear")
      : t("results.insights.monetizationUnderutilized")
    const risk =
      safeResult.automationLikelihood === "High" ? t("results.insights.automationAttention") : ""
    return [growth, monetization, risk].filter(Boolean).join(", ")
  })()

  const reportSummaryLine = (() => {
    const strength =
      safeResult.engagementQuality === "High"
        ? t("results.summary.strengthEngagement")
        : t("results.summary.strengthConsistency")
    const bottleneck =
      !isSubscribed
        ? t("results.summary.bottleneckMonetization")
        : safeResult.automationLikelihood === "High"
        ? t("results.summary.bottleneckAutomation")
        : t("results.summary.bottleneckPrioritization")
    const nextStep =
      safeResult.engagementQuality === "Low"
        ? t("results.summary.nextStepEngagement")
        : safeResult.automationLikelihood === "High"
        ? t("results.summary.nextStepAutomation")
        : t("results.summary.nextStepExecute")
    return `${strength} • ${bottleneck} • ${nextStep}.`
  })()

  const summaryText = (() => {
    const accountLabel = displayUsername ? `@${displayUsername}` : t("results.instagram.connectPromptHandle")
    return `${t("results.copy.summaryTitle")}\n\n${t("results.copy.accountLabel")}: ${accountLabel}\n${t("results.copy.platformLabel")}: ${
      safeResult.platform === "instagram" ? t("results.platform.instagram") : t("results.platform.threads")
    }\n\n${t("results.copy.primarySignals")}\n- ${t("results.copy.authenticity")}: ${safeResult.confidenceScore}% (${authenticityStatus})\n- ${t("results.copy.engagement")}: ${engagementPercent}% (${engagementStatus})\n- ${t("results.copy.automation")}: ${automationRiskPercent}% (${automationStatus})\n\n${t("results.copy.recommendation")}\n- ${reportSummaryLine}\n\n${t("results.copy.disclaimer")}\n`
  })()

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      try {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.top = "-9999px"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    }
  }

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleCopySummary = async () => {
    const ok = await copyToClipboard(summaryText)
    if (ok) {
      setHeaderCopied(true)
      showToast(t("results.toast.summaryCopied"))
      window.setTimeout(() => setHeaderCopied(false), 1200)
      return
    }
    showToast(t("results.toast.copyFailed"))
  }

  const handleExport = () => {
    if (exporting) return
    setExporting(true)
    try {
      downloadText("account-analysis.txt", `${summaryText}\nDemo data / Sample output.\n`)
      showToast(t("results.toast.exported"))
    } finally {
      window.setTimeout(() => setExporting(false), 500)
    }
  }

  const handleShare = async () => {
    const href = typeof window !== "undefined" ? window.location.href : ""
    const ok = await copyToClipboard(href)
    if (ok) {
      setShareCopied(true)
      showToast(t("results.toast.linkCopied"))
      window.setTimeout(() => setShareCopied(false), 1200)
      return
    }
    showToast(t("results.toast.copyFailed"))
  }

  const handleUpgrade = () => {
    setIsProModalOpen(true)
  }

  const scrollToKpiSection = () => {
    const el = document.getElementById("kpis-section")
    if (!el) return

    const y = el.getBoundingClientRect().top + window.scrollY
    const targetY = y - 120
    window.scrollTo({ top: targetY, behavior: "smooth" })
  }

  const { navigateToProtected, isAuthenticated } = useAuthNavigation()

  const handleConnect = async () => {
    if (connecting) return
    setConnecting(true)
    setConnectEnvError(null)
    
    // Clear auto-connect guard so user-initiated clicks are never blocked
    try {
      sessionStorage.removeItem("ig_auto_connect_attempted")
    } catch {
      // ignore
    }
    
    try {
      const nextPath = `/${activeLocale}/results`
      const oauthUrl = `/api/auth/instagram?provider=instagram&locale=${activeLocale}&next=${encodeURIComponent(nextPath)}`

      // Redirect to OAuth
      window.location.href = oauthUrl
      // Keep connecting state true during redirect
    } catch (err) {
      console.error("[handleConnect] error:", err)
      setConnecting(false)
      showToast(t("results.toast.copyFailed"))
    }
  }

  // Auto-connect mechanism: trigger OAuth once when landing on /results without connection
  useEffect(() => {
    if (typeof window === "undefined") return
    if (connecting) return
    if (igMeLoading) return // Wait for auth check to complete

    const AUTO_CONNECT_KEY = "ig_auto_connect_attempted"
    const AUTO_CONNECT_TTL = 5 * 60 * 1000 // 5 minutes
    
    // Check if user is not connected and hasn't auto-connected recently
    const isNotConnected = igMeUnauthorized || !isConnected
    if (!isNotConnected) return
    
    // Check if we've already attempted auto-connect recently
    try {
      const lastAttempt = sessionStorage.getItem(AUTO_CONNECT_KEY)
      if (lastAttempt) {
        const ts = Number(lastAttempt)
        if (Number.isFinite(ts) && Date.now() - ts < AUTO_CONNECT_TTL) {
          return // Already attempted recently, don't spam
        }
      }
    } catch {
      // ignore
    }
    
    // Check if there's an autoConnect flag in URL (from homepage navigation)
    const params = new URLSearchParams(searchParams?.toString() || "")
    const shouldAutoConnect = params.has("autoConnect") || params.has("fromHome")
    
    if (shouldAutoConnect) {
      // Mark that we've attempted auto-connect
      try {
        sessionStorage.setItem(AUTO_CONNECT_KEY, String(Date.now()))
      } catch {
        // ignore
      }
      
      // Trigger OAuth after a short delay to ensure UI is mounted
      const timer = setTimeout(() => {
        handleConnect()
      }, 300)
      
      return () => clearTimeout(timer)
    }
  }, [connecting, igMeLoading, igMeUnauthorized, isConnected, searchParams, activeLocale])

  const priorityLabel = (label: string) => {
    if (label === "High priority") return t("results.priority.high")
    if (label === "Medium priority") return t("results.priority.medium")
    return t("results.priority.maintain")
  }

  const nextPriorityLabel = (status: "good" | "warning" | "risk") => {
    if (status === "risk") return t("results.priority.high")
    if (status === "warning") return t("results.priority.medium")
    return t("results.priority.maintain")
  }

  const [kpiExpanded, setKpiExpanded] = useState(false)
  const [isSmUpViewport, setIsSmUpViewport] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 640px)")
    const sync = () => setIsSmUpViewport(mq.matches)
    sync()
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync)
      return () => mq.removeEventListener("change", sync)
    }
    mq.addListener(sync)
    return () => mq.removeListener(sync)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setIsMobile(mq.matches)
    sync()
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync)
      return () => mq.removeEventListener("change", sync)
    }
    mq.addListener(sync)
    return () => mq.removeListener(sync)
  }, [])

  const goalOptions: Array<{
    id: NonNullable<typeof selectedGoal>
    labelKey: string
    primaryKpi: "followers" | "engagementRate" | "avgLikes" | "avgComments" | "engagementVolume" | "postsPerWeek"
  }> = [
    {
      id: "growthStageAccount",
      labelKey: "results.goals.options.growthStageAccount",
      primaryKpi: "followers",
    },
    {
      id: "personalBrandBuilder",
      labelKey: "results.goals.options.personalBrandBuilder",
      primaryKpi: "avgLikes",
    },
    {
      id: "trafficFocusedCreator",
      labelKey: "results.goals.options.trafficFocusedCreator",
      primaryKpi: "avgComments",
    },
    {
      id: "highEngagementCommunity",
      labelKey: "results.goals.options.highEngagementCommunity",
      primaryKpi: "postsPerWeek",
    },
    {
      id: "serviceClientReady",
      labelKey: "results.goals.options.serviceClientReady",
      primaryKpi: "engagementRate",
    },
    {
      id: "brandCollaborationProfile",
      labelKey: "results.goals.options.brandCollaborationProfile",
      primaryKpi: "engagementRate",
    },
    {
      id: "fullTimeCreator",
      labelKey: "results.goals.options.fullTimeCreator",
      primaryKpi: "postsPerWeek",
    },
    {
      id: "monetizationFocusedAccount",
      labelKey: "results.goals.options.monetizationFocusedAccount",
      primaryKpi: "engagementRate",
    },
  ]

  const selectedGoalConfig = selectedGoal ? goalOptions.find((o) => o.id === selectedGoal) : null

  const goalMeta: Record<
    NonNullable<typeof selectedGoal> | "default",
    {
      label: string
      levelLabel: string
      actions: Array<{ titleKey: string; descKey: string; isPro: boolean }>
    }
  > = {
    default: {
      label: safeT("results.goals.title"),
      levelLabel: safeT("results.levelPill.default"),
      actions: [
        {
          titleKey: "results.nextActions.actions.default.1.title",
          descKey: "results.nextActions.actions.default.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.default.2.title",
          descKey: "results.nextActions.actions.default.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.default.3.title",
          descKey: "results.nextActions.actions.default.3.desc",
          isPro: true,
        },
      ],
    },
    growthStageAccount: {
      label: safeT("results.goals.options.growthStageAccount"),
      levelLabel: safeT("results.levelPill.growthStageAccount"),
      actions: [
        {
          titleKey: "results.nextActions.actions.growthStageAccount.1.title",
          descKey: "results.nextActions.actions.growthStageAccount.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.growthStageAccount.2.title",
          descKey: "results.nextActions.actions.growthStageAccount.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.growthStageAccount.3.title",
          descKey: "results.nextActions.actions.growthStageAccount.3.desc",
          isPro: true,
        },
      ],
    },
    personalBrandBuilder: {
      label: safeT("results.goals.options.personalBrandBuilder"),
      levelLabel: safeT("results.levelPill.personalBrandBuilder"),
      actions: [
        {
          titleKey: "results.nextActions.actions.personalBrandBuilder.1.title",
          descKey: "results.nextActions.actions.personalBrandBuilder.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.personalBrandBuilder.2.title",
          descKey: "results.nextActions.actions.personalBrandBuilder.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.personalBrandBuilder.3.title",
          descKey: "results.nextActions.actions.personalBrandBuilder.3.desc",
          isPro: true,
        },
      ],
    },
    trafficFocusedCreator: {
      label: safeT("results.goals.options.trafficFocusedCreator"),
      levelLabel: safeT("results.levelPill.trafficFocusedCreator"),
      actions: [
        {
          titleKey: "results.nextActions.actions.trafficFocusedCreator.1.title",
          descKey: "results.nextActions.actions.trafficFocusedCreator.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.trafficFocusedCreator.2.title",
          descKey: "results.nextActions.actions.trafficFocusedCreator.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.trafficFocusedCreator.3.title",
          descKey: "results.nextActions.actions.trafficFocusedCreator.3.desc",
          isPro: true,
        },
      ],
    },
    highEngagementCommunity: {
      label: safeT("results.goals.options.highEngagementCommunity"),
      levelLabel: safeT("results.levelPill.highEngagementCommunity"),
      actions: [
        {
          titleKey: "results.nextActions.actions.highEngagementCommunity.1.title",
          descKey: "results.nextActions.actions.highEngagementCommunity.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.highEngagementCommunity.2.title",
          descKey: "results.nextActions.actions.highEngagementCommunity.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.highEngagementCommunity.3.title",
          descKey: "results.nextActions.actions.highEngagementCommunity.3.desc",
          isPro: true,
        },
      ],
    },
    serviceClientReady: {
      label: safeT("results.goals.options.serviceClientReady"),
      levelLabel: safeT("results.levelPill.serviceClientReady"),
      actions: [
        {
          titleKey: "results.nextActions.actions.serviceClientReady.1.title",
          descKey: "results.nextActions.actions.serviceClientReady.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.serviceClientReady.2.title",
          descKey: "results.nextActions.actions.serviceClientReady.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.serviceClientReady.3.title",
          descKey: "results.nextActions.actions.serviceClientReady.3.desc",
          isPro: true,
        },
      ],
    },
    brandCollaborationProfile: {
      label: safeT("results.goals.options.brandCollaborationProfile"),
      levelLabel: safeT("results.levelPill.brandCollaborationProfile"),
      actions: [
        {
          titleKey: "results.nextActions.actions.brandCollaborationProfile.1.title",
          descKey: "results.nextActions.actions.brandCollaborationProfile.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.brandCollaborationProfile.2.title",
          descKey: "results.nextActions.actions.brandCollaborationProfile.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.brandCollaborationProfile.3.title",
          descKey: "results.nextActions.actions.brandCollaborationProfile.3.desc",
          isPro: true,
        },
      ],
    },
    fullTimeCreator: {
      label: safeT("results.goals.options.fullTimeCreator"),
      levelLabel: safeT("results.levelPill.fullTimeCreator"),
      actions: [
        {
          titleKey: "results.nextActions.actions.fullTimeCreator.1.title",
          descKey: "results.nextActions.actions.fullTimeCreator.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.fullTimeCreator.2.title",
          descKey: "results.nextActions.actions.fullTimeCreator.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.fullTimeCreator.3.title",
          descKey: "results.nextActions.actions.fullTimeCreator.3.desc",
          isPro: true,
        },
      ],
    },
    monetizationFocusedAccount: {
      label: safeT("results.goals.options.monetizationFocusedAccount"),
      levelLabel: safeT("results.levelPill.monetizationFocusedAccount"),
      actions: [
        {
          titleKey: "results.nextActions.actions.monetizationFocusedAccount.1.title",
          descKey: "results.nextActions.actions.monetizationFocusedAccount.1.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.monetizationFocusedAccount.2.title",
          descKey: "results.nextActions.actions.monetizationFocusedAccount.2.desc",
          isPro: false,
        },
        {
          titleKey: "results.nextActions.actions.monetizationFocusedAccount.3.title",
          descKey: "results.nextActions.actions.monetizationFocusedAccount.3.desc",
          isPro: true,
        },
      ],
    },
  }

  // (UI-only) previous interactive next-actions state removed

  const kpis: Array<{
    id: "followers" | "engagementRate" | "avgLikes" | "avgComments" | "engagementVolume" | "postsPerWeek"
    titleKey: string
    descriptionKey: string
    value: string
    preview?: boolean
  }> = [
    {
      id: "followers",
      titleKey: "results.kpis.followers.title",
      descriptionKey: "results.kpis.followers.description",
      value: allowDemoProfile ? mockAnalysis.profile.followers.toLocaleString() : formatNum(kpiFollowers),
      preview: isConnected ? isPreview(kpiFollowers) : false,
    },
    {
      id: "engagementRate",
      titleKey: "results.kpis.engagementRate.title",
      descriptionKey: "results.kpis.engagementRate.description",
      value: (() => {
        if (!isConnected) return `${(mockAnalysis.metrics.engagementRate * 100).toFixed(1)}%`
        const dbPct = typeof creatorCardPreviewData?.engagementRate === "number" && Number.isFinite(creatorCardPreviewData.engagementRate) ? creatorCardPreviewData.engagementRate : null
        return dbPct === null ? "—" : `${dbPct.toFixed(2)}%`
      })(),
      preview: isConnected ? (typeof creatorCardPreviewData?.engagementRate !== "number" || !Number.isFinite(creatorCardPreviewData.engagementRate)) : false,
    },
    {
      id: "avgLikes",
      titleKey: "results.kpis.avgLikes.title",
      descriptionKey: "results.kpis.avgLikes.description",
      value: (() => {
        if (!isConnected) return mockAnalysis.metrics.avgLikes.toLocaleString()
        const dbAvg = typeof creatorCardPreviewData?.avgLikes === "number" && Number.isFinite(creatorCardPreviewData.avgLikes) ? creatorCardPreviewData.avgLikes : null
        return dbAvg === null ? "—" : Math.round(dbAvg).toLocaleString()
      })(),
      preview: isConnected,
    },
    {
      id: "avgComments",
      titleKey: "results.kpis.avgComments.title",
      descriptionKey: "results.kpis.avgComments.description",
      value: (() => {
        if (!isConnected) return mockAnalysis.metrics.avgComments.toLocaleString()
        const dbAvg = typeof creatorCardPreviewData?.avgComments === "number" && Number.isFinite(creatorCardPreviewData.avgComments) ? creatorCardPreviewData.avgComments : null
        return dbAvg === null ? "—" : Math.round(dbAvg).toLocaleString()
      })(),
      preview: isConnected,
    },
    {
      id: "engagementVolume",
      titleKey: "results.kpis.engagementVolume.title",
      descriptionKey: "results.kpis.engagementVolume.description",
      value: isConnected
        ? "—"
        : (mockAnalysis.metrics.avgLikes + mockAnalysis.metrics.avgComments).toLocaleString(),
      preview: isConnected,
    },
    {
      id: "postsPerWeek",
      titleKey: "results.kpis.postsPerWeek.title",
      descriptionKey: "results.kpis.postsPerWeek.description",
      value: isConnected ? "—" : mockAnalysis.metrics.postsPerWeek.toFixed(1),
      preview: isConnected,
    },
  ]

  const kpiInterpretationKey = (
    goalId: NonNullable<typeof selectedGoal>,
    kpiId: (typeof kpis)[number]["id"],
    field: "focus" | "role" | "status" | "note"
  ) => `results.goals.interpretations.${goalId}.${kpiId}.${field}`

  const kpiEvaluationLevel = (
    goalId: NonNullable<typeof selectedGoal>,
    kpiId: (typeof kpis)[number]["id"]
  ) => {
    const raw = t(`results.goals.evaluations.${goalId}.${kpiId}.level`)
    if (raw === "low" || raw === "medium" || raw === "strong") return raw
    return "medium" as const
  }

  const kpiEvaluationTone = (level: "low" | "medium" | "strong") => {
    if (level === "low") {
      return {
        container: "border-white/10 bg-white/3",
        pill: "border-white/15 bg-white/5 text-slate-300/90",
        bar: "bg-slate-400/60",
        barEmpty: "bg-white/5",
      }
    }
    if (level === "medium") {
      return {
        container: "border-sky-400/15 bg-sky-500/5",
        pill: "border-sky-400/20 bg-sky-500/10 text-sky-100/95",
        bar: "bg-sky-300/80",
        barEmpty: "bg-sky-500/10",
      }
    }
    return {
      container: "border-emerald-500/20 bg-emerald-500/5",
      pill: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200/95",
      bar: "bg-emerald-400/80",
      barEmpty: "bg-emerald-500/10",
    }
  }

  const derivedGateState: GateState = (() => {
    if (loadTimedOut) return "ready"
    if ((igMeLoading || (isConnected && !mediaLoaded)) && !hasAnyResultsData) return "loading"
    if (igMeUnauthorized || !isConnected) return "needs_connect"
    if (isConnected && hasSuccessfulMePayloadRef.current && mediaLoaded && effectiveRecentLen === 0) return "needs_setup"
    return "ready"
  })()

  const creatorCardEngagementRateText = (() => {
    const dbPct = isRecord(creatorStats) && typeof creatorStats.engagementRatePct === "number" ? creatorStats.engagementRatePct : null
    if (typeof dbPct === "number" && Number.isFinite(dbPct)) return `${dbPct.toFixed(2)}%`
    if (typeof engagementRatePctFormatted === "string" && engagementRatePctFormatted.trim() && engagementRatePctFormatted !== "—") {
      return engagementRatePctFormatted
    }
    const pct = computedMetrics?.engagementRatePct
    if (typeof pct === "number" && Number.isFinite(pct)) return `${pct.toFixed(2)}%`
    return null
  })()

  if (derivedGateState === "loading")
    return (
      <LoadingCard
        t={t}
        isSlow={gateIsSlow}
        onRetry={() => {
          setGateIsSlow(false)
          setLoadTimedOut(false)
          setLoadError(false)
          hasFetchedMediaRef.current = false
          __resultsMediaFetchedOnce = false
          setMediaLoaded(false)
          hasFetchedMeRef.current = false
          __resultsMeFetchedOnce = false
          hasSuccessfulMePayloadRef.current = false
          fireRefresh("manual")
        }}
        onRefresh={() => {
          setLoadTimedOut(false)
          setLoadError(false)
          hasFetchedMediaRef.current = false
          __resultsMediaFetchedOnce = false
          setMediaLoaded(false)
          hasFetchedMeRef.current = false
          __resultsMeFetchedOnce = false
          hasSuccessfulMePayloadRef.current = false
          fireRefresh("manual")
        }}
        onBack={() => router.push(localePathname("/", activeLocale))}
      />
    )

  if (loadTimedOut && !hasAnyResultsData)
    return (
      <GateShell title={t("results.syncingTitle")} subtitle={t("results.updateSlow")}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => {
                setLoadTimedOut(false)
                setLoadError(false)
                hasFetchedMediaRef.current = false
                __resultsMediaFetchedOnce = false
                setMediaLoaded(false)
                hasFetchedMeRef.current = false
                __resultsMeFetchedOnce = false
                hasSuccessfulMePayloadRef.current = false
                fireRefresh("manual")
              }}
            >
              {t("results.retry")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/15 text-slate-200 hover:bg-white/5 w-full sm:w-auto"
              onClick={() => router.push(localePathname("/", activeLocale))}
            >
              {t("results.back")}
            </Button>
          </div>
        </div>
      </GateShell>
    )

  if (derivedGateState === "needs_connect")
    return (
      <ConnectCard
        t={t}
        onConnect={handleConnect}
        onBack={() => router.push(localePathname("/", activeLocale))}
        connectEnvError={connectEnvError}
        connecting={connecting}
      />
    )

  if (derivedGateState === "needs_setup")
    return (
      <SetupHelpCard
        t={t}
        onRetry={() => {
          hasFetchedMediaRef.current = false
          __resultsMediaFetchedOnce = false
          setMediaLoaded(false)
          hasFetchedMeRef.current = false
          __resultsMeFetchedOnce = false
          hasSuccessfulMePayloadRef.current = false
          fireRefresh("manual")
        }}
        onReconnect={handleConnect}
      />
    )

  return (
    <>
      <style jsx>{shimmerStyles}</style>
      <ResultsDebugPanel
        refreshDebug={refreshDebug}
        orchestratorDebug={{
          ...(isRecord(orchestratorDebug) ? orchestratorDebug : {}),
          revalidateSeq: { mediaRevalidateSeq, trendRevalidateSeq, snapshotRevalidateSeq },
        }}
      />

      {__DEV__ && (
        <div className="fixed bottom-3 right-3 z-[80] min-w-0">
          <div className="min-w-0 max-w-[min(420px,92vw)]">
            <button
              type="button"
              onClick={() => setDevErrorPanelOpen((v) => !v)}
              className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-white/15 bg-[#0b1220]/85 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur hover:bg-white/5"
              aria-expanded={devErrorPanelOpen}
            >
              {`錯誤面板 / Errors (${devErrors.length})`}
            </button>

            {devErrorPanelOpen && (
              <div className="mt-2 rounded-xl border border-white/10 bg-[#0b1220]/90 backdrop-blur shadow-xl overflow-hidden min-w-0">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 min-w-0">
                  <div className="text-[11px] text-white/70 min-w-0 truncate">
                    {isZh ? "最近錯誤" : "Recent errors"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDevErrors([])}
                    className="min-h-[36px] px-2 text-[11px] font-semibold text-white/70 hover:text-white/90"
                  >
                    {isZh ? "清除" : "Clear"}
                  </button>
                </div>
                <div className="max-h-[min(50vh,360px)] overflow-y-auto overflow-x-hidden p-2 space-y-2 min-w-0">
                  {devErrors.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-white/55 min-w-0 break-words">
                      {isZh ? "目前沒有錯誤" : "No errors captured"}
                    </div>
                  ) : (
                    devErrors.map((e) => (
                      <div key={e.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 min-w-0">
                        <div className="text-[10px] text-white/50 tabular-nums whitespace-nowrap truncate min-w-0">
                          {new Date(e.at).toLocaleTimeString()} · {e.type}
                        </div>
                        <div className="mt-1 text-[11px] text-white/80 leading-snug min-w-0 break-words whitespace-pre-wrap">
                          {e.message}
                        </div>
                        {e.stack ? (
                          <pre className="mt-1 text-[10px] text-white/55 leading-snug min-w-0 whitespace-pre-wrap break-words">
                            {e.stack}
                          </pre>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConnectedGate
        notConnectedUI={
          <>
          {hasAnyResultsData && isUpdating && (
            <div className="sticky top-[56px] sm:top-[60px] z-40 w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md">
              <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                  <div className="text-[12px] sm:text-xs text-white/70 min-w-0 truncate">{t("results.updating")}</div>
                </div>
              </div>
            </div>
          )}

          <div aria-live="polite" className="sr-only">
            {toast ?? ""}
          </div>
          {toast && (
            <div className="fixed top-4 right-4 z-[60]">
              <div className="rounded-xl border border-white/10 bg-[#0b1220]/85 backdrop-blur-md px-4 py-3 text-sm text-slate-200 shadow-xl">
                {toast}
              </div>
            </div>
          )}

          {hasAnyResultsData && updateSlow && (
            <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 sm:px-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white min-w-0 truncate">{t("results.updateSlow")}</div>
                  <div className="mt-1 text-[13px] text-white/70 leading-snug min-w-0 break-words">
                    {t("results.showCurrentData")}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setUpdateSlow(false)
                      fireRefresh("manual")
                    }}
                  >
                    {t("results.retry")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 w-full sm:w-auto"
                    onClick={() => setUpdateSlow(false)}
                  >
                    {t("results.showCurrentData")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {igMeUnauthorized && (
            <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 sm:px-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white min-w-0 truncate">{t("results.instagram.authExpired.title")}</div>
                  <div className="mt-1 text-[13px] text-white/70 leading-snug min-w-0 break-words">
                    {t("results.instagram.authExpired.desc")}
                  </div>
                </div>

                <Link
                  href={`/api/auth/instagram?provider=instagram&next=/${activeLocale}/results`}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_8px_20px_rgba(168,85,247,0.25)] hover:brightness-110 active:translate-y-[1px] transition w-full sm:w-auto"
                >
                  {t("results.instagram.authExpired.reconnect")}
                </Link>
              </div>
            </div>
          )}

          <div className="mt-3 sm:mt-4 space-y-4 sm:space-y-4">
            {isConnected && (
              <Card className={CARD_SHELL}>
                <CardHeader className={CARD_HEADER_ROW}>
                  <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.instagram.recentPostsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-5 lg:p-5">
                  {Array.isArray(recentPosts) && recentPosts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {recentPosts.slice(0, 3).map((m) => {
                        const caption = typeof m.caption === "string" ? m.caption : ""
                        const mediaUrl = typeof m.media_url === "string" ? m.media_url : ""
                        const previewUrl = mediaUrl && mediaUrl.startsWith("http") ? toThumbProxyUrl(mediaUrl) : mediaUrl
                        const ts = typeof m.timestamp === "string" ? m.timestamp : ""
                        const dateLabel = ts ? new Date(ts).toLocaleString() : ""

                        return (
                          <div key={m.id} className="rounded-xl border border-white/10 bg-white/5 overflow-visible">
                            <div className="aspect-square bg-black/20">
                              {previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <SafeIgThumb src={previewUrl} alt={caption ? caption.slice(0, 40) : m.id} className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
                                  {t("results.instagram.recentPostsNoPreview")}
                                </div>
                              )}
                            </div>
                            <div className="p-3 space-y-2">
                              {dateLabel && <div className="text-xs text-slate-400">{dateLabel}</div>}
                              {caption ? (
                                <div className="text-sm text-slate-200 line-clamp-3">{caption}</div>
                              ) : (
                                <div className="text-sm text-slate-400">{t("results.instagram.recentPostsNoCaption")}</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-300">{t("results.instagram.recentPostsEmpty")}</div>
                  )}
                </CardContent>
              </Card>
            )}
            <div className="flex items-center justify-between w-full">
              <div>
                <div className="text-sm text-green-400">{t("results.performance.kicker")}</div>
                <h2 className="text-lg font-semibold text-white">{t("results.performance.title")}</h2>
              </div>
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="text-slate-200 hover:bg-white/5 inline-flex items-center gap-3"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="leading-snug">{t("results.actions.back")}</span>
              </Button>
            </div>

            {/* Responsive grid: 手機 1 欄；有 sidebar 時 md+ 並排，無 sidebar 則單欄撐滿 */}
            <div className="grid grid-cols-1 gap-4 lg:gap-4">
              <div className="w-full lg:col-span-2 space-y-4 lg:space-y-4">
                <Card id="results-section-performance" className={CARD_SHELL_HOVER}>
                  <CardHeader className={CARD_HEADER_ROW}>
                    <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.performance.cardTitle")}</CardTitle>
                    <p className="text-sm text-slate-400 mt-1 min-w-0 line-clamp-2 leading-snug">
                      {t("results.performance.radarDesc")}
                    </p>
                  </CardHeader>
                  <CardContent className="p-4 md:p-5 lg:p-5">
                    <div className="space-y-4 md:space-y-5">
                      <div>
                        <div className="text-sm font-medium text-white">{t("results.performance.radarTitle")}</div>
                        <div className="text-sm text-slate-300">{t("results.performance.radarDesc")}</div>
                      </div>
                      <div className="pt-2 border-t border-white/10 text-sm text-slate-300">
                        {t("results.performance.howToInterpret")}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card id="results-section-monetization" className={CARD_SHELL_HOVER}>
                  <CardHeader className={CARD_HEADER_ROW}>
                    <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.monetization.title")}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-5 lg:p-5">
                    <p className="text-xs text-slate-400 mb-3">
                      {t("results.monetization.subtitle")}
                    </p>
                    <div className="relative rounded-xl border border-white/8 bg-white/5 p-3">
                      <div className={!isSubscribed ? "blur-sm pointer-events-none select-none" : undefined}>
                        <MonetizationSection 
                          monetizationGap={18} // This would be calculated from the analysis in a real app
                          isSubscribed={isSubscribed}
                        />
                      </div>

                      {!isSubscribed && (
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#0b1220]/80 backdrop-blur-sm p-4">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                              <div className="space-y-3">
                                <div className="text-sm text-slate-200">
                                  {t("results.monetization.paywall.stat")}
                                </div>
                                <div className="text-sm text-slate-300 leading-snug">
                                  {t("results.monetization.paywall.desc")}
                                </div>
                                <div className="pt-2">
                                  <div className="text-xs text-slate-300">{t("results.monetization.paywall.unlocks")}</div>
                                  <ul className="mt-2 text-sm text-slate-200 space-y-2">
                                    <li>{t("results.monetization.paywall.items.growthLevers")}</li>
                                    <li>{t("results.monetization.paywall.items.timing")}</li>
                                    <li>{t("results.monetization.paywall.items.optimizations")}</li>
                                    <li>{t("results.monetization.paywall.items.actionPlan")}</li>
                                  </ul>
                                </div>
                              </div>
                              <div className="w-full lg:w-auto flex flex-col gap-2">
                                <Button
                                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full lg:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                                  onClick={handleUpgrade}
                                >
                                  {t("results.monetization.paywall.cta")}
                                </Button>
                                <Button
                                  variant="outline"
                                  className="border-white/15 text-slate-200 hover:bg-white/5 w-full lg:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                                  onClick={handleConnect}
                                >
                                  {t("results.actions.connect")}
                                </Button>
                                <div className="text-xs text-slate-300">
                                  {t("results.monetization.paywall.note")}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <section id="account-insights-section" className="scroll-mt-40">
                  <Card className={"mt-8 " + CARD_SHELL_HOVER}>
                    <CardHeader className={CARD_HEADER_ROW}>
                      <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.insights.title")}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 lg:p-6">
                      <div className="space-y-2 sm:space-y-3">
                        <div className="grid grid-cols-2 gap-4 lg:gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">{t("results.insights.fields.accountType")}</p>
                            <p className="font-medium">{accountTypeLabel(safeResult.accountType)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t("results.insights.fields.accountAge")}</p>
                            <p className="font-medium">{accountAgeLabel(safeResult.accountAge)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t("results.insights.fields.visibility")}</p>
                            <p className="font-medium">{visibilityLabel(safeResult.visibility)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t("results.insights.fields.postingFrequency")}</p>
                            <p className="font-medium">{postingFrequencyLabel(safeResult.postingFrequency)}</p>
                          </div>
                        </div>

                        {safeResult.notes.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium mb-2">{t("results.insights.keyFindings")}</h3>
                            <ul className="space-y-2 lg:space-y-1.5">
                              {safeResult.notes.map((note, i) => (
                                <li key={i} className="flex items-start">
                                  <span className="text-green-500 mr-2">•</span>
                                  <span className="leading-snug">{noteLabel(note)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </section>

                {/* Share Results Section - Moved to bottom of main content */}
              </div>
            </div>

            <Card className={"mt-3 " + CARD_SHELL}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{t("results.profile.followers")}</div>
                    {shouldShowStatsSkeleton ? (
                      <StatsValueSkeleton />
                    ) : (
                      <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-xl font-semibold text-white leading-none min-w-0">
                        <span className="tabular-nums whitespace-nowrap">{formatNum(followers)}</span>
                        {isPreview(kpiFollowers) && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                            {t("results.common.preview")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{t("results.profile.followingLabel")}</div>
                    {shouldShowStatsSkeleton ? (
                      <StatsValueSkeleton />
                    ) : (
                      <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-xl font-semibold text-white leading-none min-w-0">
                        <span className="tabular-nums whitespace-nowrap">{formatNum(following)}</span>
                        {isPreview(kpiFollowing) && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                            {t("results.common.preview")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{t("results.profile.postsLabel")}</div>
                    {shouldShowStatsSkeleton ? (
                      <StatsValueSkeleton />
                    ) : (
                      <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-xl font-semibold text-white leading-none min-w-0">
                        <span className="tabular-nums whitespace-nowrap">{formatNum(posts)}</span>
                        {isPreview(kpiPosts) && (
                          <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                            {t("results.common.preview")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {false && (
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                  <CardTitle className="text-xl font-bold">{t("results.copyable.title")}</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">
                    {t("results.copyable.subtitle")}
                  </p>
                </CardHeader>
                <CardContent className="p-4 lg:p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                    <textarea
                      className="w-full min-h-[180px] rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200 outline-none resize-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      readOnly
                      defaultValue={summaryText}
                    />
                    <Button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full lg:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                      onClick={handleCopySummary}
                      aria-busy={headerCopied ? true : undefined}
                    >
                      {t("results.copyable.copy")}
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-400 leading-snug">
                    {t("results.copyable.disclaimer")}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="mt-4 lg:mt-4 space-y-4">
              <ShareResults 
                platform={safeResult.platform === 'instagram' ? 'Instagram' : 'Threads'}
                username={displayUsername}
                monetizationGap={18}
              />
              <div
                ref={upgradeCardRef}
                className={`rounded-2xl border border-white/10 bg-[#0b1220]/60 backdrop-blur-md px-5 md:px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.35)] relative overflow-hidden transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                  upgradeHighlight ? "ring-2 ring-blue-500/50" : ""
                } ${upgradeCardInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"} transition-[opacity,transform] duration-500 ease-out will-change-transform`}
              >
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-indigo-500/15 pointer-events-none" />

                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white leading-tight">{t("results.footer.proPitchTitle")}</div>
                        <div className="mt-1 text-xs text-white/70 leading-snug">{t("results.footer.proPitchDesc")}</div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-white/10 border border-white/15">
                        PRO
                      </span>
                    </div>
                  </div>

                  <Button
                    id="results-pro-upgrade"
                    variant="outline"
                    className="w-full md:w-auto border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={handleUpgrade}
                  >
                    {t("results.footer.upgrade")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {isProModalOpen && (
            <div className="fixed inset-0 z-[70] pointer-events-none">
              <div className="pointer-events-auto">
                <div className="absolute inset-x-4 sm:inset-x-6 md:inset-x-0 md:left-1/2 md:-translate-x-1/2 top-24 md:top-28 md:w-[640px] rounded-2xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
                  <div className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mt-1 text-lg font-semibold text-white leading-snug">{t("results.footer.proModalTitle")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-snug">{t("results.footer.proModalDesc")}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-slate-200 hover:bg-white/5"
                      onClick={() => setIsProModalOpen(false)}
                    >
                      {t("results.footer.proModalSecondary")}
                    </Button>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-white/5 p-3">
                    <div className="text-sm font-medium text-white">{t("results.footer.proModalBulletsTitle")}</div>
                    <ul className="mt-2 text-sm text-slate-200 space-y-1.5">
                      <li>{t("results.footer.proModalBullets.1")}</li>
                      <li>{t("results.footer.proModalBullets.2")}</li>
                      <li>{t("results.footer.proModalBullets.3")}</li>
                    </ul>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      onClick={() => setIsProModalOpen(false)}
                    >
                      {t("results.footer.proModalSecondary")}
                    </Button>
                    <Button
                      type="button"
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      onClick={() => {
                        setIsProModalOpen(false)
                        scrollToId("results-pro-upgrade", "center")
                        flashUpgradeHighlight()
                      }}
                    >
                      {t("results.footer.proModalPrimary")}
                    </Button>
                  </div>
                </div>
                </div>
              </div>
            </div>
          )}
        </>
        }
        connectedUI={
          <>
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-5">
            <div className="max-w-xl space-y-1">
              <div className="text-sm text-green-400">{t("results.instagram.connectedBadge")}</div>
            </div>
            <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto sm:min-w-[240px] justify-end">
              <Link
                href={`/${activeLocale}/pricing`}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_6px_18px_rgba(168,85,247,0.28)] hover:brightness-110 active:translate-y-[1px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
              >
                <span className="inline-flex items-center gap-2">
                  {t("results.actions.viewFullAnalysis")}
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                    {safeT("results.proBadge")}
                  </span>
                </span>
              </Link>

              <Link
                href={`/${activeLocale}/post-analysis`}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full text-xs font-semibold text-white bg-gradient-to-r from-emerald-400 to-sky-500 shadow-[0_10px_24px_rgba(16,185,129,0.22)] hover:brightness-110 active:translate-y-[1px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                {t("results.actions.analyzePost")}
              </Link>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-4 md:px-6 pb-4">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("results.preview.heading")}
              </h2>

              <p className="mt-1 text-xs text-muted-foreground leading-snug">
                {t("results.preview.description")}
              </p>
            </div>

            <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <CardContent className="p-3 md:p-4">
                <div className="flex items-start gap-4">
                  {(() => {
                    const avatarUrl = dbAvatarUrl
                      ? dbAvatarUrl
                      : isRecord(igMe) && typeof igMe.profile_picture_url === "string"
                        ? String(igMe.profile_picture_url)
                        : ""

                    return avatarUrl ? (
                      <SafeIgThumb
                        src={avatarUrl}
                        alt={displayHandle}
                        className="h-16 w-16 md:h-20 md:w-20 rounded-full border border-white/10 object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 md:h-20 md:w-20 rounded-full border border-white/10 bg-white/10 shrink-0" />
                    )
                  })()}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-white truncate">{displayName}</div>
                        <div className="text-xs text-slate-300 truncate">{displayHandle}</div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 min-w-0">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                          {safeT("results.proBadge")}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 max-w-[160px] min-w-0 truncate">
                          {t(selectedGoal ? `results.positioning.labels.${selectedGoal}` : "results.positioning.labels.default")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20 min-w-0">
                        <div className="text-[10px] leading-tight text-white/60 whitespace-nowrap truncate min-w-0">{t("results.profile.followers")}</div>
                        <div className="mt-0.5 text-[clamp(14px,4vw,16px)] font-semibold tabular-nums whitespace-nowrap truncate min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
                          {formatCompact(followersCount) ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20 min-w-0">
                        <div className="text-[10px] leading-tight text-white/60 whitespace-nowrap truncate min-w-0">{t("results.profile.following")}</div>
                        <div className="mt-0.5 text-[clamp(14px,4vw,16px)] font-semibold tabular-nums whitespace-nowrap truncate min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
                          {formatCompact(followsCount) ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20 min-w-0">
                        <div className="text-[10px] leading-tight text-white/60 whitespace-nowrap truncate min-w-0">{t("results.profile.posts")}</div>
                        <div className="mt-0.5 text-[clamp(14px,4vw,16px)] font-semibold tabular-nums whitespace-nowrap truncate min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
                          {formatCompact(mediaCount) ?? "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-4">
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {(() => {
                  const ring1Val = isConnected
                    ? engagementRate
                    : numOrNull(Math.round((mockAnalysis.metrics.engagementRate ?? 0) * 100))

                  const ring2Val = isConnected
                    ? computedMetrics?.avgLikes === null
                      ? null
                      : numOrNull(Math.min(100, Math.round(((computedMetrics?.avgLikes ?? 0) / 1000) * 100)))
                    : numOrNull(Math.min(100, Math.round(((mockAnalysis.metrics.avgLikes ?? 0) / 1000) * 100)))

                  const ring3Val = isConnected
                    ? computedMetrics?.avgComments === null
                      ? null
                      : numOrNull(Math.min(100, Math.round(((computedMetrics?.avgComments ?? 0) / 100) * 100)))
                    : numOrNull(Math.min(100, Math.round(((mockAnalysis.metrics.avgComments ?? 0) / 100) * 100)))

                  const previewBadge = (
                    <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                      {t("results.common.preview")}
                    </span>
                  )

                  return (
                    <>
                      <ProgressRing
                        value={safePercent(ring1Val)}
                        label={t("results.rings.engagementRate.label")}
                        centerText={isConnected ? engagementRatePctFormatted : undefined}
                        subLabel={
                          isConnected ? (
                            <>
                              {computedMetrics?.engagementRatePct === null
                                ? "—"
                                : formatPct2(computedMetrics?.engagementRatePct ?? null)}
                              {isPreview(ring1Val) ? previewBadge : null}
                            </>
                          ) : (
                            t("results.rings.engagementRate.description")
                          )
                        }
                      />
                      <ProgressRing
                        value={safePercent(ring2Val)}
                        label={uiCopy.avgLikesLabel}
                        centerText={isConnected ? avgLikesFormatted : undefined}
                        subLabel={
                          isConnected ? (
                            <>
                              {uiCopy.perPostLast25}
                              {isPreview(ring2Val) ? previewBadge : null}
                            </>
                          ) : (
                            t("results.rings.likeStrength.description")
                          )
                        }
                      />
                      <div className="col-span-2 sm:col-span-1">
                        <ProgressRing
                          value={safePercent(ring3Val)}
                          label={uiCopy.avgCommentsLabel}
                          centerText={isConnected ? avgCommentsFormatted : undefined}
                          subLabel={
                            isConnected ? (
                              <>
                                {uiCopy.perPostLast25}
                                {isPreview(ring3Val) ? previewBadge : null}
                              </>
                            ) : (
                              t("results.rings.commentStrength.description")
                            )
                          }
                        />
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <div className="h-px w-48 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </div>

            <Card className="mt-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <CardHeader className="border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 flex items-start sm:items-center justify-between gap-3 min-w-0">
                <div className="min-w-0 shrink-0">
                  <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.trend.title")}</CardTitle>
                  {focusedAccountTrendMetric === "followers" ? (
                    <div className="mt-1 text-[11px] text-white/55 leading-snug min-w-0 break-words">
                      {isZh
                        ? "提示：粉絲是累積值，使用階梯線顯示每日變化；滑動查看單日增量"
                        : "Tip: Followers are cumulative. Step chart shows daily changes; hover to see deltas."}
                    </div>
                  ) : null}
                </div>
                <div className="text-[11px] sm:text-sm text-slate-400 min-w-0 leading-snug text-left sm:text-right overflow-hidden max-w-[45%]">
                  <div className="min-w-0 truncate">帳號互動趨勢</div>
                  <div className="min-w-0 truncate hidden sm:block">Account engagement trend</div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-1 lg:p-6 lg:pt-2">
                {trendNeedsConnectHint ? (
                  <div className="mt-2 text-[11px] sm:text-xs text-white/55 leading-snug min-w-0">
                    {t("results.connect.subtitle")}
                  </div>
                ) : null}
                {shouldShowEmptySeriesHint ? (
                  <div className="mt-2 text-[11px] sm:text-xs text-white/55 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                    <div>資料累積中（目前 {typeof dailySnapshotAvailableDays === "number" ? dailySnapshotAvailableDays : "—"} 天），明天起會逐日形成趨勢曲線。</div>
                    <div>Collecting data ({typeof dailySnapshotAvailableDays === "number" ? dailySnapshotAvailableDays : "—"} days so far). The trend line will form as daily history builds.</div>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-col gap-1 min-w-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center justify-between gap-3 min-w-0 sm:contents">
                    <div className="shrink-0">
                      <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-xs font-semibold text-white/80 min-w-0">
                        {([90, 60, 30, 14, 7] as const).map((d) => {
                          const active = selectedTrendRangeDays === d
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={active}
                              aria-busy={isChangingRange && active}
                              onClick={() => {
                                if (selectedTrendRangeDays === d) return
                                // Prevent duplicate clicks while loading
                                if (isChangingRange) return

                                const cached = trendPointsByDaysRef.current.get(trendCacheKey("reach", d))
                                const cacheHit = Boolean(cached && Array.isArray(cached.points) && cached.points.length >= 1)
                                if (process.env.NODE_ENV !== "production") {
                                  console.debug("[trend][ui] range_click", { days: d, cacheHit })
                                }
                                
                                const requestId = rangeChangeRequestIdRef.current + 1
                                rangeChangeRequestIdRef.current = requestId
                                rangeOverlayInFlightRef.current = { requestId, days: d }
                                clearRangeOverlayErrorTimer()
                                flushSync(() => {
                                  setRangeChangeRequestId(requestId)
                                  setIsChangingRange(true)
                                  setShowRangeOverlay(true)
                                  setRangeOverlayError(false)
                                  setSelectedTrendRangeDays(d)
                                })

                                triggerPrefetchCommonRanges()

                                if (process.env.NODE_ENV !== "production" && typeof performance !== "undefined") {
                                  trendRangeSwitchStartRef.current = { at: performance.now(), days: d }
                                  console.debug("[trend][perf] range click start", { days: d, requestId })
                                }

                                if (!cacheHit) {
                                  fetchedByDaysRef.current.delete(d)
                                } else {
                                  fetchedByDaysRef.current.set(d, true)
                                }

                                if (process.env.NODE_ENV !== "production" && typeof performance !== "undefined") {
                                  console.debug(
                                    cached && Array.isArray(cached.points) && cached.points.length >= 1
                                      ? "[trend][perf] cache hit"
                                      : "[trend][perf] cache miss",
                                    { days: d, requestId },
                                  )
                                }

                                if (cacheHit && cached && Array.isArray(cached.points) && cached.points.length >= 1) {
                                  if (process.env.NODE_ENV !== "production") {
                                    console.debug("[trend][ui] range_cache_apply", { days: d, requestId })
                                  }
                                  applyTrendSeries({
                                    days: d,
                                    points: cached.points,
                                    fetchedAt: typeof cached.fetchedAt === "number" ? cached.fetchedAt : null,
                                  })
                                  return
                                }

                                requestAnimationFrame(() => {
                                  if (!isMountedRef.current) return
                                  if (requestId !== rangeChangeRequestIdRef.current) return

                                  // Arm safety timeout
                                  armRangeSwitchTimeout(requestId)

                                  // Loading state will be reset when data arrives via trendFetchStatus or safety timeout
                                })
                              }}
                              className={
                                `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ` +
                                `min-h-[44px] ` +
                                `focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-0 ` +
                                (active
                                  ? "bg-white/15 border-white/25 text-white font-semibold shadow-sm"
                                  : "border-white/10 bg-white/[0.02] text-white/55 hover:bg-white/8 hover:text-white/80")
                              }
                            >
                              {d}
                            </button>
                          )
                        })}
                        {trendFetchStatus.loading && trendFetchStatus.lastDays === selectedTrendRangeDays ? (
                          <span className="ml-1 inline-flex h-4 w-4 items-center justify-center">
                            <span className="h-2 w-2 rounded-full bg-white/55 animate-pulse" />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <button
                        type="button"
                        aria-pressed={compareEnabled}
                        aria-busy={isCompareLoading}
                        disabled={isCompareLoading}
                        onClick={() => {
                          if (isCompareLoading) return

                          setIsCompareLoading(true)
                          setCompareEnabled((v) => !v)
                          
                          if (!compareEnabled) {
                            setComparePanelOpen(true)
                          }

                          requestAnimationFrame(() => {
                            if (!isMountedRef.current) return
                            setIsCompareLoading(false)
                          })
                        }}
                        className={
                          "inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-sm font-semibold transition-all min-h-[44px] whitespace-nowrap min-w-[120px] " +
                          (isCompareLoading
                            ? "border-white/20 bg-gradient-to-r from-sky-500/50 to-cyan-500/50 text-white/80 cursor-not-allowed"
                            : compareEnabled
                            ? "border-white/25 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-cyan-500/15 hover:from-sky-400 hover:to-cyan-400"
                            : "border-white/15 bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-cyan-500/10 hover:from-sky-400 hover:to-cyan-400")
                        }
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          {isCompareLoading ? (
                            <span className="h-3 w-3 rounded-full border border-white/35 border-t-white animate-spin" />
                          ) : null}
                          <span>{isCompareLoading ? (isZh ? "處理中" : "Loading") : isZh ? "比較" : "Compare"}</span>
                        </span>
                      </button>
                      
                      {/* Helper text when compare is enabled */}
                      {compareEnabled && (
                        <div className="mt-2 text-xs text-white/60 leading-tight min-w-0">
                          {isZh ? "已啟用比較模式，請選擇時間區間" : "Compare mode enabled - select a time range"}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex justify-end overflow-x-auto flex-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden">
                      <div className="inline-flex min-w-0 flex-nowrap items-center gap-2">
                        {(
                          [
                            { k: "reach" as const, label: t("results.trend.legend.reach"), dot: "#34d399" },
                            { k: "followers" as const, label: "粉絲 Followers", dot: "#fbbf24" },
                          ] as const
                        ).map((m) => {
                          const pressed = focusedAccountTrendMetric === m.k
                          return (
                            <button
                              key={`trend-mobile-${m.k}`}
                              type="button"
                              aria-pressed={pressed}
                              onClick={() => {
                                setFocusedAccountTrendMetric(m.k)
                              }}
                              className={
                                `inline-flex items-center gap-2 rounded-full h-6 px-2 text-[11px] leading-none font-semibold border transition-colors whitespace-nowrap ` +
                                `focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-0 ` +
                                (pressed ? "bg-white/8 border-white/18 text-white" : "bg-white/[0.02] border-white/6 text-white/55 hover:bg-white/4")
                              }
                            >
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.dot }} />
                              <span className="truncate min-w-0">{m.label}</span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-1 text-[10px] text-white/45 leading-snug text-center sm:text-left min-w-0 break-words">
                        <div>{isZh ? "圖表數據：觸及 / 粉絲" : "Chart metric: Reach / Followers"}</div>
                        <div>
                          {isZh
                            ? "粉絲為總數（非每日增量）；變化值為與前一日／範圍起點相比"
                            : "Followers is total count (not daily delta); changes are vs previous day / range start"}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible compare panel - mobile only */}
                    {compareEnabled && (
                      <div className="sm:hidden mt-3">
                        <button
                          type="button"
                          onClick={() => setComparePanelOpen(!comparePanelOpen)}
                          className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 min-h-[36px] text-white/70 text-xs font-medium"
                          aria-expanded={comparePanelOpen}
                          aria-controls="compare-panel-content"
                        >
                          <span>{isZh ? "比較設定" : "Compare Settings"}</span>
                          <svg 
                            className={`w-4 h-4 transition-transform ${comparePanelOpen ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {comparePanelOpen && (
                          <div 
                            id="compare-panel-content"
                            className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 min-w-0"
                          >
                            <div className="flex flex-col gap-3 min-w-0">
                              <div className="min-w-0">
                                <label className="text-[10px] text-white/45 leading-none mb-1 block">
                                  {isZh ? "比較範圍" : "Compare Range"}
                                </label>
                                <select
                                  value={compareRangeDays}
                                  onChange={(e) => {
                                    const v = Number(e.target.value)
                                    if (v === 90 || v === 60 || v === 30 || v === 14 || v === 7) setCompareRangeDays(v)
                                  }}
                                  className="w-full min-h-[36px] rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white/85"
                                >
                                  {[90, 60, 30, 14, 7].map((d) => (
                                    <option key={`cmp-${d}`} value={d}>
                                      {d} days
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="min-w-0">
                                <label className="text-[10px] text-white/45 leading-none mb-1 block">
                                  {isZh ? "透明度" : "Opacity"}
                                </label>
                                <input
                                  type="range"
                                  min={0.2}
                                  max={0.9}
                                  step={0.1}
                                  value={compareOpacity}
                                  onChange={(e) => {
                                    const v = Number(e.target.value)
                                    if (!Number.isFinite(v)) return
                                    setCompareOpacity(Math.max(0.2, Math.min(0.9, v)))
                                  }}
                                  className="w-full h-2 accent-white/70 opacity-90"
                                  aria-label="Compare opacity"
                                />
                              </div>

                              {((focusedAccountTrendMetric === "reach" && !compareSeriesReach) ||
                                (focusedAccountTrendMetric === "followers" && !compareSeriesFollowers)) ? (
                                <div className="text-[10px] text-white/45 leading-snug">
                                  {isZh ? "比較範圍尚未快取 — 請先選取該範圍一次以載入" : "Compare range not cached yet — select that range once to load it"}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="hidden sm:inline-flex shrink-0 tabular-nums text-xs text-white/55 whitespace-nowrap">
                      <span>目前可用 {typeof dailySnapshotAvailableDays === "number" ? dailySnapshotAvailableDays : "—"} 天</span>
                      <span className="mx-1 opacity-50">|</span>
                      <span>Available {typeof dailySnapshotAvailableDays === "number" ? dailySnapshotAvailableDays : "—"} days</span>
                    </div>
                  </div>

                  <div className="min-w-0 sm:flex-1 sm:flex sm:justify-center w-full overflow-hidden">
                    <div className="w-full min-w-0">
                      <div className="hidden sm:flex w-full min-w-0 flex flex-wrap items-center justify-center gap-2">
                        {(
                          [
                            { k: "reach" as const, label: t("results.trend.legend.reach"), dot: "#34d399" },
                            { k: "followers" as const, label: "粉絲 Followers", dot: "#fbbf24" },
                          ] as const
                        ).map((m) => {
                          const pressed = focusedAccountTrendMetric === m.k
                          return (
                            <button
                              key={m.k}
                              type="button"
                              aria-pressed={pressed}
                              onClick={() => {
                                setFocusedAccountTrendMetric(m.k)
                              }}
                              className={
                                `inline-flex items-center gap-2 rounded-full h-6 px-2 text-[11px] leading-none sm:h-auto sm:px-2.5 sm:py-1 sm:text-xs sm:leading-none font-semibold border transition-colors whitespace-nowrap ` +
                                `focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-0 ` +
                                (pressed
                                  ? "bg-white/8 border-white/18 text-white"
                                  : "bg-white/[0.02] border-white/6 text-white/55 hover:bg-white/4 sm:bg-white/[0.03] sm:border-white/8 sm:text-white/60 sm:hover:bg-white/6")
                              }
                            >
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.dot }} />
                              <span className="truncate min-w-0">{m.label}</span>
                            </button>
                          )
                        })}
                      </div>

                      <div
                        className={
                          "w-full min-w-0 mt-2 relative min-h-[40px] " +
                          ((focusedAccountTrendMetric === "followers" || focusedAccountTrendMetric === "reach")
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none")
                        }
                      >
                        {/* Loading overlay for range switching */}
                        {showRangeOverlay && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 backdrop-blur-[0.5px] rounded-lg pointer-events-none">
                            <div className="flex items-center gap-2 text-sm text-white/80 min-w-0">
                              <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin flex-shrink-0" />
                              <span className="truncate">{isZh ? "載入中..." : "Loading..."}</span>
                            </div>
                          </div>
                        )}

                        {rangeOverlayError && !showRangeOverlay ? (
                          <div className="absolute left-2 top-2 z-20 rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-white/80 pointer-events-none">
                            {isZh ? "載入失敗" : "Failed"}
                          </div>
                        ) : null}
                        <div className="w-full sm:w-auto min-w-0 max-w-full overflow-hidden">
                          {(() => {
                            const fmt = (v: number | null) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString() : "—")
                            const fmtDelta = (v: number | null) =>
                              typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString()}` : "—"

                            const renderTiles = (labels: { a: string; b: string; c: string }, vals: { a: number | null; b: number | null; c: number | null }) => {
                              const subtleLoading = showRangeOverlay ? "opacity-90 animate-pulse" : ""
                              return (
                                <div className={"w-full sm:w-auto min-w-0 max-w-full overflow-hidden " + subtleLoading}>
                                  <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 min-w-0">
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 min-w-0 min-w-[92px] max-w-full">
                                      <div className="text-[11px] leading-tight text-white/60 min-w-0 truncate whitespace-nowrap">{labels.a}</div>
                                      <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap truncate min-w-0">{fmt(vals.a)}</div>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 min-w-0 min-w-[92px] max-w-full">
                                      <div className="text-[11px] leading-tight text-white/60 min-w-0 truncate whitespace-nowrap">{labels.b}</div>
                                      <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap truncate min-w-0">{fmtDelta(vals.b)}</div>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 min-w-0 min-w-[92px] max-w-full">
                                      <div className="text-[11px] leading-tight text-white/60 min-w-0 truncate whitespace-nowrap">{labels.c}</div>
                                      <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap truncate min-w-0">{fmtDelta(vals.c)}</div>
                                    </div>
                                  </div>
                                </div>
                              )
                            }

                            const reachLabels = {
                              a: isZh ? "最新觸及" : "Latest reach",
                              b: isZh ? "昨日" : "Yesterday",
                              c: isZh ? `${renderedTrendRangeDays}天` : `${renderedTrendRangeDays}d`,
                            }
                            const followersLabels = {
                              a: isZh ? "最新粉絲" : "Latest followers",
                              b: isZh ? "昨日" : "Yesterday",
                              c: isZh ? `${renderedTrendRangeDays}天` : `${renderedTrendRangeDays}d`,
                            }

                            return (
                              <>
                                <div
                                  className={
                                    "absolute inset-0 flex items-start justify-center sm:justify-end " +
                                    (focusedAccountTrendMetric === "reach" ? "opacity-100" : "opacity-0 pointer-events-none")
                                  }
                                >
                                  {(() => {
                                    // Avoid rendering missing reach as 0; show N/A when no non-null value exists.
                                    const subtleLoading = showRangeOverlay ? "opacity-90 animate-pulse" : ""
                                    const formatNumber = (n: number) => Math.round(n).toLocaleString()
                                    return (
                                      <div className={"w-full sm:w-auto min-w-0 max-w-full overflow-hidden " + subtleLoading}>
                                        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 min-w-0">
                                          <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 min-w-0 min-w-[92px] max-w-full">
                                            <div className="text-[11px] leading-tight text-white/60 min-w-0 truncate whitespace-nowrap">{reachLabels.a}</div>
                                            <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap truncate min-w-0">
                                              {latestReachForTile === null ? "N/A" : formatNumber(latestReachForTile)}
                                            </div>
                                          </div>
                                          <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 min-w-0 min-w-[92px] max-w-full">
                                            <div className="text-[11px] leading-tight text-white/60 min-w-0 truncate whitespace-nowrap">{reachLabels.b}</div>
                                            <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap truncate min-w-0">
                                              {fmtDelta(committedStatValues.reach.deltaDay)}
                                            </div>
                                          </div>
                                          <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 min-w-0 min-w-[92px] max-w-full">
                                            <div className="text-[11px] leading-tight text-white/60 min-w-0 truncate whitespace-nowrap">{reachLabels.c}</div>
                                            <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap truncate min-w-0">
                                              {fmtDelta(committedStatValues.reach.deltaRange)}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                </div>
                                <div
                                  className={
                                    "absolute inset-0 flex items-start justify-center sm:justify-end " +
                                    (focusedAccountTrendMetric === "followers" ? "opacity-100" : "opacity-0 pointer-events-none")
                                  }
                                >
                                  {renderTiles(
                                    followersLabels,
                                    {
                                      a: committedStatValues.followers.latest,
                                      b: committedStatValues.followers.deltaDay,
                                      c: committedStatValues.followers.deltaRange,
                                    },
                                  )}
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {trendMeta ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60 min-w-0">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white/80 whitespace-nowrap shrink-0">{t("results.trend.rangeLabel")}</span>
                      <span className="tabular-nums whitespace-nowrap truncate min-w-0">
                        {trendMeta.startLabel} – {trendMeta.endLabel}
                      </span>
                    </span>
                    <span className="opacity-40 shrink-0">•</span>

                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white/80 whitespace-nowrap shrink-0">{t("results.trend.updatedLabel")}</span>
                      <span className="tabular-nums whitespace-nowrap truncate min-w-0">{trendFetchedAt ? formatTimeTW(trendFetchedAt) : "—"}</span>
                    </span>

                    {trendMeta.isToday ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/75 whitespace-nowrap shrink-0">
                        {t("results.trend.today")}
                      </span>
                    ) : null}

                    {trendHasNewDay ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/75 whitespace-nowrap shrink-0">
                        {t("results.trend.new")}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {(() => {
                  const selected = selectedAccountTrendMetrics
                  const focusedIsFollowers = isFollowersFocused
                  const focusedIsReach = focusedAccountTrendMetric === "reach"

                  const buildDateDomainInclusive = (rangeStart: string, rangeEnd: string) => {
                    const parseYmd = (s: string) => {
                      const v = String(s || "").trim()
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
                      const ms = Date.parse(`${v}T00:00:00.000Z`)
                      return Number.isFinite(ms) ? (ms as number) : null
                    }
                    const fmtYmd = (ms: number) => {
                      const d = new Date(ms)
                      const y = d.getUTCFullYear()
                      const m = String(d.getUTCMonth() + 1).padStart(2, "0")
                      const dd = String(d.getUTCDate()).padStart(2, "0")
                      return `${y}-${m}-${dd}`
                    }

                    const startMs = parseYmd(rangeStart)
                    const endMs = parseYmd(rangeEnd)
                    if (startMs === null || endMs === null) return [] as Array<{ day: string; ts: number }>

                    const out: Array<{ day: string; ts: number }> = []
                    const step = 24 * 60 * 60 * 1000
                    for (let ms = startMs; ms <= endMs; ms += step) {
                      out.push({ day: fmtYmd(ms), ts: ms })
                    }
                    return out
                  }

                  const mkLabel = (ts: number) => {
                    const d = new Date(ts)
                    try {
                      return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(d)
                    } catch {
                      const m = String(d.getMonth() + 1).padStart(2, "0")
                      const dd = String(d.getDate()).padStart(2, "0")
                      return `${m}/${dd}`
                    }
                  }

                  const rangeFromApi = (() => {
                    const start = isRecord(dailySnapshotData) && typeof (dailySnapshotData as any).rangeStart === "string" ? String((dailySnapshotData as any).rangeStart).trim() : ""
                    const end = isRecord(dailySnapshotData) && typeof (dailySnapshotData as any).rangeEnd === "string" ? String((dailySnapshotData as any).rangeEnd).trim() : ""
                    if (start && end) return { start, end }
                    const days = renderedTrendRangeDays
                    const now = new Date()
                    const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
                    const startMs = endMs - (Math.max(1, Math.floor(days)) - 1) * 24 * 60 * 60 * 1000
                    const fmt = (ms: number) => {
                      const d = new Date(ms)
                      const y = d.getUTCFullYear()
                      const m = String(d.getUTCMonth() + 1).padStart(2, "0")
                      const dd = String(d.getUTCDate()).padStart(2, "0")
                      return `${y}-${m}-${dd}`
                    }
                    return { start: fmt(startMs), end: fmt(endMs) }
                  })()

                  const dateDomain = buildDateDomainInclusive(rangeFromApi.start, rangeFromApi.end)

                  const pointsByDay = (() => {
                    const map = new Map<string, AccountTrendPoint>()
                    const list = Array.isArray(trendPoints) ? trendPoints : []
                    for (const p of list) {
                      const ts = typeof (p as any)?.ts === "number" && Number.isFinite((p as any).ts) ? ((p as any).ts as number) : null
                      if (ts === null) continue
                      const day = new Date(ts).toISOString().slice(0, 10)
                      if (!day) continue
                      map.set(day, p)
                    }
                    return map
                  })()

                  const followersByDay = (() => {
                    const map = new Map<string, number>()
                    const list = Array.isArray(followersDailyRows) ? followersDailyRows : []
                    for (const r of list) {
                      const day = typeof (r as any)?.day === "string" ? String((r as any).day).trim() : ""
                      if (!day) continue
                      const nRaw = (r as any)?.followers_count
                      const n = typeof nRaw === "number" ? nRaw : Number(nRaw)
                      if (!Number.isFinite(n)) continue
                      map.set(day, Math.floor(n))
                    }
                    return map
                  })()

                  type ChartRow = {
                    t: string
                    ts: number
                    day: string
                    reach: number | null
                    impressions: number | null
                    interactions: number | null
                    engaged: number | null
                    followers: number | null
                    followerDelta: number | null
                  }

                  // forward-fill followers to ensure continuous time series (SSOT remains chartRowsAligned)
                  let lastKnownFollowers: number | null = null

                  const chartRowsAligned: ChartRow[] = dateDomain.map((d) => {
                    const p = pointsByDay.get(d.day)
                    const reach =
                      typeof (p as any)?.reach === "number" && Number.isFinite((p as any).reach)
                        ? ((p as any).reach as number)
                        : null
                    const impressions =
                      typeof (p as any)?.impressions === "number" && Number.isFinite((p as any).impressions)
                        ? ((p as any).impressions as number)
                        : null
                    const interactions =
                      typeof (p as any)?.interactions === "number" && Number.isFinite((p as any).interactions)
                        ? ((p as any).interactions as number)
                        : null
                    const engaged =
                      typeof (p as any)?.engaged === "number" && Number.isFinite((p as any).engaged)
                        ? ((p as any).engaged as number)
                        : null

                    const todaysFollowers = followersByDay.has(d.day) ? (followersByDay.get(d.day) as number) : null

                    if (typeof todaysFollowers === "number" && Number.isFinite(todaysFollowers)) {
                      lastKnownFollowers = todaysFollowers
                    }

                    const followers = lastKnownFollowers

                    return {
                      t: mkLabel(d.ts),
                      ts: d.ts,
                      day: d.day,
                      reach,
                      impressions,
                      interactions,
                      engaged,
                      followers,
                      followerDelta: null,
                    }
                  })

                  // fill leading null followers with first known value (prevents empty left segment)
                  const firstKnownFollowers =
                    chartRowsAligned.find((r) => typeof r.followers === "number" && Number.isFinite(r.followers))?.followers ?? null

                  if (typeof firstKnownFollowers === "number" && Number.isFinite(firstKnownFollowers)) {
                    for (const r of chartRowsAligned) {
                      if (typeof r.followers === "number" && Number.isFinite(r.followers)) break
                      r.followers = firstKnownFollowers
                    }
                  }

                  for (let i = 0; i < chartRowsAligned.length; i++) {
                    const cur = chartRowsAligned[i]?.followers
                    const prev = i >= 1 ? chartRowsAligned[i - 1]?.followers : null
                    const delta =
                      typeof cur === "number" &&
                      Number.isFinite(cur) &&
                      typeof prev === "number" &&
                      Number.isFinite(prev)
                        ? cur - prev
                        : null
                    chartRowsAligned[i].followerDelta = delta
                  }

                  const latestReachFromAligned = (() => {
                    if (!Array.isArray(chartRowsAligned) || chartRowsAligned.length === 0) {
                      return { v: null, day: null }
                    }

                    for (let i = chartRowsAligned.length - 1; i >= 0; i--) {
                      const r = chartRowsAligned[i]
                      const v = r?.reach

                      if (typeof v === "number" && Number.isFinite(v)) {
                        return { v, day: r?.day ?? null }
                      }
                    }

                    return { v: null, day: null }
                  })()

                  const computeMA = (values: Array<number | null>, window = 7) => {
                    const w = Math.max(1, Math.floor(window))
                    return values.map((cur, i) => {
                      if (i < w - 1) return null
                      if (typeof cur !== "number" || !Number.isFinite(cur)) return null
                      let sum = 0
                      for (let j = i - (w - 1); j <= i; j++) {
                        const v = values[j]
                        if (typeof v !== "number" || !Number.isFinite(v)) return null
                        sum += v
                      }
                      return sum / w
                    })
                  }

                  const followersDailyPoints: AccountTrendPoint[] = (() => {
                    const list = Array.isArray(followersDailyRows) ? followersDailyRows : []
                    const pts = list
                      .map((r) => {
                        const day = typeof r?.day === "string" ? r.day : ""
                        const ts = day
                          ? Date.parse(`${day}T00:00:00.000Z`)
                          : NaN
                        if (!day || !Number.isFinite(ts)) return null
                        const d = new Date(ts)
                        const label = (() => {
                          try {
                            return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(d)
                          } catch {
                            const m = String(d.getMonth() + 1).padStart(2, "0")
                            const dd = String(d.getDate()).padStart(2, "0")
                            return `${m}/${dd}`
                          }
                        })()
                        return { t: label, ts } as AccountTrendPoint
                      })
                      .filter(Boolean) as AccountTrendPoint[]

                    if (focusedIsFollowers && pts.length === 1) {
                      const p0 = pts[0]
                      const ts0 = typeof p0?.ts === "number" && Number.isFinite(p0.ts) ? p0.ts : Date.now()
                      const p1: AccountTrendPoint = {
                        ...p0,
                        ts: ts0 + 24 * 60 * 60 * 1000,
                        t: p0.t,
                      }
                      return [p0, p1]
                    }

                    return pts
                  })()

                  const dataForChartBase = shouldShowEmptySeriesHint
                    ? ([] as AccountTrendPoint[])
                    : focusedIsFollowers
                      ? ((chartRowsAligned.map((r) => ({ t: r.t, ts: r.ts })) as unknown) as AccountTrendPoint[])
                      : Array.isArray(trendPoints) && trendPoints.length >= 1
                        ? ((chartRowsAligned.map((r) => ({ t: r.t, ts: r.ts, reach: r.reach ?? undefined, impressions: r.impressions ?? undefined, interactions: r.interactions ?? undefined, engaged: r.engaged ?? undefined })) as unknown) as AccountTrendPoint[])
                        : accountTrend

                  const dataForChart = (() => {
                    if (!focusedIsFollowers) return dataForChartBase
                    if (!Array.isArray(dataForChartBase)) return [] as AccountTrendPoint[]
                    if (dataForChartBase.length !== 1) return dataForChartBase

                    const p0 = dataForChartBase[0]
                    const ts0 = typeof p0?.ts === "number" && Number.isFinite(p0.ts) ? (p0.ts as number) : Date.now()
                    const p1: AccountTrendPoint = {
                      ...p0,
                      ts: ts0 + 24 * 60 * 60 * 1000,
                      t: p0?.t,
                    }
                    return [p0 as AccountTrendPoint, p1]
                  })()

                  const shouldShowTotalsFallback =
                    Boolean(dailySnapshotTotals) && (!Array.isArray(trendPoints) || trendPoints.length < 1)

                  if (!selected.length) {
                    return (
                      <div className="mt-3 rounded-xl border border-white/8 bg-white/5 p-3">
                        <div className="text-sm text-white/75 text-center leading-snug min-w-0">{t("results.trend.selectAtLeastOne")}</div>
                      </div>
                    )
                  }

                  const labelFor = (k: AccountTrendMetricKey) =>
                    k === "reach"
                      ? t("results.trend.legend.reach")
                      : k === "followers"
                        ? "粉絲 Followers"
                        : k === "interactions"
                          ? t("results.trend.legend.interactions")
                          : k === "impressions"
                            ? t("results.trend.legend.impressions")
                            : k === "engaged"
                              ? t("results.trend.legend.engagedAccounts")
                              : t("results.trend.legend.followerChange")
                  const colorFor = (k: AccountTrendMetricKey) =>
                    k === "reach"
                      ? "#34d399"
                      : k === "followers"
                        ? "#fbbf24"
                        : k === "followerDelta"
                          ? "#fde68a"
                        : k === "interactions"
                        ? "#38bdf8"
                        : k === "impressions"
                          ? "#93c5fd"
                          : k === "engaged"
                            ? "#e879f9"
                            : "#fbbf24"

                  const getTimeSeriesValues = (k: AccountTrendMetricKey): number[] => {
                    const vals = dataForChart
                      .map((p) => {
                        const y =
                          k === "reach"
                            ? p.reach
                            : k === "followers"
                              ? null
                            : k === "interactions"
                              ? p.interactions
                              : k === "impressions"
                                ? p.impressions
                                : k === "engaged"
                                  ? p.engaged
                                  : p.followerDelta
                        return typeof y === "number" && Number.isFinite(y) ? y : null
                      })
                      .filter((x): x is number => typeof x === "number")

                    if (k === "followers") {
                      return chartRowsAligned
                        .map((r) => r.followers)
                        .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
                    }

                    if (k === "followerDelta") {
                      return chartRowsAligned
                        .map((r) => r.followerDelta)
                        .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
                    }

                    return vals
                  }

                  const hasVaryingTimeSeries = (k: AccountTrendMetricKey) => {
                    const vals = getTimeSeriesValues(k)
                    if (vals.length < 2) return false
                    const first = vals[0]
                    return vals.some((v) => v !== first)
                  }

                  const getTotalValueForMetric = (k: AccountTrendMetricKey): number | null => {
                    if (k === "reach") return typeof dailySnapshotTotals?.reach === "number" ? dailySnapshotTotals.reach : null
                    if (k === "interactions") return typeof dailySnapshotTotals?.interactions === "number" ? dailySnapshotTotals.interactions : null
                    if (k === "engaged") return typeof dailySnapshotTotals?.engaged === "number" ? dailySnapshotTotals.engaged : null
                    if (k === "impressions") return typeof dailySnapshotTotals?.impressionsTotal === "number" ? dailySnapshotTotals.impressionsTotal : null
                    if (k === "followerDelta") {
                      const vals = getTimeSeriesValues("followerDelta")
                      if (vals.length < 2) return null
                      return vals[vals.length - 1] - vals[0]
                    }
                    return null
                  }

                  const focusedHasSeries =
                    (focusedIsReach && hasVaryingTimeSeries("reach")) ||
                    (focusedIsFollowers && hasVaryingTimeSeries("followers"))
                  const focusedTotal = getTotalValueForMetric(focusedAccountTrendMetric)

                  // UX rule: only Reach + Followers are allowed to render a line chart.
                  const shouldShowTotalValuePanel = !focusedIsReach && !focusedIsFollowers

                  const seriesKeys: AccountTrendMetricKey[] = focusedIsReach ? ["reach"] : focusedIsFollowers ? ["followers", "followerDelta"] : []

                  const series = seriesKeys.map((k) => {
                    const raw = chartRowsAligned
                      .map((r, i) => {
                        const y =
                          k === "reach"
                            ? r.reach
                            : k === "followers"
                              ? r.followers
                              : k === "followerDelta"
                                ? r.followerDelta
                              : k === "interactions"
                                ? r.interactions
                                : k === "impressions"
                                  ? r.impressions
                                  : k === "engaged"
                                    ? r.engaged
                                    : null
                        if (typeof y !== "number" || !Number.isFinite(y)) return null
                        return { i, y }
                      })
                      .filter(Boolean) as Array<{ i: number; y: number }>

                    if (raw.length < 1) return { k, label: labelFor(k), color: colorFor(k), min: 0, max: 0, points: [] }
                    if (!focusedIsFollowers && raw.length < 2) return { k, label: labelFor(k), color: colorFor(k), min: 0, max: 0, points: [] }
                    const firstY = raw[0]?.y
                    const isConstant = raw.every((p) => p.y === firstY)
                    if (!focusedIsFollowers && isConstant) return { k, label: labelFor(k), color: colorFor(k), min: firstY ?? 0, max: firstY ?? 0, points: [] }

                    const ys = raw.map((p) => p.y)
                    const min = ys.length ? Math.min(...ys) : 0
                    const max = ys.length ? Math.max(...ys) : 0
                    const span = Math.max(max - min, 0)

                    const points = raw.map((p) => {
                      const norm = span > 0 ? ((p.y - min) / span) * 100 : 50
                      return { i: p.i, yRaw: p.y, yNorm: Number.isFinite(norm) ? norm : 50 }
                    })

                    return { k, label: labelFor(k), color: colorFor(k), min, max, points }
                  })

                  const drawable = series.filter((s) => s.points.length >= 1)
                  const yMin = 0
                  const yMax = 100

                  const isSmUp = isSmUpViewport

                  const xDomainRows = chartRowsAligned
                  const xN = xDomainRows.length
                  const xLast = xN - 1

                  const w = 600
                  const h = 220
                  const padX = 26
                  const padY = 18
                  const spanX = Math.max(xN - 1, 1)
                  const spanY = Math.max(yMax - yMin, 1e-6)
                  const sx = (i: number) => padX + (i / spanX) * (w - padX * 2)
                  const sy = (y: number) => h - padY - ((y - yMin) / spanY) * (h - padY * 2)

                  const clampedHoverIdx =
                    typeof hoveredAccountTrendIndex === "number"
                      ? Math.max(0, Math.min(xLast, hoveredAccountTrendIndex))
                      : null

                  const followersTooltipIdx = (() => {
                    if (!focusedIsFollowers) return null
                    if (xN < 1) return null
                    if (typeof clampedHoverIdx === "number") return clampedHoverIdx
                    return Math.max(0, xLast)
                  })()

                  const hoverPoint =
                    clampedHoverIdx !== null ? ((xDomainRows[clampedHoverIdx] as unknown) as AccountTrendPoint) : null
                  const followersHoverPoint =
                    typeof followersTooltipIdx === "number" ? ((xDomainRows[followersTooltipIdx] as unknown) as AccountTrendPoint) : null

                  const reachRawByIndex = focusedIsReach ? chartRowsAligned.map((r) => r.reach) : []
                  const reachMa7ByIndex = focusedIsReach ? computeMA(reachRawByIndex, 7) : []

                  const tooltipItems = (() => {
                    if (focusedIsFollowers) {
                      const idx = followersTooltipIdx
                      if (typeof idx !== "number") return []
                      const v = idx >= 0 && idx < chartRowsAligned.length ? chartRowsAligned[idx]?.followers : null
                      const prev = idx >= 1 && idx - 1 < chartRowsAligned.length ? chartRowsAligned[idx - 1]?.followers : null
                      const first = chartRowsAligned.length >= 1 ? chartRowsAligned[0]?.followers : null
                      const deltaValue = idx >= 0 && idx < chartRowsAligned.length ? chartRowsAligned[idx]?.followerDelta : null

                      const deltaDay =
                        typeof v === "number" &&
                        Number.isFinite(v) &&
                        typeof prev === "number" &&
                        Number.isFinite(prev)
                          ? v - prev
                          : null
                      const deltaRange =
                        typeof v === "number" &&
                        Number.isFinite(v) &&
                        typeof first === "number" &&
                        Number.isFinite(first)
                          ? v - first
                          : null

                      const fmt = (n: number | null) =>
                        typeof n === "number" && Number.isFinite(n) ? Math.round(n).toLocaleString() : (isZh ? "無資料" : "No data")
                      const fmtDelta = (n: number | null) =>
                        typeof n === "number" && Number.isFinite(n)
                          ? `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString()}`
                          : (isZh ? "無資料" : "No data")

                      return [
                        {
                          label: isZh ? "粉絲" : "Followers",
                          color: colorFor("followers"),
                          value: fmt(typeof v === "number" && Number.isFinite(v) ? v : null),
                        },
                        {
                          label: isZh ? "變化" : "Change",
                          color: "rgba(255,255,255,0.70)",
                          value: fmtDelta(typeof deltaValue === "number" && Number.isFinite(deltaValue) ? deltaValue : null),
                        },
                        {
                          label: isZh ? "單日增量" : "Δ vs prev day",
                          color: "rgba(255,255,255,0.70)",
                          value: fmtDelta(deltaDay),
                        },
                        {
                          label: isZh ? `區間增量（${renderedTrendRangeDays}天）` : `Δ over ${renderedTrendRangeDays}d`,
                          color: "rgba(255,255,255,0.70)",
                          value: fmtDelta(deltaRange),
                        },
                      ]
                    }

                    if (!hoverPoint) return []

                    if (focusedIsReach) {
                      const raw = hoverPoint.reach
                      const rawText =
                        typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw).toLocaleString() : (isZh ? "無資料" : "No data")
                      const ma7 = typeof clampedHoverIdx === "number" ? reachMa7ByIndex[clampedHoverIdx] : null
                      const ma7Text = typeof ma7 === "number" && Number.isFinite(ma7) ? Math.round(ma7).toLocaleString() : (isZh ? "無資料" : "No data")

                      return [
                        {
                          label: labelFor("reach"),
                          color: colorFor("reach"),
                          value: rawText,
                        },
                        {
                          label: "MA7 (7d avg) 7日均線",
                          color: "rgba(255,255,255,0.70)",
                          value: ma7Text,
                        },
                      ]
                    }

                    return selected
                      .map((k) => {
                        if (k === "followers") return null
                        const val =
                          k === "reach"
                            ? hoverPoint.reach
                            : k === "interactions"
                              ? hoverPoint.interactions
                              : k === "impressions"
                                ? hoverPoint.impressions
                                : k === "engaged"
                                  ? hoverPoint.engaged
                                  : hoverPoint.followerDelta
                        if (typeof val !== "number" || !Number.isFinite(val)) return null
                        return {
                          label: labelFor(k),
                          color: colorFor(k),
                          value:
                            k === "followerDelta"
                              ? `${val > 0 ? "+" : ""}${Math.round(val).toLocaleString()}`
                              : Math.round(val).toLocaleString(),
                        }
                      })
                      .filter(Boolean) as Array<{ label: string; color: string; value: string }>
                  })()

                  const followersCountFromProfileRaw = isRecord(igMe) && isRecord(igMe.profile) ? igMe.profile.followers_count : null
                  const followersCountFromProfile = (() => {
                    if (typeof followersCountFromProfileRaw === "number" && Number.isFinite(followersCountFromProfileRaw)) {
                      return followersCountFromProfileRaw
                    }
                    const strVal = String(followersCountFromProfileRaw ?? "")
                    const trimmed = strVal.trim()
                    if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
                      return Number(trimmed)
                    }
                    return null
                  })()

                  const followersCountForFallback =
                    followersCountFromProfile !== null
                      ? followersCountFromProfile
                      : typeof followersCount === "number" && Number.isFinite(followersCount)
                        ? followersCount
                        : null

                  const hasValidFollowersCount = typeof followersCountForFallback === "number" && Number.isFinite(followersCountForFallback)

                  return (
                    <>
                      <LatestReachTileBridge
                        v={latestReachFromAligned.v}
                        day={latestReachFromAligned.day}
                        setV={setLatestReachForTile}
                        setDay={setLatestReachDayForTile}
                      />
                      {shouldShowTotalValuePanel ? (
                        <div className="mt-3 rounded-xl border border-white/8 bg-white/5 p-3 min-w-0">
                          <div className="text-[11px] sm:text-xs text-white/70 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                            <div>此指標目前沒有可用數據</div>
                            <div>This metric is not available right now.</div>
                          </div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 min-w-0">
                              <div className="text-[10px] font-semibold text-white/60 whitespace-nowrap truncate min-w-0">{labelFor(focusedAccountTrendMetric)}</div>
                              <div className="mt-0.5 text-[clamp(14px,4.6vw,16px)] font-semibold text-white tabular-nums whitespace-nowrap truncate min-w-0">
                                {typeof focusedTotal === "number" ? Math.round(focusedTotal).toLocaleString() : "—"}
                              </div>
                              <div className="mt-0.5 text-[10px] text-white/45 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                                <div>總量 Total value</div>
                              </div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 min-w-0">
                              <div className="text-[10px] font-semibold text-white/60 whitespace-nowrap truncate min-w-0">{t("results.trend.rangeLabel")}</div>
                              <div className="mt-0.5 text-[11px] text-white/70 tabular-nums whitespace-nowrap truncate min-w-0">
                                {trendMeta ? `${trendMeta.startLabel} – ${trendMeta.endLabel}` : "—"}
                              </div>
                              <div className="mt-0.5 text-[10px] text-white/45 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                                <div>區間 Period</div>
                              </div>
                            </div>
                          </div>
                          {focusedTotal === null ? (
                            <div className="mt-2 text-[11px] sm:text-xs text-white/55 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                              <div>此指標目前沒有可用數據</div>
                              <div>This metric is not available right now.</div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {shouldShowTotalsFallback ? (
                        <div className="mt-3 rounded-xl border border-white/8 bg-white/5 p-3">
                          {(() => {
                            const totals = dailySnapshotTotals
                            if (!totals) return null
                            return (
                              <>
                          <div className="text-[11px] sm:text-xs text-white/70 leading-snug min-w-0">
                            {t("results.trend.totalsFallback")}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 min-w-0">
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 min-w-0">
                              <div className="text-[10px] font-semibold text-white/60 whitespace-nowrap truncate min-w-0">
                                {t("results.trend.legend.reach")}
                              </div>
                              <div className="mt-0.5 text-[clamp(13px,4vw,15px)] font-semibold text-white tabular-nums whitespace-nowrap truncate min-w-0">
                                {typeof totals.reach === "number" ? Math.round(totals.reach).toLocaleString() : "—"}
                              </div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 min-w-0">
                              <div className="text-[10px] font-semibold text-white/60 whitespace-nowrap truncate min-w-0">
                                {t("results.trend.legend.interactions")}
                              </div>
                              <div className="mt-0.5 text-[clamp(13px,4vw,15px)] font-semibold text-white tabular-nums whitespace-nowrap truncate min-w-0">
                                {typeof totals.interactions === "number"
                                  ? Math.round(totals.interactions).toLocaleString()
                                  : "—"}
                              </div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 min-w-0">
                              <div className="text-[10px] font-semibold text-white/60 whitespace-nowrap truncate min-w-0">
                                {t("results.trend.legend.engagedAccounts")}
                              </div>
                              <div className="mt-0.5 text-[clamp(13px,4vw,15px)] font-semibold text-white tabular-nums whitespace-nowrap truncate min-w-0">
                                {typeof totals.engaged === "number" ? Math.round(totals.engaged).toLocaleString() : "—"}
                              </div>
                            </div>
                          </div>
                              </>
                            )
                          })()}
                        </div>
                      ) : null}
                      {shouldShowTotalValuePanel ? null : focusedIsFollowers && hasValidFollowersCount && followersDailyRows.length < 1 && xN < 2 ? (
                        <div className="w-full mt-2 relative min-w-0">
                          <FollowersTrendFallback
                            point={(() => {
                              const first = xDomainRows[0]
                              const firstTs = isRecord(first) && typeof first.ts === "number" && Number.isFinite(first.ts) ? (first.ts as number) : null
                              const fetchedTs = trendFetchedAt ? new Date(trendFetchedAt).getTime() : null
                              const ts = firstTs !== null ? firstTs : fetchedTs
                              const date = ts !== null ? new Date(ts).toISOString().slice(0, 10) : ""
                              const value = Math.floor(followersCountForFallback)
                              const capturedAt = ts !== null ? new Date(ts).toISOString() : undefined
                              return { date, value, capturedAt }
                            })()}
                            updatedAtLabel={trendFetchedAt ? formatTimeTW(trendFetchedAt) : undefined}
                            rangeLabel={trendMeta ? `${trendMeta.startLabel} – ${trendMeta.endLabel}` : undefined}
                          />
                        </div>
                      ) : dataForChart.length < 1 && !focusedIsFollowers ? (
                        <div className="w-full mt-2">
                          <div className="py-3 text-sm text-white/75 text-center leading-snug min-w-0">{t("results.trend.noData")}</div>
                        </div>
                      ) : focusedIsFollowers && followersSeriesValues.length < 1 ? (
                        <div className="w-full mt-2 relative min-w-0">
                          <div className="h-[220px] sm:h-[280px] lg:h-[320px] flex items-center justify-center min-w-0">
                            <div className="w-full max-w-[520px] px-3 text-center min-w-0">
                              <div className="mx-auto mb-3 h-10 w-10 rounded-xl border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center">
                                <div className="h-4 w-4 rounded-full border border-white/20" />
                              </div>
                              <div className="text-sm sm:text-base text-white/80 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                                <div>尚無粉絲歷史資料</div>
                                <div>No follower history data yet</div>
                              </div>
                              <div className="mt-2 text-[11px] sm:text-xs text-white/55 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                                <div>需要累積一段時間後才會顯示趨勢</div>
                                <div>Trend will appear after enough data is collected</div>
                              </div>
                              <div className="mt-3 text-[10px] text-white/45 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                                <div>資料開始累積：</div>
                                <div>Data collection started:</div>
                                <div className="mt-1 text-white/60 tabular-nums">
                                  {(() => {
                                    const first = dataForChart[0]
                                    const firstTs = isRecord(first) && typeof first.ts === "number" && Number.isFinite(first.ts) ? (first.ts as number) : null
                                    const ms = firstTs
                                    const d = ms !== null ? new Date(ms) : new Date()
                                    const ymd = (() => {
                                      try {
                                        const s = new Intl.DateTimeFormat(activeLocale, {
                                          year: "numeric",
                                          month: "2-digit",
                                          day: "2-digit",
                                        }).format(d)
                                        return String(s).replace(/-/g, "/")
                                      } catch {
                                        return formatDateTW(d)
                                      }
                                    })()

                                    const hasRealDate = firstTs !== null
                                    if (hasRealDate) return ymd
                                    return isZh ? "從今天起" : "Starting today"
                                  })()}
                                </div>
                              </div>
                              <div className="mt-4">
                                <div className="mx-auto h-px w-40 border-t border-dashed border-white/15" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : shouldShowEmptyState ? (
                        <div className="w-full mt-2 relative min-w-0">
                          <div className="h-[220px] sm:h-[280px] lg:h-[320px] w-full flex items-center justify-center rounded-xl border border-white/8 bg-white/5">
                            <div className="w-full max-w-[400px] px-4 text-center min-w-0" aria-live="polite">
                              <div className="mx-auto mb-4 h-12 w-12 rounded-xl border border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center">
                                <div className="h-5 w-5 rounded-full border border-white/20" />
                              </div>
                              <div className="text-sm sm:text-base text-white/80 leading-snug min-w-0 break-words overflow-wrap-anywhere mb-3">
                                <div>尚無資料 / No data yet</div>
                              </div>
                              <div className="text-[11px] sm:text-xs text-white/55 leading-snug min-w-0 break-words overflow-wrap-anywhere mb-4">
                                <div>我們正在準備你的帳號趨勢資料。請稍後再試，或按下重新整理。</div>
                                <div>We're preparing your trend data. Try again soon or refresh.</div>
                              </div>
                              <div className="flex flex-col items-center gap-2">
                                <Button
                                  type="button"
                                  onClick={() => {
                                    if (isLoadingOverlay) return
                                    setManualRefreshOverlay(true)
                                    manualRefreshOverlayRef.current = true
                                    hasSeenTrendLoadingRef.current = false
                                    if (manualRefreshFallbackTimerRef.current) {
                                      clearTimeout(manualRefreshFallbackTimerRef.current)
                                      manualRefreshFallbackTimerRef.current = null
                                    }
                                    manualRefreshFallbackTimerRef.current = setTimeout(() => {
                                      if (!isMountedRef.current) return
                                      if (!manualRefreshOverlayRef.current) return
                                      if (trendLoadingRef.current) return
                                      if (hasSeenTrendLoadingRef.current) return
                                      setManualRefreshOverlay(false)
                                      manualRefreshFallbackTimerRef.current = null
                                    }, 2000)
                                    fireRefresh("manual")
                                  }}
                                  disabled={!isConnectedInstagram || isLoadingOverlay}
                                  className="h-9 px-4 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 border border-white/10 w-full sm:w-auto shrink-0"
                                >
                                  {isZh ? "重新整理" : "Refresh"}
                                </Button>
                                <div className="text-[10px] text-white/45 leading-snug min-w-0 break-words overflow-wrap-anywhere">
                                  <div>首次連結可能需要 10–30 秒。</div>
                                  <div>First-time setup may take 10–30 seconds.</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full mt-2 relative min-w-0 overflow-hidden rounded-xl">
                          {/* Loading skeleton overlay */}
                          {isLoadingOverlay && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/5 backdrop-blur-[0.5px] rounded-xl pointer-events-none">
                              <Skeleton className="h-5 w-20 mb-3" />
                              <Skeleton className="h-[180px] sm:h-[240px] lg:h-[280px] w-full max-w-[500px]" />
                              <div className="flex gap-2 mt-3">
                                <Skeleton className="h-6 w-8 rounded-full" />
                                <Skeleton className="h-6 w-8 rounded-full" />
                                <Skeleton className="h-6 w-8 rounded-full" />
                              </div>
                              {showRangeOverlay && (
                                <div className="absolute top-3 right-3 flex items-center gap-2 text-xs text-white/60 min-w-0">
                                  <span className="h-3 w-3 rounded-full border border-white/30 border-t-white animate-spin flex-shrink-0" />
                                  <span className="truncate">{isZh ? "更新中..." : "Updating..."}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className={"h-[220px] sm:h-[280px] lg:h-[320px] w-full transition-opacity " + (isLoadingOverlay ? "opacity-60" : "opacity-100")}>
                            <svg
                              viewBox={`0 0 ${w} ${h}`}
                              className="h-full w-full"
                              preserveAspectRatio="none"
                              onMouseLeave={() => {
                                if (hoverRafRef.current !== null) {
                                  cancelAnimationFrame(hoverRafRef.current)
                                  hoverRafRef.current = null
                                }
                                updateHoveredTrendIndex(null)
                              }}
                              onMouseMove={(e) => {
                                const el = e.currentTarget
                                const rect = el.getBoundingClientRect()
                                const x = e.clientX - rect.left
                                const ratio = rect.width > 0 ? x / rect.width : 0
                                const idx = Math.round(ratio * xLast)
                                const next = Math.max(0, Math.min(xLast, idx))
                                if (next === lastHoverIdxRef.current) return
                                if (hoverRafRef.current !== null) return
                                hoverRafRef.current = requestAnimationFrame(() => {
                                  hoverRafRef.current = null
                                  updateHoveredTrendIndex(next)
                                })
                              }}
                              onTouchStart={(e) => {
                                const el = e.currentTarget
                                const rect = el.getBoundingClientRect()
                                const t0 = e.touches?.[0]
                                if (!t0) return
                                const x = t0.clientX - rect.left
                                const ratio = rect.width > 0 ? x / rect.width : 0
                                const idx = Math.round(ratio * xLast)
                                const next = Math.max(0, Math.min(xLast, idx))
                                updateHoveredTrendIndex(next)
                              }}
                              onTouchMove={(e) => {
                                const el = e.currentTarget
                                const rect = el.getBoundingClientRect()
                                const t0 = e.touches?.[0]
                                if (!t0) return
                                const x = t0.clientX - rect.left
                                const ratio = rect.width > 0 ? x / rect.width : 0
                                const idx = Math.round(ratio * xLast)
                                const next = Math.max(0, Math.min(xLast, idx))
                                if (next === lastHoverIdxRef.current) return
                                updateHoveredTrendIndex(next)
                              }}
                            >
                                <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />

                                {(() => {
                                  const ordered = [...drawable].sort((a, b) => {
                                    const af = a.k === focusedAccountTrendMetric ? 1 : 0
                                    const bf = b.k === focusedAccountTrendMetric ? 1 : 0
                                    return af - bf
                                  })

                                  return ordered.map((s) => {
                                    const isFocused = s.k === focusedAccountTrendMetric

                                    const buildSmoothPath = (pts: Array<{ x: number; y: number }>) => {
                                      if (pts.length < 2) return ""
                                      if (pts.length === 2) {
                                        const a = pts[0]
                                        const b = pts[1]
                                        return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`
                                      }
                                      const d: string[] = []
                                      d.push(`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`)
                                      for (let i = 1; i < pts.length - 1; i++) {
                                        const prev = pts[i - 1]
                                        const cur = pts[i]
                                        const next = pts[i + 1]
                                        const mx = (cur.x + next.x) / 2
                                        const my = (cur.y + next.y) / 2
                                        d.push(`Q${cur.x.toFixed(1)},${cur.y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`)
                                        if (i === pts.length - 2) {
                                          d.push(`T${next.x.toFixed(1)},${next.y.toFixed(1)}`)
                                        }
                                      }
                                      return d.join(" ")
                                    }

                                    const buildStepAfterPath = (pts: Array<{ x: number; y: number }>) => {
                                      if (pts.length < 2) return ""
                                      const d: string[] = []
                                      d.push(`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`)
                                      for (let i = 1; i < pts.length; i++) {
                                        const prev = pts[i - 1]
                                        const cur = pts[i]
                                        d.push(`L${cur.x.toFixed(1)},${prev.y.toFixed(1)}`)
                                        d.push(`L${cur.x.toFixed(1)},${cur.y.toFixed(1)}`)
                                      }
                                      return d.join(" ")
                                    }

                                    if (focusedIsReach && s.k === "reach") {
                                      const span = Math.max(s.max - s.min, 0)
                                      const reachPts = chartRowsAligned
                                        .map((r, i) => {
                                        const raw = r.reach
                                        if (typeof raw !== "number" || !Number.isFinite(raw)) return null
                                        const norm = span > 0 ? ((raw - s.min) / span) * 100 : 50
                                        const x = sx(i)
                                        const y = sy(Number.isFinite(norm) ? norm : 50)
                                        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                        return { x, y }
                                        })
                                        .filter(Boolean) as Array<{ x: number; y: number }>

                                      const reachPath = buildSmoothPath(reachPts)

                                      const comparePath = (() => {
                                        if (!compareEnabled) return ""
                                        if (compareRangeDays === selectedTrendRangeDays) return ""
                                        if (!compareSeriesReach || compareSeriesReach.length < 1) return ""

                                        const span = Math.max(s.max - s.min, 0)
                                        const mapByTs = new Map<number, number>()
                                        const mapByT = new Map<string, number>()
                                        for (const p of compareSeriesReach) {
                                          const v = p?.reach
                                          if (typeof v !== "number" || !Number.isFinite(v)) continue
                                          const ts = typeof p?.ts === "number" && Number.isFinite(p.ts) ? (p.ts as number) : null
                                          if (ts !== null) {
                                            mapByTs.set(ts, v)
                                          } else {
                                            const k = typeof p?.t === "string" ? p.t : ""
                                            if (k) mapByT.set(k, v)
                                          }
                                        }

                                        const compareRawByIndex = dataForChart.map((p) => {
                                          const keyTs = typeof p?.ts === "number" && Number.isFinite(p.ts) ? (p.ts as number) : null
                                          const raw =
                                            keyTs !== null
                                              ? mapByTs.get(keyTs) ?? null
                                              : mapByT.get(typeof p?.t === "string" ? p.t : "") ?? null
                                          return typeof raw === "number" && Number.isFinite(raw) ? raw : null
                                        })

                                        const compareMa7ByIndex = compareRawByIndex.map((_, i) => {
                                          const end = i
                                          const start = Math.max(0, i - 6)
                                          let sum = 0
                                          let count = 0
                                          for (let j = start; j <= end; j++) {
                                            const v = compareRawByIndex[j]
                                            if (typeof v !== "number" || !Number.isFinite(v)) return null
                                            sum += v
                                            count += 1
                                          }
                                          if (count < 1) return null
                                          return sum / count
                                        })

                                        const ptsWithGaps = compareMa7ByIndex.map((v, i) => {
                                          if (typeof v !== "number" || !Number.isFinite(v)) return null
                                          const norm = span > 0 ? ((v - s.min) / span) * 100 : 50
                                          const x = sx(i)
                                          const y = sy(Number.isFinite(norm) ? norm : 50)
                                          if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                          return { x, y }
                                        })

                                        const pts = ptsWithGaps.filter(Boolean) as Array<{ x: number; y: number }>
                                        return pts.length >= 2 ? buildSmoothPath(pts) : ""
                                      })()

                                      const maPtsWithGaps = reachMa7ByIndex.map((v, i) => {
                                        if (typeof v !== "number" || !Number.isFinite(v)) return null
                                        const norm = span > 0 ? ((v - s.min) / span) * 100 : 50
                                        const x = sx(i)
                                        const y = sy(Number.isFinite(norm) ? norm : 50)
                                        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                        return { x, y }
                                      })

                                      const maPts = maPtsWithGaps.filter(Boolean) as Array<{ x: number; y: number }>
                                      const maPath = buildSmoothPath(maPts)

                                      return (
                                        <g key={`trend-line-${s.k}`}>
                                          <path d={reachPath} stroke={s.color} strokeWidth={isSmUp ? 2 : 1.4} fill="none" opacity={0.42} />
                                          <path d={maPath} stroke={s.color} strokeWidth={isSmUp ? 2.2 : 1.6} fill="none" opacity={0.92} />
                                          {comparePath ? (
                                            <path
                                              d={comparePath}
                                              stroke="rgba(255,255,255,0.95)"
                                              strokeWidth={isSmUp ? 1.8 : 1.4}
                                              strokeDasharray="6 4"
                                              fill="none"
                                              opacity={compareOpacity}
                                            />
                                          ) : null}
                                        </g>
                                      )
                                    }

                                    if (focusedIsFollowers && s.k === "followers") {
                                      const comparePath = (() => {
                                        if (!compareEnabled) return ""
                                        if (compareRangeDays === selectedTrendRangeDays) return ""
                                        if (!compareSeriesFollowers || compareSeriesFollowers.length < 1) return ""

                                        const span = Math.max(s.max - s.min, 0)
                                        const mapByTs = new Map<number, number>()
                                        for (const p of compareSeriesFollowers) {
                                          const ts = typeof p?.ts === "number" && Number.isFinite(p.ts) ? (p.ts as number) : null
                                          if (ts === null) continue
                                          const v = p?.followerDelta
                                          if (typeof v !== "number" || !Number.isFinite(v)) continue
                                          mapByTs.set(ts, v)
                                        }

                                        const pts = dataForChart
                                          .map((p, i) => {
                                            const keyTs = typeof p?.ts === "number" && Number.isFinite(p.ts) ? (p.ts as number) : null
                                            if (keyTs === null) return null
                                            const raw = mapByTs.get(keyTs) ?? null
                                            if (typeof raw !== "number" || !Number.isFinite(raw)) return null
                                            const norm = span > 0 ? ((raw - s.min) / span) * 100 : 50
                                            const x = sx(i)
                                            const y = sy(Number.isFinite(norm) ? norm : 50)
                                            if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                            return { x, y }
                                          })
                                          .filter(Boolean) as Array<{ x: number; y: number }>

                                        return buildStepAfterPath(pts)
                                      })()

                                      const span = Math.max(s.max - s.min, 0)
                                      const mainPts = chartRowsAligned
                                        .map((r, i) => {
                                        const raw = r.followers
                                        if (typeof raw !== "number" || !Number.isFinite(raw)) return null
                                        const norm = span > 0 ? ((raw - s.min) / span) * 100 : 50
                                        const x = sx(i)
                                        const y = sy(Number.isFinite(norm) ? norm : 50)
                                        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                        return { x, y }
                                        })
                                        .filter(Boolean) as Array<{ x: number; y: number }>

                                      const d = buildStepAfterPath(mainPts)

                                      return (
                                        <g key={`trend-line-${s.k}`}>
                                          <path
                                            d={d}
                                            stroke={s.color}
                                            strokeWidth={2}
                                            fill="none"
                                            opacity={isFocused ? 0.99 : 0.55}
                                          />
                                          {comparePath ? (
                                            <path
                                              key={`trend-line-compare-${s.k}`}
                                              d={comparePath}
                                              stroke="rgba(255,255,255,0.95)"
                                              strokeWidth={isSmUp ? 1.8 : 1.4}
                                              strokeDasharray="6 4"
                                              fill="none"
                                              opacity={compareOpacity}
                                            />
                                          ) : null}
                                        </g>
                                      )
                                    }

                                    const d = s.points
                                      .map((p, i) => {
                                        const x = sx(p.i)
                                        const y = sy(p.yNorm)
                                        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
                                      })
                                      .filter(Boolean)
                                      .join(" ")

                                    return (
                                      <path
                                        key={`trend-line-${s.k}`}
                                        d={d}
                                        stroke={s.color}
                                        strokeWidth={s.k === "followerDelta" ? 1 : 2}
                                        strokeOpacity={s.k === "followerDelta" ? 0.35 : 1}
                                        strokeDasharray={s.k === "followerDelta" ? "4 6" : "none"}
                                        fill="none"
                                        opacity={isFocused ? 0.99 : 0.55}
                                      />
                                    )
                                  })
                                })()}

                                {(() => {
                                  const focus = drawable.find((s) => s.k === focusedAccountTrendMetric)
                                  if (!focus) return null
                                  if (focusedIsReach && focus.k === "reach") return null
                                  if (focusedIsFollowers && focus.k === "followers") return null
                                  return focus.points.map((p) => {
                                    const cx = sx(p.i)
                                    const cy = sy(p.yNorm)
                                    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                                    const r = isSmUp ? 2.9 : 4.2
                                    return (
                                      <circle
                                        key={`trend-focus-pt-${p.i}`}
                                        cx={cx}
                                        cy={cy}
                                        r={r}
                                        fill={focus.color}
                                        opacity={0.95}
                                        stroke="rgba(255,255,255,0.35)"
                                        strokeWidth={1.5}
                                      />
                                    )
                                  })
                                })()}

                                {clampedHoverIdx !== null ? (
                                  <line x1={sx(clampedHoverIdx)} y1={padY} x2={sx(clampedHoverIdx)} y2={h - padY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                                ) : null}

                                {clampedHoverIdx !== null
                                  ? (() => {
                                      const s = drawable.find((x) => x.k === focusedAccountTrendMetric)
                                      if (!s) return null
                                      const hit = s.points.find((p) => p.i === clampedHoverIdx)
                                      if (!hit) return null
                                      const cx = sx(hit.i)
                                      const cy = sy(hit.yNorm)
                                      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                                      const r = focusedIsFollowers ? 4 : isSmUp ? 4.2 : 6
                                      return (
                                        <circle
                                          key={`trend-dot-focus`}
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill={s.color}
                                          stroke="rgba(255,255,255,0.35)"
                                          strokeWidth={2}
                                        />
                                      )
                                    })()
                                  : null}

                                {focusedIsFollowers && clampedHoverIdx === null
                                  ? (() => {
                                      const lastIdx = xLast
                                      if (lastIdx < 0) return null
                                      const s0 = drawable.find((s) => s.k === "followers")
                                      if (!s0) return null
                                      const hit = s0.points.find((p) => p.i === lastIdx)
                                      if (!hit) return null
                                      const cx = sx(lastIdx)
                                      const cy = sy(hit.yNorm)
                                      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                                      const r = isSmUp ? 3.8 : 5
                                      return (
                                        <circle
                                          key="trend-followers-last-dot"
                                          cx={cx}
                                          cy={cy}
                                          r={r}
                                          fill={s0.color}
                                          stroke="rgba(255,255,255,0.28)"
                                          strokeWidth={2}
                                          opacity={0.92}
                                        />
                                      )
                                    })()
                                  : null}

                                {trendMeta?.isToday
                                  ? (() => {
                                      const lastIdx = xLast
                                      if (lastIdx < 0) return null
                                      const s0 = drawable.find((s) => s.points.some((p) => p.i === lastIdx))
                                      if (!s0) return null
                                      const hit = s0.points.find((p) => p.i === lastIdx)
                                      if (!hit) return null
                                      const cx = sx(lastIdx)
                                      const cy = sy(hit.yNorm)
                                      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                                      const outerR = isSmUp ? 7 : 9
                                      const innerR = isSmUp ? 4 : 5
                                      return (
                                        <g key="trend-today-highlight" className="trend-today-pulse">
                                          <circle
                                            cx={cx}
                                            cy={cy}
                                            r={outerR}
                                            fill="none"
                                            stroke="rgba(255,255,255,0.40)"
                                            strokeWidth={2}
                                          />
                                          <circle cx={cx} cy={cy} r={innerR} fill="rgba(255,255,255,1)" />
                                          <text
                                            x={cx}
                                            y={Math.max(12, cy - 12)}
                                            textAnchor="middle"
                                            fill="rgba(255,255,255,0.70)"
                                            stroke="rgba(0,0,0,0.55)"
                                            strokeWidth={3}
                                            paintOrder="stroke"
                                            fontSize={10}
                                            fontWeight={600}
                                          >
                                            {t("results.trend.today")}
                                          </text>
                                        </g>
                                      )
                                    })()
                                  : null}

                                {(() => {
                                  const n = xN
                                  if (n <= 0) return null
                                  const last = xLast

                                  const desiredTicks = renderedTrendRangeDays <= 14 ? 7 : 8
                                  const maxTicks = isSmUp ? desiredTicks : Math.min(4, desiredTicks)
                                  const idxs = (() => {
                                    if (n <= maxTicks) return Array.from({ length: n }).map((_, i) => i)
                                    const out: Set<number> = new Set()
                                    out.add(0)
                                    out.add(last)
                                    const slots = Math.max(maxTicks - 2, 0)
                                    for (let k = 1; k <= slots; k++) {
                                      const i = Math.round((k * last) / (slots + 1))
                                      out.add(Math.max(0, Math.min(last, i)))
                                    }
                                    return Array.from(out).sort((a, b) => a - b)
                                  })()

                                  const anchorFor = (i: number) => (i === 0 ? "start" : i === last ? "end" : "middle")
                                  const topY = padY
                                  const bottomY = h - padY

                                  return (
                                    <g key="trend-x-axis-upgrade">
                                      {idxs.map((i: number) => {
                                        const x = sx(i)
                                        if (!Number.isFinite(x)) return null
                                        return (
                                          <g key={`trend-xt-${i}`}>
                                            <line
                                              x1={x}
                                              x2={x}
                                              y1={topY}
                                              y2={bottomY}
                                              stroke={focusedIsReach ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.06)"}
                                              strokeWidth="1"
                                            />
                                            <line
                                              x1={x}
                                              x2={x}
                                              y1={bottomY}
                                              y2={Math.min(h - 2, bottomY + 6)}
                                              stroke={focusedIsReach ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.18)"}
                                              strokeWidth="1"
                                            />
                                          </g>
                                        )
                                      })}

                                      {idxs.map((i: number) => {
                                        const x = sx(i)
                                        if (!Number.isFinite(x)) return null
                                        const labelRaw = xDomainRows[i]?.t ?? ""
                                        const label = !isSmUp && typeof labelRaw === "string" ? labelRaw.replace(/^0+/, "").replace("/0", "/") : labelRaw
                                        return (
                                          <text
                                            key={`trend-xlab-${i}`}
                                            x={x}
                                            y={h - 4}
                                            textAnchor={anchorFor(i)}
                                            fill="rgba(255,255,255,0.34)"
                                            fontSize={10}
                                            fontWeight={500}
                                            style={{ fontVariantNumeric: "tabular-nums" }}
                                          >
                                            {label}
                                          </text>
                                        )
                                      })}
                                    </g>
                                  )
                                })()}
                              </svg>
                          </div>

                          {focusedIsFollowers && followersHoverPoint ? (
                            <TrendHoverTooltip title={String(followersHoverPoint.t ?? "")} items={tooltipItems} />
                          ) : clampedHoverIdx !== null && hoverPoint ? (
                            <TrendHoverTooltip title={String(hoverPoint.t ?? "")} items={tooltipItems} />
                          ) : null}
                        </div>
                      )}
                    </>
                  )
                  })()}
              </CardContent>
            </Card>

            {/* DEV-only Posts Debug Panel */}
            {process.env.NODE_ENV !== "production" && (
              <PostsDebugPanel
                isConnected={isConnected}
                hasRealMedia={hasRealMedia}
                mediaLength={Array.isArray(media) ? media.length : 0}
                effectiveRecentMediaLength={Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia.length : 0}
                topPerformingPostsLength={topPerformingPosts.length}
                latestPostsLength={latestPosts.length}
                topPostsSample={extractPostDebugInfo(topPerformingPosts)}
                latestPostsSample={extractPostDebugInfo(latestPosts)}
              />
            )}

            {renderMediaErrorBanner()}

            <Card
              id="top-posts-section"
              data-testid="top-performing-posts"
              className={"mt-3 scroll-mt-40 " + CARD_SHELL}
            >
              <CardHeader className={CARD_HEADER_ROW}>
                <div className="min-w-0">
                  <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.topPosts.title")}</CardTitle>
                  <p className="mt-0.5 hidden sm:block text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {t("results.topPosts.description")}
                  </p>
                  <p className="mt-0.5 hidden sm:block text-[11px] text-muted-foreground leading-snug line-clamp-1">{uiCopy.topPostsSortHint}</p>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 sm:flex-row sm:items-center sm:gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      router.push(`/${activeLocale}/post-analysis`)
                    }}
                    className="h-9 px-4 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 border border-white/10 w-auto shrink-0"
                  >
                    {t("results.postAnalysis.cta")}
                  </Button>

                  {!isPro ? (
                    <span
                      className="min-w-0 tabular-nums overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-white/55 sm:text-xs sm:text-muted-foreground sm:max-w-[220px]"
                      title={
                        `${t("results.postAnalysis.freeLeft")} ${freePostRemaining} / ${freePostLimit}`
                      }
                    >
                      {t("results.postAnalysis.freeLeft")} 
                      <span className="font-medium tabular-nums">{freePostRemaining}</span> / {freePostLimit}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4 sm:pt-3 lg:px-6 lg:pb-5 lg:pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
                  {(() => {
                    const sectionStatus = resolveTopPostsStatus()

                    const mobileSkeletonCount = isSmUpViewport ? 3 : 2

                    if (sectionStatus === "loading") {
                      return Array.from({ length: mobileSkeletonCount }, (_, i) => (
                        <div
                          key={`top-loading-skeleton-${i}`}
                          className="rounded-xl border border-white/8 bg-white/5 p-3 sm:p-4 min-w-0 overflow-hidden"
                        >
                          <div className="flex gap-2 min-w-0">
                            <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-md bg-white/10 animate-pulse" />
                            <div className="min-w-0 flex-1">
                              <div className="h-3 w-32 rounded bg-white/10 animate-pulse" />
                              <div className="mt-2 h-3 w-24 rounded bg-white/10 animate-pulse" />
                              <div className="mt-3 h-6 w-full rounded bg-white/10 animate-pulse hidden sm:block" />
                            </div>
                          </div>
                        </div>
                      ))
                    }

                    if (sectionStatus === "empty") {
                      return (
                        <div className="col-span-full text-center py-4 sm:py-8 text-white/60 text-xs sm:text-sm">
                          {t("results.topPosts.emptyState")}
                        </div>
                      )
                    }

                    const mockPosts = mockAnalysis.topPosts
                    const renderCards = hasRealMedia
                      ? (topPerformingPosts.length > 0 ? topPerformingPosts : effectiveRecentMedia.slice(0, 3))
                      : mockPosts.slice(0, 3)

                    const shown = !isSmUpViewport ? renderCards.slice(0, 3) : renderCards
                    return shown.map((p: unknown, index: number) => (
                      <div key={String(isRecord(p) && typeof p.id === "string" ? p.id : index)} className="group relative rounded-xl border border-white/8 bg-white/5 p-3 sm:p-4 min-w-0 overflow-hidden transition-colors duration-150 hover:border-white/15 hover:bg-white/6 active:bg-white/8">
                        {(() => {
                          if (!isRecord(p)) return null
                          const real = p

                          const metrics = getPostMetrics(real)
                          const views = typeof real?.views === "number" ? real.views : null
                          const likes = metrics.likes ?? 0
                          const comments = metrics.comments ?? 0
                          const engagement = metrics.engagement ?? 0

                          const mediaType =
                            typeof (real?.media_type ?? real?.mediaType) === "string" && String(real?.media_type ?? real?.mediaType)
                              ? String(real?.media_type ?? real?.mediaType)
                              : ""

                          const isVideoOrReel = mediaType === "VIDEO" || mediaType === "REELS"
                          const showViews = isVideoOrReel && views !== null && views > 0

                        const ymd = (() => {
                          const ts = typeof real?.timestamp === "string" ? real.timestamp : ""
                          if (!ts) return "—"
                          const d = new Date(ts)
                          const tms = d.getTime()
                          if (Number.isNaN(tms)) return "—"
                          const y = d.getFullYear()
                          const m = String(d.getMonth() + 1).padStart(2, "0")
                          const day = String(d.getDate()).padStart(2, "0")
                          return `${y}/${m}/${day}`
                        })()

                        const base = getBasicMediaFields(real)
                        const permalink = base.permalink
                        const caption = base.caption.trim() ? base.caption.trim() : ""
                        const realShortcode = base.shortcode

                        const normalizeKey = (input: string): string => {
                          const s = String(input || "").trim()
                          if (!s) return ""
                          if (/^\d+$/.test(s)) {
                            const t = s.replace(/^0+/, "")
                            return t ? t : "0"
                          }
                          return s
                        }

                        const realIdOrPermalink = (() => {
                          const idStr = base.id
                          if (idStr.trim()) return normalizeKey(idStr)
                          const pl = permalink.trim()
                          if (pl) return normalizeKey(pl)
                          const midStr = readIdLike(real, "media_id") || readIdLike(real, "mediaId")
                          if (midStr.trim()) return normalizeKey(midStr)
                          return ""
                        })()

                        const igHref =
                          (typeof real?.permalink === "string" && real.permalink ? real.permalink : "") ||
                          (typeof real?.ig_permalink === "string" && real.ig_permalink ? real.ig_permalink : "") ||
                          (typeof real?.shortcode === "string" && real.shortcode
                            ? `https://www.instagram.com/p/${real.shortcode}/`
                            : "")

                        const getIdAndPermalink = (it: unknown): { id: string; pl: string } => {
                          if (!isRecord(it)) return { id: "", pl: "" }
                          const id = readIdLike(it, "id")
                          const pl = readString(it, "permalink")
                          return { id, pl }
                        }

                        const findByIdOrPermalink = (list: unknown, key: string): unknown => {
                          const k = normalizeKey(key)
                          if (!k) return null
                          if (!Array.isArray(list)) return null
                          for (const it of list) {
                            const x = getIdAndPermalink(it)
                            const xid = normalizeKey(x.id)
                            if (xid && xid === k) return it
                            const xpl = normalizeKey(x.pl)
                            if (xpl && xpl === k) return it
                          }
                          return null
                        }

                        const snapshotMatchPost = findByIdOrPermalink(snapshotTopPosts, realIdOrPermalink)
                        const recentMatchPost = findByIdOrPermalink(recentPosts, realIdOrPermalink)

                        const previewUrl = (() => {
                          const isLikelyVideoUrl = (u: string) => /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)

                          const pickFrom = (it: unknown): { mt: string; tu: string; mu: string } => {
                            if (!isRecord(it)) return { mt: "", tu: "", mu: "" }
                            const mt = readString(it, "media_type") || readString(it, "mediaType")
                            const tu = readString(it, "thumbnail_url") || readString(it, "thumbnailUrl")
                            const mu = readString(it, "media_url") || readString(it, "mediaUrl")
                            return { mt, tu, mu }
                          }

                          const srcCandidates: unknown[] = [
                            real,
                            snapshotMatchPost,
                            recentMatchPost,
                            Array.isArray(snapshotTopPosts) ? snapshotTopPosts[index] : null,
                            Array.isArray(recentPosts) ? recentPosts[index] : null,
                          ]

                          for (const cand of srcCandidates) {
                            const { mt, tu, mu } = pickFrom(cand)
                            const isVideoType = mt === "VIDEO" || mt === "REELS"

                            const chosenRaw = (() => {
                              // VIDEO/REELS: prefer thumbnail. Only use media_url if it's not a video file.
                              if (isVideoType) {
                                const t = (tu || "").trim()
                                if (t) return t
                                const m = (mu || "").trim()
                                if (m && !isLikelyVideoUrl(m)) return m
                                const d = deriveVideoThumbUrl(permalink, realShortcode, igHref)
                                if (d) return d
                                // Fallback: if we only have an IG permalink (page URL),
                                // convert it to /media/?size=l so we can fetch a cover image.
                                const p = (permalink || "").trim()
                                if (p) return p
                                return ""
                              }

                              // IMAGE/CAROUSEL/etc: prefer media_url, fallback to thumbnail.
                              const m = (mu || "").trim()
                              if (m) return m
                              const t = (tu || "").trim()
                              if (t) return t
                              return ""
                            })()

                            if (!chosenRaw) continue

                            // Never return a video URL as an image.
                            if (isLikelyVideoUrl(chosenRaw)) {
                              const t = (tu || "").trim()
                              if (!t || isLikelyVideoUrl(t)) continue
                              if (t.startsWith("http")) return toThumbProxyUrl(t)
                              return t
                            }

                            if (chosenRaw.startsWith("http")) {
                              return toThumbProxyUrl(chosenRaw)
                            }
                            return chosenRaw
                          }

                          const p = (permalink || "").trim()
                          if (p && p.startsWith("http")) {
                            return toThumbProxyUrl(p)
                          }

                          return ""
                        })()

                        if (!previewUrl && (mediaType === "VIDEO" || mediaType === "REELS")) {
                          const ident = getStablePostIdentity(real)
                          const stableKey = getStableVideoThumbLogKey({
                            id: ident.id,
                            permalink: ident.permalink,
                            shortcode: ident.shortcode,
                          })
                          maybeLogMissingVideoThumb({
                            stableKey,
                            idOrPermalink: realIdOrPermalink || null,
                            hasPermalink: Boolean(ident.permalink.trim()),
                            hasShortcode: Boolean(ident.shortcode.trim()),
                          })
                        }

                        const isVideo = mediaType === "VIDEO" || mediaType === "REELS"
                        const videoLabel = mediaType === "REELS" ? "REELS" : "VIDEO"
                        const analyzeHref = permalink
                          ? `/${activeLocale}/post-analysis?url=${encodeURIComponent(permalink)}`
                          : `/${activeLocale}/post-analysis`

                        const insightsUnavailable = false
                        const insightsUnavailableLabel = isZh ? "無法取得洞察" : "Insights unavailable"

                        const thumbAlt = `Post preview${mediaType ? ` (${mediaType}${ymd && ymd !== "—" ? ` ${ymd}` : ""})` : ""}`

                        const cardHref = (igHref || "").trim()

                        return (
                          <>
                            {cardHref ? (
                              <a
                                href={cardHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open on Instagram"
                                className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220]"
                              />
                            ) : null}

                            <div className="relative z-10 flex gap-2 min-w-0">
                            <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                              <a
                                href={igHref || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="relative z-10 block relative overflow-hidden rounded-md bg-white/5 border border-white/10 h-full w-full"
                              >
                                <TopPostThumb src={previewUrl || undefined} alt={thumbAlt} mediaType={mediaType} />
                              </a>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0">
                                  <div className="text-xs text-muted-foreground leading-tight truncate min-w-0">
                                    <span className="whitespace-nowrap">{mediaType}</span>
                                    <span className="mx-1">·</span>
                                    <span className={numMono}>{ymd}</span>
                                  </div>

                                  {insightsUnavailable ? (
                                    <div className="mt-1 inline-flex max-w-full items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/65 whitespace-nowrap overflow-hidden text-ellipsis">
                                      {insightsUnavailableLabel}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={analyzeHref}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="relative z-10 inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 whitespace-nowrap"
                                    title={t("results.topPosts.card.analyzeTitle")}
                                  >
                                    {t("results.topPosts.card.analyzeLabel")}
                                  </a>
                                </div>
                              </div>

                              {caption ? (
                                <div className="mt-1 hidden sm:block text-xs text-slate-200/85 leading-tight line-clamp-2 min-w-0">
                                  {caption}
                                </div>
                              ) : null}

                              <div className="mt-2 sm:hidden text-[11px] leading-tight text-white/60 min-w-0 truncate">
                                {showViews ? (
                                  <>
                                    <span className="whitespace-nowrap">{t("results.metrics.views")}</span>
                                    <span className="ml-1 mr-2 inline-flex items-center">
                                      <span className={numMono}>
                                        {Math.round(views!).toLocaleString()}
                                      </span>
                                    </span>
                                    <span className="opacity-50">·</span>
                                  </>
                                ) : null}
                                <span className="whitespace-nowrap">{t("results.topPosts.card.likesLabel")}</span>
                                <span className="ml-1 mr-2 inline-flex items-center">
                                  <span className={numMono}>
                                    {Math.round(likes).toLocaleString()}
                                  </span>
                                </span>
                                <span className="opacity-50">·</span>
                                <span className="ml-2 whitespace-nowrap">{t("results.topPosts.card.commentsLabel")}</span>
                                <span className="ml-1 mr-2 inline-flex items-center">
                                  <span className={numMono}>
                                    {Math.round(comments).toLocaleString()}
                                  </span>
                                </span>
                                <span className="opacity-50">·</span>
                                <span className="ml-2 whitespace-nowrap">{t("results.topPosts.card.engagementLabel")}</span>
                                <span className="ml-1 inline-flex items-center">
                                  <span className={numMono}>
                                    {Math.round(engagement ?? (likes + comments)).toLocaleString()}
                                  </span>
                                </span>
                              </div>

                              <div className="mt-2.5 hidden sm:flex items-center justify-center gap-x-8 sm:gap-x-10 pr-4 sm:pr-6 min-w-0 overflow-hidden">
                                {showViews ? (
                                  <div className="min-w-0 text-center">
                                    <div className="text-xs text-slate-400 truncate">{t("results.metrics.views")}</div>
                                    <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                      <span className={numMono}>
                                        {Math.round(views!).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                ) : null}

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.likesLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {Math.round(likes).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.commentsLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {Math.round(comments).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.engagementLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {Math.round((engagement ?? (likes + comments)) as number).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                            </div>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    ))
                  })()}
                </div>
              </CardContent>
            </Card>

            <Card
              id="latest-posts-section"
              className={"mt-3 scroll-mt-40 " + CARD_SHELL}
            >
              <CardHeader className={CARD_HEADER_ROW}>
                <div className="min-w-0">
                  <CardTitle className="text-xl font-bold text-white min-w-0 truncate">{t("results.latestPosts.title")}</CardTitle>
                  <p className="mt-0.5 hidden sm:block text-[11px] text-muted-foreground leading-snug line-clamp-2">
                    {t("results.latestPosts.description")}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4 sm:pt-3 lg:px-6 lg:pb-5 lg:pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
                  {(() => {
                    const sectionStatus = resolveLatestPostsStatus()

                    const mobileSkeletonCount = isSmUpViewport ? 3 : 2

                    if (sectionStatus === "loading") {
                      return Array.from({ length: mobileSkeletonCount }, (_, i) => (
                        <div
                          key={`latest-loading-skeleton-${i}`}
                          className="rounded-xl border border-white/8 bg-white/5 p-3 sm:p-4 min-w-0 overflow-hidden"
                        >
                          <div className="flex gap-2 min-w-0">
                            <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-md bg-white/10 animate-pulse" />
                            <div className="min-w-0 flex-1">
                              <div className="h-3 w-32 rounded bg-white/10 animate-pulse" />
                              <div className="mt-2 h-3 w-24 rounded bg-white/10 animate-pulse" />
                              <div className="mt-3 h-6 w-full rounded bg-white/10 animate-pulse hidden sm:block" />
                            </div>
                          </div>
                        </div>
                      ))
                    }

                    if (sectionStatus === "empty") {
                      return (
                        <div className="col-span-full text-center py-4 sm:py-8 text-white/60 text-xs sm:text-sm">
                          {t("results.latestPosts.emptyState")}
                        </div>
                      )
                    }

                    return latestPosts.map((real, idx) => {
                      const base = getBasicMediaFields(real)
                      const likes = base.likeCount
                      const comments = base.commentsCount
                      const engagement = likes + comments

                      const mediaType = base.mediaType

                      const ymd = (() => {
                        const ts = base.timestamp
                        if (!ts) return "—"
                        const d = new Date(ts)
                        const tms = d.getTime()
                        if (Number.isNaN(tms)) return "—"
                        const y = d.getFullYear()
                        const m = String(d.getMonth() + 1).padStart(2, "0")
                        const day = String(d.getDate()).padStart(2, "0")
                        return `${y}/${m}/${day}`
                      })()

                      const permalink = base.permalink.trim() ? base.permalink : ""
                      const caption = base.caption.trim() ? base.caption.trim() : ""
                      const igHref = permalink
                      const realShortcode = base.shortcode

                      const previewUrl = (() => {
                        const mt = String(base.mediaType ?? "")
                        const tu = base.thumbnailUrl
                        const mu = base.mediaUrl
                        const isVideoType = mt === "VIDEO" || mt === "REELS"
                        const isLikelyVideoUrl = (u: string) => /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)

                        const chosenRaw = (() => {
                          if (isVideoType) {
                            const t = (tu || "").trim()
                            if (t) return t
                            const m = (mu || "").trim()
                            if (m && !isLikelyVideoUrl(m)) return m
                            const d = deriveVideoThumbUrl(permalink, realShortcode, igHref)
                            if (d) return d
                            // Fallback: use permalink and let the IG page->/media converter handle it.
                            const p = (permalink || "").trim()
                            if (p) return p
                            return ""
                          }

                          const m = (mu || "").trim()
                          if (m) return m
                          const t = (tu || "").trim()
                          if (t) return t
                          return ""
                        })()

                        if (!chosenRaw) {
                          const p = (permalink || "").trim()
                          if (p && p.startsWith("http")) {
                            return toThumbProxyUrl(p)
                          }
                          return ""
                        }
                        if (isLikelyVideoUrl(chosenRaw)) {
                          const t = (tu || "").trim()
                          if (!t || isLikelyVideoUrl(t)) {
                            const p = (permalink || "").trim()
                            if (p && p.startsWith("http")) {
                              return toThumbProxyUrl(p)
                            }
                            return ""
                          }
                          if (t.startsWith("http")) return toThumbProxyUrl(t)
                          return t
                        }

                        if (chosenRaw.startsWith("http")) {
                          return toThumbProxyUrl(chosenRaw)
                        }
                        return chosenRaw
                      })()

                      if (!previewUrl && (mediaType === "VIDEO" || mediaType === "REELS")) {
                        const ident = getStablePostIdentity(real)
                        const stableKey = getStableVideoThumbLogKey({
                          id: ident.id,
                          permalink: ident.permalink,
                          shortcode: ident.shortcode,
                        })
                        maybeLogMissingVideoThumb({
                          stableKey,
                          idOrPermalink: (ident.id || ident.permalink) ? String(ident.id || ident.permalink) : null,
                          hasPermalink: Boolean(ident.permalink.trim()),
                          hasShortcode: Boolean(ident.shortcode.trim()),
                        })
                      }

                      const analyzeHref = permalink
                        ? `/${activeLocale}/post-analysis?url=${encodeURIComponent(permalink)}`
                        : `/${activeLocale}/post-analysis`

                      const thumbAlt = `Post preview${mediaType ? ` (${mediaType}${ymd && ymd !== "—" ? ` ${ymd}` : ""})` : ""}`

                      const cardHref = (igHref || "").trim()

                      return (
                        <div key={base.id ? String(base.id) : `latest-${idx}`} className="group relative rounded-xl border border-white/8 bg-white/5 p-3 sm:p-4 min-w-0 overflow-hidden transition-colors duration-150 hover:border-white/15 hover:bg-white/6 active:bg-white/8">
                          {cardHref ? (
                            <a
                              href={cardHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open on Instagram"
                              className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220]"
                            />
                          ) : null}
                          <div className="relative z-10 flex gap-2 min-w-0">
                            <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                              <a
                                href={igHref || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="relative z-10 block relative overflow-hidden rounded-md bg-white/5 border border-white/10 h-full w-full"
                              >
                                <TopPostThumb src={previewUrl || undefined} alt={thumbAlt} mediaType={mediaType} />
                              </a>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0">
                                  <div className="text-xs text-muted-foreground leading-tight truncate min-w-0">
                                    <span className="whitespace-nowrap">{mediaType}</span>
                                    <span className="mx-1">·</span>
                                    <span className={numMono}>{ymd}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={analyzeHref}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 whitespace-nowrap"
                                    title={t("results.topPosts.card.analyzeTitle")}
                                  >
                                    {t("results.topPosts.card.analyzeLabel")}
                                  </a>
                                </div>
                              </div>

                              {caption ? (
                                <div className="mt-1 hidden sm:block text-xs text-slate-200/85 leading-tight line-clamp-2 min-w-0">
                                  {caption}
                                </div>
                              ) : null}

                              <div className="mt-2 sm:hidden text-[11px] leading-tight text-white/60 min-w-0 truncate">
                                <span className="whitespace-nowrap">{t("results.topPosts.card.likesLabel")}</span>
                                <span className="ml-1 mr-2 inline-flex items-center">
                                  <span className={numMono}>
                                    {Math.round(likes).toLocaleString()}
                                  </span>
                                </span>
                                <span className="opacity-50">·</span>
                                <span className="ml-2 whitespace-nowrap">{t("results.topPosts.card.commentsLabel")}</span>
                                <span className="ml-1 mr-2 inline-flex items-center">
                                  <span className={numMono}>
                                    {Math.round(comments).toLocaleString()}
                                  </span>
                                </span>
                                <span className="opacity-50">·</span>
                                <span className="ml-2 whitespace-nowrap">{t("results.topPosts.card.engagementLabel")}</span>
                                <span className="ml-1 inline-flex items-center">
                                  <span className={numMono}>
                                    {Math.round(engagement).toLocaleString()}
                                  </span>
                                </span>
                              </div>

                              <div className="mt-2.5 hidden sm:flex items-center justify-center gap-x-8 sm:gap-x-10 pr-4 sm:pr-6 min-w-0 overflow-hidden">
                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.likesLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {Math.round(likes).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.commentsLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {Math.round(comments).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.engagementLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {Math.round(engagement).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </CardContent>
            </Card>
            <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/18 to-transparent" />

            <div id="kpis-section" className="mt-4 scroll-mt-40">
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm sm:hidden overflow-hidden">
                <CardHeader
                  className={
                    isMobile
                      ? "px-3 pt-3 pb-2"
                      : kpiExpanded
                        ? "px-3 pt-3 pb-2 cursor-pointer"
                        : "px-3 py-2 cursor-pointer"
                  }
                  onClick={() => {
                    if (isMobile) return
                    setKpiExpanded((v) => !v)
                  }}
                >
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="min-w-0">
                      <CardTitle className="text-base font-semibold text-white min-w-0 truncate">{t("results.kpis.ui.mobileTitle")}</CardTitle>
                      {!isMobile && !kpiExpanded ? (
                        <div className="mt-0.5 text-[11px] leading-tight text-white/55 min-w-0 truncate">
                          {t("results.kpis.ui.mobileHintCollapsed")}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setKpiExpanded((v) => !v)
                      }}
                      className="text-xs text-white/70 hover:text-white whitespace-nowrap shrink-0 hidden sm:inline-flex"
                    >
                      {kpiExpanded ? t("results.kpis.ui.collapse") : t("results.kpis.ui.expand")}
                    </button>
                  </div>
                </CardHeader>
                {isMobile || kpiExpanded ? (
                  <CardContent className="pt-0 px-3 pb-3">
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {kpis.map((kpi) => {
                        const isSelected = Boolean(selectedGoalConfig)
                        const focus = isSelected
                          ? safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "focus"))
                          : ""
                        const isPrimary = isSelected && selectedGoalConfig!.primaryKpi === kpi.id
                        const note = isSelected ? safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "note")) : ""

                        const evalLevel = isSelected ? kpiEvaluationLevel(selectedGoalConfig!.id, kpi.id) : null
                        const evalTone = evalLevel ? kpiEvaluationTone(evalLevel) : null
                        const evalNote = isSelected ? t(`results.goals.evaluations.${selectedGoalConfig!.id}.${kpi.id}.note`) : ""

                        const levelSegments = evalLevel === "low" ? 1 : evalLevel === "medium" ? 2 : 3

                        return (
                          <Card
                            key={kpi.id}
                            className={
                              "rounded-xl border backdrop-blur-sm min-w-0 overflow-hidden " +
                              (evalTone ? evalTone.container + " " : "bg-white/5 ") +
                              (isPrimary ? "border-white/25" : "border-white/10")
                            }
                          >
                            <CardContent className="p-3 sm:p-4 flex h-full flex-col justify-between min-w-0 min-h-[120px] sm:min-h-0">
                              <div className="flex items-start justify-between gap-3 min-w-0">
                                <div className={"text-xs sm:text-sm leading-tight font-medium text-slate-100 min-w-0 whitespace-normal break-words line-clamp-2 sm:whitespace-nowrap sm:truncate sm:line-clamp-none" + (isPrimary ? "" : "")}>{t(kpi.titleKey)}</div>
                                <div className="flex flex-col items-end gap-2 min-w-0">
                                  {isSelected ? (
                                    <div className="text-[11px] text-muted-foreground text-right min-w-0 line-clamp-2 leading-snug">{focus}</div>
                                  ) : null}
                                  {evalLevel ? (
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-1">
                                        {[0, 1, 2].map((i) => (
                                          <span
                                            key={i}
                                            className={
                                              "h-1.5 w-5 rounded-full " +
                                              (i < levelSegments
                                                ? kpiEvaluationTone(evalLevel).bar
                                                : kpiEvaluationTone(evalLevel).barEmpty)
                                            }
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="mt-1 text-2xl sm:text-3xl font-semibold text-white min-w-0 tabular-nums whitespace-nowrap">
                                <span className={numMono}>{kpi.value}</span>
                                {kpi.preview ? (
                                  <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                                    {t("results.common.preview")}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-[11px] leading-snug text-white/75 min-w-0 overflow-hidden break-words line-clamp-1 sm:line-clamp-none min-h-[16px] sm:min-h-0">
                                {t(kpi.descriptionKey)}
                              </p>
                              {safeT(`results.kpi.consequence.${kpi.id}`) ? (
                                <p className="hidden sm:block mt-1 text-xs text-white/45 leading-snug">
                                  {safeT(`results.kpi.consequence.${kpi.id}`)}
                                </p>
                              ) : null}
                              {evalNote ? (
                                <div className="mt-1 text-[10px] text-muted-foreground leading-tight line-clamp-1 min-w-0">
                                  {evalNote}
                                </div>
                              ) : null}

                              {isSelected ? (
                                <div className="mt-2 text-xs text-muted-foreground hidden sm:block">
                                  <div>{safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "role"))}</div>
                                  <div className="mt-1">{safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "status"))}</div>
                                  {note ? <div className="mt-1">{note}</div> : null}
                                </div>
                              ) : null}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </CardContent>
                ) : null}
              </Card>

              <div className="hidden sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {kpis.map((kpi) => {
                  const isSelected = Boolean(selectedGoalConfig)
                  const focus = isSelected
                    ? safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "focus"))
                    : ""
                  const isPrimary = isSelected && selectedGoalConfig!.primaryKpi === kpi.id
                  const note = isSelected ? safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "note")) : ""

                  const evalLevel = isSelected ? kpiEvaluationLevel(selectedGoalConfig!.id, kpi.id) : null
                  const evalTone = evalLevel ? kpiEvaluationTone(evalLevel) : null
                  const evalNote = isSelected ? t(`results.goals.evaluations.${selectedGoalConfig!.id}.${kpi.id}.note`) : ""

                  const levelSegments = evalLevel === "low" ? 1 : evalLevel === "medium" ? 2 : 3

                  return (
                    <Card
                      key={kpi.id}
                      className={
                        "rounded-xl border backdrop-blur-sm min-w-0 overflow-hidden " +
                        (evalTone ? evalTone.container + " " : "bg-white/5 ") +
                        (isPrimary ? "border-white/25" : "border-white/10")
                      }
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className={"text-[11px] leading-tight sm:text-sm font-medium text-slate-100 min-w-0 truncate" + (isPrimary ? "" : "")}>{t(kpi.titleKey)}</div>
                          <div className="flex flex-col items-end gap-2 min-w-0">
                            {isSelected ? (
                              <div className="text-[11px] text-muted-foreground text-right min-w-0 line-clamp-2 leading-snug">{focus}</div>
                            ) : null}
                            {evalLevel ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  {[0, 1, 2].map((i) => (
                                    <span
                                      key={i}
                                      className={
                                        "h-1.5 w-5 rounded-full " +
                                        (i < levelSegments
                                          ? kpiEvaluationTone(evalLevel).bar
                                          : kpiEvaluationTone(evalLevel).barEmpty)
                                      }
                                    />
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-1 text-[clamp(18px,5vw,22px)] sm:text-lg font-semibold text-white min-w-0">
                          <span className={numMono}>{kpi.value}</span>
                          {kpi.preview ? (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              {t("results.common.preview")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-white/75 min-w-0 overflow-hidden line-clamp-1 sm:line-clamp-none sm:text-xs">
                          {t(kpi.descriptionKey)}
                        </p>
                        {safeT(`results.kpi.consequence.${kpi.id}`) ? (
                          <p className="hidden sm:block mt-1 text-xs text-white/45 leading-snug">
                            {safeT(`results.kpi.consequence.${kpi.id}`)}
                          </p>
                        ) : null}

                        {evalNote ? (
                          <div className="mt-1 text-[10px] sm:text-xs text-muted-foreground leading-tight line-clamp-1 min-w-0">
                            {evalNote}
                          </div>
                        ) : null}

                        {isSelected ? (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <div>{safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "role"))}</div>
                            <div className="mt-1">{safeT(kpiInterpretationKey(selectedGoalConfig!.id, kpi.id, "status"))}</div>
                            {note ? <div className="mt-1">{note}</div> : null}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Creator Card Showcase Section */}
          <CreatorCardShowcase
            locale={activeLocale}
            username={displayUsername}
            displayName={displayName}
            isConnected={isConnectedInstagram}
            isLoading={isCreatorCardLoading}
            hasCard={isRecord(creatorCard)}
            isCardPublic={isRecord(creatorCard) ? Boolean(creatorCard.isPublic ?? creatorCard.is_public) : false}
            cardId={isRecord(creatorCard) && typeof creatorCard.id === "string" ? creatorCard.id : undefined}
            topPosts={topPerformingPosts}
            latestPosts={latestPosts}
            t={t}
          />

          {isProModalOpen && (
            <div className="fixed inset-0 z-[70] pointer-events-none">
              <div className="pointer-events-auto">
                <div className="absolute inset-x-4 sm:inset-x-6 md:inset-x-0 md:left-1/2 md:-translate-x-1/2 top-24 md:top-28 md:w-[640px] rounded-2xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
                  <div className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mt-1 text-lg font-semibold text-white leading-snug">{t("results.footer.proModalTitle")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-snug">{t("results.footer.proModalDesc")}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-slate-200 hover:bg-white/5"
                      onClick={() => setIsProModalOpen(false)}
                    >
                      {t("results.footer.proModalSecondary")}
                    </Button>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/8 bg-white/5 p-3">
                    <div className="text-sm font-medium text-white">{t("results.footer.proModalBulletsTitle")}</div>
                    <ul className="mt-2 text-sm text-slate-200 space-y-1.5">
                      <li>{t("results.footer.proModalBullets.1")}</li>
                      <li>{t("results.footer.proModalBullets.2")}</li>
                      <li>{t("results.footer.proModalBullets.3")}</li>
                    </ul>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      onClick={() => setIsProModalOpen(false)}
                    >
                      {t("results.footer.proModalSecondary")}
                    </Button>
                    <Button
                      type="button"
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      onClick={() => {
                        setIsProModalOpen(false)
                        scrollToId("results-pro-upgrade", "center")
                        flashUpgradeHighlight()
                      }}
                    >
                      {t("results.footer.proModalPrimary")}
                    </Button>
                  </div>
                </div>
                </div>
              </div>
            </div>
          )}
          </>
        }
      />

    </>
  )
}
