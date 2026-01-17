"use client"

// Density pass: tighten common headings/blocks inside Results page (UI-only)

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { createClient } from "@supabase/supabase-js"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { ArrowLeft, Instagram, AtSign, Lock } from "lucide-react"
import GrowthPaths from "../../components/growth-paths"
import { MonetizationSection } from "../../components/monetization-section"
import { ShareResults } from "../../components/share-results"
import { useRefetchTick } from "../lib/useRefetchTick"
import { extractLocaleFromPathname, localePathname } from "../lib/locale-path"
import { useInstagramMe } from "../lib/useInstagramMe"
import { extractIgUserIdFromInsightsId } from "../lib/instagram"
import { useFollowersMetrics } from "./hooks/useFollowersMetrics"
import { FollowersStatChips } from "./components/FollowersStatChips"
import { CreatorCardPreview } from "../components/CreatorCardPreview"
import ConnectedGateBase from "../[locale]/results/ConnectedGate"
import { mockAnalysis } from "../[locale]/results/mockData"

// Dev StrictMode can mount/unmount/mount causing useRef to reset.
// Module-scope flag survives remount in the same session and prevents duplicate fetch.
let __resultsMediaFetchedOnce = false
let __resultsMeFetchedOnce = false

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

function isAbortError(err: unknown): boolean {
  const anyErr = err as any
  const name = typeof anyErr?.name === "string" ? anyErr.name : ""
  const msg = typeof anyErr?.message === "string" ? anyErr.message : ""
  const s = `${name} ${msg}`.toLowerCase()
  return name === "AbortError" || s.includes("abort") || s.includes("canceled") || s.includes("cancelled")
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
  card?: any
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

function TopPostThumb({ src, alt }: { src?: string; alt: string }) {
  const FALLBACK_IMG = "/window.svg"
  const [currentSrc, setCurrentSrc] = useState<string>(src && src.length > 0 ? src : FALLBACK_IMG)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
    setCurrentSrc(src && src.length > 0 ? src : FALLBACK_IMG)
  }, [src])

  const isVideoUrl = useMemo(() => {
    const u = typeof currentSrc === "string" ? currentSrc.trim() : ""
    if (!u) return false
    return /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)
  }, [currentSrc])

  if (broken || isVideoUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-[11px] font-semibold text-white/70" aria-label={alt}>
        Video
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
      onError={() => {
        setBroken(true)
      }}
    />
  )
}

function SafeIgThumb(props: { src?: string; alt: string; className: string }) {
  const { src, alt, className } = props
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
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
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onConnect}
        >
          {props.t("results.gates.connect.cta")}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onBack}
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

function normalizeMedia(raw: any):
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
  }> {
  const src = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []

  return src
    .map((m: any) => {
      const id = typeof m?.id === "string" ? m.id : String(m?.id ?? "")
      if (!id) return null

      const like_count = Number(m?.like_count ?? m?.likeCount ?? m?.likes_count ?? m?.likesCount ?? m?.likes)
      const comments_count = Number(m?.comments_count ?? m?.commentsCount ?? m?.comment_count ?? m?.commentCount ?? m?.comments)

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
      }
    })
    .filter(Boolean) as any
}

const normalizeMe = (raw: unknown): IgMeResponse | null => {
  const isRec = (v: unknown): v is Record<string, any> => Boolean(v && typeof v === "object")
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
  const base: Record<string, any> = (isRec(raw.data) ? raw.data : isRec(raw.me) ? raw.me : raw) as any
  const connected = Boolean((raw as any)?.connected ?? base?.connected)

  const profileRaw: Record<string, any> | null =
    (isRec(base?.profile) ? base.profile : null) ||
    (isRec(base?.data?.profile) ? base.data.profile : null) ||
    (isRec((raw as any)?.profile) ? (raw as any).profile : null)

  // If backend returns flat fields, synthesize a profile object.
  const flatHasAny =
    typeof base?.profile_picture_url === "string" ||
    typeof base?.username === "string" ||
    typeof base?.followers_count !== "undefined" ||
    typeof base?.follows_count !== "undefined" ||
    typeof base?.media_count !== "undefined"

  const p = (profileRaw ?? (flatHasAny ? base : null)) as any
  if (!p && !connected) return null

  const profile = p
    ? {
        id: pickStr(p?.id),
        username: pickStr(p?.username, base?.username, (raw as any)?.username),
        name: pickStr(p?.name, base?.name, (raw as any)?.name, base?.display_name),
        profile_picture_url: pickStr(p?.profile_picture_url, base?.profile_picture_url),
        followers_count: toNumOrNull(p?.followers_count),
        follows_count: toNumOrNull(p?.follows_count ?? p?.following_count),
        media_count: toNumOrNull(p?.media_count),
      }
    : undefined

  return {
    connected,
    provider: typeof (raw as any)?.provider === "string" ? (raw as any).provider : undefined,
    profile,
    username: profile?.username,
    name: profile?.name,
    profile_picture_url: profile?.profile_picture_url,
    followers_count: typeof profile?.followers_count === "number" ? profile.followers_count : undefined,
    follows_count: typeof profile?.follows_count === "number" ? profile.follows_count : undefined,
    media_count: typeof profile?.media_count === "number" ? profile.media_count : undefined,
    recent_media: Array.isArray(base?.recent_media) ? base.recent_media : Array.isArray((raw as any)?.recent_media) ? (raw as any).recent_media : undefined,
  }
}

export default function ResultsClient() {
  const __DEV__ = process.env.NODE_ENV !== "production"
  const __DEBUG_RESULTS__ = process.env.NEXT_PUBLIC_DEBUG_RESULTS === "1"
  const dlog = useCallback(
    (...args: any[]) => {
      if (__DEV__) console.debug(...args)
    },
    [__DEV__]
  )

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

  const getPostPermalink = (post: any): string => {
    return (
      (typeof post?.permalink === "string" ? post.permalink : "") ||
      (typeof post?.url === "string" ? post.url : "") ||
      (typeof post?.link === "string" ? post.link : "") ||
      (typeof post?.post_url === "string" ? post.post_url : "") ||
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
  const [connectEnvError, setConnectEnvError] = useState<"missing_env" | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
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
  const [dailySnapshotData, setDailySnapshotData] = useState<any>(null)
  const [dailySnapshotAvailableDays, setDailySnapshotAvailableDays] = useState<number | null>(null)
  const [trendFetchStatus, setTrendFetchStatus] = useState<{ loading: boolean; error: string; lastDays: number | null }>({
    loading: false,
    error: "",
    lastDays: null,
  })
  const [trendFetchedAt, setTrendFetchedAt] = useState<number | null>(null)
  const [trendHasNewDay, setTrendHasNewDay] = useState(false)
  const [trendNeedsConnectHint, setTrendNeedsConnectHint] = useState(false)

  const [followersDailyRows, setFollowersDailyRows] = useState<
    Array<{ day: string; followers_count: number }>
  >([])
  const [followersLastWriteAt, setFollowersLastWriteAt] = useState<string | null>(null)

  const trendPointsHashRef = useRef<string>("")
  const hashTrendPoints = useCallback((pts: AccountTrendPoint[]) => {
    const list = Array.isArray(pts) ? pts : []
    try {
      return JSON.stringify(
        list.map((p: any) => [
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

  // Stable lengths for useEffect deps (avoid conditional/spread deps changing array size)
  const igRecentLen = Array.isArray((igMe as any)?.recent_media) ? (igMe as any).recent_media.length : 0
  const mediaLen = Array.isArray(media) ? media.length : 0
  const effectiveRecentMedia = useMemo(() => {
    const fromApi = Array.isArray(media) ? media : []
    if (fromApi.length > 0) return fromApi

    const fromMe = Array.isArray((igMe as any)?.recent_media) ? (igMe as any).recent_media : []
    if (fromMe.length > 0) return fromMe

    return [] as any[]
  }, [igMe, media])

  const effectiveRecentLen = Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia.length : 0
  const topPostsLen = effectiveRecentLen

  // Profile stats (UI-only)
  // Source of truth: Meta returns these on `profile`.
  const profileStats = ((igMe as any)?.profile ?? null) as any
  const followersCount = toNum(profileStats?.followers_count)
  const followsCount = toNum(profileStats?.follows_count ?? profileStats?.following_count)
  const mediaCount = toNum(profileStats?.media_count) ?? (mediaLoaded && Array.isArray(media) ? media.length : undefined)
  const formatCompact = (n?: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    try {
      return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    } catch {
      return String(Math.round(n))
    }
  }

  // Determine whether "recent_media" looks like real IG media (numeric id) — DEV logging only
  const recentFirstId = String((((igMe as any)?.recent_media?.[0] as any)?.id ?? ""))
  const topPostsFirstId = recentFirstId
  const topPostsHasReal = igRecentLen > 0 && /^\d+$/.test(recentFirstId)

  const hasFetchedMediaRef = useRef(false)
  const hasFetchedMeRef = useRef(false)
  const lastMediaFetchTickRef = useRef<number | null>(null)
  const mediaReqIdRef = useRef(0)
  const hasSuccessfulMePayloadRef = useRef(false)
  const lastMeFetchTickRef = useRef<number | null>(null)

  const hasRestoredResultsScrollRef = useRef(false)

  const hasFetchedDailySnapshotRef = useRef(false)
  const hasAppliedDailySnapshotTrendRef = useRef(false)
  const dailySnapshotAbortRef = useRef<AbortController | null>(null)
  const dailySnapshotRequestSeqRef = useRef(0)
  const lastDailySnapshotFetchAtRef = useRef(0)
  const lastDailySnapshotPointsSourceRef = useRef<string>("")

  const [forceReloadTick, setForceReloadTick] = useState(0)

  const tick = forceReloadTick ?? 0
  const lastRevalidateAtRef = useRef(0)

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
    (insightsDaily: any[]): {
      reach: number | null
      interactions: number | null
      engaged: number | null
      profileViews: number | null
      impressionsTotal: number | null
    } | null => {
    const list = Array.isArray(insightsDaily) ? insightsDaily : []
    const pickMetric = (metricName: string): number | null => {
      const it = list.find((x) => String(x?.name || "").trim() === metricName)
      const v = it?.total_value?.value
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

  const igCacheId = String(((igMe as any)?.profile?.id ?? (igMe as any)?.profile?.username ?? (igMe as any)?.username ?? "me") || "me")
  const resultsCacheKey = `results_cache:${igCacheId}:7`

  useEffect(() => {
    if (typeof window === "undefined") return
    const key = "results:scrollY"

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
    const key = "results:scrollY"
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(key)
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
    const legacyKeySameLocale = `results_cache:${igCacheId}:7:${activeLocale}`
    const legacyKeyOtherLocale = `results_cache:${igCacheId}:7:${activeLocale === "zh-TW" ? "en" : "zh-TW"}`

    const cached =
      saReadResultsCache(resultsCacheKey) ??
      saReadResultsCache(legacyKeySameLocale) ??
      saReadResultsCache(legacyKeyOtherLocale)

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
      const cachedLen = cached.trendPoints.length
      const curLen = Array.isArray(trendPoints) ? trendPoints.length : 0
      if (cachedLen >= 1 || (curLen < 1 && !hasAppliedDailySnapshotTrendRef.current)) {
        setTrendPointsDeduped(cached.trendPoints)
      }
    }
    if (typeof cached.trendFetchedAt === "number" || cached.trendFetchedAt === null) setTrendFetchedAt(cached.trendFetchedAt)

    // Migrate legacy locale-specific cache to the locale-agnostic key.
    saWriteResultsCache(resultsCacheKey, cached)
  }, [resultsCacheKey, setTrendPointsDeduped, trendPoints.length])

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

  const igProfile = ((igMe as any)?.profile ?? igMe) as any
  const isConnected =
    cookieConnected ||
    Boolean((igMe as any)?.connected === true) ||
    Boolean(((igMe as any)?.connected ? igProfile?.username : igMe?.username))
  const isConnectedInstagram = cookieConnected || Boolean((igMe as any)?.connected === true) || isConnected

  const hasAnyResultsData = Boolean(effectiveRecentLen > 0 || trendPoints.length > 0 || igMe)

  const refetchTick = useRefetchTick({ enabled: isConnectedInstagram, throttleMs: 900 })

  useEffect(() => {
    if (!cookieConnected) return
    setIgMe((prev: any) => {
      if (prev && prev.connected === true) return prev
      return { ...(prev ?? {}), connected: true }
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

  const normalizeDailyInsightsToTrendPoints = useCallback((insightsDaily: any[]): AccountTrendPoint[] => {
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
      const name = String(item?.name || "").trim()
      const values = Array.isArray(item?.values) ? item.values : []
      for (const v of values) {
        const endTime = typeof v?.end_time === "string" ? v.end_time : ""
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

  const mergeToContinuousTrendPoints = useCallback(
    (params: {
      days: number
      baseDbRowsRaw: unknown
      overridePointsRaw: unknown
    }): AccountTrendPoint[] => {
      const days = Math.max(1, Math.floor(params.days || 90))

      const parseYmd = (ymd: string) => {
        const s = String(ymd || "").trim()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
        const ms = Date.parse(`${s}T00:00:00.000Z`)
        return Number.isFinite(ms) ? ms : null
      }

      const utcDateStringFromOffset = (daysAgo: number) => {
        const now = new Date()
        const ms =
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0) -
          daysAgo * 24 * 60 * 60 * 1000
        const d = new Date(ms)
        const y = d.getUTCFullYear()
        const m = String(d.getUTCMonth() + 1).padStart(2, "0")
        const dd = String(d.getUTCDate()).padStart(2, "0")
        return `${y}-${m}-${dd}`
      }

      const toSafeInt = (v: unknown) => {
        const n = typeof v === "number" ? v : Number(v)
        if (!Number.isFinite(n)) return 0
        return Math.max(0, Math.floor(n))
      }

      const toByDayFromDbRows = (raw: unknown) => {
        const arr = Array.isArray(raw) ? raw : []
        const map = new Map<
          string,
          { reach: number; impressions: number; total_interactions: number; accounts_engaged: number }
        >()

        for (const it of Array.isArray(arr) ? arr : []) {
          const ymd = typeof (it as any)?.day === "string" ? String((it as any).day).trim() : ""
          if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue

          map.set(ymd, {
            reach: toSafeInt((it as any)?.reach),
            impressions: toSafeInt((it as any)?.impressions),
            total_interactions: toSafeInt((it as any)?.total_interactions),
            accounts_engaged: toSafeInt((it as any)?.accounts_engaged),
          })
        }

        return map
      }

      const toByDayFromIgPoints = (raw: unknown) => {
        const arr = coerceDailySnapshotPointsToArray(raw)
        const map = new Map<
          string,
          { reach: number; impressions: number; total_interactions: number; accounts_engaged: number }
        >()

        for (const it of Array.isArray(arr) ? arr : []) {
          const ymd =
            (typeof (it as any)?.date === "string" ? String((it as any).date).trim() : "") ||
            (typeof (it as any)?.day === "string" ? String((it as any).day).trim() : "")
          if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue

          map.set(ymd, {
            reach: toSafeInt((it as any)?.reach),
            impressions: toSafeInt((it as any)?.impressions),
            total_interactions: toSafeInt((it as any)?.interactions ?? (it as any)?.total_interactions),
            accounts_engaged: toSafeInt((it as any)?.engaged_accounts ?? (it as any)?.accounts_engaged ?? (it as any)?.engaged),
          })
        }

        return map
      }

      const baseByDay = toByDayFromDbRows(params.baseDbRowsRaw)
      const overrideByDay = toByDayFromIgPoints(params.overridePointsRaw)

      const mergedByDay = new Map(baseByDay)
      for (const [k, v] of overrideByDay.entries()) mergedByDay.set(k, v)

      const out: AccountTrendPoint[] = []
      for (let i = days - 1; i >= 0; i--) {
        const ymd = utcDateStringFromOffset(i)
        const row = mergedByDay.get(ymd) ?? { reach: 0, impressions: 0, total_interactions: 0, accounts_engaged: 0 }
        const ts = parseYmd(ymd)
        const safeTs = ts ?? Date.now() - i * 24 * 60 * 60 * 1000

        const p: any = {
          t: (() => {
            try {
              return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(safeTs))
            } catch {
              const d = new Date(safeTs)
              const m = String(d.getMonth() + 1).padStart(2, "0")
              const dd = String(d.getDate()).padStart(2, "0")
              return `${m}/${dd}`
            }
          })(),
          ts: safeTs,
          reach: row.reach,
          impressions: row.impressions,
          interactions: row.total_interactions,
          engaged: row.accounts_engaged,
        }
        p.total_interactions = row.total_interactions
        p.engaged_accounts = row.accounts_engaged
        p.accounts_engaged = row.accounts_engaged
        out.push(p as AccountTrendPoint)
      }

      return out
    },
    [],
  )

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

  function coerceDailySnapshotPointsToArray(points: unknown): any[] {
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
      if (!v || typeof v !== "object") return null
      const obj: any = v as any
      if (typeof obj.ts === "number" && Number.isFinite(obj.ts)) return obj.ts
      const dateRaw =
        (typeof obj.timestamp === "string" ? obj.timestamp : null) ??
        (typeof obj.date === "string" ? obj.date : null) ??
        (typeof obj.day === "string" ? obj.day : null)
      if (!dateRaw) return null
      const ms = Date.parse(String(dateRaw))
      return Number.isFinite(ms) ? ms : null
    }

    const looksLikePoint = (v: unknown): boolean => {
      if (!v || typeof v !== "object") return false
      const obj: any = v as any
      const hasTime =
        (typeof obj.date === "string" && obj.date.trim()) ||
        (typeof obj.day === "string" && obj.day.trim()) ||
        (typeof obj.timestamp === "string" && obj.timestamp.trim()) ||
        (typeof obj.ts === "number" && Number.isFinite(obj.ts))

      const hasMetric =
        obj.reach !== undefined ||
        obj.impressions !== undefined ||
        obj.interactions !== undefined ||
        obj.total_interactions !== undefined ||
        obj.engaged_accounts !== undefined ||
        obj.accounts_engaged !== undefined

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

  const normalizeDailySnapshotPointsToTrendPoints = useCallback((pointsRaw: any[]): AccountTrendPoint[] => {
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
      const it = list[idx] as any
      const dateRaw =
        (typeof it?.date === "string" ? it.date : null) ??
        (typeof it?.day === "string" ? it.day : null) ??
        (typeof it?.t === "string" ? it.t : null)

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

      const reach = toNum(it?.reach) ?? 0
      const impressions = toNum(it?.impressions) ?? 0
      const interactions = toNum(it?.interactions) ?? toNum(it?.total_interactions) ?? 0
      const engaged = toNum(it?.engaged_accounts) ?? toNum(it?.accounts_engaged) ?? 0

      const p: any = {
        t: fmtLabel(ts),
        ts,
        reach,
        impressions,
        interactions,
        engaged,
      }
      p.total_interactions = interactions
      p.engaged_accounts = engaged
      p.accounts_engaged = engaged
      out.push(p as AccountTrendPoint)
    }

    return out
  }, [])

  useEffect(() => {
    if (!isConnectedInstagram) {
      setTrendNeedsConnectHint(false)
      return
    }

    const now = Date.now()
    const cooldownMs = 90_000
    if (now - lastDailySnapshotFetchAtRef.current < cooldownMs) return
    if (hasFetchedDailySnapshotRef.current && trendPoints.length >= 1) return

    lastDailySnapshotFetchAtRef.current = now
    hasFetchedDailySnapshotRef.current = true

    setTrendFetchStatus({ loading: true, error: "", lastDays: 90 })
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
        const igReq = fetch("/api/instagram/daily-snapshot?days=90", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          signal: ac.signal,
        })

        const igUserIdStr = getCookieValue("ig_ig_id")
        const pageIdStr = getCookieValue("ig_page_id")
        const ig_user_id = Number(igUserIdStr)
        const page_id = Number(pageIdStr)

        const canQueryDb = Boolean(
          supabaseBrowser &&
            igUserIdStr &&
            pageIdStr &&
            Number.isFinite(ig_user_id) &&
            Number.isFinite(page_id)
        )

        const dbReq = canQueryDb
          ? supabaseBrowser!
              .from("ig_daily_insights")
              .select("day,reach,impressions,total_interactions,accounts_engaged")
              .eq("ig_user_id", ig_user_id)
              .eq("page_id", page_id)
              .gte("day", (() => {
                const now = new Date()
                const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0) - 89 * 24 * 60 * 60 * 1000
                const d = new Date(ms)
                const y = d.getUTCFullYear()
                const m = String(d.getUTCMonth() + 1).padStart(2, "0")
                const dd = String(d.getUTCDate()).padStart(2, "0")
                return `${y}-${m}-${dd}`
              })())
              .order("day", { ascending: true })
          : Promise.resolve({ data: [], error: null } as any)

        const [igRes, dbRes] = await Promise.all([igReq, dbReq])

        if (igRes.status === 401 || igRes.status === 403) {
          setTrendNeedsConnectHint(true)
          setTrendFetchStatus({ loading: false, error: "", lastDays: 90 })
          return
        }

        const json7 = await igRes.json().catch(() => null)
        if (!igRes.ok || !json7?.ok) {
          setDailySnapshotData(null)
          setTrendFetchStatus({ loading: false, error: "", lastDays: 90 })
          return
        }

        setDailySnapshotData(json7)

        const availableDaysFromApi = typeof json7?.available_days === "number" && Number.isFinite(json7.available_days) ? (json7.available_days as number) : null
        if (availableDaysFromApi !== null) setDailySnapshotAvailableDays(availableDaysFromApi)

        const pointsSource = typeof json7?.points_source === "string" ? json7.points_source : ""
        lastDailySnapshotPointsSourceRef.current = pointsSource

        if (pointsSource === "empty") {
          setTrendFetchStatus({ loading: false, error: "", lastDays: 90 })
          return
        }

        const totalsRaw = Array.isArray(json7?.insights_daily) ? json7.insights_daily : []
        setDailySnapshotTotals(normalizeTotalsFromInsightsDaily(totalsRaw))

        const dbRows = (dbRes as any)?.data
        const merged90 = mergeToContinuousTrendPoints({ days: 90, baseDbRowsRaw: dbRows, overridePointsRaw: json7?.points })

        if (merged90.length >= 1) {
          hasAppliedDailySnapshotTrendRef.current = true
          setTrendPointsDeduped(merged90)
          setTrendFetchedAt(Date.now())
        }

        setTrendFetchStatus({ loading: false, error: "", lastDays: 90 })
      } catch (e: any) {
        if (e?.name === "AbortError") return
        setDailySnapshotData(null)
        setTrendFetchStatus({ loading: false, error: "", lastDays: 90 })
      }
    })()

    return () => {
      // Do not abort here. React effect cleanup can run due to unrelated state/dep changes
      // and would prematurely cancel an in-flight request. Abort is handled only when a
      // new request starts (above) or on component unmount (separate effect).
    }
  }, [isConnectedInstagram, mergeToContinuousTrendPoints, normalizeTotalsFromInsightsDaily, supabaseBrowser, trendPoints.length])

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
    const first = trendPoints[0] as any
    const last = trendPoints[trendPoints.length - 1] as any
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

  const hasConnectedFlag = (igMe as any)?.connected === true
  const hasRealProfile = Boolean(isConnected)
  const allowDemoProfile = !hasConnectedFlag && !hasRealProfile && !igMeLoading

  const recentPosts = igMe?.recent_media

  const needsDataRefetch = useMemo(() => {
    const hasProfile = Boolean(igProfile && (igProfile?.id || igProfile?.username))
    const hasMedia = Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0
    const hasTopPosts = Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0
    return !hasProfile || !hasMedia || !hasTopPosts
  }, [effectiveRecentLen, effectiveRecentMedia, igProfile])

  useEffect(() => {
    if (!isConnected) return
    if (!needsDataRefetch) return

    const now = Date.now()
    if (now - lastRevalidateAtRef.current < 2500) return
    lastRevalidateAtRef.current = now

    setForceReloadTick((x) => x + 1)
  }, [isConnected, needsDataRefetch, pathname, router])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return
      if (!isConnected) return
      if (!needsDataRefetch) return

      const now = Date.now()
      if (now - lastRevalidateAtRef.current < 2500) return
      lastRevalidateAtRef.current = now

      setForceReloadTick((x) => x + 1)
    }

    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [isConnected, needsDataRefetch])

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

    if (lastMediaFetchTickRef.current === forceReloadTick) return
    lastMediaFetchTickRef.current = forceReloadTick

    let cancelled = false
    mediaReqIdRef.current += 1
    const reqId = mediaReqIdRef.current

    dlog("[media] fetch (from ConnectedGate)")
    fetch("/api/instagram/media", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        let body: any = null
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
        const rawMedia = Array.isArray((json as any)?.data)
          ? (json as any).data
          : Array.isArray(json)
            ? json
            : []

        const items = normalizeMedia(rawMedia)

        dlog("[media] response received:", {
          hasDataArray: Array.isArray((json as any)?.data),
          dataLength: Array.isArray((json as any)?.data) ? (json as any).data.length : Array.isArray(json) ? json.length : 0,
          hasPaging: !!(json as any)?.paging,
          normalizedLen: items.length,
        })

        if (__DEBUG_RESULTS__) {
          try {
            const dataArr = Array.isArray(rawMedia) ? rawMedia : []
            const first: any = Array.isArray(dataArr) && dataArr.length > 0 ? dataArr[0] : null
            const firstKeys = first && typeof first === "object" ? Object.keys(first).slice(0, 50) : []
            const byType: Record<string, number> = {}
            for (const it of Array.isArray(dataArr) ? dataArr : []) {
              const mt = String((it as any)?.media_type ?? (it as any)?.mediaType ?? "") || "(unknown)"
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

        setMedia((prev: any) => {
          if (Array.isArray(prev) && prev.length > 0 && items.length === 0) return prev
          return items
        })

        setIgMe((prev: any) => {
          const base = (prev ?? {}) as any
          if (Array.isArray(base?.recent_media) && base.recent_media.length > 0 && items.length === 0) return base
          return { ...base, recent_media: items }
        })

        setMediaLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        if (reqId !== mediaReqIdRef.current) return

        const status = (err as any)?.status
        const body = (err as any)?.body

        const bodyError = typeof body?.error === "string" ? body.error : ""
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
        const detail = typeof body?.detail === "string" && body.detail ? `: ${body.detail}` : ""
        setMediaError(`${reason}${detail}`)

        if (__DEV__) {
          const reason = bodyError || null
          const detail = typeof body?.detail === "string" ? body.detail : null
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
  }, [forceReloadTick, mediaLen])

  useEffect(() => {
    const onFocus = () => {
      if (!isConnected) return
      if (!needsDataRefetch) return
      const now = Date.now()
      if (now - lastRevalidateAtRef.current < 2500) return
      lastRevalidateAtRef.current = now
      setForceReloadTick((x) => x + 1)
    }

    if (typeof window === "undefined") return

    window.addEventListener("focus", onFocus)

    return () => {
      window.removeEventListener("focus", onFocus)
    }
  }, [isConnected, needsDataRefetch])

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
    const firstId = String((((igMe as any)?.recent_media?.[0] as any)?.id ?? ""))
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
    ? (typeof igProfile?.username === "string" ? String(igProfile.username).trim() : "")
    : ""

  const displayName = (() => {
    if (allowDemoProfile) return mockAnalysis.profile.displayName
    const raw = igProfile?.name ?? igProfile?.display_name ?? igProfile?.displayName
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
        const likes =
          finiteNumOrNull((p as any)?.like_count) ??
          finiteNumOrNull((p as any)?.likes_count) ??
          finiteNumOrNull((p as any)?.likes) ??
          0
        const comments =
          finiteNumOrNull((p as any)?.comments_count) ??
          finiteNumOrNull((p as any)?.comment_count) ??
          finiteNumOrNull((p as any)?.comments) ??
          0
        const timestamp = typeof (p as any)?.timestamp === "string" ? String((p as any).timestamp) : null
        return { likes, comments, timestamp }
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

    const now = Date.now()
    const days7 = 7 * 24 * 60 * 60 * 1000
    let postsPerWeek: number | null = 0
    let hasValidTs = false
    for (const p of posts) {
      if (!p.timestamp) continue
      const tms = new Date(p.timestamp).getTime()
      if (Number.isNaN(tms)) continue
      hasValidTs = true
      if (now - tms <= days7) postsPerWeek += 1
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
    return displayUsername ? `@${displayUsername}` : "—"
  })()

  const formatNum = (n: number | null) => (n === null ? "—" : n.toLocaleString())

  const isPreview = (n: number | null) => isConnected && n === null

  // KPI numbers should accept numeric strings from API responses.
  const kpiFollowers = finiteNumOrNull(igProfile?.followers_count)
  const kpiFollowing = finiteNumOrNull(igProfile?.follows_count ?? igProfile?.following_count)
  const kpiMediaCount = finiteNumOrNull(igProfile?.media_count)
  const kpiPosts = kpiMediaCount

  // Treat any non-empty media array as real media; do NOT require like/comment metrics.
  const hasRealMedia = Array.isArray(effectiveRecentMedia) && effectiveRecentMedia.length > 0

  const topPerformingPosts = useMemo(() => {
    if (!hasRealMedia) return []

    const copy = [...effectiveRecentMedia]
    copy.sort((a, b) => {
      const al = toNum((a as any)?.like_count) ?? 0
      const ac = toNum((a as any)?.comments_count) ?? 0
      const bl = toNum((b as any)?.like_count) ?? 0
      const bc = toNum((b as any)?.comments_count) ?? 0
      return (bl + bc) - (al + ac)
    })
    return copy.slice(0, 3)
  }, [effectiveRecentMedia, hasRealMedia])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const first = hasRealMedia ? ((effectiveRecentMedia as any[])?.[0] as any) : null
    // eslint-disable-next-line no-console
    console.log("[top-posts]", {
      mediaLen: Array.isArray(media) ? media.length : 0,
      effectiveRecentLen: Array.isArray(effectiveRecentMedia) ? effectiveRecentMedia.length : 0,
      hasRealMedia,
      topPostsLen: Array.isArray(topPerformingPosts) ? topPerformingPosts.length : 0,
      firstPresence: first
        ? {
            hasMediaUrl: typeof first.media_url === "string" && first.media_url.length > 0,
            hasThumb: typeof first.thumbnail_url === "string" && first.thumbnail_url.length > 0,
            hasLike: typeof first.like_count === "number",
            hasComments: typeof first.comments_count === "number",
          }
        : null,
    })
  }, [hasRealMedia, effectiveRecentMedia, topPerformingPosts, media])

  useEffect(() => {
    if (!__DEV__) return
    try {
      const first: any = Array.isArray(topPerformingPosts) && topPerformingPosts.length > 0 ? topPerformingPosts[0] : null
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
      const first: any = arr[0] || null
      if (!first) {
        // eslint-disable-next-line no-console
        console.debug("[DEBUG_RESULTS] media: empty")
        return
      }

      const mediaType = String(first?.media_type ?? first?.mediaType ?? "")
      const mediaUrl = String(first?.media_url ?? first?.mediaUrl ?? "")
      const thumbUrl = String(first?.thumbnail_url ?? first?.thumbnailUrl ?? "")
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
        has_like_count: typeof first?.like_count !== "undefined" || typeof first?.likeCount !== "undefined",
        has_comments_count: typeof first?.comments_count !== "undefined" || typeof first?.commentsCount !== "undefined",
      })
    } catch {
      // ignore
    }
  }, [__DEBUG_RESULTS__, effectiveRecentMedia])

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      if (!Array.isArray(topPerformingPosts) || topPerformingPosts.length === 0) return
      const top3 = topPerformingPosts.slice(0, 3).map((p: any) => ({
        id: p?.id ?? "",
        media_type: p?.media_type ?? "",
        thumbnail_url: p?.thumbnail_url ?? "",
        media_url: p?.media_url ?? "",
        permalink: getPostPermalink(p),
        like_count: typeof p?.like_count === "number" ? p.like_count : (typeof p?.likeCount === "number" ? p.likeCount : null),
        comments_count: typeof p?.comments_count === "number" ? p.comments_count : (typeof p?.commentsCount === "number" ? p.commentsCount : null),
        engagement: p?.engagement ?? null,
        timestamp: p?.timestamp ?? "",
      }))
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

  const engagementRate = isConnected ? (computedMetrics?.engagementRatePct ?? null) : null

  const cadenceScore = (() => {
    if (!isConnected) return null
    if (!Array.isArray(media) || media.length === 0) return null

    const now = Date.now()
    const days30 = 30 * 24 * 60 * 60 * 1000

    let c30 = 0
    for (const m of media) {
      const ts = (m as any)?.timestamp
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
      const likes = numOrNull((m as any)?.like_count) ?? 0
      const comments = numOrNull((m as any)?.comments_count) ?? 0
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

  const [creatorCard, setCreatorCard] = useState<any | null>(null)
  const [creatorStats, setCreatorStats] = useState<any | null>(null)
  const [creatorIdFromCardMe, setCreatorIdFromCardMe] = useState<string | null>(null)
  const creatorCardFetchedRef = useRef(false)
  const creatorStatsUpsertKeyRef = useRef<string>("")

  const resolvedCreatorId = useMemo(() => {
    const igUserIdFromSnapshot = (() => {
      const insightId = (dailySnapshotData as any)?.insights_daily_series?.[0]?.id
      return extractIgUserIdFromInsightsId(insightId)
    })()
    const igUserIdFromCookie = getCookieValue("ig_ig_id").trim()
    const igUserIdStr = (creatorIdFromCardMe || igUserIdFromSnapshot || igUserIdFromCookie).trim()
    return igUserIdStr || null
  }, [creatorIdFromCardMe, dailySnapshotData])

  useEffect(() => {
    if (!isConnectedInstagram) {
      setFollowersDailyRows([])
      setFollowersLastWriteAt(null)
      return
    }

    const igUserIdFromSnapshot = (() => {
      const insightId = (dailySnapshotData as any)?.insights_daily_series?.[0]?.id
      return extractIgUserIdFromInsightsId(insightId)
    })()

    if (!meQuery.data && !igUserIdFromSnapshot && !getCookieValue("ig_ig_id").trim()) {
      return
    }

    const igUserIdFromMe =
      typeof (meQuery.data as any)?.igId === "string"
        ? String((meQuery.data as any).igId).trim()
        : ""
    const igUserIdFromCookie = getCookieValue("ig_ig_id").trim()
    const igUserIdStr = (igUserIdFromMe || igUserIdFromSnapshot || igUserIdFromCookie).trim()

    if (__DEBUG_RESULTS__) {
      dlog("[followers] resolved igUserId", {
        igUserId: igUserIdStr || null,
        source: igUserIdFromMe
          ? "me"
          : igUserIdFromSnapshot
            ? "snapshot"
            : igUserIdFromCookie
              ? "cookie"
              : "none",
      })
    }

    if (!supabaseBrowser || !igUserIdStr) {
      setFollowersDailyRows([])
      setFollowersLastWriteAt(null)
      return
    }

    if (__DEBUG_RESULTS__) {
      dlog("[followers] fetch start", { igUserId: igUserIdStr })
    }

    let cancelled = false
    ;(async () => {
      try {
        const resp: any = await supabaseBrowser
          .from("ig_daily_followers")
          .select("day,followers_count")
          .eq("ig_user_id", igUserIdStr)
          .order("day", { ascending: true })

        const data = (resp as any)?.data
        const error = (resp as any)?.error

        if (cancelled) return
        if (error || !Array.isArray(data)) {
          setFollowersDailyRows([])
          setFollowersLastWriteAt(null)
          return
        }

        const rows = (data as any[])
          .map((r) => {
            const day = typeof r?.day === "string" ? r.day : ""
            const n =
              typeof r?.followers_count === "number"
                ? r.followers_count
                : Number(r?.followers_count)
            if (!day || !Number.isFinite(n)) return null
            return { day, followers_count: Math.floor(n) }
          })
          .filter(Boolean) as Array<{
            day: string
            followers_count: number
          }>

        setFollowersDailyRows(rows)

        setFollowersLastWriteAt(null)

        if (__DEBUG_RESULTS__) {
          const firstDay = rows[0]?.day ?? ""
          const lastDay = rows[rows.length - 1]?.day ?? ""
          dlog("[followers] fetch done", {
            igUserId: igUserIdStr,
            rows: rows.length,
            firstDay,
            lastDay,
            lastWriteAt: null,
            lastDataDay: lastDay,
            fetchedAt: new Date().toISOString(),
          })
        }
      } catch {
        if (cancelled) return
        setFollowersDailyRows([])
        setFollowersLastWriteAt(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [__DEBUG_RESULTS__, dailySnapshotData, dlog, isConnectedInstagram, meQuery.data, supabaseBrowser])

  useEffect(() => {
    if (!isConnectedInstagram) {
      setCreatorCard(null)
      creatorCardFetchedRef.current = false
      setCreatorStats(null)
      setCreatorIdFromCardMe(null)
      creatorStatsUpsertKeyRef.current = ""
      return
    }

    if (creatorCardFetchedRef.current) return
    creatorCardFetchedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const json = (await res.json().catch(() => null)) as CreatorCardMeResponse | null
        if (cancelled) return
        if (!res.ok || !json?.ok) {
          setCreatorCard(null)
          return
        }
        const nextCreatorId =
          json?.me && typeof (json as any).me?.igUserId === "string" ? String((json as any).me.igUserId).trim() : ""
        setCreatorIdFromCardMe(nextCreatorId || null)
        setCreatorCard(json?.card && typeof json.card === "object" ? (json.card as any) : null)
      } catch (e) {
        if (cancelled) return
        if (isAbortError(e)) return
        setCreatorCard(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isConnectedInstagram])

  useEffect(() => {
    if (!isConnectedInstagram || !resolvedCreatorId) {
      setCreatorStats(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(resolvedCreatorId)}/stats`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const json: any = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !json?.ok) {
          setCreatorStats(null)
          return
        }
        setCreatorStats(json?.stats ?? null)
      } catch (e) {
        if (cancelled) return
        if (isAbortError(e)) return
        setCreatorStats(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isConnectedInstagram, resolvedCreatorId])

  useEffect(() => {
    if (!isConnectedInstagram || !resolvedCreatorId) return
    if (!computedMetrics) return

    const engagementRatePct = computedMetrics?.engagementRatePct
    const avgLikes = computedMetrics?.avgLikes
    const avgComments = computedMetrics?.avgComments
    const followers = finiteNumOrNull((igProfile as any)?.followers_count)

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

  const hasSidebar = Boolean(displayUsername)

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

  const handleConnect = () => {
    setConnectEnvError(null)
    const nextPath = `/${activeLocale}/results`
    const oauthUrl = `/api/auth/instagram?provider=instagram&next=${encodeURIComponent(nextPath)}`
    window.location.href = oauthUrl
  }

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
  const [openReadinessCard, setOpenReadinessCard] = useState<null | "style" | "stage" | "readiness">(null)
  const readinessRefs = useRef<Record<"style" | "stage" | "readiness", HTMLButtonElement | null>>({
    style: null,
    stage: null,
    readiness: null,
  })

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
    if (!openReadinessCard) return
    const el = readinessRefs.current[openReadinessCard]
    if (!el) return

    window.requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 0
      const isFullyVisible = rect.top >= 0 && rect.bottom <= vh
      if (isFullyVisible) return
      el.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [openReadinessCard])

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

  const renderInsightsSection = (variant: "mobile" | "desktop") => {
    const isMobileVariant = variant === "mobile"
    return (
      <Card
        id="creator-card-section"
        className={
          isMobileVariant
            ? "mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm"
            : "mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm"
        }
      >
        <CardHeader className={isMobileVariant ? "px-3 pt-3 pb-2 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6" : "px-3 pt-3 pb-2 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6"}>
          <div className="min-w-0">
            <CardTitle className={isMobileVariant ? "text-base font-semibold text-white" : "text-sm text-white"}>
              {t("results.creatorReadiness.title")}
            </CardTitle>
            <div className="mt-0.5 text-[11px] leading-tight text-white/55 min-w-0 line-clamp-2">
              {t("results.creatorReadiness.subtitle")}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="text-[11px] sm:text-[12px] text-white/60 leading-snug">
              {t("results.creatorCard.subtitle")}
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] sm:text-[12px] text-white/75">
              <span className="font-semibold text-white/85">{t("results.creatorCard.readiness")}</span>
              <span className="tabular-nums whitespace-nowrap">{completionPct}%</span>
              <span className="text-white/55">•</span>
              <span className="text-white/70">
                {isCardReady ? t("results.creatorCard.status.ready") : t("results.creatorCard.status.notReady")}
              </span>
            </div>
          </div>

          <div className="mb-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 min-w-0 truncate">
                {t("results.creatorReadiness.cards.style.value")}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 min-w-0 truncate">
                {t("results.creatorReadiness.cards.stage.value")}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 min-w-0 truncate">
                {t("results.creatorReadiness.cards.readiness.value")}
              </span>
            </div>

            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0" />
              <div className="text-[11px] leading-tight text-white/60 text-right min-w-0">
                <span className="font-semibold text-white/75">{t("results.creatorReadiness.explain.readiness.nextTitle")}</span>
                <span className="ml-2 min-w-0 truncate inline-block align-bottom">{t("results.creatorReadiness.explain.readiness.next.1")}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
            {(
              [
                { k: "style" as const, titleKey: "results.creatorReadiness.cards.style.title", valueKey: "results.creatorReadiness.cards.style.value" },
                { k: "stage" as const, titleKey: "results.creatorReadiness.cards.stage.title", valueKey: "results.creatorReadiness.cards.stage.value" },
                {
                  k: "readiness" as const,
                  titleKey: "results.creatorReadiness.cards.readiness.title",
                  valueKey: "results.creatorReadiness.cards.readiness.value",
                },
              ] as const
            ).map((item) => {
              const isOpen = openReadinessCard === item.k
              return (
                <div key={item.k} className="min-w-0">
                  <button
                    ref={(node) => {
                      readinessRefs.current[item.k] = node
                    }}
                    type="button"
                    className={
                      "w-full text-left rounded-xl border bg-white/5 p-3 sm:p-4 min-w-0 overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 " +
                      (isOpen ? "border-white/25" : "border-white/10 hover:border-white/20")
                    }
                    onClick={() => setOpenReadinessCard((prev) => (prev === item.k ? null : item.k))}
                  >
                    <div className="text-[10px] font-semibold tracking-widest text-white/55 whitespace-nowrap">{t(item.titleKey)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 min-w-0">
                      <div className="text-base font-semibold text-white min-w-0 truncate">{t(item.valueKey)}</div>
                      {item.k === "readiness" ? (
                        <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200 shrink-0 whitespace-nowrap">
                          {t("results.common.baseline")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-white/60 min-w-0 line-clamp-1">
                      {item.k === "style"
                        ? t("results.creatorCard.cards.niche.body")
                        : item.k === "stage"
                          ? t("results.creatorCard.cards.stage.body")
                          : t("results.creatorCard.cards.collab.body")}
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs sm:text-sm text-white/80 min-w-0 break-words">
                      <div className="space-y-2 sm:space-y-2">
                        <div>
                          <div className="text-[11px] font-semibold text-white/85">{t(`results.creatorReadiness.explain.${item.k}.meaningTitle`)}</div>
                          <div className="mt-0.5 leading-snug sm:line-clamp-none line-clamp-3">{t(`results.creatorReadiness.explain.${item.k}.meaningBody`)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-white/85">{t(`results.creatorReadiness.explain.${item.k}.statusTitle`)}</div>
                          <div className="mt-0.5 leading-snug sm:line-clamp-none line-clamp-3">{t(`results.creatorReadiness.explain.${item.k}.statusBody`)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-white/85">{t(`results.creatorReadiness.explain.${item.k}.nextTitle`)}</div>
                          <ul className="mt-1 list-disc pl-5 space-y-1">
                            <li className="leading-snug">{t(`results.creatorReadiness.explain.${item.k}.next.1`)}</li>
                            <li className="leading-snug">{t(`results.creatorReadiness.explain.${item.k}.next.2`)}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
              {t("results.creatorCard.fields.portfolio")}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
              {t("results.creatorCard.fields.audience")}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
              {t("results.creatorCard.fields.collabTypes")}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
              {t("results.creatorCard.fields.contact")}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 min-w-0">
            {/* Left: Brand preview card */}
            <div className="lg:col-span-8 min-w-0">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 min-w-0">
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[12px] sm:text-[13px] font-semibold text-white leading-snug">
                      {t("results.creatorCard.brandPreview.title")}
                    </div>
                    <div className="mt-1 text-[11px] sm:text-[12px] text-white/60 leading-snug">
                      {t("results.creatorCard.brandPreview.subtitle")}
                    </div>
                  </div>

                  <span className="shrink-0 inline-flex items-center rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-white/80 whitespace-nowrap">
                    {isCardReady
                      ? t("results.creatorCard.brandPreview.badgeReady")
                      : t("results.creatorCard.brandPreview.badgeDraft")}
                  </span>
                </div>

                {/* Snapshot rows */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
                    <div className="text-[10px] font-semibold text-white/60">{t("results.creatorCard.brandPreview.rows.nicheLabel")}</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-white truncate">
                      {t("results.creatorCard.brandPreview.rows.nicheValue")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
                    <div className="text-[10px] font-semibold text-white/60">{t("results.creatorCard.brandPreview.rows.audienceLabel")}</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-white truncate">
                      {t("results.creatorCard.brandPreview.rows.audienceValue")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
                    <div className="text-[10px] font-semibold text-white/60">
                      {t("results.creatorCard.brandPreview.rows.deliverablesLabel")}
                    </div>
                    <div className="mt-0.5 text-[12px] font-semibold text-white truncate">
                      {t("results.creatorCard.brandPreview.rows.deliverablesValue")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 min-w-0">
                    <div className="text-[10px] font-semibold text-white/60">{t("results.creatorCard.brandPreview.rows.contactLabel")}</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-white truncate">
                      {t("results.creatorCard.brandPreview.rows.contactValue")}
                    </div>
                  </div>
                </div>

                {/* Collab type chips (preview) */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
                    {t("results.creatorCard.brandPreview.chips.c0")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
                    {t("results.creatorCard.brandPreview.chips.c1")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
                    {t("results.creatorCard.brandPreview.chips.c2")}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75">
                    {t("results.creatorCard.brandPreview.chips.c3")}
                  </span>
                </div>

                {/* Portfolio placeholders */}
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-white/60">{t("results.creatorCard.brandPreview.portfolioLabel")}</div>

                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 min-w-0">
                      <div className="text-[11px] font-semibold text-white truncate">
                        {t("results.creatorCard.brandPreview.portfolio.p0.title")}
                      </div>
                      <div className="mt-1 text-[10px] text-white/55 leading-snug line-clamp-2">
                        {t("results.creatorCard.brandPreview.portfolio.p0.desc")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 min-w-0">
                      <div className="text-[11px] font-semibold text-white truncate">
                        {t("results.creatorCard.brandPreview.portfolio.p1.title")}
                      </div>
                      <div className="mt-1 text-[10px] text-white/55 leading-snug line-clamp-2">
                        {t("results.creatorCard.brandPreview.portfolio.p1.desc")}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 min-w-0">
                      <div className="text-[11px] font-semibold text-white truncate">
                        {t("results.creatorCard.brandPreview.portfolio.p2.title")}
                      </div>
                      <div className="mt-1 text-[10px] text-white/55 leading-snug line-clamp-2">
                        {t("results.creatorCard.brandPreview.portfolio.p2.desc")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Brand CTA panel */}
            <div className="lg:col-span-4 min-w-0">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 min-w-0">
                <div className="text-[12px] sm:text-[13px] font-semibold text-white leading-snug">
                  {t("results.creatorCard.brandPreview.cta.title")}
                </div>
                <div className="mt-1 text-[11px] sm:text-[12px] text-white/60 leading-snug">
                  {t("results.creatorCard.brandPreview.cta.body")}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-[12px] font-semibold text-white/40 cursor-not-allowed"
                    title={t("results.creatorCard.brandPreview.cta.comingSoon")}
                  >
                    {t("results.creatorCard.brandPreview.cta.primary")}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      document
                        .querySelector('[data-scope="next-actions"]')
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    className="inline-flex items-center justify-center rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/80 hover:border-white/20 hover:bg-white/7 transition-colors"
                  >
                    {t("results.creatorCard.brandPreview.cta.secondary")}
                  </button>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/65 leading-snug">
                  {t("results.creatorCard.brandPreview.cta.note")}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

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
      value: isConnected ? engagementRatePctFormatted : `${(mockAnalysis.metrics.engagementRate * 100).toFixed(1)}%`,
      preview: isConnected ? computedMetrics?.engagementRatePct === null : false,
    },
    {
      id: "avgLikes",
      titleKey: "results.kpis.avgLikes.title",
      descriptionKey: "results.kpis.avgLikes.description",
      value: isConnected ? avgLikesFormatted : mockAnalysis.metrics.avgLikes.toLocaleString(),
      preview: isConnected ? computedMetrics?.avgLikes === null : false,
    },
    {
      id: "avgComments",
      titleKey: "results.kpis.avgComments.title",
      descriptionKey: "results.kpis.avgComments.description",
      value: isConnected ? avgCommentsFormatted : mockAnalysis.metrics.avgComments.toLocaleString(),
      preview: isConnected ? computedMetrics?.avgComments === null : false,
    },
    {
      id: "engagementVolume",
      titleKey: "results.kpis.engagementVolume.title",
      descriptionKey: "results.kpis.engagementVolume.description",
      value: isConnected
        ? formatNum(computedMetrics?.engagementVolume ?? null)
        : (mockAnalysis.metrics.avgLikes + mockAnalysis.metrics.avgComments).toLocaleString(),
      preview: isConnected ? computedMetrics?.engagementVolume === null : false,
    },
    {
      id: "postsPerWeek",
      titleKey: "results.kpis.postsPerWeek.title",
      descriptionKey: "results.kpis.postsPerWeek.description",
      value: isConnected ? formatNum(computedMetrics?.postsPerWeek ?? null) : mockAnalysis.metrics.postsPerWeek.toFixed(1),
      preview: isConnected ? computedMetrics?.postsPerWeek === null : false,
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
    const dbPct = typeof creatorStats?.engagementRatePct === "number" ? creatorStats.engagementRatePct : null
    if (typeof dbPct === "number" && Number.isFinite(dbPct)) return `${dbPct.toFixed(2)}%`
    if (typeof engagementRatePctFormatted === "string" && engagementRatePctFormatted.trim() && engagementRatePctFormatted !== "—") {
      return engagementRatePctFormatted
    }
    const pct = computedMetrics?.engagementRatePct
    if (typeof pct === "number" && Number.isFinite(pct)) return `${pct.toFixed(2)}%`
    return null
  })()

  const creatorCardPreviewCard = (
    <CreatorCardPreview
      t={t}
      id="creator-card"
      className={"mt-3 scroll-mt-40 " + CARD_SHELL_HOVER}
      headerClassName={CARD_HEADER_ROW}
      actions={(() => {
        const returnTo = `/${activeLocale}/results#creator-card`
        return (
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href={`/${activeLocale}/creator-card?returnTo=${encodeURIComponent(returnTo)}`}
              className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/85 hover:border-white/20 hover:bg-white/7 transition-colors whitespace-nowrap"
            >
              {t("results.creatorCardPreview.actions.complete")}
            </Link>
            <button
              type="button"
              disabled
              className="hidden sm:inline-flex items-center justify-center rounded-full border border-white/10 bg-white/3 px-3 py-2 text-[12px] font-semibold text-white/40 cursor-not-allowed whitespace-nowrap"
              title={t("results.nextActions.cta.comingSoon")}
            >
              {t("results.nextActions.cta.exportMediaKit")}
            </button>
          </div>
        )
      })()}
      profileImageUrl={(() => {
        const u =
          typeof (igProfile as any)?.profile_picture_url === "string"
            ? String((igProfile as any).profile_picture_url)
            : typeof (igMe as any)?.profile_picture_url === "string"
              ? String((igMe as any).profile_picture_url)
              : ""
        return u || null
      })()}
      displayName={
        typeof (igProfile as any)?.name === "string" && String((igProfile as any).name).trim()
          ? String((igProfile as any).name).trim()
          : displayUsername
      }
      username={displayUsername}
      aboutText={t("results.mediaKit.about.placeholder")}
      primaryNiche={
        typeof (creatorCard as any)?.niche === "string" && String((creatorCard as any).niche).trim()
          ? String((creatorCard as any).niche).trim()
          : null
      }
      contact={(creatorCard as any)?.contact ?? null}
      collaborationNiches={(creatorCard as any)?.collaborationNiches ?? (creatorCard as any)?.collaboration_niches ?? null}
      deliverables={(creatorCard as any)?.deliverables ?? null}
      pastCollaborations={(creatorCard as any)?.pastCollaborations ?? (creatorCard as any)?.past_collaborations ?? null}
      followersText={typeof followers === "number" && Number.isFinite(followers) ? formatNum(followers) : null}
      postsText={typeof mediaCount === "number" && Number.isFinite(mediaCount) ? formatCompact(mediaCount) : null}
      avgLikesLabel={uiCopy.avgLikesLabel}
      avgLikesText={avgLikesFormatted && avgLikesFormatted !== "—" ? avgLikesFormatted : null}
      avgCommentsLabel={uiCopy.avgCommentsLabel}
      avgCommentsText={avgCommentsFormatted && avgCommentsFormatted !== "—" ? avgCommentsFormatted : null}
      engagementRateText={creatorCardEngagementRateText}
      reachText={
        typeof dailySnapshotTotals?.reach === "number" && Number.isFinite(dailySnapshotTotals.reach)
          ? formatNum(dailySnapshotTotals.reach)
          : null
      }
    />
  )

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
          setForceReloadTick((x) => x + 1)
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
          setForceReloadTick((x) => x + 1)
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
                setForceReloadTick((x) => x + 1)
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
          setForceReloadTick((x) => x + 1)
        }}
        onReconnect={handleConnect}
      />
    )

  return (
    <>
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
                      setForceReloadTick((x) => x + 1)
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
                        const ts = typeof m.timestamp === "string" ? m.timestamp : ""
                        const dateLabel = ts ? new Date(ts).toLocaleString() : ""

                        return (
                          <div key={m.id} className="rounded-xl border border-white/10 bg-white/5 overflow-visible">
                            <div className="aspect-square bg-black/20">
                              {mediaUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <SafeIgThumb src={mediaUrl} alt={caption ? caption.slice(0, 40) : m.id} className="h-full w-full object-cover" />
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

              {hasSidebar && (
                <div className="lg:col-span-1 w-full">
                  <Card className={"lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] " + CARD_SHELL_HOVER}>
                    <CardHeader className={CARD_HEADER_ROW}>
                      <CardTitle className="text-base text-white min-w-0 truncate">{t("results.sidebar.title")}</CardTitle>
                      <p className="text-sm text-slate-400 mt-1 lg:mt-0.5">
                        {t("results.sidebar.subtitle")} @{displayUsername}
                      </p>
                    </CardHeader>
                    <div className="flex-1 lg:overflow-y-auto">
                      <CardContent className="p-4 lg:p-6 pb-4 lg:pb-6">
                        <GrowthPaths
                          result={{
                            handle: displayUsername,
                            platform: safeResult.platform,
                            confidence: safeResult.confidenceScore,
                            abnormalBehaviorRisk: safeResult.abnormalBehaviorRisk as "Low" | "Medium" | "High",
                            automationLikelihood: safeResult.automationLikelihood as "Low" | "Medium" | "High",
                            engagementQuality: safeResult.engagementQuality as "Low" | "Medium" | "High",
                          }}
                        />
                      </CardContent>
                    </div>
                  </Card>
                </div>
              )}
            </div>

            <Card className={"mt-3 " + CARD_SHELL}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{t("results.profile.followers")}</div>
                    <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-xl font-semibold text-white leading-none min-w-0">
                      <span className="tabular-nums whitespace-nowrap">{formatNum(followers)}</span>
                      {isPreview(kpiFollowers) && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                          {t("results.common.preview")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{t("results.profile.followingLabel")}</div>
                    <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-xl font-semibold text-white leading-none min-w-0">
                      <span className="tabular-nums whitespace-nowrap">{formatNum(following)}</span>
                      {isPreview(kpiFollowing) && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                          {t("results.common.preview")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{t("results.profile.postsLabel")}</div>
                    <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-xl font-semibold text-white leading-none min-w-0">
                      <span className="tabular-nums whitespace-nowrap">{formatNum(posts)}</span>
                      {isPreview(kpiPosts) && (
                        <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                          {t("results.common.preview")}
                        </span>
                      )}
                    </div>
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
                    const avatarUrl =
                      typeof (igMe as any)?.profile_picture_url === "string"
                        ? String((igMe as any).profile_picture_url)
                        : typeof (igMe as any)?.profilePictureUrl === "string"
                          ? String((igMe as any).profilePictureUrl)
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
                <CardTitle className="text-xl font-bold text-white min-w-0 truncate shrink-0">{t("results.trend.title")}</CardTitle>
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
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 whitespace-nowrap">
                        <span className="tabular-nums">90天數據</span>
                      </span>
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
                    </div>

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
                        <div className="w-full sm:w-auto min-w-0 max-w-full overflow-hidden">
                          {(() => {
                            const reachSeriesForStats = shouldShowEmptySeriesHint
                              ? ([] as AccountTrendPoint[])
                              : Array.isArray(trendPoints) && trendPoints.length >= 1
                                ? trendPoints
                                : accountTrend
                            const reachValues = reachSeriesForStats
                              .map((p) => {
                                const v = (p as any)?.reach
                                return typeof v === "number" && Number.isFinite(v) ? v : null
                              })
                              .filter((x): x is number => typeof x === "number")
                            const reachTotal = reachValues.length >= 1 ? reachValues[reachValues.length - 1] : null
                            const reachDeltaYesterday =
                              reachValues.length >= 2 ? reachValues[reachValues.length - 1] - reachValues[reachValues.length - 2] : null
                            const reachGrowth7d = (() => {
                              const n = reachValues.length
                              if (n < 8) return null
                              return reachValues[n - 1] - reachValues[Math.max(0, n - 1 - 7)]
                            })()

                            return (
                              <>
                                <div
                                  className={
                                    "absolute inset-0 flex items-start justify-center sm:justify-end " +
                                    (focusedAccountTrendMetric === "reach" ? "opacity-100" : "opacity-0 pointer-events-none")
                                  }
                                >
                                  <FollowersStatChips
                                    totalFollowers={reachTotal}
                                    deltaYesterday={reachDeltaYesterday}
                                    growth7d={reachGrowth7d}
                                    labelTotal="觸及總"
                                    labelYesterday="昨日"
                                    label7d="近7天"
                                  />
                                </div>
                                <div
                                  className={
                                    "absolute inset-0 flex items-start justify-center sm:justify-end " +
                                    (focusedAccountTrendMetric === "followers" ? "opacity-100" : "opacity-0 pointer-events-none")
                                  }
                                >
                                  <FollowersStatChips totalFollowers={totalFollowers} deltaYesterday={deltaYesterday} growth7d={growth7d} />
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
                        ...(p0 as any),
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
                      ? followersDailyPoints
                      : Array.isArray(trendPoints) && trendPoints.length >= 1
                        ? trendPoints
                        : accountTrend

                  const dataForChart = (() => {
                    if (!focusedIsFollowers) return dataForChartBase
                    if (!Array.isArray(dataForChartBase)) return [] as AccountTrendPoint[]
                    if (dataForChartBase.length !== 1) return dataForChartBase

                    const p0 = dataForChartBase[0] as any
                    const ts0 = typeof p0?.ts === "number" && Number.isFinite(p0.ts) ? (p0.ts as number) : Date.now()
                    const p1: AccountTrendPoint = {
                      ...(p0 as any),
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
                            ? (p as any).reach
                            : k === "followers"
                              ? null
                            : k === "interactions"
                              ? (p as any).interactions
                              : k === "impressions"
                                ? (p as any).impressions
                                : k === "engaged"
                                  ? (p as any).engaged
                                  : (p as any).followerDelta
                        return typeof y === "number" && Number.isFinite(y) ? y : null
                      })
                      .filter((x): x is number => typeof x === "number")

                    if (k === "followers") {
                      const list = followersSeriesValues
                      return Array.isArray(list) ? list.filter((x) => typeof x === "number" && Number.isFinite(x)) : []
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

                  const seriesKeys: AccountTrendMetricKey[] = focusedIsReach ? ["reach"] : focusedIsFollowers ? ["followers"] : []

                  const series = seriesKeys.map((k) => {
                    const raw = dataForChart
                      .map((p, i) => {
                        const y =
                          k === "reach"
                            ? p.reach
                            : k === "followers"
                              ? followersSeriesValues[i]
                            : k === "interactions"
                              ? p.interactions
                              : k === "impressions"
                                ? p.impressions
                                : k === "engaged"
                                  ? p.engaged
                                  : p.followerDelta
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

                  const w = 600
                  const h = 220
                  const padX = 26
                  const padY = 18
                  const spanX = Math.max(dataForChart.length - 1, 1)
                  const spanY = Math.max(yMax - yMin, 1e-6)
                  const sx = (i: number) => padX + (i / spanX) * (w - padX * 2)
                  const sy = (y: number) => h - padY - ((y - yMin) / spanY) * (h - padY * 2)

                  const clampedHoverIdx =
                    typeof hoveredAccountTrendIndex === "number"
                      ? Math.max(0, Math.min(dataForChart.length - 1, hoveredAccountTrendIndex))
                      : null

                  const hoverPoint = clampedHoverIdx !== null ? dataForChart[clampedHoverIdx] : null

                  const reachRawByIndex = focusedIsReach
                    ? dataForChart.map((p) => {
                        const v = (p as any)?.reach
                        return typeof v === "number" && Number.isFinite(v) ? v : null
                      })
                    : []

                  const reachMa7ByIndex = focusedIsReach
                    ? reachRawByIndex.map((_, i) => {
                        const end = i
                        const start = Math.max(0, i - 6)
                        let sum = 0
                        let count = 0
                        for (let j = start; j <= end; j++) {
                          const v = reachRawByIndex[j]
                          if (typeof v !== "number" || !Number.isFinite(v)) return null
                          sum += v
                          count += 1
                        }
                        if (count < 1) return null
                        return sum / count
                      })
                    : []

                  const tooltipItems = hoverPoint
                    ? (() => {
                        if (focusedIsFollowers) {
                          const v = typeof clampedHoverIdx === "number" ? followersSeriesValues[clampedHoverIdx] : null
                          if (typeof v !== "number" || !Number.isFinite(v)) return []

                          const delta = typeof clampedHoverIdx === "number" ? deltasByIndex[clampedHoverIdx] : null
                          const deltaText =
                            typeof delta === "number" && Number.isFinite(delta)
                              ? `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`
                              : "—"

                          return [
                            {
                              label: labelFor("followers"),
                              color: colorFor("followers"),
                              value: `${Math.round(v).toLocaleString()}（Δ ${deltaText}）`,
                            },
                          ]
                        }

                        if (focusedIsReach) {
                          const raw = hoverPoint.reach
                          const rawText =
                            typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw).toLocaleString() : "—"
                          const ma7 = typeof clampedHoverIdx === "number" ? reachMa7ByIndex[clampedHoverIdx] : null
                          const ma7Text =
                            typeof ma7 === "number" && Number.isFinite(ma7) ? Math.round(ma7).toLocaleString() : "—"

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
                    : []

                  const followersCountFromProfileRaw = (igMe as any)?.profile?.followers_count
                  const followersCountFromProfile =
                    typeof followersCountFromProfileRaw === "number" && Number.isFinite(followersCountFromProfileRaw)
                      ? followersCountFromProfileRaw
                      : typeof followersCountFromProfileRaw === "string" && followersCountFromProfileRaw.trim() && Number.isFinite(Number(followersCountFromProfileRaw))
                        ? Number(followersCountFromProfileRaw)
                        : null

                  const followersCountForFallback =
                    followersCountFromProfile !== null
                      ? followersCountFromProfile
                      : typeof followersCount === "number" && Number.isFinite(followersCount)
                        ? followersCount
                        : null

                  const hasValidFollowersCount = typeof followersCountForFallback === "number" && Number.isFinite(followersCountForFallback)

                  return (
                    <>
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
                      {shouldShowTotalValuePanel ? null : focusedIsFollowers && hasValidFollowersCount && followersDailyRows.length < 1 && dataForChart.length < 2 ? (
                        <div className="w-full mt-2 relative min-w-0">
                          <FollowersTrendFallback
                            point={(() => {
                              const first = dataForChart[0] as any
                              const firstTs = typeof first?.ts === "number" && Number.isFinite(first.ts) ? (first.ts as number) : null
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
                                    const first = dataForChart[0] as any
                                    const firstTs = typeof first?.ts === "number" && Number.isFinite(first.ts) ? (first.ts as number) : null
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
                      ) : (
                        <div className="w-full mt-2 relative min-w-0">
                          <div className="h-[220px] sm:h-[280px] lg:h-[320px] w-full">
                            <svg
                              viewBox={`0 0 ${w} ${h}`}
                              className="h-full w-full"
                              preserveAspectRatio="none"
                              onMouseLeave={() => setHoveredAccountTrendIndex(null)}
                              onMouseMove={(e) => {
                                const el = e.currentTarget
                                const rect = el.getBoundingClientRect()
                                const x = e.clientX - rect.left
                                const ratio = rect.width > 0 ? x / rect.width : 0
                                const idx = Math.round(ratio * (dataForChart.length - 1))
                                setHoveredAccountTrendIndex(Math.max(0, Math.min(dataForChart.length - 1, idx)))
                              }}
                              onTouchStart={(e) => {
                                const el = e.currentTarget
                                const rect = el.getBoundingClientRect()
                                const t = e.touches?.[0]
                                if (!t) return
                                const x = t.clientX - rect.left
                                const ratio = rect.width > 0 ? x / rect.width : 0
                                const idx = Math.round(ratio * (dataForChart.length - 1))
                                setHoveredAccountTrendIndex(Math.max(0, Math.min(dataForChart.length - 1, idx)))
                              }}
                              onTouchMove={(e) => {
                                const el = e.currentTarget
                                const rect = el.getBoundingClientRect()
                                const t = e.touches?.[0]
                                if (!t) return
                                const x = t.clientX - rect.left
                                const ratio = rect.width > 0 ? x / rect.width : 0
                                const idx = Math.round(ratio * (dataForChart.length - 1))
                                setHoveredAccountTrendIndex(Math.max(0, Math.min(dataForChart.length - 1, idx)))
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

                                    if (focusedIsReach && s.k === "reach") {
                                      const reachPts = s.points
                                        .map((p) => {
                                          const x = sx(p.i)
                                          const y = sy(p.yNorm)
                                          if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                          return { x, y }
                                        })
                                        .filter(Boolean) as Array<{ x: number; y: number }>

                                      const reachPath = buildSmoothPath(reachPts)

                                      const span = Math.max(s.max - s.min, 0)
                                      const maPts = reachMa7ByIndex
                                        .map((v, i) => {
                                          if (typeof v !== "number" || !Number.isFinite(v)) return null
                                          const norm = span > 0 ? ((v - s.min) / span) * 100 : 50
                                          const x = sx(i)
                                          const y = sy(Number.isFinite(norm) ? norm : 50)
                                          if (!Number.isFinite(x) || !Number.isFinite(y)) return null
                                          return { x, y }
                                        })
                                        .filter(Boolean) as Array<{ x: number; y: number }>

                                      const maPath = buildSmoothPath(maPts)

                                      return (
                                        <g key={`trend-line-${s.k}`}>
                                          <path d={reachPath} stroke={s.color} strokeWidth={isSmUp ? 2 : 1.4} fill="none" opacity={0.42} />
                                          <path d={maPath} stroke={s.color} strokeWidth={isSmUp ? 2.2 : 1.6} fill="none" opacity={0.92} />
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
                                        strokeWidth={1.5}
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
                                      const r = isSmUp ? 4.2 : 6
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

                                {trendMeta?.isToday
                                  ? (() => {
                                      const lastIdx = dataForChart.length - 1
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
                                  const n = dataForChart.length
                                  if (n <= 0) return null
                                  const last = n - 1

                                  const maxTicks = isSmUp ? 8 : 4
                                  const idxs = (() => {
                                    if (n <= maxTicks) return Array.from({ length: n }).map((_, i) => i)
                                    const out = new Set<number>()
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
                                      {idxs.map((i) => {
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

                                      {idxs.map((i) => {
                                        const x = sx(i)
                                        if (!Number.isFinite(x)) return null
                                        const labelRaw = dataForChart[i]?.t ?? ""
                                        const label = !isSmUp && typeof labelRaw === "string" ? labelRaw.replace(/^0+/, "").replace("/0", "/") : labelRaw
                                        return (
                                          <text
                                            key={`trend-xlab-${i}`}
                                            x={x}
                                            y={h - 4}
                                            textAnchor={anchorFor(i) as any}
                                            fill="rgba(255,255,255,0.34)"
                                            fontSize={10}
                                            fontWeight={500}
                                            style={{ fontVariantNumeric: "tabular-nums" as any }}
                                          >
                                            {label}
                                          </text>
                                        )
                                      })}
                                    </g>
                                  )
                                })()}
                              </svg>
                              {/* ultra-subtle pulse for Today marker (scoped to this component) */}
                              <style jsx>{`
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
                                  .trend-today-pulse circle:first-child {
                                    animation: none;
                                  }
                                }
                              `}</style>
                            </div>

                            {clampedHoverIdx !== null && hoverPoint ? (
                              <div
                                className="pointer-events-none absolute top-2 left-2 rounded-lg border border-white/10 bg-[#0b1220]/85 backdrop-blur px-3 py-2 shadow-xl max-w-[min(280px,70vw)]"
                              >
                                <div className="text-[11px] text-white/70 tabular-nums whitespace-nowrap truncate min-w-0">{hoverPoint.t}</div>
                                <div className="mt-1 space-y-1">
                                  {tooltipItems.map((it, i) => (
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
                            ) : null}
                          </div>
                        )}
                      </>
                    )
                  })()}
              </CardContent>
            </Card>

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
                  {mediaError ? (
                    <div className="text-xs opacity-60 mt-1 truncate">
                      Media load failed: {mediaError}
                    </div>
                  ) : null}
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(() => {
                    const placeholders = Array.from({ length: 3 }, (_, i) => ({ id: `loading-${i}` }))
                    const mockPosts = mockAnalysis.topPosts
                    const renderCards = hasRealMedia
                      ? (topPerformingPosts.length > 0 ? topPerformingPosts : (effectiveRecentMedia as any[]).slice(0, 3))
                      : (isConnected ? placeholders : mockPosts.slice(0, 3))

                    const shown = !isSmUpViewport ? (renderCards as any[]).slice(0, 3) : (renderCards as any[])
                    return shown.map((p: any, index: number) => (
                      <div key={String(p?.id ?? index)} className="rounded-xl border border-white/8 bg-white/5 p-3 min-w-0 overflow-hidden">
                        {(() => {
                          const real = p as any

                          const likeCountRaw =
                            typeof real?.like_count === "number"
                              ? real.like_count
                              : typeof real?.likeCount === "number"
                                ? real.likeCount
                                : typeof real?.likes === "number"
                                  ? real.likes
                                  : toNum(real?.like_count ?? real?.likeCount ?? real?.likes_count ?? real?.likesCount ?? real?.likes)

                          const commentsCountRaw =
                            typeof real?.comments_count === "number"
                              ? real.comments_count
                              : typeof real?.commentsCount === "number"
                                ? real.commentsCount
                                : typeof real?.comments === "number"
                                  ? real.comments
                                  : toNum(real?.comments_count ?? real?.commentsCount ?? real?.comment_count ?? real?.commentCount ?? real?.comments)

                          const likes = (toNum(likeCountRaw) ?? 0)
                          const comments = (toNum(commentsCountRaw) ?? 0)

                          const engagement =
                            typeof real?.engagement === "number" && Number.isFinite(real.engagement)
                              ? real.engagement
                              : typeof likes === "number" && typeof comments === "number"
                                ? likes + comments
                                : null

                          const mediaType =
                            typeof (real?.media_type ?? real?.mediaType) === "string" && String(real?.media_type ?? real?.mediaType)
                              ? String(real?.media_type ?? real?.mediaType)
                              : ""

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

                        const permalink = typeof real?.permalink === "string" && real.permalink ? real.permalink : ""
                        const caption = typeof real?.caption === "string" && real.caption.trim() ? real.caption.trim() : ""

                        const igHref =
                          (typeof real?.permalink === "string" && real.permalink ? real.permalink : "") ||
                          (typeof real?.ig_permalink === "string" && real.ig_permalink ? real.ig_permalink : "") ||
                          (typeof real?.shortcode === "string" && real.shortcode
                            ? `https://www.instagram.com/p/${real.shortcode}/`
                            : "")

                        const previewUrl = (() => {
                          const mt = String((real as any)?.media_type ?? (real as any)?.mediaType ?? "")
                          const tu = typeof (real as any)?.thumbnail_url === "string" ? String((real as any).thumbnail_url) : ""
                          const mu = typeof (real as any)?.media_url === "string" ? String((real as any).media_url) : ""
                          const isVideoType = mt === "VIDEO" || mt === "REELS"
                          const isLikelyVideoUrl = (u: string) => /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)
                          const pick = isVideoType ? (tu || mu) : (mu || tu)
                          if (pick && isLikelyVideoUrl(pick)) return tu || ""
                          return pick || ""
                        })()

                        if (__DEV__ && !previewUrl) {
                          dlog("[top posts] missing previewUrl", {
                            id: real?.id,
                            media_type: real?.media_type,
                            has_thumbnail_url: Boolean(real?.thumbnail_url),
                            has_media_url: Boolean(real?.media_url),
                            has_caption: Boolean(real?.caption),
                          })
                        }

                        const isVideo = mediaType === "VIDEO" || mediaType === "REELS"
                        const videoLabel = mediaType === "REELS" ? "REELS" : "VIDEO"
                        const analyzeHref = permalink
                          ? `/${activeLocale}/post-analysis?url=${encodeURIComponent(permalink)}`
                          : `/${activeLocale}/post-analysis`

                        const insightsUnavailable = false
                        const insightsUnavailableLabel = isZh ? "無法取得洞察" : "Insights unavailable"

                        return (
                          <div className="flex gap-2 min-w-0">
                            <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                              <a href={igHref || undefined} target="_blank" rel="noopener noreferrer" className="block relative overflow-hidden rounded-md bg-white/5 border border-white/10 h-full w-full">
                                <TopPostThumb src={previewUrl || undefined} alt="post preview" />
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
                                    {Math.round(engagement ?? (likes + comments)).toLocaleString()}
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
                                      {Math.round((engagement ?? (likes + comments)) as number).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    ))
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

            <Card
              id="goals-section"
              className="text-slate-100 flex flex-col gap-3 transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-white/30 hover:shadow-xl mt-4 sm:mt-6 rounded-2xl border border-white/24 bg-gradient-to-b from-white/9 via-white/4 to-white/2 ring-1 ring-white/10 shadow-lg shadow-black/35 backdrop-blur-sm px-3 py-3 sm:px-3 sm:py-3.5 scroll-mt-40 min-w-0 overflow-hidden"
            >
              <CardHeader className="pt-3 pb-0 min-w-0">
                <CardTitle className="text-sm sm:text-base font-semibold tracking-tight text-white leading-tight">
                  {t("results.goals.title")}
                </CardTitle>
                <p className={"mt-0.5 text-white/65 max-w-2xl line-clamp-1 " + clampBodyMobile + " sm:text-xs sm:text-white/65 sm:line-clamp-none"}>{t("results.goals.subtitle")}</p>
                <div className="mt-2 h-px w-full bg-white/10" />
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 min-w-0">
                  {goalOptions.map((opt) => {
                    const isSelected = selectedGoal === opt.id
                    return (
                      <div
                        key={opt.id}
                        role="button"
                        tabIndex={0}
                        className={
                          "select-none cursor-pointer w-full min-w-0 truncate rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200 hover:bg-white/12 hover:border-white/30 hover:shadow-lg hover:shadow-black/30 active:scale-[0.99] max-w-full border " +
                          (isSelected
                            ? "border-white/30 bg-white/6 text-white"
                            : "border-white/15 bg-white/6 text-slate-200")
                        }
                        onClick={() => {
                          setSelectedGoal((prev) => (prev === opt.id ? null : opt.id))
                          window.setTimeout(() => scrollToKpiSection(), 0)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedGoal((prev) => (prev === opt.id ? null : opt.id))
                            window.setTimeout(() => scrollToKpiSection(), 0)
                          }
                        }}
                      >
                        {t(opt.labelKey)}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {creatorCardPreviewCard}

            {selectedGoal === "brandCollaborationProfile" ? (
              <section id="insights-section" className="mt-3 scroll-mt-32">
                {renderInsightsSection("desktop")}
              </section>
            ) : null}
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
      />
    </>
  )
}
