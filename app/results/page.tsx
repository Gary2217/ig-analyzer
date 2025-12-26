"use client"

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
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-0">
      <div
        className="h-12 w-12 rounded-full"
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
      <div className="leading-tight min-w-0">
        <div className="text-sm font-semibold text-white truncate">{label}</div>
        {subLabel ? <div className="text-xs text-white/60 truncate">{subLabel}</div> : null}
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

export default function ResultsPage() {
  console.log("[LocaleResultsPage] mounted")

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

  const [mediaLoaded, setMediaLoaded] = useState(false)

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

  const uiCopy = {
    avgLikesLabel: isZh ? "平均按讚" : "Avg Likes",
    avgCommentsLabel: isZh ? "平均留言" : "Avg Comments",
    perPostLast25: isZh ? "每篇平均（最近 25 篇）" : "Per post (last 25)",
    topPostsSortHint: isZh ? "依（按讚＋留言）排序（最近 25 篇）" : "Sorted by likes + comments (last 25)",
  }

  const igProfile = ((igMe as any)?.profile ?? igMe) as any
  const isConnected = Boolean(((igMe as any)?.connected ? igProfile?.username : igMe?.username))
  const connectedProvider = searchParams.get("connected")
  const isConnectedInstagram = connectedProvider === "instagram"

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
    router.refresh()
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

    console.log("[media] fetch (from ConnectedGate)")
    fetch("/api/instagram/media", { cache: "no-store", credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (__DEV__) {
          const rawLen = Array.isArray(json?.data) ? json.data.length : 0
          console.log("[media] response received:", { hasDataArray: Array.isArray(json?.data), dataLength: rawLen, hasPaging: !!json?.paging })
        }
        setMedia(normalizeMedia(json))
        setMediaLoaded(true)
      })
      .catch((err) => {
        console.error("[media] fetch failed", err)
      })
  }, [isConnected, pathname, forceReloadTick, r])

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

    let cancelled = false
    const run = async () => {
      setIgMeLoading(true)
      setIgMeUnauthorized(false)
      setConnectEnvError(null)
      try {
        const r = await fetch("/api/auth/instagram/me", { cache: "no-store" })
        if (cancelled) return

        if (r.status === 401) {
          setIgMe(null)
          setIgMeUnauthorized(true)
          return
        }

        if (!r.ok) {
          setIgMe(null)
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
      } catch {
        if (!cancelled) setIgMe(null)
      } finally {
        if (!cancelled) setIgMeLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [forceReloadTick])

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

  return (
    <ConnectedGate
      notConnectedUI={
        <>
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

          {igMeUnauthorized && (
            <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 sm:px-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Instagram 連線已失效</div>
                  <div className="mt-1 text-[13px] text-white/70 leading-relaxed">
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

          {igMeLoading || loading ? (
            <>
              <main
                data-scroll-container
                className="w-full flex items-center justify-center bg-[#0b1220] px-4 py-16 overflow-x-hidden"
              >
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                  <p>{t("results.states.loading")}</p>
                </div>
              </main>
            </>
          ) : igMeUnauthorized ? (
            <>
              <main
                data-scroll-container
                className="w-full flex items-center justify-center bg-[#0b1220] px-4 py-16 overflow-x-hidden"
              >
                <Card className="w-full max-w-2xl rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-2xl sm:text-3xl font-bold text-white">
                    {t("results.instagram.connectGate.title")}
                  </CardTitle>
                  <p className="text-sm text-slate-300 mt-2">{t("results.instagram.connectGate.desc")}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {connectEnvError === "missing_env" && (
                    <Alert>
                      <AlertTitle>{t("results.instagram.missingEnv.title")}</AlertTitle>
                      <AlertDescription>
                        <div className="space-y-2">
                          <div>{t("results.instagram.missingEnv.desc")}</div>
                          <div className="font-mono text-xs break-all">APP_BASE_URL / META_APP_ID / META_APP_SECRET</div>
                          <div>{t("results.instagram.missingEnv.restartHint")}</div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg"
                      onClick={handleConnect}
                      disabled={igMeLoading}
                    >
                      {t("results.instagram.connectGate.cta")}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg"
                      onClick={() => router.push(localePathname("/", activeLocale))}
                    >
                      {t("results.instagram.connectGate.back")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              </main>
            </>
          ) : !hasResult ? (
            <>
              <main
                data-scroll-container
                className="w-full flex items-center justify-center bg-[#0b1220] px-4 py-16 overflow-x-hidden"
              >
                <Alert>
                  <AlertTitle>{t("results.states.noResultsTitle")}</AlertTitle>
                  <AlertDescription>{t("results.states.noResultsDesc")}</AlertDescription>
                  <Button className="mt-4" onClick={() => router.push(localePathname("/", activeLocale))}>
                    {t("results.actions.backToHome")}
                  </Button>
                </Alert>
              </main>
            </>
          ) : (
            <main
              data-scroll-container
              className="w-full bg-gradient-to-b from-[#0b1220]/100 via-[#0b1220]/95 to-[#0b1220]/90 overflow-x-hidden"
            >
          <div className="border-b border-white/10 bg-[#0b1220]/60 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!isConnected && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-200 border border-white/10">
                        {t("results.badges.demo")}
                      </span>
                    )}
                    {isConnected && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-200 border border-emerald-400/20">
                        {t("results.instagram.connectedBadge")}
                      </span>
                    )}
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20">
                      {safeResult.platform === "instagram"
                        ? t("results.platform.instagram")
                        : t("results.platform.threads")}
                    </span>
                    {!isConnected && (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-200 border border-emerald-400/20"
                        title={t("results.badges.modeHint")}
                      >
                        {t("results.badges.inferredA")}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-white truncate">{t("results.title")}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {!isConnected && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                      onClick={() => router.push(localePathname("/post-analysis", activeLocale))}
                    >
                      {t("results.actions.analyzePost")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={handleExport}
                    disabled={exporting}
                    aria-busy={exporting ? true : undefined}
                  >
                    {t("results.actions.export")}
                  </Button>
                  {displayUsername && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                      onClick={handleShare}
                      aria-busy={shareCopied ? true : undefined}
                    >
                      {shareCopied ? t("results.actions.copied") : t("results.actions.share")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            {!isConnected && (
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{t("results.title")}</h1>
                <p className="text-sm text-slate-300 max-w-2xl">
                  {t("results.subtitle")}
                </p>
                <div className="text-xs text-slate-400 max-w-3xl">
                  <span className="font-medium text-slate-300">{t("results.badges.inferredA")}</span> {t("results.badges.inferredDesc")}
                </div>
              </div>
            )}

          <Card id="overview-section" className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg scroll-mt-40">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <div className="text-sm text-slate-300">{t("results.overview.kicker")}</div>
                  <div className="flex items-center gap-4 min-w-0">
                    {isConnected && igProfile?.profile_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(igProfile.profile_picture_url)}
                        alt={`@${String(igProfile?.username ?? "")}`}
                        className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border border-white/10 object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-600/40 border border-white/10 flex items-center justify-center shrink-0">
                        <Instagram className="h-5 w-5 text-slate-100" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight min-w-0 truncate">
                          {isConnected ? `@${igMe!.username}` : t("results.instagram.connectPromptTitle")}
                        </div>
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20 shrink-0">
                          {safeResult.platform === "instagram" ? (
                            <Instagram className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <span className="h-3.5 w-3.5 rounded-full bg-blue-200/80 shrink-0" />
                          )}
                          {safeResult.platform === "instagram" ? t("results.platform.instagram") : t("results.platform.threads")}
                        </span>
                        {isConnected && igMe?.account_type && (
                          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-200 border border-white/10 shrink-0">
                            {igMe.account_type}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-2 text-sm text-slate-300 min-w-0">
                        <AtSign className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {isConnected ? `@${String(igProfile?.username ?? "")}` : t("results.instagram.connectPromptHandle")}
                        </span>
                      </div>
                      {isConnected && typeof igProfile?.followers_count === "number" && (
                        <div className="mt-1 text-sm text-slate-300">
                          {t("results.instagram.followersLabel")}: {Number(igProfile.followers_count).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  {!isConnected && (
                    <div className="text-sm text-slate-300 max-w-2xl">{t("results.instagram.connectPromptDesc")}</div>
                  )}
                  {isConnected && (
                    <div className="text-sm text-slate-300 max-w-2xl">{headerInsight}</div>
                  )}
                  {safeResult.platform === "threads" && (
                    <div className="text-xs text-slate-400 max-w-2xl">
                      {t("results.overview.threadsNote")}
                    </div>
                  )}
                  {isConnected && (
                    <div className="text-sm text-slate-200/90 max-w-3xl">
                      {reportSummaryLine}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  {!isConnected && (
                    <Button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                      onClick={handleConnect}
                      disabled={igMeLoading}
                    >
                      {t("results.instagram.connectCta")}
                    </Button>
                  )}
                  {false && (
                    <Button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                      onClick={handleUpgrade}
                    >
                      {t("results.actions.upgrade")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(() => {
                  const tone = metricTone(authenticityStatus)
                  return (
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => focusKpi("authenticity")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") focusKpi("authenticity")
                      }}
                      className={`rounded-xl border ${tone.border} ${tone.bg} h-full cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 ${activeKpi === "authenticity" ? "ring-2 ring-blue-500/40" : ""}`}
                    >
                      <CardContent className="p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-200">{t("results.metrics.authenticity.title")}</div>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                          >
                            {toneLabel(tone.label)}
                          </span>
                        </div>
                        <div className="mt-3 text-3xl font-bold text-white">{safeResult.confidenceScore}%</div>
                        <div className="mt-1 text-sm text-slate-300">{t("results.metrics.authenticity.desc")}</div>
                        <div className="mt-1 text-xs text-slate-400">{t("results.metrics.authenticity.note")}</div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {(() => {
                  const tone = metricTone(engagementStatus)
                  return (
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => focusKpi("engagement")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") focusKpi("engagement")
                      }}
                      className={`rounded-xl border ${tone.border} ${tone.bg} h-full cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 ${activeKpi === "engagement" ? "ring-2 ring-blue-500/40" : ""}`}
                    >
                      <CardContent className="p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-200">{t("results.metrics.engagement.title")}</div>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                          >
                            {toneLabel(tone.label)}
                          </span>
                        </div>
                        <div className="mt-3 text-3xl font-bold text-white">{engagementPercent}%</div>
                        <div className="mt-1 text-sm text-slate-300">{t("results.metrics.engagement.desc")}</div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {(() => {
                  const tone = metricTone(automationStatus)
                  return (
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => focusKpi("automation")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") focusKpi("automation")
                      }}
                      className={`rounded-xl border ${tone.border} ${tone.bg} h-full cursor-pointer transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 ${activeKpi === "automation" ? "ring-2 ring-blue-500/40" : ""}`}
                    >
                      <CardContent className="p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-200">{t("results.metrics.automation.title")}</div>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                          >
                            {toneLabel(tone.label)}
                          </span>
                        </div>
                        <div className="mt-3 text-3xl font-bold text-white">{automationRiskPercent}%</div>
                        <div className="mt-1 text-sm text-slate-300">{t("results.metrics.automation.desc")}</div>
                      </CardContent>
                    </Card>
                  )
                })()}
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 sm:mt-10 space-y-6 sm:space-y-8">
            {isConnected && (
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">{t("results.instagram.recentPostsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {Array.isArray(recentPosts) && recentPosts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recentPosts.slice(0, 3).map((m) => {
                        const caption = typeof m.caption === "string" ? m.caption : ""
                        const mediaUrl = typeof m.media_url === "string" ? m.media_url : ""
                        const ts = typeof m.timestamp === "string" ? m.timestamp : ""
                        const dateLabel = ts ? new Date(ts).toLocaleString() : ""

                        return (
                          <div key={m.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
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
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-300">{t("results.performance.kicker")}</div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">{t("results.performance.title")}</h2>
              </div>
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="text-slate-200 hover:bg-white/5 inline-flex items-center gap-3"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="leading-relaxed">{t("results.actions.back")}</span>
              </Button>
            </div>

            {/* Responsive grid: 手機 1 欄；有 sidebar 時 md+ 並排，無 sidebar 則單欄撐滿 */}
            <div className="grid grid-cols-1 gap-8 lg:gap-6">
              <div className="w-full lg:col-span-2 space-y-6 lg:space-y-4">
                <Card id="results-section-performance" className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
                  <CardHeader className="border-b border-white/10">
                    <CardTitle className="text-2xl lg:text-2xl font-bold flex items-center justify-between gap-3 min-w-0">
                      <span className="min-w-0 truncate">{t("results.performance.cardTitle")}</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-800/50 shrink-0">
                        {safeResult.platform === "instagram"
                          ? t("results.platform.instagram")
                          : t("results.platform.threads")}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6">
                    <div className="space-y-4">
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
                  <CardHeader className="border-b border-white/10">
                    <CardTitle className="text-xl lg:text-xl font-bold">{t("results.monetization.title")}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6">
                    <p className="text-xs text-slate-400 mb-3">
                      {t("results.monetization.subtitle")}
                    </p>
                    <div className="relative rounded-xl border border-white/10 bg-white/5 p-4 md:p-6">
                      <div className={!isSubscribed ? "blur-sm pointer-events-none select-none" : undefined}>
                        <MonetizationSection 
                          monetizationGap={18} // This would be calculated from the analysis in a real app
                          isSubscribed={isSubscribed}
                        />
                      </div>

                      {!isSubscribed && (
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#0b1220]/80 backdrop-blur-sm p-4 md:p-6">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                              <div className="space-y-3">
                                <div className="text-sm text-slate-200">
                                  {t("results.monetization.paywall.stat")}
                                </div>
                                <div className="text-sm text-slate-300">
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
                    <CardHeader className="border-b border-white/10">
                      <CardTitle className="text-xl lg:text-xl font-bold">{t("results.insights.title")}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6">
                      <div className="space-y-4 lg:space-y-3">
                        <div className="grid grid-cols-2 gap-6 lg:gap-4">
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
                                  <span className="leading-relaxed">{noteLabel(note)}</span>
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
                    <CardHeader className="border-b border-white/10">
                      <CardTitle className="text-base">{t("results.sidebar.title")}</CardTitle>
                      <p className="text-sm text-slate-400 mt-1 lg:mt-0.5">
                        {t("results.sidebar.subtitle")} @{displayUsername}
                      </p>
                    </CardHeader>
                    <div className="flex-1 lg:overflow-y-auto">
                      <CardContent className="p-4 md:p-6 pb-6 lg:pb-4">
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
              <CardHeader className="border-b border-white/10">
                <CardTitle className="text-xl lg:text-xl font-bold">{t("results.next.title")}</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  {t("results.next.subtitle")}
                </p>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
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
                        <CardContent className="p-4 md:p-6 h-full">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">{t("results.next.step1")}</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-slate-300 leading-relaxed">{t("results.next.desc1")}</div>
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
                        <CardContent className="p-4 md:p-6 h-full">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">{t("results.next.step2")}</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-slate-300 leading-relaxed">{t("results.next.desc2")}</div>
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
                        <CardContent className="p-4 md:p-6 h-full">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">{t("results.next.step3")}</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${tone.text} ${tone.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-3 text-sm text-slate-300 leading-relaxed">{t("results.next.desc3")}</div>
                        </CardContent>
                      </Card>
                    )
                  })()}
                </div>

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card
                    id="next-1"
                    className={`rounded-xl border border-white/10 bg-white/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      activeNextId === "next-1" ? "ring-2 ring-blue-500/40" : ""
                    }`}
                  >
                    <CardContent className="p-4 md:p-6">
                      <div className="text-sm font-semibold text-white">{t("results.next.s1.title")}</div>
                      <div className="mt-2 text-sm text-slate-300 leading-relaxed">{t("results.next.s1.line1")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-relaxed">{t("results.next.s1.line2")}</div>
                    </CardContent>
                  </Card>
                  <Card
                    id="next-2"
                    className={`rounded-xl border border-white/10 bg-white/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      activeNextId === "next-2" ? "ring-2 ring-blue-500/40" : ""
                    }`}
                  >
                    <CardContent className="p-4 md:p-6">
                      <div className="text-sm font-semibold text-white">{t("results.next.s2.title")}</div>
                      <div className="mt-2 text-sm text-slate-300 leading-relaxed">{t("results.next.s2.line1")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-relaxed">{t("results.next.s2.line2")}</div>
                    </CardContent>
                  </Card>
                  <Card
                    id="next-3"
                    className={`rounded-xl border border-white/10 bg-white/5 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                      activeNextId === "next-3" ? "ring-2 ring-blue-500/40" : ""
                    }`}
                  >
                    <CardContent className="p-4 md:p-6">
                      <div className="text-sm font-semibold text-white">{t("results.next.s3.title")}</div>
                      <div className="mt-2 text-sm text-slate-300 leading-relaxed">{t("results.next.s3.line1")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-relaxed">{t("results.next.s3.line2")}</div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {false && (
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl lg:text-xl font-bold">{t("results.copyable.title")}</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">
                    {t("results.copyable.subtitle")}
                  </p>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
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
                  <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                    {t("results.copyable.disclaimer")}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="mt-12 lg:mt-8 space-y-6">
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
                        <div className="mt-1 text-xs text-white/70 leading-relaxed">{t("results.footer.proPitchDesc")}</div>
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
          </div>
        </main>
      )}

          {isProModalOpen && (
            <div className="fixed inset-0 z-[70] pointer-events-none">
              <div className="pointer-events-auto">
                <div className="absolute inset-x-4 sm:inset-x-6 md:inset-x-0 md:left-1/2 md:-translate-x-1/2 top-24 md:top-28 md:w-[640px] rounded-2xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
                  <div className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mt-1 text-lg font-semibold text-white leading-snug">{t("results.footer.proModalTitle")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-relaxed">{t("results.footer.proModalDesc")}</div>
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

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
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
          <div className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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

          <div className="px-6 pb-6">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-muted-foreground">
                {t("results.preview.heading")}
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                {t("results.preview.description")}
              </p>
            </div>

            <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {igProfile?.profile_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(igProfile.profile_picture_url)}
                        alt={displayHandle}
                        className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border border-white/10 object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border border-white/10 bg-white/10 shrink-0" />
                    )}

                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="text-lg font-semibold text-white truncate">
                        {displayName}
                      </div>
                      <div className="text-sm text-slate-300 truncate">
                        {displayHandle}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex min-w-0 items-baseline gap-1">
                          <span className="whitespace-nowrap">Followers</span>
                          <span className="min-w-0 truncate font-medium tabular-nums text-foreground whitespace-nowrap">
                            {formatCompact(followersCount)}
                          </span>
                        </div>
                        <span className="text-muted-foreground/60">·</span>
                        <div className="flex min-w-0 items-baseline gap-1">
                          <span className="whitespace-nowrap">Following</span>
                          <span className="min-w-0 truncate font-medium tabular-nums text-foreground whitespace-nowrap">
                            {formatCompact(followsCount)}
                          </span>
                        </div>
                        <span className="text-muted-foreground/60">·</span>
                        <div className="flex min-w-0 items-baseline gap-1">
                          <span className="whitespace-nowrap">Posts</span>
                          <span className="min-w-0 truncate font-medium tabular-nums text-foreground whitespace-nowrap">
                            {formatCompact(mediaCount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center justify-center">
                    <div className="grid grid-cols-3 gap-4 xl:gap-6 md:min-w-[360px] text-center">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{activeLocale === "zh-TW" ? "粉絲數" : t("results.instagram.followersLabel")}</div>
                        <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-2xl font-semibold text-white leading-none min-w-0">
                          <span className="tabular-nums whitespace-nowrap">{formatNum(followers)}</span>
                          {isPreview(kpiFollowers) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.followingLabel")}</div>
                        <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-2xl font-semibold text-white leading-none min-w-0">
                          <span className="tabular-nums whitespace-nowrap">{formatNum(following)}</span>
                          {isPreview(kpiFollowing) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.postsLabel")}</div>
                        <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-2xl font-semibold text-white leading-none min-w-0">
                          <span className="tabular-nums whitespace-nowrap">{formatNum(posts)}</span>
                          {isPreview(kpiPosts) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-auto lg:hidden md:flex-[1.2] md:flex md:justify-center">
                    <div className="grid grid-cols-3 gap-4 md:gap-6 md:min-w-[360px] text-center">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{activeLocale === "zh-TW" ? "粉絲數" : t("results.instagram.followersLabel")}</div>
                        <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-2xl font-semibold text-white leading-none min-w-0">
                          <span className="tabular-nums whitespace-nowrap">{formatNum(followers)}</span>
                          {isPreview(kpiFollowers) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.followingLabel")}</div>
                        <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-2xl font-semibold text-white leading-none min-w-0">
                          <span className="tabular-nums whitespace-nowrap">{formatNum(following)}</span>
                          {isPreview(kpiFollowing) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.postsLabel")}</div>
                        <div className="mt-1 text-[clamp(16px,5vw,24px)] sm:text-2xl font-semibold text-white leading-none min-w-0">
                          <span className="tabular-nums whitespace-nowrap">{formatNum(posts)}</span>
                          {isPreview(kpiPosts) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:flex flex-col justify-center max-w-[360px] min-w-[220px] text-right px-1 sm:px-2">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                        {safeT("results.proBadge")}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70">
                        {t(
                          selectedGoal
                            ? `results.positioning.labels.${selectedGoal}`
                            : "results.positioning.labels.default"
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-4">
              <div className="flex justify-end">
                <div className="text-[11px] text-muted-foreground">{t("results.proHint.rings")}</div>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      預覽
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
                    </>
                  )
                })()}
              </div>
            </div>

            <div id="kpis-section" className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 scroll-mt-40">
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
                      "rounded-xl border backdrop-blur-sm " +
                      (evalTone ? evalTone.container + " " : "bg-white/5 ") +
                      (isPrimary ? "border-white/25" : "border-white/10")
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className={"text-[15px] font-medium text-slate-100" + (isPrimary ? "" : "")}>{t(kpi.titleKey)}</div>
                        <div className="flex flex-col items-end gap-2">
                          {isSelected ? <div className="text-[11px] text-muted-foreground text-right">{focus}</div> : null}
                          {evalLevel ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                                  kpiEvaluationTone(evalLevel).pill
                                }
                              >
                                {safeT(`results.kpi.badgeLabels.${kpi.id}`)}
                              </span>
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

                      <div className="mt-1 text-[clamp(18px,5vw,32px)] sm:text-2xl font-semibold text-white min-w-0">
                        <span className="tabular-nums whitespace-nowrap">{kpi.value}</span>
                        {kpi.preview ? (
                          <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                            預覽
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[11px] sm:text-xs text-white/75 leading-tight line-clamp-2">{t(kpi.descriptionKey)}</div>
                      {safeT(`results.kpi.consequence.${kpi.id}`) ? (
                        <div className="mt-1 text-[11px] sm:text-xs text-white/45 leading-tight line-clamp-2">
                          {safeT(`results.kpi.consequence.${kpi.id}`)}
                        </div>
                      ) : null}

                      {evalNote ? (
                        <div className="mt-2 text-[11px] sm:text-xs text-muted-foreground leading-tight line-clamp-3">{evalNote}</div>
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

            <div className="mt-4 flex justify-center">
              <div className="h-px w-48 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </div>

            <Card className="text-slate-100 flex flex-col gap-6 transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-white/35 hover:shadow-2xl mt-3 rounded-2xl border border-white/30 bg-gradient-to-b from-white/10 via-white/5 to-white/3 ring-1 ring-white/20 shadow-2xl shadow-black/60 backdrop-blur-sm px-5 sm:px-6 py-5 sm:py-6 mb-8">
              <CardHeader className="pb-0">
                <CardTitle className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  {safeT("results.nextActions.title")}
                </CardTitle>
                <p className="mt-1 text-sm text-white/65 max-w-2xl">{safeT("results.nextActions.helperLine")}</p>
                <p className="mt-1 text-sm text-white/65 max-w-2xl">{safeT("results.nextActions.subtitle")}</p>
                <div className="mt-3 h-px w-full bg-white/10" />
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(() => {
                    let proDividerInserted = false
                    return activeGoalMeta.actions.flatMap((action) => {
                      const isLocked = action.isPro && !isPro
                      const shouldInsertDivider = action.isPro && !proDividerInserted
                      if (shouldInsertDivider) proDividerInserted = true
                      const nodes: ReactNode[] = []

                      if (shouldInsertDivider) {
                        nodes.push(
                          <div key="pro-divider" className="my-6 flex items-center gap-3 md:col-span-3">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-xs font-semibold text-purple-300">專業版解鎖內容</span>
                            <div className="h-px flex-1 bg-white/10" />
                          </div>
                        )
                      }

                      nodes.push(
                        <div
                          key={action.titleKey}
                          className="flex flex-col gap-2 rounded-xl border border-white/20 bg-white/8 px-4 py-3 sm:py-4 transition-all hover:bg-white/12 hover:border-white/40"
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-1 h-4 w-4 shrink-0 rounded border border-white/30 bg-black/20" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm font-semibold text-white leading-snug">
                                  {safeT(action.titleKey)}
                                </div>
                                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                                  {action.isPro
                                    ? safeT("results.nextActions.proBadge")
                                    : safeT("results.nextActions.freeBadge")}
                                </span>
                              </div>

                              <div
                                className={
                                  "mt-2 text-xs text-slate-300 leading-relaxed " +
                                  (isLocked ? "blur-[3px] select-none" : "")
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

            <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-white/18 to-transparent" />

            <Card
              id="goals-section"
              className="text-slate-100 flex flex-col gap-6 transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-white/35 hover:shadow-2xl mt-0 rounded-2xl border border-white/30 bg-gradient-to-b from-white/9 via-white/4 to-white/2 ring-1 ring-white/15 shadow-xl shadow-black/40 backdrop-blur-sm px-5 sm:px-6 py-5 sm:py-6 scroll-mt-40"
            >
              <CardHeader className="pb-0">
                <CardTitle className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                  {t("results.goals.title")}
                </CardTitle>
                <p className="mt-1 text-sm text-white/65 max-w-2xl">{t("results.goals.subtitle")}</p>
                <div className="mt-3 h-px w-full bg-white/10" />
              </CardHeader>
              <CardContent className="pt-0 px-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {goalOptions.map((opt) => {
                    const isSelected = selectedGoal === opt.id
                    return (
                      <div
                        key={opt.id}
                        role="button"
                        tabIndex={0}
                        className={
                          "select-none cursor-pointer min-h-[56px] flex items-center justify-center rounded-xl border px-3 py-3 text-sm sm:text-base font-medium transition-all duration-200 hover:bg-white/12 hover:border-white/30 hover:shadow-lg hover:shadow-black/30 hover:scale-[1.01] active:scale-[0.99] " +
                          (isSelected
                            ? "border-white/30 bg-white/6 text-white"
                            : "border-white/15 bg-white/6 text-slate-200")
                        }
                        onClick={() => {
                          setSelectedGoal((prev) => (prev === opt.id ? null : opt.id))
                          requestAnimationFrame(() => {
                            scrollToKpiSection()
                          })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedGoal((prev) => (prev === opt.id ? null : opt.id))
                            requestAnimationFrame(() => {
                              scrollToKpiSection()
                            })
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

            <Card id="top-posts-section" className="mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm scroll-mt-40">
              <CardHeader className="pb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base text-white truncate">{t("results.topPosts.title")}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground leading-tight line-clamp-2">
                    {t("results.topPosts.description")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground leading-tight line-clamp-1">{uiCopy.topPostsSortHint}</p>
                </div>

                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      router.push(`/${activeLocale}/post-analysis`)
                    }}
                    className="h-9 px-4 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 border border-white/10 w-full sm:w-auto shrink-0"
                  >
                    {activeLocale === "zh-TW" ? "前往貼文分析" : "Analyze Posts"}
                  </Button>

                  {!isPro ? (
                    <span
                      className="min-w-0 text-xs text-muted-foreground tabular-nums overflow-hidden text-ellipsis whitespace-nowrap sm:max-w-[220px]"
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
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(isConnected
                    ? (topPerformingPosts.length > 0
                        ? topPerformingPosts
                        : Array.from({ length: 3 }, (_, i) => ({ id: `loading-${i}` })))
                    : mockAnalysis.topPosts.slice(0, 3)
                  ).map((p: any, index: number) => (
                    <div key={String(p?.id ?? index)} className="rounded-xl border border-white/10 bg-white/5 p-4 min-w-0">
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
                          <div className="flex gap-3 min-w-0">
                            <div className="h-16 w-16 sm:h-20 sm:w-20 shrink-0">
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
                                    <span className="tabular-nums whitespace-nowrap">{ymd}</span>
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
                                <div className="mt-1 text-xs text-slate-200/85 leading-tight line-clamp-2 min-w-0">
                                  {caption}
                                </div>
                              ) : null}

                              <div className="mt-3 flex items-center justify-center gap-x-10 sm:gap-x-12 pr-6 sm:pr-8 min-w-0">
                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.likesLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className="tabular-nums whitespace-nowrap">
                                      {typeof likes === "number" && Number.isFinite(likes) ? Math.round(likes).toLocaleString() : "—"}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.commentsLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className="tabular-nums whitespace-nowrap">
                                      {typeof comments === "number" && Number.isFinite(comments)
                                        ? Math.round(comments).toLocaleString()
                                        : "—"}
                                    </span>
                                  </div>
                                </div>

                                <div className="min-w-0 text-center">
                                  <div className="text-xs text-slate-400 truncate">{t("results.topPosts.card.engagementLabel")}</div>
                                  <div className="mt-1 text-[clamp(16px,4.5vw,18px)] font-semibold text-white min-w-0">
                                    <span className="tabular-nums whitespace-nowrap">
                                      {typeof engagement === "number" && Number.isFinite(engagement)
                                        ? Math.round(engagement).toLocaleString()
                                        : "—"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 text-xs text-muted-foreground leading-tight line-clamp-2">
                                {t("results.topPosts.card.proHintFull")}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <section id="insights-section" className="mt-12 scroll-mt-32">
              <Card className="mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-white">{t("results.recommendations.title")}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {insights.map((insight) => (
                      <div key={insight.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold text-white">{insight.title}</div>
                          <div className="text-xs text-muted-foreground text-right">{t("results.insights.proHint")}</div>
                        </div>
                        <div className="mt-1 text-sm text-slate-300 leading-relaxed">{insight.description}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            <Card className="mt-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="text-xs text-muted-foreground">{t("results.cta.trust")}</div>

                <h2 className="mt-2 text-xl font-semibold">{t("results.cta.title")}</h2>

                <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {t("results.cta.intro")}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
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

          {isProModalOpen && (
            <div className="fixed inset-0 z-[70] pointer-events-none">
              <div className="pointer-events-auto">
                <div className="absolute inset-x-4 sm:inset-x-6 md:inset-x-0 md:left-1/2 md:-translate-x-1/2 top-24 md:top-28 md:w-[640px] rounded-2xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
                  <div className="p-4 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mt-1 text-lg font-semibold text-white leading-snug">{t("results.footer.proModalTitle")}</div>
                      <div className="mt-1 text-sm text-slate-300 leading-relaxed">{t("results.footer.proModalDesc")}</div>
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

                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
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
