"use client"

// Density pass: tighten common headings/blocks inside Results page (UI-only)

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react"
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
import ConnectedGateBase from "../[locale]/results/ConnectedGate"
import { mockAnalysis } from "../[locale]/results/mockData"

// Dev StrictMode can mount/unmount/mount causing useRef to reset.
// Module-scope flag survives remount in the same session and prevents duplicate fetch.
let __resultsMediaFetchedOnce = false
let __resultsMeFetchedOnce = false

type IgMeResponse = {
  username?: string
  name?: string
  display_name?: string
  profile_picture_url?: string
  account_type?: string
  followers_count?: number
  follows_count?: number
  following_count?: number
  media_count?: number
  recent_media?: Array<{
    id: string
    media_type?: string
    media_url?: string
    caption?: string
    timestamp?: string
  }>
  connected?: boolean
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
  engaged?: number
  followerDelta?: number
}

const MOCK_ACCOUNT_TREND_7D: AccountTrendPoint[] = [
  { t: "12/22", reach: 18200, impressions: 25400, engaged: 890, followerDelta: 12 },
  { t: "12/23", reach: 20150, impressions: 27800, engaged: 960, followerDelta: 18 },
  { t: "12/24", reach: 17500, impressions: 24100, engaged: 820, followerDelta: -3 },
  { t: "12/25", reach: 22300, impressions: 30500, engaged: 1100, followerDelta: 25 },
  { t: "12/26", reach: 21000, impressions: 28950, engaged: 1025, followerDelta: 9 },
  { t: "12/27", reach: 23800, impressions: 33000, engaged: 1210, followerDelta: 31 },
  { t: "12/28", reach: 25150, impressions: 34800, engaged: 1290, followerDelta: 22 },
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
  isZh: boolean
  onConnect: () => void
  onBack: () => void
  connectEnvError: "missing_env" | null
}) {
  return (
    <GateShell
      title={props.isZh ? "連線 Instagram 以開始分析" : "Connect Instagram to start"}
      subtitle={props.isZh ? "我們只會讀取你授權的帳號資料。" : "We only read the data you authorize."}
    >
      {props.connectEnvError === "missing_env" ? (
        <Alert>
          <AlertTitle>{props.isZh ? "缺少必要環境變數" : "Missing required env vars"}</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <div>
                {props.isZh
                  ? "伺服器端缺少連線所需設定。請補齊環境變數並重啟服務。"
                  : "Server is missing config required for connecting. Please set env vars and restart."}
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
          {props.isZh ? "連線 Instagram" : "Connect Instagram"}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onBack}
        >
          {props.isZh ? "返回" : "Back"}
        </Button>
      </div>

      <div className="text-xs text-white/55 leading-snug min-w-0 break-words">
        {props.isZh
          ? "提示：若你是一般私人帳號，可能需要先切換成「專業帳號（商業／創作者）」才能被分析。"
          : "Tip: Personal accounts may need to switch to a Professional account (Business/Creator) to be analyzed."}
      </div>
    </GateShell>
  )
}

function SetupHelpCard(props: { isZh: boolean; onRetry: () => void; onReconnect: () => void }) {
  return (
    <GateShell
      title={props.isZh ? "你的 Instagram 帳號目前無法被分析" : "We can’t analyze this account yet"}
      subtitle={
        props.isZh
          ? "Meta 規則要求：IG 必須是專業帳號並綁定 Facebook 粉絲專頁。"
          : "Meta requires a Professional IG account linked to a Facebook Page."
      }
    >
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
        <div className="font-medium mb-2">{props.isZh ? "一分鐘修正步驟" : "1-minute fix"}</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>{props.isZh ? "打開 Instagram → 設定與隱私 → 帳號類型與工具" : "Open Instagram → Settings and privacy → Account type and tools"}</li>
          <li>{props.isZh ? "切換成「專業帳號」（商業或創作者）" : "Switch to a Professional account (Business or Creator)"}</li>
          <li>{props.isZh ? "到 Meta Business Suite / 粉專設定，把 IG 帳號綁到你的粉絲專頁" : "In Meta Business Suite/Page settings, link your IG to your Facebook Page"}</li>
          <li>{props.isZh ? "回到這裡按「重新抓取」" : "Come back here and click Retry"}</li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onRetry}
        >
          {props.isZh ? "我已完成設定，重新抓取" : "I’ve updated settings — Retry"}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg w-full sm:w-auto"
          onClick={props.onReconnect}
        >
          {props.isZh ? "重新連線 Instagram" : "Reconnect Instagram"}
        </Button>
      </div>

      <div className="text-xs text-white/55 leading-snug min-w-0 break-words">
        {props.isZh
          ? "若你剛完成綁定，可能需要等幾秒再重試一次（Meta 同步需要時間）。"
          : "If you just linked it, wait a few seconds and try again (Meta sync can take time)."}
      </div>
    </GateShell>
  )
}

function ConnectedGate(props: ComponentProps<typeof ConnectedGateBase>) {
  console.log("[ConnectedGate] mounted")
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
  const src =
    Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : []

  return src
    .map((m: any) => {
      const id = typeof m?.id === "string" ? m.id : String(m?.id ?? "")
      if (!id) return null

      const like_count = Number(m?.like_count)
      const comments_count = Number(m?.comments_count)

      return {
        id,
        like_count: Number.isFinite(like_count) ? like_count : undefined,
        comments_count: Number.isFinite(comments_count) ? comments_count : undefined,
        timestamp: typeof m?.timestamp === "string" ? m.timestamp : undefined,
        media_type: typeof m?.media_type === "string" ? m.media_type : undefined,
        permalink: typeof m?.permalink === "string" ? m.permalink : undefined,
        media_url: typeof m?.media_url === "string" ? m.media_url : undefined,
        thumbnail_url: typeof m?.thumbnail_url === "string" ? m.thumbnail_url : undefined,
        caption: typeof m?.caption === "string" ? m.caption : undefined,
      }
    })
    .filter(Boolean) as any
}

export default function ResultsClient() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[LocaleResultsPage] mounted")
  }

  const __DEV__ = process.env.NODE_ENV !== "production"

  const router = useRouter()
  const pathname = usePathname() || "/"
  const searchParams = useSearchParams()
  const r = searchParams?.get("r") || ""
  const { t } = useI18n()

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
    if (process.env.NODE_ENV !== "production") {
      console.log("[results page] file =", "app/results/page.tsx")
    }
  }, [])

  const safeT = (key: string) => {
    const v = t(key)
    return v === key ? "" : v
  }

  const isPro = false // TODO: wire to real subscription state

  // ---- Post analysis free quota (UI-only sync) -----------------------------
  const FREE_POST_ANALYSIS_LIMIT = 3
  const FREE_QUOTA_USED_KEYS = [
    // Prefer your actual key if you already have one; keep these fallbacks:
    "sa_post_analysis_used",
    "sa_free_post_analysis_used",
    "post_analysis_used",
    "free_post_analysis_used",
    "sa_post_used",
    "free_post_used",
  ]
  const FREE_QUOTA_REMAIN_KEYS = [
    "sa_post_analysis_remaining",
    "sa_free_post_analysis_remaining",
    "post_analysis_remaining",
    "free_post_analysis_remaining",
    "sa_post_remaining",
    "free_post_remaining",
  ]
  const FREE_QUOTA_LIMIT_KEYS = [
    "sa_post_analysis_limit",
    "sa_free_post_analysis_limit",
    "post_analysis_limit",
    "free_post_analysis_limit",
  ]

  const safeParseInt = (v: unknown) => {
    if (typeof v !== "string") return null
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }

  const readFirstNumberFromLocalStorage = (keys: string[]) => {
    if (typeof window === "undefined") return null
    try {
      for (const k of keys) {
        const raw = window.localStorage.getItem(k)
        const n = safeParseInt(raw)
        if (n !== null) return n
      }
    } catch {
      // ignore (private mode / blocked storage)
    }
    return null
  }

  const computeFreeQuotaSnapshot = () => {
    // priority: remaining -> used -> fallback
    const limitFromLs = readFirstNumberFromLocalStorage(FREE_QUOTA_LIMIT_KEYS) ?? FREE_POST_ANALYSIS_LIMIT

    const remainingFromLs = readFirstNumberFromLocalStorage(FREE_QUOTA_REMAIN_KEYS)
    if (remainingFromLs !== null) {
      const r = Math.max(0, Math.min(limitFromLs, remainingFromLs))
      return { limit: limitFromLs, remaining: r }
    }

    const usedFromLs = readFirstNumberFromLocalStorage(FREE_QUOTA_USED_KEYS)
    if (usedFromLs !== null) {
      const used = Math.max(0, Math.min(limitFromLs, usedFromLs))
      return { limit: limitFromLs, remaining: Math.max(0, limitFromLs - used) }
    }

    // final fallback: keep current UX default (do not break UI)
    return { limit: FREE_POST_ANALYSIS_LIMIT, remaining: 2 }
  }

  const [freePostRemaining, setFreePostRemaining] = useState<number>(() => {
    // SSR-safe default; will be replaced on mount
    return 2
  })
  const [freePostLimit, setFreePostLimit] = useState<number>(() => {
    return FREE_POST_ANALYSIS_LIMIT
  })

  useEffect(() => {
    const sync = () => {
      const snap = computeFreeQuotaSnapshot()
      setFreePostLimit(snap.limit)
      setFreePostRemaining(snap.remaining)
    }

    sync()

    // Cross-tab sync: if post-analysis page updates localStorage, reflect here.
    const watched = new Set([...FREE_QUOTA_USED_KEYS, ...FREE_QUOTA_REMAIN_KEYS, ...FREE_QUOTA_LIMIT_KEYS])
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (watched.has(e.key)) sync()
    }

    // Same-tab sync (most common): when user comes back from post-analysis,
    // refresh on focus/visibility.
    const onFocus = () => sync()
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync()
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // When user navigates back from post-analysis to results in the SAME tab,
    // focus/visibility may NOT fire. Re-sync on pathname changes.
    if (typeof pathname === "string" && pathname.endsWith("/results")) {
      const snap = computeFreeQuotaSnapshot()
      setFreePostLimit(snap.limit)
      setFreePostRemaining(snap.remaining)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const [media, setMedia] = useState<Array<ReturnType<typeof normalizeMedia>[number]>>([])
  const [topPosts, setTopPosts] = useState<any[]>([])

  const [trendPoints, setTrendPoints] = useState<AccountTrendPoint[]>([])
  const [trendFetchStatus, setTrendFetchStatus] = useState<{ loading: boolean; error: string; lastDays: number | null }>({
    loading: false,
    error: "",
    lastDays: null,
  })
  const [trendFetchedAt, setTrendFetchedAt] = useState<number | null>(null)
  const [trendHasNewDay, setTrendHasNewDay] = useState(false)

  const [mediaLoaded, setMediaLoaded] = useState(false)

  const [hasCachedData, setHasCachedData] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateSlow, setUpdateSlow] = useState(false)
  const [loadTimedOut, setLoadTimedOut] = useState(false)
  const [loadError, setLoadError] = useState(false)

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

  type AccountTrendMetricKey = "reach" | "impressions" | "engaged" | "followerDelta"
  const [selectedAccountTrendMetrics, setSelectedAccountTrendMetrics] = useState<AccountTrendMetricKey[]>([
    "reach",
    "impressions",
    "engaged",
    "followerDelta",
  ])
  const [focusedAccountTrendMetric, setFocusedAccountTrendMetric] = useState<AccountTrendMetricKey>("engaged")
  const [hoveredAccountTrendIndex, setHoveredAccountTrendIndex] = useState<number | null>(null)

  // Stable lengths for useEffect deps (avoid conditional/spread deps changing array size)
  const mediaLen = Array.isArray(media) ? media.length : 0
  const topPostsLen = Array.isArray(topPosts) ? topPosts.length : 0
  const igRecentLen = Array.isArray((igMe as any)?.recent_media) ? (igMe as any).recent_media.length : 0

  // Profile stats (UI-only)
  const followersCount = Number((igMe as any)?.followers_count ?? NaN)
  const followsCount = Number((igMe as any)?.follows_count ?? NaN)
  const mediaCount = Number((igMe as any)?.media_count ?? NaN)
  const formatCompact = (n: number) => {
    if (!Number.isFinite(n)) return "—"
    try {
      return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
    } catch {
      return String(n)
    }
  }

  // Determine whether topPosts is real IG media (numeric id) — used for DEV logging only.
  const topPostsFirstId = String((topPosts as any)?.[0]?.id ?? "")
  const topPostsHasReal = topPostsLen > 0 && /^\d+$/.test(topPostsFirstId)

  const hasFetchedMediaRef = useRef(false)
  const hasFetchedMeRef = useRef(false)

  const [forceReloadTick, setForceReloadTick] = useState(0)
  const lastRevalidateAtRef = useRef(0)

  const activeLocale = (extractLocaleFromPathname(pathname).locale ?? "en") as "zh-TW" | "en"
  const isZh = activeLocale === "zh-TW"

  const igCacheId = String(((igMe as any)?.profile?.id ?? (igMe as any)?.profile?.username ?? (igMe as any)?.username ?? "me") || "me")
  const resultsCacheKey = `results_cache:${igCacheId}:7`

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
      setMediaLoaded(true)
    }
    if (Array.isArray(cached.trendPoints)) setTrendPoints(cached.trendPoints)
    if (typeof cached.trendFetchedAt === "number" || cached.trendFetchedAt === null) setTrendFetchedAt(cached.trendFetchedAt)

    // Migrate legacy locale-specific cache to the locale-agnostic key.
    saWriteResultsCache(resultsCacheKey, cached)
  }, [resultsCacheKey])

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
    avgLikesLabel: isZh ? "平均按讚" : "Avg Likes",
    avgCommentsLabel: isZh ? "平均留言" : "Avg Comments",
    perPostLast25: isZh ? "每篇平均（最近 25 篇）" : "Per post (last 25)",
    topPostsSortHint: isZh ? "依（按讚＋留言）排序（最近 25 篇）" : "Sorted by likes + comments (last 25)",
  }

  const safeFlexRow = "flex min-w-0 items-center gap-2"
  const safeText = "min-w-0 overflow-hidden"
  const clampTitleMobile = "min-w-0 overflow-hidden line-clamp-2"
  const clampBodyMobile = "min-w-0 overflow-hidden line-clamp-2 text-[11px] leading-snug"
  const numMono = "tabular-nums whitespace-nowrap"

  const igProfile = ((igMe as any)?.profile ?? igMe) as any
  const isConnected = Boolean(((igMe as any)?.connected ? igProfile?.username : igMe?.username))
  const connectedProvider = searchParams.get("connected")
  const isConnectedInstagram = Boolean((igMe as any)?.connected === true) || connectedProvider === "instagram"

  const hasAnyResultsData = Boolean(mediaLen > 0 || trendPoints.length > 0 || igMe)

  const refetchTick = useRefetchTick({ enabled: isConnectedInstagram, throttleMs: 900 })

  useEffect(() => {
    if (!isConnectedInstagram) return
    setForceReloadTick((x) => x + 1)
  }, [isConnectedInstagram, refetchTick])

  const formatDateTW = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
  const formatTimeTW = (ms: number) => new Date(ms).toLocaleString("zh-TW", { hour12: false })

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

    if (Array.isArray(trendPoints) && trendPoints.length >= 2) {
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
    if (!arr || arr.length < 2) {
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
    return all.length >= 2 ? all : (__DEV__ ? MOCK_ACCOUNT_TREND_7D : [])
  }, [__DEV__, igMe, igProfile, result, trendPoints])

  const accountTrend = useMemo<AccountTrendPoint[]>(() => {
    const data = allAccountTrend
    if (!data.length) return []
    return data.slice(-7)
  }, [allAccountTrend])

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
    if (!isConnectedInstagram) return

    const daysWanted = 7
    if (forceReloadTick === 0 && trendFetchStatus.lastDays === 7 && Array.isArray(trendPoints) && trendPoints.length >= 2) return

    const controller = new AbortController()
    let cancelled = false

    const run = async () => {
      try {
        setTrendFetchStatus((s) => ({ ...s, loading: true, error: "", lastDays: daysWanted }))
        const res = await fetch(`/api/instagram/trend?days=7`, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        })

        if (cancelled) return
        if (!res.ok) {
          setTrendFetchStatus((s) => ({ ...s, loading: false, error: `trend_api_failed_${res.status}` }))
          return
        }

        const json = (await res.json()) as any
        const pts = Array.isArray(json?.points) ? json.points : []
        if (pts.length >= 2) {
          setTrendPoints(
            pts.map((p: any) => ({
              ts: typeof p?.ts === "number" && Number.isFinite(p.ts) ? p.ts : undefined,
              t:
                typeof p?.t === "string" && p.t.trim()
                  ? p.t
                  : typeof p?.ts === "number" && Number.isFinite(p.ts)
                    ? (() => {
                        try {
                          return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(
                            new Date(p.ts)
                          )
                        } catch {
                          const d = new Date(p.ts)
                          const m = String(d.getMonth() + 1).padStart(2, "0")
                          const dd = String(d.getDate()).padStart(2, "0")
                          return `${m}/${dd}`
                        }
                      })()
                    : "—",
              reach: typeof p?.reach === "number" && Number.isFinite(p.reach) ? p.reach : null,
              impressions: typeof p?.impressions === "number" && Number.isFinite(p.impressions) ? p.impressions : null,
              engaged: typeof p?.engaged === "number" && Number.isFinite(p.engaged) ? p.engaged : null,
              followerDelta: typeof p?.followerDelta === "number" && Number.isFinite(p.followerDelta) ? p.followerDelta : null,
            }))
          )
          setTrendFetchedAt(Date.now())
          setTrendFetchStatus((s) => ({ ...s, loading: false, error: "" }))
        } else {
          setTrendFetchStatus((s) => ({ ...s, loading: false, error: "trend_api_no_points" }))
        }
      } catch (err: any) {
        if (cancelled) return
        if (err?.name === "AbortError") return
        setTrendFetchStatus((s) => ({ ...s, loading: false, error: "trend_api_exception" }))
      }
    }

    run()
    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnectedInstagram, pathname, forceReloadTick])

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

  const recentPosts = isConnectedInstagram && topPosts.length > 0 ? topPosts : igMe?.recent_media

  const needsDataRefetch = useMemo(() => {
    const hasProfile = Boolean(igProfile && (igProfile?.id || igProfile?.username))
    const hasMedia = Array.isArray(media) && media.length > 0
    const hasTopPosts = Array.isArray(topPosts) && topPosts.length > 0
    return !hasProfile || !hasMedia || !hasTopPosts
  }, [igProfile, media, topPosts])

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
    if (!__DEV__) return
    const source = topPostsHasReal ? "topPosts(from /api/instagram/media)" : "igMe.recent_media(fallback)"
    console.log(
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
  }, [__DEV__, isConnected, isConnectedInstagram, topPostsLen, igRecentLen, mediaLen])

  useEffect(() => {
    if (!isConnected) return

    if (forceReloadTick === 0) {
      // Prevent duplicate fetch across StrictMode remounts in dev
      if (__resultsMediaFetchedOnce) return

      // Prevent duplicate fetch (StrictMode / re-render)
      if (hasFetchedMediaRef.current) return

      if (mediaLoaded) return
    }

    __resultsMediaFetchedOnce = true
    hasFetchedMediaRef.current = true

    const controller = new AbortController()
    let cancelled = false

    console.log("[media] fetch (from ConnectedGate)")
    fetch("/api/instagram/media", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (__DEV__) {
          const rawLen = Array.isArray(json?.data) ? json.data.length : 0
          console.log("[media] response received:", { hasDataArray: Array.isArray(json?.data), dataLength: rawLen, hasPaging: !!json?.paging })
        }
        setMedia(normalizeMedia(json))
        setMediaLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        if ((err as any)?.name === "AbortError") return
        console.error("[media] fetch failed", err)

        setLoadError(true)

        // Avoid infinite loading when fetch fails.
        setMedia([])
        setMediaLoaded(true)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isConnectedInstagram, pathname, forceReloadTick, r])

  useEffect(() => {
    const onFocus = () => {
      if (!isConnected) return
      if (!needsDataRefetch) return
      const now = Date.now()
      if (now - lastRevalidateAtRef.current < 2500) return
      lastRevalidateAtRef.current = now
      setForceReloadTick((x) => x + 1)
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [isConnected, needsDataRefetch])

  // -------------------------------------------------
  // DEV-ONLY: Observe media state length after normalize + setMedia
  // (No logic changes; helps confirm we actually stored media data)
  // -------------------------------------------------
  useEffect(() => {
    if (!__DEV__) return
    console.log("[media] state:", { mediaLoaded, mediaLength: mediaLen })
  }, [__DEV__, mediaLoaded, mediaLen])

  useEffect(() => {
    const firstId = String((topPosts as any)?.[0]?.id ?? "")
    const hasRealTopPosts = topPostsLen > 0 && /^\d+$/.test(firstId)

    if (__DEV__) {
      console.log("[top-posts][compute] enter", {
        isConnected,
        isConnectedInstagram,
        mediaLen,
        topPostsLen,
        firstId,
        hasRealTopPosts,
      })
    }

    if (!isConnected) return
    if (mediaLen === 0) return
    if (hasRealTopPosts) return

    // Use existing `media` state only (trigger-only fix).
    // Keep the exact same computation logic.
    const items = media
    setTopPosts(
      items
        .filter((m: any) => ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(String(m?.media_type || "")))
        .sort(
          (a: any, b: any) =>
            (Number(b?.like_count || 0) || 0) + (Number(b?.comments_count || 0) || 0) -
            ((Number(a?.like_count || 0) || 0) + (Number(a?.comments_count || 0) || 0))
        )
        .slice(0, 3),
    )
    if (__DEV__) console.log("[top-posts][compute] setTopPosts from media", { mediaLen })
  }, [isConnected, isConnectedInstagram, topPostsLen, mediaLen])

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

    if (!Array.isArray(media) || media.length === 0) {
      return {
        engagementRatePct: null as number | null,
        avgLikes: null as number | null,
        avgComments: null as number | null,
        engagementVolume: null as number | null,
        postsPerWeek: null as number | null,
      }
    }

    const posts = media
      .slice(0, 25)
      .map((p) => {
        const likes = finiteNumOrNull((p as any)?.like_count) ?? 0
        const comments = finiteNumOrNull((p as any)?.comments_count) ?? 0
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

  const kpiFollowers = numOrNull(igProfile?.followers_count)
  const kpiFollowing = numOrNull(igProfile?.follows_count ?? igProfile?.following_count)
  const kpiMediaCount = numOrNull(igProfile?.media_count)
  const kpiPosts = kpiMediaCount

  const topPerformingPosts = (() => {
    if (isConnected && Array.isArray(media) && media.length > 0) {
      const items = media
        .filter((m: any) => ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(String(m?.media_type || "")))
        .map((m: any) => {
          const likes = Number(m?.like_count || 0) || 0
          const comments = Number(m?.comments_count || 0) || 0
          return {
            id: String(m?.id || ""),
            media_type: typeof m?.media_type === "string" ? m.media_type : "",
            likes,
            comments,
            engagement: likes + comments,
            permalink: typeof m?.permalink === "string" ? m.permalink : "",
            media_url: typeof m?.media_url === "string" ? m.media_url : "",
            thumbnail_url: typeof m?.thumbnail_url === "string" ? m.thumbnail_url : "",
            timestamp: typeof m?.timestamp === "string" ? m.timestamp : "",
          }
        })
        .filter((p) => Boolean(p.id))
        .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))

      return items.slice(0, 3)
    }

    if (isConnected) return []
    return mockAnalysis.topPosts.slice(0, 3).map((p) => ({ ...p, engagement: p.likes + p.comments }))
  })()

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
        likes: p?.likes ?? null,
        comments: p?.comments ?? null,
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

  useEffect(() => {
    // Prevent duplicate fetch across StrictMode remounts in dev
    if (forceReloadTick === 0) {
      if (__resultsMeFetchedOnce) return

      // Prevent duplicate fetch in same mount
      if (hasFetchedMeRef.current) return
    }

    __resultsMeFetchedOnce = true
    hasFetchedMeRef.current = true

    const controller = new AbortController()
    let cancelled = false
    const run = async () => {
      setIgMeLoading(true)
      setIgMeUnauthorized(false)
      setConnectEnvError(null)
      setLoadError(false)
      try {
        const r = await fetch("/api/auth/instagram/me", { cache: "no-store", signal: controller.signal })
        if (cancelled) return

        if (r.status === 401) {
          setIgMe(null)
          setIgMeUnauthorized(true)
          return
        }

        if (!r.ok) {
          setIgMe(null)
          setLoadError(true)
          return
        }

        const data = (await r.json()) as any
        const normalized: IgMeResponse | null = (() => {
          if (data?.connected === true && data?.profile) {
            const p = data.profile
            return {
              connected: true,
              provider: data?.provider,
              profile: p,
              username: typeof p?.username === "string" ? p.username : undefined,
              name: typeof p?.name === "string" ? p.name : undefined,
              profile_picture_url: typeof p?.profile_picture_url === "string" ? p.profile_picture_url : undefined,
              followers_count: typeof p?.followers_count === "number" ? p.followers_count : undefined,
              follows_count: typeof p?.follows_count === "number" ? p.follows_count : undefined,
              media_count: typeof p?.media_count === "number" ? p.media_count : undefined,
            }
          }

          if (typeof data?.username === "string" && data.username.trim()) {
            return data as IgMeResponse
          }

          return null
        })()

        setIgMe(normalized)
      } catch (err) {
        if (cancelled) return
        if ((err as any)?.name === "AbortError") return
        setIgMe(null)
        setLoadError(true)
      } finally {
        if (!cancelled) setIgMeLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [forceReloadTick])

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
    const active = (igMeLoading || trendFetchStatus.loading || (isConnected && !mediaLoaded)) && hasAnyResultsData
    setIsUpdating(active)
  }, [hasAnyResultsData, igMeLoading, isConnected, mediaLoaded, trendFetchStatus.loading])

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
    const run = async () => {
      setConnectEnvError(null)
      try {
        const nextPath = `/${activeLocale}/results`
        const oauthUrl = `/api/auth/instagram?provider=instagram&next=${encodeURIComponent(nextPath)}`
        const r = await fetch(oauthUrl, {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
        })

        if (r.status === 500) {
          const data = (await r.json().catch(() => null)) as { error?: string } | null
          if (data?.error === "missing_env") {
            setConnectEnvError("missing_env")
            return
          }
        }

        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get("Location")
          window.location.href = loc || oauthUrl
          return
        }

        window.location.href = oauthUrl
      } catch {
        const nextPath = `/${activeLocale}/results`
        const oauthUrl = `/api/auth/instagram?provider=instagram&next=${encodeURIComponent(nextPath)}`
        window.location.href = oauthUrl
      }
    }

    void run()
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

  const insights = [
    {
      title: t("results.insights.items.0.title"),
      description: t("results.insights.items.0.description"),
    },
    {
      title: t("results.insights.items.1.title"),
      description: t("results.insights.items.1.description"),
    },
    {
      title: t("results.insights.items.2.title"),
      description: t("results.insights.items.2.description"),
    },
  ]

  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [kpiExpanded, setKpiExpanded] = useState(false)
  const [nextActionsExpanded, setNextActionsExpanded] = useState(false)
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

  const insightUiMeta = (
    i: number
  ): {
    source: string
    action: string
    why: string
  } => {
    if (isZh) {
      if (i === 0)
        return {
          source: "根據最近 3 天的互動帳號趨勢",
          action: "👉 這週先把高互動主題做成 3 篇小系列",
          why: "因為最近互動帳號上升，但延續性不夠",
        }
      if (i === 1)
        return {
          source: "根據最近一週的粉絲變化趨勢",
          action: "👉 這週先把個人頁與置頂貼文做一次對齊",
          why: "因為最近粉絲成長停滯，需要更清楚的追蹤理由",
        }
      return {
        source: "根據最近 7 天的觸及趨勢",
        action: "👉 這週先固定一個可維持的發文節奏",
        why: "因為最近觸及有波動，穩定輸出能讓分發更連續",
      }
    }

    if (i === 0)
      return {
        source: "Based on the last 3 days of engaged accounts trend",
        action: "👉 This week, turn your high-engagement topic into a 3-post mini series",
        why: "Because engaged accounts are rising, but the momentum isn’t consistent",
      }
    if (i === 1)
      return {
        source: "Based on the last week of follower change trend",
        action: "👉 This week, align your profile + pinned posts in one pass",
        why: "Because follower growth is stalling and the follow reason isn’t clear enough",
      }
    return {
      source: "Based on the last 7 days of reach trend",
      action: "👉 This week, lock a posting cadence you can sustain",
      why: "Because reach is fluctuating—steady output helps distribution stay continuous",
    }
  }

  const renderInsightsSection = (variant: "mobile" | "desktop") => {
    const isMobile = variant === "mobile"
    const shownInsights = isMobile ? (insightsExpanded ? insights.slice(0, 3) : []) : insights
    return (
      <Card className={isMobile ? "mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm" : "mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm"}>
        <CardHeader
          className={
            isMobile
              ? (insightsExpanded
                  ? "px-3 pt-3 pb-2 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6 cursor-pointer"
                  : "px-3 py-2 sm:px-4 sm:pt-4 sm:pb-2 lg:px-6 lg:pt-6 cursor-pointer")
              : "px-3 pt-3 pb-2 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6"
          }
          onClick={
            isMobile
              ? () => {
                  setInsightsExpanded((v) => !v)
                }
              : undefined
          }
        >
          {isMobile ? (
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-white">{t("results.recommendations.title")}</CardTitle>
                {!insightsExpanded ? (
                  <div className="mt-0.5 text-[11px] leading-tight text-white/55">
                    {isZh ? `${insights.length} 個洞察 · 點擊展開` : `${insights.length} insights · tap to expand`}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setInsightsExpanded((v) => !v)
                }}
                className="text-xs text-white/70 hover:text-white whitespace-nowrap shrink-0"
              >
                {insightsExpanded ? "收合" : "展開"}
              </button>
            </div>
          ) : (
            <CardTitle className="text-sm text-white">{t("results.recommendations.title")}</CardTitle>
          )}
        </CardHeader>
        {(!isMobile || insightsExpanded) ? (
          <CardContent className="pt-0">
            <div className={isMobile ? "space-y-2" : "space-y-2 sm:space-y-3"}>
              {shownInsights.map((insight, idx) => {
                const meta = insightUiMeta(idx)
                return (
                  <div
                    key={insight.title}
                    className={
                      "rounded-xl border border-white/10 bg-white/5 min-w-0 overflow-hidden " +
                      (isMobile ? "p-3" : "p-4")
                    }
                  >
                    <div className={safeFlexRow + " items-start"}>
                      <div
                        className={
                          isMobile
                            ? "text-sm font-semibold text-white leading-snug " + clampTitleMobile
                            : "min-w-0 text-xs font-semibold text-white leading-snug"
                        }
                      >
                        {insight.title}
                      </div>
                    </div>

                    <div
                      className={
                        isMobile
                          ? "mt-1 text-white/55 " + clampBodyMobile
                          : "mt-1 text-xs text-white/45 leading-snug"
                      }
                    >
                      {meta.source}
                    </div>

                    <div className={isMobile ? "mt-2 space-y-1.5" : "mt-2 space-y-2"}>
                      <div
                        className={
                          isMobile
                            ? "font-semibold text-white " + clampBodyMobile
                            : "text-sm font-semibold text-white leading-snug"
                        }
                      >
                        {meta.action}
                      </div>
                      <div
                        className={
                          isMobile
                            ? "text-slate-200/85 " + clampBodyMobile
                            : "text-xs text-slate-300 leading-snug"
                        }
                      >
                        {meta.why}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        ) : null}
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

  const activeGoalMeta = goalMeta[selectedGoal ?? "default"]

  const [checkedNextActions, setCheckedNextActions] = useState<Record<string, boolean>>({})
  const toggleNextActionChecked = (actionKey: string) => {
    setCheckedNextActions((prev) => ({ ...prev, [actionKey]: !prev[actionKey] }))
  }

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
    if (isConnected && mediaLoaded && media.length === 0 && topPosts.length === 0) return "needs_setup"
    return "ready"
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
          setForceReloadTick((x) => x + 1)
        }}
        onRefresh={() => {
          setLoadTimedOut(false)
          setLoadError(false)
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
        isZh={isZh}
        onConnect={handleConnect}
        onBack={() => router.push(localePathname("/", activeLocale))}
        connectEnvError={connectEnvError}
      />
    )

  if (derivedGateState === "needs_setup")
    return (
      <SetupHelpCard
        isZh={isZh}
        onRetry={() => {
          setForceReloadTick((x) => x + 1)
        }}
        onReconnect={handleConnect}
      />
    )

  return (
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
                  <div className="text-sm font-semibold text-white">Instagram 連線已失效</div>
                  <div className="mt-1 text-[13px] text-white/70 leading-snug">
                    請重新驗證登入後再查看帳號分析結果。
                  </div>
                </div>

                <Link
                  href={`/api/auth/instagram?provider=instagram&next=/${activeLocale}/results`}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_8px_20px_rgba(168,85,247,0.25)] hover:brightness-110 active:translate-y-[1px] transition w-full sm:w-auto"
                >
                  重新連線 Instagram
                </Link>
              </div>
            </div>
          )}

          <div className="mt-3 sm:mt-4 space-y-4 sm:space-y-4">
            {isConnected && (
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                  <CardTitle className="text-xl font-bold text-white">{t("results.instagram.recentPostsTitle")}</CardTitle>
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
                                <img
                                  src={mediaUrl}
                                  alt={caption ? caption.slice(0, 40) : m.id}
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
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
                <div className="text-sm text-slate-300">{t("results.performance.kicker")}</div>
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
                <Card id="results-section-performance" className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
                  <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
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

                <Card id="results-section-monetization" className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
                  <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                    <CardTitle className="text-xl font-bold">{t("results.monetization.title")}</CardTitle>
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
                  <Card className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
                    <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                      <CardTitle className="text-xl font-bold">{t("results.insights.title")}</CardTitle>
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
                  <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
                    <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                      <CardTitle className="text-base">{t("results.sidebar.title")}</CardTitle>
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

            <Card id="next-steps-section" className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg scroll-mt-40">
              <CardHeader className="border-b border-white/10 px-3 pt-3 pb-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
                <CardTitle className="text-xl font-bold">{t("results.next.title")}</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  {t("results.next.subtitle")}
                </p>
              </CardHeader>
              <CardContent className="p-4 lg:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {(() => {
                    const status =
                      safeResult.contentConsistency === "Consistent"
                        ? "good"
                        : safeResult.contentConsistency === "Mixed"
                        ? "warning"
                        : "risk"
                    const tone = metricTone(status)
                    const priority = nextPriorityLabel(status)
                    return (
                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveNextId("next-1")
                          window.setTimeout(() => scrollToId("next-1"), 0)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setActiveNextId("next-1")
                            window.setTimeout(() => scrollToId("next-1"), 0)
                          }
                        }}
                        className={`rounded-xl border border-white/10 bg-white/5 cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                          activeNextId === "next-1" ? "ring-2 ring-blue-500/40" : ""
                        }`}
                      >
                        <CardContent className="p-4 h-full">
                          <div className="flex items-center justify-between w-full">
                            <div className="text-sm font-medium text-white">{t("results.next.step1")}</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-slate-300 leading-snug">{t("results.next.desc1")}</div>
                        </CardContent>
                      </Card>
                    )
                  })()}

                  {(() => {
                    const status = engagementStatus
                    const tone = metricTone(status)
                    const priority = nextPriorityLabel(status)
                    return (
                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveNextId("next-2")
                          window.setTimeout(() => scrollToId("next-2"), 0)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setActiveNextId("next-2")
                            window.setTimeout(() => scrollToId("next-2"), 0)
                          }
                        }}
                        className={`rounded-xl border border-white/10 bg-white/5 cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                          activeNextId === "next-2" ? "ring-2 ring-blue-500/40" : ""
                        }`}
                      >
                        <CardContent className="p-4 h-full">
                          <div className="flex items-center justify-between w-full">
                            <div className="text-sm font-medium text-white">{t("results.next.step2")}</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-slate-300 leading-snug">{t("results.next.desc2")}</div>
                        </CardContent>
                      </Card>
                    )
                  })()}

                  {(() => {
                    const status = isSubscribed ? "good" : "warning"
                    const tone = metricTone(status)
                    const priority = status === "warning" ? t("results.priority.high") : t("results.priority.maintain")
                    return (
                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveNextId("next-3")
                          window.setTimeout(() => scrollToId("next-3"), 0)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            setActiveNextId("next-3")
                            window.setTimeout(() => scrollToId("next-3"), 0)
                          }
                        }}
                        className={`rounded-xl border border-white/10 bg-white/5 cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                          activeNextId === "next-3" ? "ring-2 ring-blue-500/40" : ""
                        }`}
                      >
                        <CardContent className="p-4 h-full">
                          <div className="flex items-center justify-between w-full">
                            <div className="text-sm font-medium text-white">{t("results.next.step3")}</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-slate-300 leading-snug">{t("results.next.desc3")}</div>
                        </CardContent>
                      </Card>
                    )
                  })()}
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card
                    id="next-1"
                    className={`rounded-xl border border-white/10 bg-white/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      activeNextId === "next-1" ? "ring-2 ring-blue-500/40" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold text-white">{t("results.next.s1.title")}</div>
                      <div className="mt-2 text-sm text-slate-300 leading-snug">{t("results.next.s1.line1")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-snug">{t("results.next.s1.line2")}</div>
                    </CardContent>
                  </Card>
                  <Card
                    id="next-2"
                    className={`rounded-xl border border-white/10 bg-white/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      activeNextId === "next-2" ? "ring-2 ring-blue-500/40" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold text-white">{t("results.next.s2.title")}</div>
                      <div className="mt-2 text-sm text-slate-300 leading-snug">{t("results.next.s2.line1")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-snug">{t("results.next.s2.line2")}</div>
                    </CardContent>
                  </Card>
                  <Card
                    id="next-3"
                    className={`rounded-xl border border-white/10 bg-white/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      activeNextId === "next-3" ? "ring-2 ring-blue-500/40" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="text-sm font-semibold text-white">{t("results.next.s3.title")}</div>
                      <div className="mt-2 text-sm text-slate-300 leading-snug">{t("results.next.s3.line1")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-snug">{t("results.next.s3.line2")}</div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 text-center">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs text-slate-400">{activeLocale === "zh-TW" ? t("results.profile.followers") : t("results.instagram.followersLabel")}</div>
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
                <div className="relative">
                  <div className="hidden sm:flex items-center gap-6 min-w-0">
                    <div className="flex items-center gap-4 min-w-0">
                      {igProfile?.profile_picture_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={String(igProfile.profile_picture_url)}
                          alt={displayHandle}
                          className="h-16 w-16 md:h-20 md:w-20 rounded-full border border-white/10 object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-16 w-16 md:h-20 md:w-20 rounded-full border border-white/10 bg-white/10 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="text-base font-semibold text-white truncate">
                          {displayName}
                        </div>
                        <div className="text-xs text-slate-300 truncate">
                          {displayHandle}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center gap-3 md:gap-4 self-center min-w-0">
                      <div className="w-[160px] md:w-[170px]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20">
                          <div className="text-xs text-white/60 whitespace-nowrap">{t("results.profile.followers")}</div>
                          <div className="mt-1 text-xl md:text-2xl font-semibold tabular-nums whitespace-nowrap truncate animate-in fade-in slide-in-from-bottom-2 duration-500">
                            {formatCompact(followersCount) ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="w-[160px] md:w-[170px]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20">
                          <div className="text-xs text-white/60 whitespace-nowrap">{t("results.profile.following")}</div>
                          <div className="mt-1 text-xl md:text-2xl font-semibold tabular-nums whitespace-nowrap truncate animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75">
                            {formatCompact(followsCount) ?? "—"}
                          </div>
                        </div>
                      </div>

                      <div className="w-[160px] md:w-[170px]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4 text-center transition-transform duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-black/20">
                          <div className="text-xs text-white/60 whitespace-nowrap">{t("results.profile.posts")}</div>
                          <div className="mt-1 text-xl md:text-2xl font-semibold tabular-nums whitespace-nowrap truncate animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150">
                            {formatCompact(mediaCount) ?? "—"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-center">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                        {safeT("results.proBadge")}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 max-w-[160px] min-w-0 truncate">
                        {t(
                          selectedGoal
                            ? `results.positioning.labels.${selectedGoal}`
                            : "results.positioning.labels.default"
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="sm:hidden flex flex-col gap-2">
                    <div className="flex items-start gap-4">
                      {igProfile?.profile_picture_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={String(igProfile.profile_picture_url)}
                          alt={displayHandle}
                          className="h-16 w-16 rounded-full border border-white/10 object-cover shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full border border-white/10 bg-white/10 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="text-base font-semibold text-white truncate">
                          {displayName}
                        </div>
                        <div className="text-xs text-slate-300 truncate">
                          {displayHandle}
                        </div>
                      </div>

                      <div className="ml-auto flex items-center gap-2 shrink-0 min-w-0">
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                          {safeT("results.proBadge")}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 max-w-[160px] min-w-0 truncate">
                          {t(
                            selectedGoal
                              ? `results.positioning.labels.${selectedGoal}`
                              : "results.positioning.labels.default"
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
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

            <section className="mt-3 scroll-mt-32 sm:hidden">
              {renderInsightsSection("mobile")}
            </section>

            <Card className="mt-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <CardHeader className="border-b border-white/10 px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 flex items-start sm:items-center justify-between gap-3 min-w-0">
                <CardTitle className="text-xl font-bold text-white min-w-0 truncate shrink-0">{t("results.trend.title")}</CardTitle>
                <p className="text-[11px] sm:text-sm text-slate-400 min-w-0 leading-snug sm:leading-none sm:whitespace-nowrap sm:truncate text-left sm:text-right">
                  {isZh
                    ? "最近 7 天（系統會每日自動累積，之後可查看更長區間）"
                    : "Last 7 days (we’ll auto-build history daily; longer ranges coming soon)"}
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-1 lg:p-6 lg:pt-2">
                <div className="mt-2 flex flex-col gap-1 min-w-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center justify-between gap-3 min-w-0 sm:contents">
                    <div className="shrink-0">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 whitespace-nowrap">
                        7天
                      </span>
                    </div>

                    <div className="shrink-0 whitespace-nowrap tabular-nums min-w-0 overflow-hidden text-ellipsis text-[10px] text-white/45 sm:text-xs sm:text-white/55">
                      {isZh ? "目前可用：7 天" : "Available: 7 days"}
                    </div>
                  </div>

                  <div className="min-w-0 sm:flex-1 sm:flex sm:justify-center">
                    <div className="max-w-full sm:overflow-x-auto sm:whitespace-nowrap sm:overscroll-x-contain sm:[-webkit-overflow-scrolling:touch]">
                      <div className="flex flex-wrap items-center gap-2 sm:inline-flex sm:flex-nowrap sm:whitespace-nowrap sm:min-w-max">
                        {(
                          [
                            { k: "reach" as const, label: t("results.trend.legend.reach"), dot: "#34d399" },
                            { k: "impressions" as const, label: t("results.trend.legend.impressions"), dot: "#38bdf8" },
                            { k: "engaged" as const, label: t("results.trend.legend.engagedAccounts"), dot: "#e879f9" },
                            { k: "followerDelta" as const, label: t("results.trend.legend.followerChange"), dot: "#fbbf24" },
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
                    </div>
                  </div>
                </div>

                {trendMeta ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60 min-w-0">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white/80 whitespace-nowrap shrink-0">{isZh ? "趨勢區間" : "Range"}</span>
                      <span className="tabular-nums whitespace-nowrap truncate min-w-0">
                        {trendMeta.startLabel} – {trendMeta.endLabel}
                      </span>
                    </span>
                    <span className="opacity-40 shrink-0">•</span>

                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-white/80 whitespace-nowrap shrink-0">{isZh ? "更新" : "Updated"}</span>
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
                  const dataForChart = accountTrend

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
                      : k === "impressions"
                        ? t("results.trend.legend.impressions")
                        : k === "engaged"
                          ? t("results.trend.legend.engagedAccounts")
                          : t("results.trend.legend.followerChange")
                  const colorFor = (k: AccountTrendMetricKey) =>
                    k === "reach" ? "#34d399" : k === "impressions" ? "#38bdf8" : k === "engaged" ? "#e879f9" : "#fbbf24"

                  const series = selected.map((k) => {
                    const raw = dataForChart
                      .map((p, i) => {
                        const y = k === "reach" ? p.reach : k === "impressions" ? p.impressions : k === "engaged" ? p.engaged : p.followerDelta
                        if (typeof y !== "number" || !Number.isFinite(y)) return null
                        return { i, y }
                      })
                      .filter(Boolean) as Array<{ i: number; y: number }>

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

                  const drawable = series.filter((s) => s.points.length >= 2)
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

                  const tooltipItems = hoverPoint
                    ? selected
                        .map((k) => {
                          const val =
                            k === "reach"
                              ? hoverPoint.reach
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
                    : []

                  return (
                    <>
                      {dataForChart.length < 2 ? (
                        <div className="w-full mt-2">
                          <div className="py-3 text-sm text-white/75 text-center leading-snug min-w-0">
                            {isZh ? "尚無趨勢資料" : "No trend data yet"}
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
                                      key={`trend-series-${s.k}`}
                                      d={d || ""}
                                      fill="none"
                                      stroke={s.color}
                                      strokeWidth={isFocused ? 3.6 : 2.2}
                                      opacity={isFocused ? 0.99 : 0.55}
                                    />
                                  )
                                  })
                                })()}

                                {(() => {
                                  const focus = drawable.find((s) => s.k === focusedAccountTrendMetric)
                                  if (!focus) return null
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
                                  const mid = Math.floor(last / 2)
                                  const step = n <= 8 ? 3 : n <= 16 ? 4 : 5
                                  const showLabel = (i: number) =>
                                    !isSmUp ? i === 0 || i === last || i === mid : i === 0 || i === last || i === mid || i % step === 0
                                  const anchorFor = (i: number) => (i === 0 ? "start" : i === last ? "end" : "middle")
                                  const topY = padY
                                  const bottomY = h - padY

                                  return (
                                    <g key="trend-x-axis-upgrade">
                                      {Array.from({ length: n }).map((_, i) => {
                                        const x = sx(i)
                                        if (!Number.isFinite(x)) return null
                                        return (
                                          <g key={`trend-xt-${i}`}>
                                            <line
                                              x1={x}
                                              x2={x}
                                              y1={topY}
                                              y2={bottomY}
                                              stroke="rgba(255,255,255,0.06)"
                                              strokeWidth="1"
                                            />
                                            <line
                                              x1={x}
                                              x2={x}
                                              y1={bottomY}
                                              y2={Math.min(h - 2, bottomY + 6)}
                                              stroke="rgba(255,255,255,0.18)"
                                              strokeWidth="1"
                                            />
                                          </g>
                                        )
                                      })}

                                      {Array.from({ length: n })
                                        .map((_, i) => i)
                                        .filter(showLabel)
                                        .map((i) => {
                                          const x = sx(i)
                                          if (!Number.isFinite(x)) return null
                                          const label = dataForChart[i]?.t ?? ""
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

            <Card id="top-posts-section" className="mt-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm scroll-mt-40 overflow-hidden">
              <CardHeader className="border-b border-white/10 px-3 pt-4 pb-1 sm:px-4 sm:py-2 lg:px-6 lg:py-3 flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <CardTitle className="text-sm text-white truncate">{t("results.topPosts.title")}</CardTitle>
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
                    {activeLocale === "zh-TW" ? "前往貼文分析" : "Analyze Posts"}
                  </Button>

                  {!isPro ? (
                    <span
                      className="min-w-0 tabular-nums overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-white/55 sm:text-xs sm:text-muted-foreground sm:max-w-[220px]"
                      title={
                        activeLocale === "zh-TW"
                          ? `免費剩餘 ${freePostRemaining} / ${freePostLimit}`
                          : `Free left ${freePostRemaining} / ${freePostLimit}`
                      }
                    >
                      {activeLocale === "zh-TW" ? "免費剩餘 " : "Free left "}
                      <span className="font-medium tabular-nums">{freePostRemaining}</span> / {freePostLimit}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4 sm:pt-3 lg:px-6 lg:pb-5 lg:pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(() => {
                    const src = isConnected
                      ? (topPerformingPosts.length > 0
                          ? topPerformingPosts
                          : Array.from({ length: 3 }, (_, i) => ({ id: `loading-${i}` })))
                      : mockAnalysis.topPosts.slice(0, 3)

                    const shown = !isSmUpViewport ? (src as any[]).slice(0, 3) : (src as any[])
                    return shown.map((p: any, index: number) => (
                      <div key={String(p?.id ?? index)} className="rounded-xl border border-white/8 bg-white/5 p-3 min-w-0 overflow-hidden">
                        {(() => {
                          const real = topPerformingPosts[index] as any

                          const likes = typeof real?.likes === "number" ? real.likes : !isConnected ? Number(p?.likes ?? 0) : null
                          const comments =
                            typeof real?.comments === "number" ? real.comments : !isConnected ? Number(p?.comments ?? 0) : null
                          const engagement =
                            typeof real?.engagement === "number"
                              ? real.engagement
                              : !isConnected
                                ? Number((p?.likes ?? 0) + (p?.comments ?? 0))
                                : null

                          const mediaType = typeof real?.media_type === "string" && real.media_type ? real.media_type : ""

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

                        const thumbSrc = (() => {
                          const thumb = typeof real?.thumbnail_url === "string" && real.thumbnail_url ? real.thumbnail_url : ""
                          if (thumb) return thumb

                          // Only IMAGE/CAROUSEL should use media_url as an <img> source.
                          // VIDEO/REELS media_url is often an mp4, which will break <img> and fall back to placeholder.
                          const mu = typeof real?.media_url === "string" && real.media_url ? real.media_url : ""
                          if (!mu) return ""
                          if (mediaType === "IMAGE" || mediaType === "CAROUSEL_ALBUM") return mu
                          return ""
                        })()

                        if (process.env.NODE_ENV !== "production" && !thumbSrc) {
                          console.log("[top posts] missing thumbnail", {
                            id: real?.id,
                            media_type: real?.media_type,
                            has_thumbnail_url: Boolean(real?.thumbnail_url),
                            has_media_url: Boolean(real?.media_url),
                          })
                        }

                        const isVideo = mediaType === "VIDEO" || mediaType === "REELS"
                        const videoLabel = mediaType === "REELS" ? "REELS" : "VIDEO"
                        const analyzeHref = permalink
                          ? `/${activeLocale}/post-analysis?url=${encodeURIComponent(permalink)}`
                          : `/${activeLocale}/post-analysis`

                        return (
                          <div className="flex gap-2 min-w-0">
                            <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                              {igHref ? (
                                <a
                                  href={igHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block relative group overflow-hidden rounded-md bg-white/5 border border-white/10 h-full w-full"
                                >
                                  <div className="absolute inset-0 bg-white/10" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-[10px] sm:text-[11px] font-semibold text-white/60 tabular-nums tracking-wide whitespace-nowrap truncate max-w-[90%]">
                                      {mediaType ? mediaType : "POST"}
                                    </span>
                                  </div>
                                  {thumbSrc ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={thumbSrc}
                                      alt=""
                                      className="absolute inset-0 h-full w-full object-cover"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        // hide broken image to reveal placeholder underneath
                                        e.currentTarget.style.display = "none"
                                      }}
                                    />
                                  ) : null}

                                  {isVideo ? (
                                    <div
                                      className="absolute left-2 top-2 sm:hidden max-w-[70%] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium leading-none text-white"
                                      title={videoLabel}
                                    >
                                      <span className="truncate">{videoLabel}</span>
                                    </div>
                                  ) : null}

                                  {isVideo ? (
                                    <div className="pointer-events-none absolute inset-0 hidden sm:flex items-center justify-center bg-black/0 opacity-0 group-hover:opacity-100 group-hover:bg-black/30 transition">
                                      <div
                                        className="max-w-[90%] overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-[11px] sm:text-xs font-medium leading-none text-white"
                                        title={videoLabel}
                                      >
                                        <span className="shrink-0">▶</span>
                                        <span className="truncate">{videoLabel}</span>
                                      </div>
                                    </div>
                                  ) : null}
                                </a>
                              ) : (
                                <div className="block relative group overflow-hidden rounded-md bg-white/5 border border-white/10 h-full w-full">
                                  <div className="absolute inset-0 bg-white/10" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-[10px] sm:text-[11px] font-semibold text-white/60 tabular-nums tracking-wide whitespace-nowrap truncate max-w-[90%]">
                                      {mediaType ? mediaType : "POST"}
                                    </span>
                                  </div>
                                  {thumbSrc ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={thumbSrc}
                                      alt=""
                                      className="absolute inset-0 h-full w-full object-cover"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        // hide broken image to reveal placeholder underneath
                                        e.currentTarget.style.display = "none"
                                      }}
                                    />
                                  ) : null}

                                  {isVideo ? (
                                    <div
                                      className="absolute left-2 top-2 sm:hidden max-w-[70%] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium leading-none text-white"
                                      title={videoLabel}
                                    >
                                      <span className="truncate">{videoLabel}</span>
                                    </div>
                                  ) : null}

                                  {isVideo ? (
                                    <div className="pointer-events-none absolute inset-0 hidden sm:flex items-center justify-center bg-black/0 opacity-0 group-hover:opacity-100 group-hover:bg-black/30 transition">
                                      <div
                                        className="max-w-[90%] overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-[11px] sm:text-xs font-medium leading-none text-white"
                                        title={videoLabel}
                                      >
                                        <span className="shrink-0">▶</span>
                                        <span className="truncate">{videoLabel}</span>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              )}
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
                                    className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10 whitespace-nowrap"
                                    title={activeLocale === "zh-TW" ? "分析貼文" : "Analyze"}
                                  >
                                    {activeLocale === "zh-TW" ? "分析" : "Analyze"}
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
                                    {typeof likes === "number" && Number.isFinite(likes) ? Math.round(likes).toLocaleString() : "—"}
                                  </span>
                                </span>
                                <span className="opacity-50">·</span>
                                <span className="ml-2 whitespace-nowrap">{t("results.topPosts.card.commentsLabel")}</span>
                                <span className="ml-1 mr-2 inline-flex items-center">
                                  <span className={numMono}>
                                    {typeof comments === "number" && Number.isFinite(comments)
                                      ? Math.round(comments).toLocaleString()
                                      : "—"}
                                  </span>
                                </span>
                                <span className="opacity-50">·</span>
                                <span className="ml-2 whitespace-nowrap">{t("results.topPosts.card.engagementLabel")}</span>
                                <span className="ml-1 inline-flex items-center">
                                  <span className={numMono}>
                                    {typeof engagement === "number" && Number.isFinite(engagement)
                                      ? Math.round(engagement).toLocaleString()
                                      : "—"}
                                  </span>
                                </span>
                              </div>

                              <div className="mt-2.5 hidden sm:flex items-center justify-center gap-x-8 sm:gap-x-10 pr-4 sm:pr-6 min-w-0 overflow-hidden">
                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.likesLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {typeof likes === "number" && Number.isFinite(likes) ? Math.round(likes).toLocaleString() : "—"}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.commentsLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {typeof comments === "number" && Number.isFinite(comments)
                                        ? Math.round(comments).toLocaleString()
                                        : "—"}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.engagementLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className={numMono}>
                                      {typeof engagement === "number" && Number.isFinite(engagement)
                                        ? Math.round(engagement).toLocaleString()
                                        : "—"}
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
                      <CardTitle className="text-base font-semibold text-white">關鍵指標</CardTitle>
                      {!isMobile && !kpiExpanded ? (
                        <div className="mt-0.5 text-[11px] leading-tight text-white/55">6 個指標 · 點擊展開</div>
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
                      {kpiExpanded ? "收合" : "展開"}
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
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedGoal((prev) => (prev === opt.id ? null : opt.id))
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

            <Card className="text-slate-100 flex flex-col gap-1.5 transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg mt-3 rounded-xl border border-white/12 bg-gradient-to-b from-white/8 via-white/4 to-white/2 ring-1 ring-white/8 shadow-lg shadow-black/35 backdrop-blur-sm px-2 py-2 sm:px-3 sm:py-3 mb-5">
              <CardHeader className="pb-0 py-2">
                <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight text-white">
                  {safeT("results.nextActions.title")}
                </CardTitle>
                <p className="mt-0.5 text-[10px] leading-tight text-white/65 max-w-3xl min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="truncate">{safeT("results.nextActions.helperLine")}</span>
                  <span className="mx-1 opacity-60">·</span>
                  <span className="truncate">{safeT("results.nextActions.subtitle")}</span>
                </p>
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                  {(() => {
                    if (!isSmUpViewport) {
                      const actions = activeGoalMeta.actions
                      const visibleActions = nextActionsExpanded ? actions.slice(0, 3) : actions.slice(0, 1)
                      const hiddenCount = Math.max(0, Math.min(3, actions.length) - visibleActions.length)
                      let proDividerInserted = false
                      const nodes: ReactNode[] = []

                      visibleActions.forEach((action) => {
                        const isLocked = action.isPro && !isPro
                        const shouldInsertDivider = action.isPro && !proDividerInserted
                        if (shouldInsertDivider) proDividerInserted = true

                        if (shouldInsertDivider) {
                          nodes.push(
                            <div key="pro-divider" className="md:col-span-3 flex items-center">
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                                專業版內容
                              </span>
                            </div>
                          )
                        }

                        nodes.push(
                          <div
                            key={action.titleKey}
                            role={!isLocked ? "button" : undefined}
                            tabIndex={!isLocked ? 0 : undefined}
                            className={
                              "flex flex-col gap-1 rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5 transition-all min-w-0 overflow-hidden " +
                              (isLocked
                                ? "border-white/20 bg-white/8"
                                : checkedNextActions[action.titleKey]
                                  ? "cursor-pointer border-white/12 bg-white/6 hover:bg-white/7 hover:border-white/25"
                                  : "cursor-pointer border-white/20 bg-white/8 hover:bg-white/12 hover:border-white/40")
                            }
                            onClick={() => {
                              if (isLocked) return
                              toggleNextActionChecked(action.titleKey)
                            }}
                            onKeyDown={(e) => {
                              if (isLocked) return
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                toggleNextActionChecked(action.titleKey)
                              }
                            }}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <button
                                type="button"
                                aria-label="toggle"
                                role="checkbox"
                                aria-checked={!!checkedNextActions[action.titleKey]}
                                disabled={isLocked}
                                className={
                                  "mt-[1px] h-4 w-4 shrink-0 rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 " +
                                  (isLocked
                                    ? "cursor-not-allowed border-white/25 bg-black/20"
                                    : checkedNextActions[action.titleKey]
                                      ? "border-emerald-300/60 bg-emerald-400/25"
                                      : "border-white/30 bg-black/20 hover:bg-white/8")
                                }
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (isLocked) return
                                  toggleNextActionChecked(action.titleKey)
                                }}
                              />
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                  <div
                                    className={
                                      "text-xs font-semibold leading-snug line-clamp-1 min-w-0 " +
                                      (isLocked
                                        ? "text-white"
                                        : checkedNextActions[action.titleKey]
                                          ? "text-white/60 line-through decoration-white/30"
                                          : "text-white")
                                    }
                                  >
                                    {safeT(action.titleKey)}
                                  </div>
                                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200 shrink-0 whitespace-nowrap">
                                    {action.isPro ? safeT("results.nextActions.proBadge") : safeT("results.nextActions.freeBadge")}
                                  </span>
                                </div>

                                <div
                                  className={
                                    "mt-1 text-[11px] leading-snug line-clamp-2 min-w-0 " +
                                    (isLocked
                                      ? "text-slate-300 blur-[3px] select-none"
                                      : checkedNextActions[action.titleKey]
                                        ? "text-slate-300/70"
                                        : "text-slate-300")
                                  }
                                >
                                  {safeT(action.descKey)}
                                </div>

                                {isLocked ? (
                                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                    <Lock className="h-3.5 w-3.5" />
                                    <button
                                      type="button"
                                      className="hover:text-slate-200"
                                      onClick={handleUpgrade}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClickCapture={(e) => e.stopPropagation()}
                                    >
                                      {safeT("results.nextActions.lockLine")}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )
                      })

                      if (!nextActionsExpanded && hiddenCount > 0) {
                        nodes.push(
                          <div
                            key="next-actions-see-more"
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-xl border border-white/20 bg-white/6 px-2.5 py-2 text-xs font-semibold text-white/85 hover:bg-white/8 hover:border-white/30"
                            onClick={() => setNextActionsExpanded(true)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setNextActionsExpanded(true)
                              }
                            }}
                          >
                            {activeLocale === "zh-TW" ? `查看更多（${hiddenCount}）` : `See more (${hiddenCount})`}
                          </div>
                        )
                      }

                      if (nextActionsExpanded) {
                        nodes.push(
                          <div
                            key="next-actions-collapse"
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-xl border border-white/20 bg-white/6 px-2.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/8 hover:border-white/30"
                            onClick={() => setNextActionsExpanded(false)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setNextActionsExpanded(false)
                              }
                            }}
                          >
                            {activeLocale === "zh-TW" ? "收合" : "Collapse"}
                          </div>
                        )
                      }

                      return nodes
                    }

                    let proDividerInserted = false
                    return activeGoalMeta.actions.flatMap((action) => {
                      const isLocked = action.isPro && !isPro
                      const shouldInsertDivider = action.isPro && !proDividerInserted
                      if (shouldInsertDivider) proDividerInserted = true
                      const nodes: ReactNode[] = []

                      if (shouldInsertDivider) {
                        nodes.push(
                          <div key="pro-divider" className="md:col-span-3 flex items-center">
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                              專業版內容
                            </span>
                          </div>
                        )
                      }

                      nodes.push(
                        <div
                          key={action.titleKey}
                          role={!isLocked ? "button" : undefined}
                          tabIndex={!isLocked ? 0 : undefined}
                          className={
                            "flex flex-col gap-1 rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5 transition-all min-w-0 overflow-hidden " +
                            (isLocked
                              ? "border-white/20 bg-white/8"
                              : checkedNextActions[action.titleKey]
                                ? "cursor-pointer border-white/12 bg-white/6 hover:bg-white/7 hover:border-white/25"
                                : "cursor-pointer border-white/20 bg-white/8 hover:bg-white/12 hover:border-white/40")
                          }
                          onClick={() => {
                            if (isLocked) return
                            toggleNextActionChecked(action.titleKey)
                          }}
                          onKeyDown={(e) => {
                            if (isLocked) return
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggleNextActionChecked(action.titleKey)
                            }
                          }}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <button
                              type="button"
                              aria-label="toggle"
                              role="checkbox"
                              aria-checked={!!checkedNextActions[action.titleKey]}
                              disabled={isLocked}
                              className={
                                "mt-[1px] h-4 w-4 shrink-0 rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 " +
                                (isLocked
                                  ? "cursor-not-allowed border-white/25 bg-black/20"
                                  : checkedNextActions[action.titleKey]
                                    ? "border-emerald-300/60 bg-emerald-400/25"
                                    : "border-white/30 bg-black/20 hover:bg-white/8")
                              }
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isLocked) return
                                toggleNextActionChecked(action.titleKey)
                              }}
                            />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div
                                  className={
                                    "text-xs font-semibold leading-snug line-clamp-1 min-w-0 " +
                                    (isLocked
                                      ? "text-white"
                                      : checkedNextActions[action.titleKey]
                                        ? "text-white/60 line-through decoration-white/30"
                                        : "text-white")
                                  }
                                >
                                  {safeT(action.titleKey)}
                                </div>
                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200 shrink-0 whitespace-nowrap">
                                  {action.isPro
                                    ? safeT("results.nextActions.proBadge")
                                    : safeT("results.nextActions.freeBadge")}
                                </span>
                              </div>

                              <div
                                className={
                                  "mt-1 text-[11px] leading-snug line-clamp-2 min-w-0 " +
                                  (isLocked
                                    ? "text-slate-300 blur-[3px] select-none"
                                    : checkedNextActions[action.titleKey]
                                      ? "text-slate-300/70"
                                      : "text-slate-300")
                                }
                              >
                                {safeT(action.descKey)}
                              </div>

                              {isLocked ? (
                                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                  <Lock className="h-3.5 w-3.5" />
                                  <button
                                    type="button"
                                    className="hover:text-slate-200"
                                    onClick={handleUpgrade}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClickCapture={(e) => e.stopPropagation()}
                                  >
                                    {safeT("results.nextActions.lockLine")}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )

                      return nodes
                    })
                  })()}
                </div>
              </CardContent>
            </Card>

            <section id="insights-section" className="mt-3 scroll-mt-32 hidden sm:block">
              {renderInsightsSection("desktop")}
            </section>

            <div className="hidden sm:block">
              <Card className="mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{t("results.cta.trust")}</div>

                  <h2 className="mt-2 text-lg font-semibold">{t("results.cta.title")}</h2>

                  <div className="mt-2 text-xs text-muted-foreground leading-snug">
                    {t("results.cta.intro")}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>{t("results.cta.bullets.1")}</li>
                    <li>{t("results.cta.bullets.2")}</li>
                    <li>{t("results.cta.bullets.3")}</li>
                    <li>{t("results.cta.bullets.4")}</li>
                  </ul>

                  <Button
                    type="button"
                    className="mt-4 bg-emerald-500 hover:bg-emerald-600"
                    onClick={() => {
                      window.open("https://forms.gle/REPLACE_WITH_YOUR_FORM", "_blank")
                    }}
                  >
                    {t("results.cta.button")}
                  </Button>
                </CardContent>
              </Card>
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
    />
  )
}
