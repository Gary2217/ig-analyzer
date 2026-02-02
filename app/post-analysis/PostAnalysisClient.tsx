"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Info, Lock, HelpCircle } from "lucide-react"
import { useRefetchTick } from "../lib/useRefetchTick"
import { getPostMetrics } from "../lib/postMetrics"
import { useAuthNavigation } from "../lib/useAuthNavigation"
import { useInstagramConnection } from "@/app/components/InstagramConnectionProvider"

const isValidPostUrl = (s: string) => /instagram\.com|threads\.net/i.test((s || "").trim())

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object")

const pickFirst = (...candidates: unknown[]) => {
  for (const v of candidates) {
    if (v !== undefined && v !== null && v !== "") return v
  }
  return ""
}

function coerceToUrlLike(raw: string) {
  const s = (raw || "").trim()
  if (!s) return s
  if (/^(instagram\.com|www\.instagram\.com|m\.instagram\.com|threads\.net|www\.threads\.net)/i.test(s)) {
    return `https://${s}`
  }
  return s
}

function normalizePermalink(raw: string) {
  const s0 = coerceToUrlLike(raw)
  try {
    const u = new URL(s0)
    const host = u.hostname.toLowerCase()
    if (host === "instagram.com" || host === "m.instagram.com") {
      u.hostname = "www.instagram.com"
    }
    if (host === "threads.net") {
      u.hostname = "www.threads.net"
    }
    u.search = ""
    u.hash = ""
    if (!u.pathname.endsWith("/")) u.pathname += "/"
    return u.toString()
  } catch {
    return (raw || "").trim()
  }
}

const SA_PA_CACHE_TTL = 10 * 60_000
const SA_PA_CACHE_KEY = (url: string) => `sa_cache_post_analysis_v1:${encodeURIComponent(url)}`

function saReadPACache(url: string) {
  try {
    if (typeof window === "undefined") return null
    const u = typeof url === "string" ? url.trim() : ""
    if (!u) return null
    const raw = window.sessionStorage.getItem(SA_PA_CACHE_KEY(u))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const ts = parsed?.ts
    const data = parsed?.data
    if (typeof ts !== "number") return null
    if (Date.now() - ts > SA_PA_CACHE_TTL) return null
    return data ?? null
  } catch {
    return null
  }
}

function saWritePACache(url: string, data: any) {
  try {
    if (typeof window === "undefined") return
    const u = typeof url === "string" ? url.trim() : ""
    if (!u) return
    window.sessionStorage.setItem(SA_PA_CACHE_KEY(u), JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // ignore
  }
}

function saSleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function saFetchWithRetry(input: RequestInfo | URL, init?: RequestInit) {
  let lastErr: unknown = null
  const attempts: Array<{ delayMs: number }> = [{ delayMs: 0 }, { delayMs: 150 }, { delayMs: 400 }]

  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i].delayMs) await saSleep(attempts[i].delayMs)
    try {
      const res = await fetch(input, init)
      if (res.status === 401 || res.status === 403) return res
      if (!res.ok) {
        const e: any = new Error(`http_${res.status}`)
        e.status = res.status
        try {
          e.body = await res.text()
        } catch {
          // ignore
        }
        throw e
      }
      return res
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("fetch_failed")
}

type InferredStatus = "Good" | "Moderate" | "Needs Improvement"

type InferredMetric = {
  title: string
  status: InferredStatus
  detail: string
}

function toneForStatus(status: InferredStatus): { label: string; classes: string } {
  if (status === "Good") {
    return {
      label: "Good",
      classes: "bg-emerald-500/10 text-emerald-200 border-emerald-400/20",
    }
  }
  if (status === "Moderate") {
    return {
      label: "Moderate",
      classes: "bg-amber-500/10 text-amber-200 border-amber-400/20",
    }
  }
  return {
    label: "Needs Improvement",
    classes: "bg-rose-500/10 text-rose-200 border-rose-400/20",
  }
}

const numMono = "tabular-nums"

function SafeIgThumb(props: { src: string; alt?: string; className: string }) {
  const { src, alt, className } = props
  const [broken, setBroken] = useState(false)

  const cls = useMemo(() => {
    const c = String(className || "").trim()
    return c ? `${c} relative` : "relative"
  }, [className])

  useEffect(() => {
    setBroken(false)
  }, [src])

  const isVideoUrl = useMemo(() => {
    const u = typeof src === "string" ? src.trim() : ""
    if (!u) return false
    return /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)
  }, [src])

  const shouldShowPlaceholder = broken || !src || isVideoUrl

  if (shouldShowPlaceholder) {
    return (
      <div className={cls} aria-label={alt || "Video"}>
        <div className="absolute inset-0 bg-white/5" />
        <div className="relative text-white/70 text-[11px] font-semibold">Video</div>
      </div>
    )
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt || ""}
      className={cls}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}

export default function PostAnalysisClient() {
  const { locale, t } = useI18n()
  const router = useRouter()
  const pathname = usePathname() || ""
  const searchParams = useSearchParams()

  const igConn = useInstagramConnection()

  const refetchTick = useRefetchTick({ enabled: true, throttleMs: 900 })
  const [manualRefreshTick, setManualRefreshTick] = useState(0)

  const isZh = typeof locale === "string" && locale.startsWith("zh")

  const copy = useMemo(
    () =>
      isZh
        ? {
            officialBadge: "官方（C）",
            officialBadgeEn: "",
            officialUnavailable:
              "尚未取得官方指標（需要授權或目前無法讀取）。你仍可使用推論結果（A）做優化。",
            officialUnavailableTitle: "官方指標尚未提供",
            retry: "重新嘗試",
            refresh: "重新整理",
            dataSource: "資料來源",
            dataSourceA: "A 推論",
            dataSourceC: "C 官方",
            updated: "更新",
            justNow: "剛剛",
            officialKpiHint: "下列為 IG 官方指標（若無法讀取會顯示 —）。",
            officialErrorFriendly:
              "目前無法讀取官方指標（可能是授權/網路/權限）。你仍可使用推論結果（A）。",
            errorDetail: "錯誤",
            kpiLikeNote: "互動量較多，內容引發回應",
            kpiCommentZeroNote: "討論量較少，可嘗試在文案加入提問",
            kpiErNeedsReach: "需要官方觸及或曝光資料才能計算",
            kpiRelAbove: "高於帳號近期平均",
            kpiRelBelow: "低於帳號近期平均",
            kpiRelClose: "接近帳號近期平均",
            kpiNoBaseline: "官方互動指標，未提供帳號近期基準，暫不進行比較",
            kpiDistributionNote: "官方曝光指標，數值受平台分發與發佈時機影響",
            kpiUnavailable: "IG 未提供此貼文的官方洞察資料（常見於舊貼文或部分帳號）",
            timelineTitle: "貼文互動曲線",
            timelineTitleEn: "Post Interaction Trend",
            timelineSubtitle: "選擇指標顯示趨勢（可多選）",
            timelineEmpty: "目前尚未提供互動時間分佈資料",
            timelineEmptySecondary:
              "IG 官方目前不提供單篇互動的時間分佈；若之後取得時間序列資料，將自動顯示曲線。",
            timelineSelectedEmpty: "目前選取的指標沒有足夠的時間序列資料可繪製",
            timelineAxisHours: "X：小時",
            timelineAxisDays: "X：天",
            timelineMetricReach: "觸及",
            timelineMetricImpressions: "曝光",
            timelineMetricLikes: "喜歡",
            timelineMetricComments: "留言",
            timelineMetricEngagementRate: "互動率",
            timelineFast: "互動集中在發佈初期",
            timelineSteady: "互動隨時間穩定累積",
            insightsNoticeTitle: "說明",
            insightsNoticeBody: "Instagram 並非每一則貼文都會提供官方洞察數據。\n若貼文未被納入官方洞察計算（例如未進入推薦流程），將無法顯示觸及、曝光與互動率等指標。",
            comparedToAvg: "相較帳號近期平均",
            comparedToAvgInferred: "相較帳號近期平均（推論）",
            comparedToRecentShort: "相較近期平均",
            comparedToRecentWithN: "相較帳號近期平均（最近 {n} 篇）",
            avgAbove: "較多",
            avgBelow: "較少",
            avgNear: "接近",
            baselineTooltipInferredWithN:
              "此比較根據你最近 {n} 篇貼文的表現推算，僅供趨勢參考，非官方保證數值。",
            baselineTooltipOfficial: "此比較來自帳號整體表現基準。",
            baselineDisclaimer:
              "此比較為根據你帳號近期貼文表現推算，僅供趨勢參考，非官方保證數值。",
            analysisFailed: "分析失敗。請確認連結可公開開啟，或稍後再試。",
            errorTitle: "發生錯誤",
            engagementRate: "互動率",
          }
        : {
            officialBadge: "Official (C)",
            officialBadgeEn: "",
            officialUnavailable:
              "Official metrics aren’t available (authorization required or not accessible). You can still use inferred signals (A).",
            officialUnavailableTitle: "Official metrics unavailable",
            retry: "Retry",
            refresh: "Refresh",
            dataSource: "Data source",
            dataSourceA: "A inferred",
            dataSourceC: "C official",
            updated: "Updated",
            justNow: "just now",
            officialKpiHint: "These are official IG metrics (unavailable ones show —).",
            officialErrorFriendly:
              "We can’t load official metrics right now (auth/network/permission). You can still use inferred signals (A).",
            errorDetail: "Error",
            kpiLikeNote: "Higher interaction volume — the content is prompting responses.",
            kpiCommentZeroNote: "Low discussion volume — consider adding a question CTA.",
            kpiErNeedsReach: "Requires reach or impressions to calculate.",
            kpiRelAbove: "Above your recent account average",
            kpiRelBelow: "Below your recent account average",
            kpiRelClose: "Close to your recent account average",
            kpiNoBaseline: "Official interaction metric without a recent account baseline",
            kpiDistributionNote: "Official distribution metric influenced by platform delivery and timing",
            kpiUnavailable: "This metric isn’t available from the platform",
            timelineTitle: "Post Interaction Trend",
            timelineTitleEn: "",
            timelineSubtitle: "Toggle metrics to show trends (multi-select)",
            timelineEmpty: "Interaction timeline data isn’t available yet.",
            timelineEmptySecondary:
              "Instagram doesn’t provide time-distribution for single-post interactions here. The chart will appear automatically when timeline data is available.",
            timelineSelectedEmpty: "The selected metrics don’t have enough timeline points to draw a chart.",
            timelineAxisHours: "X: hours",
            timelineAxisDays: "X: days",
            timelineMetricReach: "Reach",
            timelineMetricImpressions: "Impressions",
            timelineMetricLikes: "Likes",
            timelineMetricComments: "Comments",
            timelineMetricEngagementRate: "Engagement rate",
            timelineFast: "Most interactions happen soon after posting",
            timelineSteady: "Interactions accumulate steadily over time",
            insightsNoticeTitle: "Note",
            insightsNoticeBody: "Instagram does not provide official insights for every post.\nIf a post is not included in official insights calculation (for example, not entering the recommendation flow), reach, impressions, and engagement rate will not be available.",
            comparedToAvg: "Compared to your recent account average",
            comparedToAvgInferred: "Compared to your recent account average (inferred)",
            comparedToRecentShort: "Compared to recent average",
            comparedToRecentWithN: "Compared to your recent account average (last {n} posts)",
            avgAbove: "Above average",
            avgBelow: "Below average",
            avgNear: "Near average",
            baselineTooltipInferredWithN:
              "This comparison is inferred from your last {n} posts and provided for trend reference only. It is not an official metric.",
            baselineTooltipOfficial: "This comparison is based on your account-level baseline.",
            baselineDisclaimer:
              "This comparison is inferred from your recent posts and provided for trend reference only. It is not an official metric.",
            analysisFailed: "Analysis failed. Please check the link is publicly accessible and try again.",
            errorTitle: "Something went wrong",
            engagementRate: "Engagement rate",
          },
    [isZh],
  )

  const tt = (k: string, fbKey: string) => {
    try {
      const s = t(k)
      if (typeof s !== "string") return t(fbKey)
      if (s === k) return t(fbKey)
      return s
    } catch {
      return t(fbKey)
    }
  }

  const looksLikeI18nKey = (s: string) => {
    const v = String(s || "").trim()
    if (!v) return false
    if (v.startsWith("post.")) return true
    return /^[a-z0-9]+\.[a-z0-9_.-]+$/i.test(v)
  }

  const safeSentenceOr = (s: string, fbKey: string) => {
    const v = String(s || "").trim()
    if (!v) return t(fbKey)
    if (looksLikeI18nKey(v)) return t(fbKey)
    return v
  }
  const sectionCard =
    "rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md"
  const sectionInner = "p-4 sm:p-6"
  const sectionInnerCompact = "p-4 sm:p-5"
  const sectionSpaceCompact = "space-y-3 sm:space-y-4"
  const subtleDivider = "border-t border-white/10"
  const FREE_LIMIT = 3
  const STORAGE_KEY = "sa_free_post_credits_v1"
  const LS_USED = "sa_post_analysis_used"
  const LS_REMAINING = "sa_post_analysis_remaining"
  const LS_LIMIT = "sa_post_analysis_limit"
  const LS_TOP_POSTS = "sa_top_posts_v1"
  const [postUrl, setPostUrl] = useState("")
  const [hasAnalysis, setHasAnalysis] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const isConnected = igConn.isConnected
  const [officialPost, setOfficialPost] = useState<any | null>(null)
  const [officialLoading, setOfficialLoading] = useState(false)
  const [officialError, setOfficialError] = useState<null | { status: number; code?: string }>(null)
  const [lastAnalyzedUrl, setLastAnalyzedUrl] = useState<string>("")
  const [summaryMode, setSummaryMode] = useState<"short" | "detailed">("short")
  const [toast, setToast] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null)
  const [copyToast, setCopyToast] = useState<null | { ts: number; msg: string }>(null)
  const [headerCopied, setHeaderCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({
    a1: true,
    a2: false,
    a3: false,
  })

  const [quickTop3, setQuickTop3] = useState<any[]>([])
  const [quickTop3Ts, setQuickTop3Ts] = useState<number | null>(null)
  const [quickPickStatus, setQuickPickStatus] = useState<"loading" | "ready" | "empty">("loading")

  const resolveNumericShortcut = (raw: string) => {
    const s = (raw || "").trim()
    if (!/^\d+$/.test(s)) return null
    const n = Number(s)
    if (!Number.isFinite(n)) return null
    if (n < 1 || n > 3) return null
    const picked = quickTop3?.[n - 1]
    const link = typeof picked?.permalink === "string" ? picked.permalink.trim() : ""
    return link || null
  }

  const quickPickThumbSrc = useMemo(() => {
    const url = typeof postUrl === "string" ? postUrl.trim() : ""
    if (!url) return ""

    const match = quickTop3.find((p: any) => {
      const link = typeof p?.permalink === "string" ? p.permalink.trim() : ""
      return link && link === url
    })

    const thumb = typeof match?.thumbnail_url === "string" ? match.thumbnail_url : ""
    const media = typeof match?.media_url === "string" ? match.media_url : ""
    return (thumb && thumb.trim()) || (media && media.trim()) || ""
  }, [postUrl, quickTop3])

  const previewThumbSrc = useMemo(() => {
    const officialThumb = typeof (officialPost as any)?.media?.thumbnail_url === "string" ? String((officialPost as any).media.thumbnail_url) : ""
    const officialMedia = typeof (officialPost as any)?.media?.media_url === "string" ? String((officialPost as any).media.media_url) : ""
    const thumb = typeof (analysisResult as any)?.thumbnail_url === "string" ? String((analysisResult as any).thumbnail_url) : ""
    const media = typeof (analysisResult as any)?.media_url === "string" ? String((analysisResult as any).media_url) : ""

    const isVideo = (u: string) => /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)
    const pick = (u: string) => {
      const s = String(u || "").trim()
      if (!s) return ""
      if (isVideo(s)) return ""
      return s
    }

    return pick(officialThumb) || pick(officialMedia) || pick(thumb) || pick(media) || ""
  }, [analysisResult, officialPost])

  const safeImgSrc = useMemo(() => {
    const isVideo = (u: string) => /\.mp4(\?|$)/i.test(u) || /\/o1\/v\//i.test(u)
    return (u: string) => {
      const s = String(u || "").trim()
      if (!s) return ""
      if (isVideo(s)) return ""
      return s
    }
  }, [])

  const [freeUsed, setFreeUsed] = useState(0)

  const resultsRef = useRef<HTMLDivElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const urlSectionRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const postUrlInputRef = useRef<HTMLInputElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const imgErrorLoggedRef = useRef<Record<string, boolean>>({})
  const officialAbortRef = useRef<AbortController | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const loggedAnalysisShapeRef = useRef(false)
  const officialFetchGuardRef = useRef<{ url: string; ts: number } | null>(null)
  const analysisGuardRef = useRef<{ url: string; ts: number } | null>(null)
  const sameUrlConfirmRef = useRef<{ url: string; ts: number } | null>(null)
  const quickPickGuardRef = useRef<{ url: string; ts: number } | null>(null)
  const didOauthRefetchRef = useRef(false)

  const scrollToPostUrl = () => {
    const getStickyOffset = () => {
      const candidates = [
        document.querySelector("[data-sticky-header]"),
        document.querySelector("header"),
        document.querySelector("[role='banner']"),
        document.querySelector(".sticky"),
      ].filter(Boolean) as Element[]

      for (const el of candidates) {
        const rect = (el as HTMLElement).getBoundingClientRect()
        const height = Math.round(rect.height || 0)
        if (height >= 40 && height <= 200) return height + 12
      }

      return 96
    }

    const el = document.getElementById("post-url-section")
    if (!el) return

    const OFFSET = getStickyOffset()
    const top = el.getBoundingClientRect().top + window.scrollY - OFFSET
    window.scrollTo({ top, behavior: "smooth" })

    window.setTimeout(() => {
      postUrlInputRef.current?.focus()
      postUrlInputRef.current?.select?.()
    }, 200)
  }

  const freeRemaining = Math.max(0, FREE_LIMIT - freeUsed)

  const devBypass = useMemo(() => {
    if (process.env.NODE_ENV !== "production") return true
    if (typeof window === "undefined") return false
    const host = window.location.hostname || ""
    if (host.includes("localhost") || host.includes("trycloudflare.com")) return true
    const sp = new URLSearchParams(window.location.search)
    return sp.get("debug") === "1" || sp.get("bypass") === "1"
  }, [])

  const formatCount = (template: string, params: { count: number; limit: number }) => {
    return template
      .replace("{count}", String(params.count))
      .replace("{limit}", String(params.limit))
  }

  const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

  const readInt = (key: string) => {
    try {
      const v = window.localStorage.getItem(key)
      const n = Number.parseInt(v ?? "", 10)
      return Number.isFinite(n) ? n : null
    } catch {
      return null
    }
  }

  const writeInt = (key: string, n: number) => {
    try {
      window.localStorage.setItem(key, String(n))
    } catch {
      // ignore
    }
  }

  const readFreeUsed = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return 0
      const parsed = JSON.parse(raw) as { used?: number } | null
      const used = typeof parsed?.used === "number" ? parsed.used : 0
      if (!Number.isFinite(used) || used < 0) return 0
      return Math.min(FREE_LIMIT, Math.floor(used))
    } catch {
      return 0
    }
  }

  const writeFreeUsed = (used: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ used }))
    } catch {
      // ignore
    }
  }

  const writeQuotaSnapshot = (used: number) => {
    try {
      const limit = FREE_LIMIT
      const safeUsed = clampInt(used, 0, limit)
      const remaining = Math.max(0, limit - safeUsed)
      writeInt(LS_LIMIT, limit)
      writeInt(LS_USED, safeUsed)
      writeInt(LS_REMAINING, remaining)
    } catch {
      // ignore
    }
  }

  const consumeFreeOnce = () => {
    const used = readFreeUsed()
    const nextUsed = Math.min(FREE_LIMIT, used + 1)
    writeFreeUsed(nextUsed)
    writeQuotaSnapshot(nextUsed)
    setFreeUsed(nextUsed)
  }

  const goPricingFreeLimit = () => {
    router.push(`/${locale}/pricing?src=post-analysis&reason=free_limit`)
  }

  const guardAnalyze = () => {
    if (isAnalyzing || officialLoading) {
      showToast(t("post.toast.busy"))
      return
    }
    if (!canAnalyze) {
      showToast(t("post.toast.invalidUrl"))
      return
    }

    setAnalyzeError(null)

    const base = normalizePermalink((postUrl || "").trim())
    const picked = resolveNumericShortcut(base)
    const url = normalizePermalink((picked || base).trim())

    if (picked) {
      setPostUrl(url)
      requestAnimationFrame(() => {
        urlSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
      window.setTimeout(() => inputRef.current?.focus?.(), 0)
    }

    if (!isValidPostUrl(url)) {
      requestAnimationFrame(() => {
        urlSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
      window.setTimeout(() => inputRef.current?.focus?.(), 0)
      return
    }

    // Also update input so user sees the cleaned canonical link.
    setPostUrl(url)

    if (freeRemaining <= 0 && !devBypass) {
      goPricingFreeLimit()
      return
    }
    if (!devBypass) consumeFreeOnce()
    void handleAnalyze(url)
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    // Initialize legacy storage (existing behavior)
    const legacyUsed = readFreeUsed()

    // Prefer explicit post-analysis keys if present; otherwise use legacy.
    const limit = readInt(LS_LIMIT) ?? FREE_LIMIT
    const remainingFromLs = readInt(LS_REMAINING)
    const usedFromLs = readInt(LS_USED)

    const used = (() => {
      if (remainingFromLs !== null) {
        const r = clampInt(remainingFromLs, 0, limit)
        return clampInt(limit - r, 0, limit)
      }
      if (usedFromLs !== null) return clampInt(usedFromLs, 0, limit)
      return clampInt(legacyUsed, 0, limit)
    })()

    setFreeUsed(used)
    writeQuotaSnapshot(used)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const urlFromQuery = searchParams?.get("url") || ""
    if (urlFromQuery) {
      setPostUrl((prev) => {
        const p = typeof prev === "string" ? prev.trim() : ""
        const next = String(urlFromQuery).trim()
        if (!next) return prev
        if (!isValidPostUrl(next)) return prev
        if (!p) return next
        if (p !== next) return next
        return prev
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Read snapshot written by Results (SSOT). Fallback to legacy key to avoid empty state.
  useEffect(() => {
    try {
      if (typeof window === "undefined") return

      const rawSnap = window.localStorage.getItem("sa_top_posts_snapshot_v1")
      if (rawSnap) {
        const parsed = JSON.parse(rawSnap)
        const items = parsed?.items
        const ts = parsed?.ts
        if (Array.isArray(items) && items.length > 0) {
          setQuickTop3(items.slice(0, 3))
          setQuickTop3Ts(typeof ts === "number" ? ts : null)
          setQuickPickStatus("ready")
          return
        }
      }

      // Legacy fallback (older builds): sa_top_posts_v1 was an array
      const rawLegacy = window.localStorage.getItem("sa_top_posts_v1")
      if (rawLegacy) {
        const legacy = JSON.parse(rawLegacy)
        if (Array.isArray(legacy) && legacy.length > 0) {
          setQuickTop3(legacy.slice(0, 3))
          setQuickTop3Ts(null)
          setQuickPickStatus("ready")
          return
        }
      }

      setQuickTop3([])
      setQuickTop3Ts(null)
      setQuickPickStatus("empty")
    } catch {
      setQuickTop3([])
      setQuickTop3Ts(null)
      setQuickPickStatus("empty")
    }
  }, [])

  const platformLabel = (platform: "instagram" | "threads") =>
    platform === "threads" ? t("post.platform.threads") : t("post.platform.instagram")

  const inferredStatusLabel = (status: InferredStatus) => {
    if (status === "Good") return t("post.health.status.good")
    if (status === "Moderate") return t("post.health.status.moderate")
    return t("post.health.status.needsImprovement")
  }

  const inferredPlatform = useMemo<"instagram">(() => {
    return "instagram"
  }, [postUrl])

  const sourceDomain = useMemo(() => {
    return "instagram.com"
  }, [postUrl, t])

  const previewData = useMemo(() => {
    const ar = analysisResult

    const get = (obj: unknown, path: string): unknown => {
      try {
        if (!obj || !path) return ""
        const parts = String(path).split(".").filter(Boolean)
        let cur: unknown = obj
        for (const p of parts) {
          if (!isRecord(cur)) return ""
          cur = (cur as Record<string, unknown>)[p]
        }
        if (cur === undefined || cur === null) return ""
        return cur
      } catch {
        return ""
      }
    }

    const arObj = isRecord(ar) ? (ar as Record<string, unknown>) : null
    const permalink = String(
      pickFirst(
        arObj?.permalink,
        arObj?.ig_permalink,
        arObj?.url,
        get(ar, "data.permalink"),
        get(ar, "data.ig_permalink"),
        get(ar, "post.permalink"),
        get(ar, "post.ig_permalink"),
        get(ar, "media.permalink"),
        get(ar, "media.ig_permalink"),
        postUrl,
      ),
    ).trim()

    const mediaTypeRaw = String(
      pickFirst(
        arObj?.media_type,
        arObj?.mediaType,
        arObj?.type,
        arObj?.media_product_type,
        arObj?.mediaProductType,
        get(ar, "data.media_type"),
        get(ar, "data.mediaProductType"),
        get(ar, "data.media_product_type"),
        get(ar, "post.media_type"),
        get(ar, "post.mediaProductType"),
        get(ar, "post.media_product_type"),
        get(ar, "media.media_type"),
        get(ar, "media.mediaProductType"),
        get(ar, "media.media_product_type"),
      ),
    ).trim()

    const mediaTypeNorm = mediaTypeRaw.toUpperCase()
    const mediaTypeKey = (() => {
      if (mediaTypeNorm === "REELS" || mediaTypeNorm.includes("REEL")) return "reel"
      if (mediaTypeNorm === "VIDEO" || mediaTypeNorm.includes("VIDEO")) return "video"
      if (mediaTypeNorm === "CAROUSEL_ALBUM" || mediaTypeNorm === "CAROUSEL" || mediaTypeNorm.includes("CAROUSEL")) return "carousel"
      if (mediaTypeNorm === "IMAGE" || mediaTypeNorm.includes("IMAGE") || mediaTypeNorm.includes("PHOTO")) return "photo"
      return ""
    })()

    const thumb = String(
      pickFirst(arObj?.thumbnail_url, arObj?.thumbnailUrl, arObj?.media_url, arObj?.mediaUrl, arObj?.image_url, arObj?.imageUrl),
    ).trim()

    const caption = String(
      pickFirst(
        arObj?.caption,
        arObj?.text,
        arObj?.message,
        get(ar, "data.caption"),
        get(ar, "post.caption"),
        get(ar, "media.caption"),
        get(ar, "data.text"),
        get(ar, "post.text"),
        get(ar, "media.text"),
      ),
    ).trim()

    const timestampRaw = pickFirst(
      arObj?.timestamp,
      arObj?.created_time,
      arObj?.createdAt,
      arObj?.taken_at,
      arObj?.takenAt,
      arObj?.time,
      get(ar, "data.timestamp"),
      get(ar, "data.created_time"),
      get(ar, "data.createdAt"),
      get(ar, "data.taken_at"),
      get(ar, "post.timestamp"),
      get(ar, "post.created_time"),
      get(ar, "post.createdAt"),
      get(ar, "post.taken_at"),
      get(ar, "media.timestamp"),
      get(ar, "media.created_time"),
      get(ar, "media.createdAt"),
      get(ar, "media.taken_at"),
    )
    const tsMs = (() => {
      if (timestampRaw === undefined || timestampRaw === null || timestampRaw === "") return null

      if (typeof timestampRaw === "number" && Number.isFinite(timestampRaw)) {
        return timestampRaw < 1e12 ? Math.round(timestampRaw * 1000) : Math.round(timestampRaw)
      }

      const s = String(timestampRaw).trim()
      if (!s) return null

      if (/^\d+$/.test(s)) {
        const n = Number(s)
        if (!Number.isFinite(n)) return null
        return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
      }

      const ms = Date.parse(s)
      return Number.isFinite(ms) ? ms : null
    })()

    const timeLabel = (() => {
      if (!tsMs) return t("post.preview.time.unknown")
      const diff = Date.now() - tsMs
      if (!Number.isFinite(diff) || diff < 0) return t("post.preview.time.unknown")

      const hours = Math.floor(diff / 36e5)
      if (hours < 48) {
        const n = Math.max(1, hours)
        return t("post.preview.time.hoursAgo").replace("{n}", String(n))
      }

      const days = Math.floor(hours / 24)
      if (days < 14) {
        const n = Math.max(1, days)
        return t("post.preview.time.daysAgo").replace("{n}", String(n))
      }

      const d = new Date(tsMs)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      return `${y}/${m}/${dd}`
    })()

    const platformRaw = String(pickFirst(ar?.platform, ar?.provider, ar?.source)).trim().toLowerCase()
    const platform = platformRaw === "threads" ? "threads" : "instagram"
    const platformLabelText = platformLabel(platform)

    const mediaTypeI18nKey = (() => {
      if (!mediaTypeKey) return "unknown"
      if (mediaTypeKey === "photo") return "image"
      if (mediaTypeKey === "reel") return "reels"
      return mediaTypeKey
    })()
    const mediaTypeLabel = tt(`post.preview.mediaType.${mediaTypeI18nKey}`, "post.preview.mediaType.unknown")
    const hasAny = Boolean(permalink || mediaTypeKey || thumb || tsMs)

    return {
      hasAny,
      platform,
      platformLabel: platformLabelText,
      permalink,
      permalinkRaw: permalink,
      mediaTypeKey,
      mediaTypeLabel,
      thumb,
      caption,
      mediaTypeRaw,
      timestampRaw,
      tsMs,
      timeLabel,
    }
  }, [analysisResult, postUrl, t, tt])

  const looksLikeSupportedUrl = useMemo(() => {
    const u = postUrl.toLowerCase().trim()
    if (!u) return true
    return isValidPostUrl(u)
  }, [postUrl])

  const normalizedPostUrl = useMemo(() => {
    const raw = typeof postUrl === "string" ? postUrl : ""
    return raw.trim()
  }, [postUrl])

  const isValidIgPostOrReelUrl = useMemo(() => {
    const raw = normalizedPostUrl
    if (!raw) return false

    const coerceUrl = (s: string) => {
      const v = s.trim()
      if (!v) return null
      try {
        return new URL(v)
      } catch {
        try {
          return new URL(`https://${v.replace(/^\/+/, "")}`)
        } catch {
          return null
        }
      }
    }

    const u = coerceUrl(raw)
    if (!u) return false
    const host = u.hostname.toLowerCase()
    const pathname = u.pathname || ""

    const isIgHost = host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am"
    if (!isIgHost) return false

    // Accept: /p/<code>, /reel/<code>, /reels/<code> (allow trailing slash)
    return /^\/(p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.test(pathname)
  }, [normalizedPostUrl])

  const inferredMetrics: InferredMetric[] = useMemo(
    () => [
      {
        title: t("post.health.metrics.hook.title"),
        status: "Moderate",
        detail: t("post.health.metrics.hook.detail"),
      },
      {
        title: t("post.health.metrics.clarity.title"),
        status: "Moderate",
        detail: t("post.health.metrics.clarity.detail"),
      },
      {
        title: t("post.health.metrics.readability.title"),
        status: "Needs Improvement",
        detail: t("post.health.metrics.readability.detail"),
      },
      {
        title: t("post.health.metrics.interaction.title"),
        status: "Moderate",
        detail: t("post.health.metrics.interaction.detail"),
      },
      {
        title: t("post.health.metrics.dropoff.title"),
        status: "Needs Improvement",
        detail: t("post.health.metrics.dropoff.detail"),
      },
    ],
    [t]
  )

  const inferredQualityScore = useMemo(() => {
    const scoreFor = (s: InferredStatus) => {
      if (s === "Good") return 80
      if (s === "Moderate") return 55
      return 30
    }
    const scores = inferredMetrics.map((m) => scoreFor(m.status))
    if (!scores.length) return 55
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return Math.round(avg)
  }, [inferredMetrics])

  const qualityLabel = useMemo(() => {
    if (inferredQualityScore >= 70) return "Good" as const
    if (inferredQualityScore >= 45) return "Moderate" as const
    return "Needs Improvement" as const
  }, [inferredQualityScore])

  const tldrPrimaryIssue = useMemo(() => {
    const hook = inferredMetrics?.[0]
    const clarity = inferredMetrics?.[1]
    const readability = inferredMetrics?.[2]

    if (hook && hook.status !== "Good") return "hook" as const
    if (clarity && clarity.status !== "Good") return "clarity" as const
    if (readability && readability.status !== "Good") return "readability" as const
    return "none" as const
  }, [inferredMetrics])

  const actualPerfSignal = useMemo(() => {
    const reach = (officialPost as any)?.insights?.reach
    const impressions = (officialPost as any)?.insights?.impressions
    if (reach === null || reach === undefined || impressions === null || impressions === undefined) {
      return { has: false, reach: null as number | null, impressions: null as number | null, ratio: null as number | null }
    }
    const r = Number(reach)
    const i = Number(impressions)
    if (!Number.isFinite(r) || !Number.isFinite(i) || r <= 0 || i <= 0) {
      return { has: true, reach: Number.isFinite(r) ? r : null, impressions: Number.isFinite(i) ? i : null, ratio: null as number | null }
    }
    return { has: true, reach: r, impressions: i, ratio: i / r }
  }, [officialPost])

  const officialInterpretation = useMemo(() => {
    if (!(officialPost as any)?.ok) return ""
    const reach = (officialPost as any)?.insights?.reach
    const impressions = (officialPost as any)?.insights?.impressions
    const qOk = qualityLabel === "Good" || qualityLabel === "Moderate"

    if (reach !== null && reach !== undefined && impressions !== null && impressions !== undefined) {
      const r = Number(reach)
      const i = Number(impressions)
      if (Number.isFinite(r) && Number.isFinite(i) && r > 0 && i > r) {
        if (i > r * 1.6) return t("post.official.interpretation.seenButLowRetention")
      }
    }

    if (qOk) return t("post.official.interpretation.distribution")
    return t("post.official.interpretation.content")
  }, [officialPost, qualityLabel, t])

  const contrastConclusion = useMemo(() => {
    if (!(officialPost as any)?.ok) return { badge: "", body: "" }
    const reach = (officialPost as any)?.insights?.reach
    const impressions = (officialPost as any)?.insights?.impressions
    const actual = reach ?? impressions
    if (actual === null || actual === undefined) return { badge: "", body: "" }

    const ratio = actualPerfSignal.ratio
    const actualLow = typeof ratio === "number" ? ratio >= 1.6 : false
    const actualHigh = typeof ratio === "number" ? ratio <= 1.2 : false

    if (qualityLabel === "Good" && actualLow) {
      return {
        badge: t("post.contrast.conclusion.badge.distribution"),
        body: t("post.contrast.conclusion.body.distribution"),
      }
    }
    if (qualityLabel === "Needs Improvement" && actualLow) {
      return {
        badge: t("post.contrast.conclusion.badge.content"),
        body: t("post.contrast.conclusion.body.content"),
      }
    }
    if (qualityLabel !== "Needs Improvement" && actualHigh) {
      return {
        badge: t("post.contrast.conclusion.badge.success"),
        body: t("post.contrast.conclusion.body.success"),
      }
    }
    return {
      badge: t("post.contrast.conclusion.badge.mixed"),
      body: t("post.contrast.conclusion.body.mixed"),
    }
  }, [actualPerfSignal.ratio, officialPost, qualityLabel, t])

  const tldrText = useMemo(() => {
    const ok = qualityLabel === "Good" || qualityLabel === "Moderate"
    const actualLow = typeof actualPerfSignal.ratio === "number" ? actualPerfSignal.ratio >= 1.6 : false
    const actualHigh = typeof actualPerfSignal.ratio === "number" ? actualPerfSignal.ratio <= 1.2 : false

    if (ok && actualHigh) return t("post.summary.body.success")
    if (ok && actualLow) {
      if (tldrPrimaryIssue === "hook") return t("post.summary.body.okButLow.hook")
      if (tldrPrimaryIssue === "clarity") return t("post.summary.body.okButLow.clarity")
      return t("post.summary.body.okButLow.generic")
    }
    if (!ok && actualLow) return t("post.summary.body.low.low")
    if (!ok) {
      if (tldrPrimaryIssue === "hook") return t("post.summary.body.low.hook")
      return t("post.summary.body.low.generic")
    }
    return t("post.summary.body.neutral")
  }, [actualPerfSignal.ratio, qualityLabel, t, tldrPrimaryIssue])

  const underperformReasons = useMemo(
    () => [
      tt("post.underperform.reasons.1", "post.underperform.reasons.1"),
      tt("post.underperform.reasons.2", "post.underperform.reasons.2"),
      tt("post.underperform.reasons.3", "post.underperform.reasons.3"),
    ],
    [t]
  )

  const rewriteSuggestions = useMemo(
    () => ({
      hooks: [
        tt("post.rewrite.hooks.1", "post.quick.fallback.hook"),
        tt("post.rewrite.hooks.2", "post.quick.fallback.hook"),
        tt("post.rewrite.hooks.3", "post.quick.fallback.hook"),
      ],
      ctas: [
        tt("post.rewrite.ctas.1", "post.quick.fallback.cta"),
        tt("post.rewrite.ctas.2", "post.quick.fallback.cta"),
      ],
      visuals: [
        tt("post.rewrite.visuals.1", "post.quick.fallback.visual"),
        tt("post.rewrite.visuals.2", "post.quick.fallback.visual"),
        tt("post.rewrite.visuals.3", "post.quick.fallback.visual"),
      ],
    }),
    [t]
  )

  const rankedQuick = useMemo(() => {
    const hook = {
      id: "a1",
      title: t("post.quick.items.a1"),
      body: safeSentenceOr(rewriteSuggestions.hooks[0], "post.quick.fallback.hook"),
      tier: 1 as const,
    }
    const cta = {
      id: "a2",
      title: t("post.quick.items.a2"),
      body: safeSentenceOr(rewriteSuggestions.ctas[0], "post.quick.fallback.cta"),
      tier: 2 as const,
    }
    const visual = {
      id: "a3",
      title: t("post.quick.items.a3"),
      body: safeSentenceOr(rewriteSuggestions.visuals[0], "post.quick.fallback.visual"),
      tier: 3 as const,
    }

    return {
      top: [hook],
      next: [cta].filter((x) => Boolean(x.body)).slice(0, 2),
      later: [visual].filter((x) => Boolean(x.body)),
    }
  }, [rewriteSuggestions, t])

  const copyBlock = useMemo(() => {
    const base = `${t("post.copy.snapshotTitle")}\n\n${t("post.copy.mode")}: ${
      isConnected ? t("post.mode.official") : t("post.mode.inferred")
    }\n${t("post.copy.postUrl")}: ${postUrl || t("post.copy.notProvided")}\n\n${t("post.copy.keySignals")}\n- ${t("post.health.metrics.hook.title")}: ${inferredMetrics[0]?.status}\n- ${t("post.health.metrics.clarity.title")}: ${inferredMetrics[1]?.status}\n- ${t("post.health.metrics.readability.title")}: ${inferredMetrics[2]?.status}\n- ${t("post.health.metrics.interaction.title")}: ${inferredMetrics[3]?.status}\n- ${t("post.health.metrics.dropoff.title")}: ${inferredMetrics[4]?.status}\n`

    const c = isConnected
      ? `\n${t("post.copy.officialSection")}\n- ${t("post.official.metrics.reach")}: ${(officialPost as any)?.insights?.reach ?? "—"}\n- ${t("post.official.metrics.impressions")}: ${(officialPost as any)?.insights?.impressions ?? "—"}\n- ${t("post.official.metrics.likes")} / ${t("post.official.metrics.comments")}: ${(officialPost as any)?.counts?.like_count ?? "—"} / ${(officialPost as any)?.counts?.comments_count ?? "—"}\n`
      : ""

    const disclaimer = `\n${t("post.copy.disclaimer") }\n`

    return `${base}${c}${disclaimer}`
  }, [inferredMetrics, isConnected, officialPost, postUrl, t])

  const shortCopyBlock = useMemo(() => {
    const lines = [
      t("post.copy.shortTitle"),
      `${t("post.preview.source")}: ${sourceDomain}`,
      `${t("post.copy.link")}: ${postUrl || t("post.copy.notProvided")}`,
      "",
      t("post.copy.topSignals"),
      `- ${t("post.health.metrics.hook.title")}: ${inferredMetrics[0]?.status}`,
      `- ${t("post.health.metrics.clarity.title")}: ${inferredMetrics[1]?.status}`,
      `- ${t("post.health.metrics.readability.title")}: ${inferredMetrics[2]?.status}`,
      "",
      t("post.copy.shortDisclaimer"),
    ]
    return `${lines.join("\n")}\n`
  }, [inferredMetrics, postUrl, sourceDomain, t])

  const proSummaryText = useMemo(() => {
    const mode = isConnected ? t("post.mode.official") : t("post.mode.inferred")
    const linkLine = `${t("post.copy.link")}: ${postUrl || t("post.copy.notProvided")}`
    const topSignals = [
      `- ${t("post.health.metrics.hook.title")}: ${inferredMetrics[0]?.status}`,
      `- ${t("post.health.metrics.clarity.title")}: ${inferredMetrics[1]?.status}`,
      `- ${t("post.health.metrics.readability.title")}: ${inferredMetrics[2]?.status}`,
    ].join("\n")

    const suggestions = [
      `${t("post.copy.rec.1")}: ${rewriteSuggestions.hooks[0]}`,
      `${t("post.copy.rec.2")}: ${rewriteSuggestions.ctas[0]}`,
      `${t("post.copy.rec.3")}: ${rewriteSuggestions.visuals[0]}`,
      `${t("post.copy.rec.4")}: ${underperformReasons[0]}`,
    ]
      .filter(Boolean)
      .slice(0, 5)
      .join("\n")

    const officialLines = (() => {
      if (!isConnected) return ""
      if (!(officialPost as any)?.ok) return ""
      const reach = (officialPost as any)?.insights?.reach
      const impressions = (officialPost as any)?.insights?.impressions
      const plays = (officialPost as any)?.insights?.plays
      const saved = (officialPost as any)?.insights?.saved
      const shares = (officialPost as any)?.insights?.shares
      const likes = (officialPost as any)?.counts?.like_count
      const comments = (officialPost as any)?.counts?.comments_count

      const lines: string[] = []
      lines.push(t("post.copy.officialSection"))
      if (reach !== null && reach !== undefined) lines.push(`- ${t("post.official.metrics.reach")}: ${formatMetric(reach)}`)
      if (impressions !== null && impressions !== undefined)
        lines.push(`- ${t("post.official.metrics.impressions")}: ${formatMetric(impressions)}`)
      if (likes !== null && likes !== undefined) lines.push(`- ${t("post.official.metrics.likes")}: ${formatMetric(likes)}`)
      if (comments !== null && comments !== undefined) lines.push(`- ${t("post.official.metrics.comments")}: ${formatMetric(comments)}`)
      if (plays !== null && plays !== undefined) lines.push(`- ${t("post.official.metrics.plays")}: ${formatMetric(plays)}`)
      if (saved !== null && saved !== undefined) lines.push(`- ${t("post.official.metrics.saves")}: ${formatMetric(saved)}`)
      if (shares !== null && shares !== undefined) lines.push(`- ${t("post.official.metrics.shares")}: ${formatMetric(shares)}`)
      return lines.length ? `\n${lines.join("\n")}` : ""
    })()

    const officialVsInferred = (() => {
      if (!isConnected) return ""
      if (!(officialPost as any)?.ok) return ""
      const reach = (officialPost as any)?.insights?.reach
      const impressions = (officialPost as any)?.insights?.impressions
      const a = reach ?? impressions
      if (a === null || a === undefined) return ""

      const officialPart = reach !== null && reach !== undefined ? `${t("post.official.metrics.reach")} ${formatMetric(reach)}` : `${t("post.official.metrics.impressions")} ${formatMetric(impressions)}`
      return t("post.share.officialVsInferred")
        .replace("{official}", officialPart)
        .replace("{inferred}", `${inferredQualityScore}/100`)
    })()

    const quickWins = (() => {
      const items = [rewriteSuggestions.hooks?.[0], rewriteSuggestions.ctas?.[0]].filter(Boolean).slice(0, 2)
      if (!items.length) return ""
      return `${t("post.share.quickWins")}\n- ${items[0]}${items[1] ? `\n- ${items[1]}` : ""}`
    })()

    const lines = [
      t("post.share.reportTitle"),
      "",
      `${t("post.copy.mode")}: ${mode} (${t("post.copy.modeHint")})`,
      linkLine,
      officialLines ? "" : "",
      officialLines ? officialLines.trimEnd() : "",
      officialVsInferred ? "" : "",
      officialVsInferred ? officialVsInferred : "",
      "",
      t("post.copy.topSignals"),
      topSignals,
      "",
      t("post.copy.recommendations"),
      suggestions,
      quickWins ? "" : "",
      quickWins ? quickWins : "",
    ]

    const cleaned = lines.filter((x, idx) => {
      if (x === "" && lines[idx - 1] === "") return false
      return true
    })

    return `${cleaned.join("\n")}\n`
  }, [inferredMetrics, inferredQualityScore, isConnected, officialPost, postUrl, rewriteSuggestions, underperformReasons, t])

  const fullExportText = useMemo(() => {
    const lines = [
      proSummaryText.trimEnd(),
      "",
      t("post.export.assumptions"),
      t("post.export.notOfficial"),
    ]
    return `${lines.join("\n")}\n`
  }, [proSummaryText, t])

  const canAnalyze = postUrl.trim().length > 0

  const { isAuthenticated, navigateToProtected } = useAuthNavigation()

  const beginOAuth = (nextUrl: string) => {
    const next = nextUrl || `/${locale}/post-analysis`
    navigateToProtected(next)
  }

  const parseTsMs = (raw: any) => {
    try {
      if (!raw) return null
      if (typeof raw === "number" && Number.isFinite(raw)) return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw)
      const s = String(raw).trim()
      if (!s) return null
      if (/^\d+$/.test(s)) {
        const n = Number(s)
        if (!Number.isFinite(n)) return null
        return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
      }
      const ms = Date.parse(s)
      return Number.isFinite(ms) ? ms : null
    } catch {
      return null
    }
  }

  const formatRelativeTime = (tsLike: any) => {
    const tsMs = parseTsMs(tsLike)
    if (!tsMs) return t("post.preview.time.unknown")
    const diff = Date.now() - tsMs
    if (!Number.isFinite(diff) || diff < 0) return t("post.preview.time.unknown")

    const hours = Math.floor(diff / 36e5)
    if (hours < 48) {
      const n = Math.max(1, hours)
      return t("post.preview.time.hoursAgo").replace("{n}", String(n))
    }

    const days = Math.floor(hours / 24)
    if (days < 14) {
      const n = Math.max(1, days)
      return t("post.preview.time.daysAgo").replace("{n}", String(n))
    }

    const d = new Date(tsMs)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${y}/${m}/${dd}`
  }

  function formatMetric(v: any) {
    if (v === null || v === undefined) return "—"
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return "—"
    return n.toLocaleString()
  }

  const formatNumber = (v: any) => {
    if (v === null || v === undefined) return "—"
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return "—"
    const abs = Math.abs(n)
    const toFixed1 = (x: number) => {
      const s = x.toFixed(1)
      return s.endsWith(".0") ? s.slice(0, -2) : s
    }
    if (abs >= 1_000_000_000) return `${toFixed1(n / 1_000_000_000)}B`
    if (abs >= 1_000_000) return `${toFixed1(n / 1_000_000)}M`
    if (abs >= 10_000) return `${toFixed1(n / 1_000)}K`
    return n.toLocaleString()
  }

  const fmtTime = (ms: number | null) => {
    if (!ms) return copy.justNow
    const d = new Date(ms)
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    const diff = Date.now() - ms
    if (Number.isFinite(diff) && diff >= 0 && diff < 60_000) return copy.justNow
    return `${hh}:${mm}`
  }

  const extractOfficialMetrics = (analysis: any, official: any) => {
    const a = analysis as any
    const o = official as any

    const fromAnalysis = a?.officialMetrics || a?.official_metrics || a?.official || null
    const fromInsights = a?.insights || fromAnalysis?.insights || fromAnalysis || null
    const fromCounts = a?.counts || fromAnalysis?.counts || null

    const reach = fromInsights?.reach ?? o?.insights?.reach ?? null
    const impressions = fromInsights?.impressions ?? o?.insights?.impressions ?? null

    const likes =
      fromInsights?.likes ??
      fromCounts?.like_count ??
      fromCounts?.likes ??
      o?.counts?.like_count ??
      o?.counts?.likes ??
      null
    const comments =
      fromInsights?.comments ??
      fromCounts?.comments_count ??
      fromCounts?.comments ??
      o?.counts?.comments_count ??
      o?.counts?.comments ??
      null

    const saves = fromInsights?.saved ?? fromInsights?.saves ?? o?.insights?.saved ?? o?.insights?.saves ?? null
    const shares = fromInsights?.shares ?? o?.insights?.shares ?? null

    const metrics = { reach, impressions, likes, comments, saves, shares }
    const hasAny = Object.values(metrics).some((v) => v !== null && v !== undefined && Number.isFinite(Number(v)))
    return { metrics, hasAny }
  }

  const officialUnified = useMemo(() => extractOfficialMetrics(analysisResult, officialPost), [analysisResult, officialPost])

  const publicEngagement = useMemo(() => {
    const toNum = (v: any) => {
      const n = typeof v === "number" ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }

    const ar = analysisResult as any
    const op = officialPost as any

    if (!ar || typeof ar !== "object") {
      return { hasAny: false, metrics: { likes: null, comments: null, engagement: null } }
    }

    const likes = toNum(ar?.like_count ?? ar?.likes ?? ar?.counts?.like_count ?? ar?.counts?.likes)
    const comments = toNum(ar?.comments_count ?? ar?.comments ?? ar?.counts?.comments_count ?? ar?.counts?.comments)
    const engagement = typeof likes === "number" && typeof comments === "number" ? likes + comments : null

    const metrics = { likes, comments, engagement }
    const hasAny = Object.values(metrics).some((v) => typeof v === "number" && Number.isFinite(v))

    return { hasAny, metrics }
  }, [analysisResult, officialPost])

  const baseline = useMemo(() => {
    const toNum = (v: any) => {
      const n = typeof v === "number" ? v : Number(v)
      return Number.isFinite(n) ? n : null
    }
    const avgFrom = (vals: any[]) => {
      const xs = vals.map(toNum).filter((x): x is number => typeof x === "number" && Number.isFinite(x))
      if (!xs.length) return undefined
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }

    const ar: any = analysisResult as any
    const getPath = (obj: any, path: string) => {
      try {
        if (!obj || !path) return undefined
        const parts = String(path).split(".").filter(Boolean)
        let cur: any = obj
        for (const p of parts) {
          if (cur === null || cur === undefined) return undefined
          cur = cur[p]
        }
        return cur
      } catch {
        return undefined
      }
    }

    const fromAnalysis = {
      likesAvg: avgFrom([
        getPath(ar, "accountBaseline.likesAvg"),
        getPath(ar, "recentAverages.likes"),
        getPath(ar, "accountStats.likesAvg"),
        getPath(ar, "profileStats.likesAvg"),
        getPath(ar, "recentPostsAvg.likes"),
      ]),
      commentsAvg: avgFrom([
        getPath(ar, "accountBaseline.commentsAvg"),
        getPath(ar, "recentAverages.comments"),
        getPath(ar, "accountStats.commentsAvg"),
        getPath(ar, "profileStats.commentsAvg"),
        getPath(ar, "recentPostsAvg.comments"),
      ]),
      savesAvg: avgFrom([
        getPath(ar, "accountBaseline.savesAvg"),
        getPath(ar, "recentAverages.saves"),
        getPath(ar, "accountStats.savesAvg"),
        getPath(ar, "profileStats.savesAvg"),
        getPath(ar, "recentPostsAvg.saves"),
      ]),
      sharesAvg: avgFrom([
        getPath(ar, "accountBaseline.sharesAvg"),
        getPath(ar, "recentAverages.shares"),
        getPath(ar, "accountStats.sharesAvg"),
        getPath(ar, "profileStats.sharesAvg"),
        getPath(ar, "recentPostsAvg.shares"),
      ]),
    }

    const list = Array.isArray(quickTop3) ? quickTop3 : []
    const likesAvg = avgFrom(list.map((p: any) => (p?.like_count ?? p?.likes) as any))
    const commentsAvg = avgFrom(list.map((p: any) => (p?.comments_count ?? p?.comments) as any))
    const savesAvg = avgFrom(list.map((p: any) => (p?.saved ?? p?.saves ?? p?.save_count) as any))
    const sharesAvg = avgFrom(list.map((p: any) => (p?.shares ?? p?.share_count) as any))

    const metrics = {
      likesAvg: fromAnalysis.likesAvg ?? likesAvg,
      commentsAvg: fromAnalysis.commentsAvg ?? commentsAvg,
      savesAvg: fromAnalysis.savesAvg ?? savesAvg,
      sharesAvg: fromAnalysis.sharesAvg ?? sharesAvg,
    }

    const hasAny = Object.values(metrics).some((v) => typeof v === "number" && Number.isFinite(v))
    if (!hasAny) {
      return { hasAny: false, metrics: {} as typeof metrics, baselineSource: "inferred" as const, baselineWindow: "recent" as const, n: 0 }
    }

    const baselineSource =
      Object.values(fromAnalysis).some((v) => typeof v === "number" && Number.isFinite(v)) ? ("official" as const) : ("inferred" as const)

    return {
      hasAny: true,
      metrics,
      baselineSource,
      baselineWindow: "recent" as const,
      n: list.length,
    }
  }, [analysisResult, quickTop3])

  const dataSourceLabel = officialUnified.hasAny ? copy.dataSourceC : copy.dataSourceA

  const fetchOfficial = async (url: string) => {
    if (!isConnected) return
    const clean = normalizePermalink(String(url || "").trim())
    if (!clean || !isValidPostUrl(clean)) return

    const last = officialFetchGuardRef.current
    if (last && last.url === clean && Date.now() - last.ts < 10_000) {
      return
    }
    officialFetchGuardRef.current = { url: clean, ts: Date.now() }

    officialAbortRef.current?.abort()
    const controller = new AbortController()
    officialAbortRef.current = controller

    setOfficialLoading(true)
    setOfficialError(null)

    const timeoutId = window.setTimeout(() => controller.abort(), 12_000)
    try {
      const res = await fetch(`/api/instagram/post?url=${encodeURIComponent(clean)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      })

      const body = await res.json().catch(() => null)

      if (!res.ok) {
        setOfficialPost(null)
        setOfficialError({ status: res.status, code: body?.code })
        return
      }

      if (body && typeof body === "object" && body.ok === true) {
        setOfficialPost(body)
        setOfficialError(null)
        setUpdatedAtMs(Date.now())
      } else {
        setOfficialPost(null)
        setOfficialError({ status: 500, code: "UNKNOWN" })
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return
      setOfficialPost(null)
      setOfficialError({ status: 500, code: "UNKNOWN" })
    } finally {
      window.clearTimeout(timeoutId)
      setOfficialLoading(false)
    }
  }

  // IG connection state comes from the global InstagramConnectionProvider.
  // This avoids duplicate /api/auth/instagram/me requests and centralizes revalidation.

  useEffect(() => {
    if (typeof window === "undefined") return
    if (didOauthRefetchRef.current) return
    if (!postUrl) return

    const u = new URL(window.location.href)
    const connected = u.searchParams.get("connected") || u.searchParams.get("instagram")
    if (!connected) return

    didOauthRefetchRef.current = true
    void fetchOfficial(postUrl)

    u.searchParams.delete("connected")
    u.searchParams.delete("instagram")
    window.history.replaceState({}, "", u.toString())
  }, [postUrl])

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = (postUrl || "").trim()

    // No URL: reset to initial UI state
    if (!url) {
      setHasAnalysis(false)
      setAnalysisResult(null)
      return
    }

    const cached = saReadPACache(url)
    const cachedHasAnalysis = cached?.hasAnalysis === true
    const cachedResult = cached?.analysisResult

    // Only hydrate analysisResult if it is a real payload for THIS exact URL.
    const match =
      cachedResult &&
      typeof cachedResult === "object" &&
      typeof cachedResult?.permalink === "string" &&
      cachedResult.permalink.trim() === url

    setHasAnalysis(cachedHasAnalysis)
    setAnalysisResult(match ? cachedResult : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postUrl])

  const handleAnalyze = async (forcedUrl?: string) => {
    if (isAnalyzing || officialLoading) {
      showToast(t("post.toast.busy"))
      return
    }

    setAnalyzeError(null)

    const raw = String(forcedUrl ?? postUrl).trim()
    if (!raw) {
      showToast(t("post.toast.invalidUrl"))
      return
    }
    const url = normalizePermalink(raw)
    setLastAnalyzedUrl(url)

    const guard = analysisGuardRef.current
    if (guard && guard.url === url && Date.now() - guard.ts < 10_000) {
      const now = Date.now()
      const confirm = sameUrlConfirmRef.current
      const withinConfirm = Boolean(confirm && confirm.url === url && now - confirm.ts < 6_000)

      if (!withinConfirm) {
        sameUrlConfirmRef.current = { url, ts: now }
        showToast(t("post.toast.tooSoonConfirm"))
        return
      }

      sameUrlConfirmRef.current = null
    }
    analysisGuardRef.current = { url, ts: Date.now() }

    // guardAnalyze already validates; keep a minimal safety check.
    if (!isValidPostUrl(url)) {
      showToast(t("post.toast.invalidUrl"))
      return
    }

    requestAnimationFrame(() => {
      scrollToRef(previewRef, "post-preview")
    })

    setIsAnalyzing(true)

    analysisAbortRef.current?.abort()
    const analysisController = new AbortController()
    analysisAbortRef.current = analysisController

    if (isConnected) {
      void fetchOfficial(url)
    }

    // SWR: try cache first (seconds-fast), then revalidate in background.
    const cached = saReadPACache(url)
    const cachedResult = cached?.analysisResult
    const cacheMatch =
      cachedResult &&
      typeof cachedResult === "object" &&
      typeof cachedResult?.permalink === "string" &&
      cachedResult.permalink.trim() === url

    if (cacheMatch) {
      setHasAnalysis(true)
      setAnalysisResult(cachedResult)
    }

    try {
      const res = await saFetchWithRetry("/api/post-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
        signal: analysisController.signal,
      })

      if (!res.ok) return

      const data = await res.json()

      if (!loggedAnalysisShapeRef.current) {
        loggedAnalysisShapeRef.current = true
        console.log("[post-analysis] /api/post-analysis response", data)
      }

      const match =
        data &&
        typeof data === "object" &&
        typeof data?.permalink === "string" &&
        data.permalink.trim() === url

      if (match) {
        setHasAnalysis(true)
        setAnalysisResult(data)
        saWritePACache(url, { hasAnalysis: true, analysisResult: data })
        setUpdatedAtMs(Date.now())
      }

      requestAnimationFrame(() => {
        scrollToRef(resultsRef, "analysis-results")
      })
    } catch (e: any) {
      if (e?.name === "AbortError") return
      const status = e?.status ? ` (HTTP ${e.status})` : ""
      setAnalyzeError(`${copy.analysisFailed}${status}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasAnalysis && !officialPost && !officialError) return

    requestAnimationFrame(() => {
      scrollToRef(resultsRef, "analysis-results")
    })
  }, [hasAnalysis, officialPost, officialError])

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800)
  }

  const upToDateToast = () => {
    showToast(t("post.toast.updated"))
  }

  function scrollToRef(ref: React.RefObject<HTMLElement | null>, fallbackId?: string) {
    if (typeof window === "undefined") return
    const el = ref.current ?? (fallbackId ? document.getElementById(fallbackId) : null)
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 96
    window.scrollTo({ top: y, behavior: "smooth" })
  }

  const startFromTopPost = async (url: string) => {
    const link = typeof url === "string" ? url.trim() : ""
    if (!link) return
    const filledToast = () => {
      showToast(t("post.toast.filledLink"))
    }

    const clean = normalizePermalink(link)
    const guard = quickPickGuardRef.current
    if (guard && guard.url === clean && Date.now() - guard.ts < 10_000) {
      setPostUrl(clean)
      setLastAnalyzedUrl("")
      sameUrlConfirmRef.current = null
      window.setTimeout(scrollToPostUrl, 0)
      window.setTimeout(() => inputRef.current?.focus?.(), 50)
      filledToast()
      return
    }

    setPostUrl(clean)
    setLastAnalyzedUrl("")
    sameUrlConfirmRef.current = null
    setOfficialPost(null)
    setOfficialError(null)
    window.setTimeout(scrollToPostUrl, 0)
    window.setTimeout(() => inputRef.current?.focus?.(), 50)
    quickPickGuardRef.current = { url: clean, ts: Date.now() }
    filledToast()
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

  const handleBackToResults = () => {
    const qs = typeof window !== "undefined" ? window.location.search : ""
    const ts = Date.now()
    const hasQ = typeof qs === "string" && qs.length > 0
    const sep = hasQ ? (qs.includes("?") ? "&" : "?") : "?"
    const url = `/${locale}/results${qs || ""}${sep}r=${ts}`
    if (typeof window !== "undefined") {
      window.location.assign(url)
      return
    }
    router.push(url)
  }

  const handleHeaderCopySummary = async () => {
    const ok = await copyToClipboard(proSummaryText)
    if (ok) {
      setHeaderCopied(true)
      showToast(t("post.toast.summaryCopied"))
      window.setTimeout(() => setHeaderCopied(false), 1200)
      return
    }
    showToast(t("post.toast.copyFailed"))
  }

  const handleHeaderExport = () => {
    if (exporting) return
    setExporting(true)
    try {
      downloadText("post-analysis.txt", fullExportText)
      showToast(t("post.toast.exported"))
    } finally {
      window.setTimeout(() => setExporting(false), 500)
    }
  }

  const handleHeaderShare = async () => {
    const href = typeof window !== "undefined" ? window.location.href : ""
    try {
      if (typeof navigator !== "undefined" && typeof (navigator as any).share === "function" && href) {
        await (navigator as any).share({
          title: t("post.header.title"),
          url: href,
        })
        showToast(t("post.toast.linkCopied"))
        return
      }
    } catch {
      // fall through to copy
    }

    const ok = await copyToClipboard(href)
    if (ok) {
      setShareCopied(true)
      showToast(t("post.toast.linkCopied"))
      window.setTimeout(() => setShareCopied(false), 1200)
      return
    }
    showToast(t("post.toast.copyFailed"))
  }

  return (
    <main className="w-full bg-gradient-to-b from-[#0b1220]/100 via-[#0b1220]/95 to-[#0b1220]/90 overflow-x-hidden">
      {copyToast && (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-md bg-black/70 px-3 py-2 text-xs text-white shadow-lg max-w-[70vw] truncate whitespace-nowrap"
          role="status"
          aria-live="polite"
        >
          {copyToast.msg}
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

      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
                <span className="px-2 py-0.5 rounded-full border border-white/15 whitespace-nowrap">
                  {t("post.header.badge")}
                </span>

                <span className="px-2 py-0.5 rounded-full border border-white/15 whitespace-nowrap">
                  {platformLabel(inferredPlatform)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_8px_24px_rgba(168,85,247,0.35)] hover:brightness-110 active:translate-y-[1px] transition whitespace-nowrap"
                onClick={handleBackToResults}
              >
                {isZh ? "分析你的帳號" : "Analyze your account"}
              </Button>
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/90 bg-gradient-to-b from-[#1f2937] to-[#0b1220] border border-white/10 shadow-[0_4px_0_#020617] hover:brightness-110 active:translate-y-[1px] transition whitespace-nowrap"
                onClick={handleHeaderCopySummary}
                aria-busy={headerCopied ? true : undefined}
              >
                {headerCopied ? t("post.header.copied") : t("post.header.copySummary")}
              </Button>
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/90 bg-gradient-to-b from-[#1f2937] to-[#0b1220] border border-white/10 shadow-[0_4px_0_#020617] hover:brightness-110 active:translate-y-[1px] transition whitespace-nowrap"
                onClick={handleHeaderExport}
                disabled={exporting}
                aria-busy={exporting ? true : undefined}
              >
                {t("post.header.export")}
              </Button>
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/90 bg-gradient-to-b from-[#1f2937] to-[#0b1220] border border-white/10 shadow-[0_4px_0_#020617] hover:brightness-110 active:translate-y-[1px] transition whitespace-nowrap"
                onClick={handleHeaderShare}
                aria-busy={shareCopied ? true : undefined}
              >
                {shareCopied ? t("post.header.copied") : t("post.header.share")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{t("post.title")}</h1>
          <p className="text-sm text-slate-300 max-w-2xl">
            {t("post.subtitle")}
          </p>
          <div className="text-xs text-slate-400 max-w-3xl">{t("post.modeExplain")}</div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
            <span className="whitespace-nowrap">
              {copy.dataSource}: <span className="font-medium text-white/80">{dataSourceLabel}</span>
            </span>
            <span className="text-white/25">·</span>
            <span className="whitespace-nowrap tabular-nums">
              {copy.updated}: <span className="font-medium text-white/80">{fmtTime(updatedAtMs)}</span>
            </span>
          </div>
        </div>

        <div className="mt-8 space-y-5 sm:space-y-7">
          <Card className={sectionCard}>
            <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
              <div id="post-url-section" ref={urlSectionRef} className="min-w-0 space-y-2">
                <div className="text-sm font-medium text-white">{t("post.input.label")}</div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
                  <Input
                    ref={(el) => {
                      inputRef.current = el
                      postUrlInputRef.current = el
                    }}
                    value={postUrl}
                    onChange={(e) => {
                      const next = e.target.value
                      setPostUrl(next)
                      const cleaned = normalizePermalink(String(next || "").trim())
                      if (cleaned && cleaned !== lastAnalyzedUrl) {
                        setLastAnalyzedUrl("")
                        sameUrlConfirmRef.current = null
                        analysisGuardRef.current = null
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        if (!isValidIgPostOrReelUrl) return
                        guardAnalyze()
                      }
                    }}
                    inputMode="url"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={t("post.input.placeholder")}
                    className="min-w-0 truncate bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 select-text pointer-events-auto cursor-text selection:bg-white/25 selection:text-white caret-white"
                  />
                  <div className="w-full md:w-[168px] flex flex-col gap-1 min-w-0">
                    <div className="text-xs text-white/70 leading-relaxed min-w-0">
                      {devBypass && freeRemaining <= 0 ? (
                        <div className="text-xs text-white/60 leading-relaxed">
                          {t("post.devBypass")}
                        </div>
                      ) : null}
                      {freeRemaining > 0 ? (
                        <span className="min-w-0">
                          {t("post.freeRemaining")} {formatCount(t("post.freeRemainingCount"), { count: freeRemaining, limit: FREE_LIMIT })}
                        </span>
                      ) : (
                        <span className="min-w-0">
                          {t("post.freeExhaustedTitle")} · {t("post.freeExhaustedDesc")}
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="relative w-full">
                        <Button
                          type="button"
                          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()

                            if (isAnalyzing || officialLoading) {
                              showToast(t("post.toast.busy"))
                              return
                            }
                            if (!isValidIgPostOrReelUrl) {
                              showToast(t("post.toast.invalidUrl"))
                              return
                            }

                            if (freeRemaining <= 0 && !devBypass) {
                              goPricingFreeLimit()
                              return
                            }

                            void handleAnalyze(postUrl)
                          }}
                          disabled={isAnalyzing || officialLoading}
                          aria-disabled={isAnalyzing || officialLoading ? true : undefined}
                          aria-busy={isAnalyzing || officialLoading ? true : undefined}
                        >
                        {isAnalyzing || officialLoading ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            {t("post.input.analyzing")}
                          </span>
                        ) : freeRemaining <= 0 && !devBypass ? (
                          t("post.ctaUpgrade")
                        ) : (
                          t("post.ctaAnalyze")
                        )}
                        </Button>

                        {isAnalyzing || officialLoading ? (
                          <button
                            type="button"
                            aria-hidden
                            tabIndex={-1}
                            className="absolute inset-0 rounded-lg cursor-not-allowed"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              showToast(t("post.toast.busy"))
                            }}
                          />
                        ) : null}
                      </div>

                      <span
                        className="min-w-0 text-xs text-white/70 tabular-nums overflow-hidden text-ellipsis whitespace-nowrap truncate"
                        title={`免費剩餘 ${freeRemaining} / ${FREE_LIMIT}`}
                      >
                        免費剩餘 {freeRemaining} / {FREE_LIMIT}
                      </span>
                    </div>
                  </div>
                </div>
                {normalizedPostUrl ? (
                  !isValidIgPostOrReelUrl ? (
                    <div className="text-xs text-slate-400 leading-relaxed break-words min-w-0">{t("post.url.invalid")}</div>
                  ) : null
                ) : (
                  <div className="text-xs text-slate-400 leading-relaxed break-words min-w-0">{t("post.url.hint")}</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCard}>
            <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
              <div className="space-y-2">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">🔥 從高互動貼文開始分析</div>
                    <div className="mt-1 text-xs text-white/60 leading-relaxed">
                      不知道該選哪一篇？直接從你表現最好的貼文開始。
                      <br />
                      （點「使用這篇」會自動填入，不影響既有分析結果）
                    </div>
                    <div className="mt-1 text-[10px] text-white/40 truncate">
                      以下 3 篇與帳號分析頁顯示結果一致
                      {quickTop3Ts ? ` · 更新於 ${new Date(quickTop3Ts).toLocaleString()}` : ""}
                    </div>
                  </div>
                </div>

                {quickPickStatus === "ready" ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
                    {quickTop3.map((p: any, idx: number) => {
                      const link = typeof p?.permalink === "string" ? p.permalink : ""
                      const igHref =
                        (typeof p?.permalink === "string" && p.permalink ? p.permalink : "") ||
                        (typeof p?.ig_permalink === "string" && p.ig_permalink ? p.ig_permalink : "") ||
                        (typeof p?.shortcode === "string" && p.shortcode ? `https://www.instagram.com/p/${p.shortcode}/` : "")
                      const thumb =
                        (typeof p?.thumbnail_url === "string" && p.thumbnail_url ? p.thumbnail_url : "") ||
                        (typeof p?.media_url === "string" && p.media_url ? p.media_url : "")
                      const type = String(p?.media_type || "POST").toUpperCase()
                      const metrics = getPostMetrics(p)
                      const likes = metrics.likes ?? "—"
                      const comments = metrics.comments ?? "—"
                      const engagement = metrics.engagement ?? "—"

                      return (
                        <div
                          key={String(p?.id ?? link ?? idx)}
                          className="min-w-[240px] sm:min-w-0 rounded-xl border border-white/10 bg-white/5 p-3 min-w-0 cursor-pointer hover:border-white/20 hover:bg-white/[0.06] transition"
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (!link) return
                            void startFromTopPost(link)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              if (!link) return
                              void startFromTopPost(link)
                            }
                          }}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            {igHref ? (
                              <a
                                href={igHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block shrink-0 relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5 border border-white/10"
                              >
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <SafeIgThumb src={safeImgSrc(thumb)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                  <div className="flex flex-col items-center justify-center text-white/45">
                                    <div className="h-8 w-8 rounded-lg border border-white/10 bg-white/5" />
                                    <div className="mt-1 text-[10px]">POST</div>
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/45 tabular-nums">
                                  {type}
                                </div>
                              </a>
                            ) : (
                              <div className="block shrink-0 relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5 border border-white/10">
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <SafeIgThumb src={safeImgSrc(thumb)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                ) : null}
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/45 tabular-nums">
                                  {type}
                                </div>
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/70 whitespace-nowrap">
                                  {type}
                                </span>
                              </div>

                              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                                <div className="min-w-0">
                                  <div className="text-[10px] text-white/40 truncate">按讚</div>
                                  <div className="text-sm font-medium tabular-nums truncate">
                                    {typeof likes === "number" && Number.isFinite(likes) ? Math.round(likes) : likes}
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] text-white/40 truncate">留言</div>
                                  <div className="text-sm font-medium tabular-nums truncate">
                                    {typeof comments === "number" && Number.isFinite(comments) ? Math.round(comments) : comments}
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] text-white/40 truncate">互動</div>
                                  <div className="text-sm font-medium tabular-nums truncate">
                                    {typeof engagement === "number" && Number.isFinite(engagement) ? Math.round(engagement) : engagement}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  className="h-9 rounded-md bg-white/10 px-3 text-xs text-white hover:bg-white/15 whitespace-nowrap w-full sm:w-auto"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!link) return
                                    void startFromTopPost(link)
                                  }}
                                  title="使用這篇"
                                >
                                  使用這篇
                                </button>

                                <button
                                  type="button"
                                  className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10 whitespace-nowrap w-full sm:w-auto"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    if (!link) return
                                    const ok = await copyToClipboard(link)
                                    if (ok) {
                                      const msg = typeof locale === "string" && locale.startsWith("zh") ? "已複製" : "Copied"
                                      setCopyToast({ ts: Date.now(), msg })
                                      window.setTimeout(() => setCopyToast(null), 1200)
                                    }
                                  }}
                                  title="複製連結"
                                >
                                  複製連結
                                </button>
                              </div>

                              <div className="mt-2 text-[10px] text-white/40 break-all min-w-0 line-clamp-2">{link || "—"}</div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : quickPickStatus === "loading" ? (
                  <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="min-w-[240px] sm:min-w-0 rounded-xl border border-white/10 bg-white/5 p-3"
                      >
                        <div className="h-14 w-14 rounded-lg bg-white/5 border border-white/10" />
                        <div className="mt-3 h-4 w-32 rounded bg-white/5" />
                        <div className="mt-2 h-8 w-40 rounded bg-white/5" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                    目前還沒有可用的最佳貼文。請先回到「帳號分析」頁等待貼文載入後，再回來這裡。
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div ref={previewRef} id="post-preview" />
          <div ref={resultsRef} id="analysis-results" />

          {isAnalyzing && (
            <div className="space-y-6">
              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.loading.resultsTitle")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.loading.resultsDesc")}
                      </p>
                    </div>
                  </div>

                  {analyzeError ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-[#0b1220]/35 p-4 space-y-3">
                      <div className="text-sm font-semibold text-white">{copy.errorTitle}</div>
                      <div className="text-sm text-white/75 leading-relaxed break-words">{analyzeError}</div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          size="sm"
                          className="w-full sm:w-auto whitespace-nowrap"
                          onClick={() => void handleAnalyze(lastAnalyzedUrl || postUrl)}
                          disabled={!lastAnalyzedUrl && !postUrl}
                        >
                          {copy.retry}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto border-white/15 text-slate-200 hover:bg-white/5 whitespace-nowrap"
                          onClick={() => setManualRefreshTick((x) => x + 1)}
                        >
                          {copy.refresh}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className={subtleDivider} />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <div className="h-4 w-32 bg-white/10 rounded" />
                      <div className="mt-3 h-24 bg-white/10 rounded" />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                      <div className="h-4 w-40 bg-white/10 rounded" />
                      <div className="mt-3 space-y-2">
                        <div className="h-3 w-full bg-white/10 rounded" />
                        <div className="h-3 w-5/6 bg-white/10 rounded" />
                        <div className="h-3 w-2/3 bg-white/10 rounded" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {hasAnalysis && (
            <div className="space-y-5 sm:space-y-7">
              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {tt("post.preview.title", "post.preview.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {tt("post.preview.subtitle", "post.preview.subtitle")}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <a
                        href={previewData.permalink || postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-200 hover:text-blue-100 underline underline-offset-4 break-all"
                      >
                        {t("post.preview.openOriginal")}
                      </a>
                    </div>
                  </div>

                  {analyzeError ? (
                    <div className="mt-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                      {analyzeError}
                    </div>
                  ) : null}

                  <div className={subtleDivider} />
                  <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
                    <div className="w-full max-w-[260px]">
                      {(() => {
                        const igHref = previewData.permalink

                        return igHref ? (
                          <a
                            href={igHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block aspect-[4/5] rounded-xl border border-white/10 bg-white/5 flex items-center justify-center relative overflow-hidden"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
                            {previewThumbSrc ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <SafeIgThumb src={previewThumbSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
                            ) : null}
                            {!previewThumbSrc && (
                              <div className="relative text-slate-300">
                                <div className="mx-auto h-10 w-10 rounded-lg border border-white/10 bg-white/5" />
                                <div className="mt-2 text-xs">POST</div>
                              </div>
                            )}
                          </a>
                        ) : (
                          <div className="aspect-[4/5] rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-xs text-white/50">
                            —
                          </div>
                        )
                      })()}
                    </div>

                    <div className="space-y-4 min-w-0">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-white/70">{t("post.preview.meta")}</div>
                        <div className="rounded-xl border border-white/10 bg-[#0b1220]/35 p-4 space-y-3">
                          <div className="text-xs text-slate-300">{t("post.preview.url")}</div>
                          <div className="text-xs text-slate-300 break-all min-w-0">{previewData.permalink || postUrl || tt("post.copy.notProvided", "post.copy.notProvided")}</div>
                          <div className="text-sm text-slate-200 min-w-0">
                            <span className="text-slate-400">{t("post.preview.captionLabel")} </span>
                            <span className="block mt-1 text-slate-200/90 leading-relaxed line-clamp-2 sm:line-clamp-3">
                              {(typeof (officialPost as any)?.media?.caption === "string" && String((officialPost as any).media.caption).trim()) ||
                                previewData.caption ||
                                t("post.preview.noCaption")}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {t("post.preview.timestamp")}: {previewData.timeLabel}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-white/70">{t("post.preview.quick")}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            {
                              k: "type",
                              label: t("post.preview.type"),
                              v: previewData.mediaTypeLabel,
                            },
                            {
                              k: "quality",
                              label: t("post.preview.quality"),
                              v: inferredStatusLabel(qualityLabel),
                            },
                          ].map((row) => (
                            <div key={row.k} className="rounded-xl border border-white/10 bg-white/5 p-4 min-w-0">
                              <div className="text-xs text-slate-300 truncate">{row.label}</div>
                              <div className="mt-2 text-sm text-white truncate min-w-0">{row.v || "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {t("post.publicEngagement.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.publicEngagement.subtitle")}
                      </p>
                    </div>
                  </div>

                  <div className={subtleDivider} />

                  {publicEngagement.hasAny ? (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                      {[
                        {
                          key: "likes",
                          label: t("post.publicEngagement.metrics.likes"),
                          value: publicEngagement.metrics.likes,
                        },
                        {
                          key: "comments",
                          label: t("post.publicEngagement.metrics.comments"),
                          value: publicEngagement.metrics.comments,
                        },
                        {
                          key: "engagement",
                          label: t("post.publicEngagement.metrics.engagement"),
                          value: publicEngagement.metrics.engagement,
                        },
                      ].map((m) => (
                        <Card key={m.key} className="rounded-xl border border-white/10 bg-white/5 min-w-0">
                          <CardContent className="p-3 sm:p-5 min-w-0">
                            <div className="text-[12px] sm:text-sm text-slate-400/70 truncate min-w-0">{m.label}</div>
                            <div className="mt-2 text-[clamp(18px,5.6vw,26px)] font-bold tabular-nums overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                              <span className={m.value === null ? "text-white/50" : "text-white"}>
                                {formatNumber(m.value)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                      <div className="text-sm text-white/60">{t("post.publicEngagement.noData")}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {t("post.official.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.official.subtitle")}
                      </p>
                    </div>
                    {officialPost?.ok ? (
                      <div className="shrink-0 text-[11px] text-white/45 tabular-nums whitespace-nowrap">
                        {(typeof (officialPost as any)?.media?.media_type === "string" && String((officialPost as any).media.media_type)) || ""}
                      </div>
                    ) : null}
                  </div>

                  <div className={subtleDivider} />

                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-white/55 leading-relaxed min-w-0">{copy.officialKpiHint}</div>
                      {officialUnified.hasAny && !officialError && !officialLoading ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white bg-emerald-500/15 border border-emerald-400/25 whitespace-nowrap">
                          {copy.officialBadge}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                      {(() => {
                        const toNum = (v: any) => {
                          const n = typeof v === "number" ? v : Number(v)
                          return Number.isFinite(n) ? n : null
                        }

                        const interactionKeys = new Set(["likes", "comments", "saves", "shares", "engagementRate"])
                        const distributionKeys = new Set(["reach", "impressions"])

                        const getBaselineAvg = (key: "likes" | "comments" | "saves" | "shares") => {
                          if (!baseline?.hasAny) return null
                          const avg =
                            key === "likes"
                              ? baseline.metrics.likesAvg
                              : key === "comments"
                                ? baseline.metrics.commentsAvg
                                : key === "saves"
                                  ? baseline.metrics.savesAvg
                                  : baseline.metrics.sharesAvg
                          return typeof avg === "number" && Number.isFinite(avg) ? avg : null
                        }

                        const getCompare = (valueN: number, avg: number) => {
                          const denom = Math.max(avg, 1)
                          const deltaPct = ((valueN - avg) / denom) * 100
                          const near = Math.abs(deltaPct) < 5
                          const arrow = near ? "→" : deltaPct > 0 ? "↑" : "↓"
                          const text = near ? copy.kpiRelClose : deltaPct > 0 ? copy.kpiRelAbove : copy.kpiRelBelow

                          const n = typeof (baseline as any)?.n === "number" ? (baseline as any).n : 0
                          const hasN = (baseline as any)?.baselineWindow === "recent" && n > 0
                          const tooltip = (() => {
                            if (baseline?.baselineSource === "official") return copy.baselineTooltipOfficial
                            if (hasN) return copy.baselineTooltipInferredWithN.replace("{n}", String(n))
                            return copy.baselineDisclaimer
                          })()

                          return { arrow, text, tooltip }
                        }

                        const likeN = officialError ? null : toNum(officialUnified.metrics.likes)
                        const commentN = officialError ? null : toNum(officialUnified.metrics.comments)
                        const saveN = officialError ? null : toNum(officialUnified.metrics.saves)
                        const shareN = officialError ? null : toNum(officialUnified.metrics.shares)
                        const reachN = officialError ? null : toNum(officialUnified.metrics.reach)
                        const impN = officialError ? null : toNum(officialUnified.metrics.impressions)

                        const denom = impN ?? reachN
                        const er = (() => {
                          if (officialLoading) return { shown: null as string | null, hasValue: false, note: null as string | null }
                          if (officialError) return { shown: "—", hasValue: false, note: null }
                          if (!denom || denom <= 0) return { shown: "—", hasValue: false, note: copy.kpiErNeedsReach }
                          const numer = (likeN ?? 0) + (commentN ?? 0) + (saveN ?? 0) + (shareN ?? 0)
                          const pct = (numer / denom) * 100
                          if (!Number.isFinite(pct)) return { shown: "—", hasValue: false, note: copy.kpiErNeedsReach }
                          return { shown: `${pct.toFixed(1)}%`, hasValue: true, note: null }
                        })()

                        const kpis = [
                          {
                            key: "reach",
                            label: t("post.official.metrics.reach"),
                            value: officialError ? null : officialUnified.metrics.reach,
                            hasValue: !officialLoading && !officialError && toNum(officialUnified.metrics.reach) !== null,
                            note: (!officialLoading && !officialError && toNum(officialUnified.metrics.reach) === null) ? copy.kpiUnavailable : null,
                          },
                          {
                            key: "impressions",
                            label: t("post.official.metrics.impressions"),
                            value: officialError ? null : officialUnified.metrics.impressions,
                            hasValue: !officialLoading && !officialError && toNum(officialUnified.metrics.impressions) !== null,
                            note: (!officialLoading && !officialError && toNum(officialUnified.metrics.impressions) === null) ? copy.kpiUnavailable : null,
                          },
                          {
                            key: "likes",
                            label: t("post.official.metrics.likes"),
                            value: officialError ? null : officialUnified.metrics.likes,
                            hasValue: !officialLoading && !officialError && likeN !== null,
                            note: !officialLoading && !officialError && likeN !== null ? copy.kpiLikeNote : null,
                          },
                          {
                            key: "comments",
                            label: t("post.official.metrics.comments"),
                            value: officialError ? null : officialUnified.metrics.comments,
                            hasValue: !officialLoading && !officialError && commentN !== null,
                            note: !officialLoading && !officialError && commentN === 0 ? copy.kpiCommentZeroNote : null,
                          },
                          {
                            key: "saves",
                            label: t("post.official.metrics.saves"),
                            value: officialError ? null : officialUnified.metrics.saves,
                            hasValue: !officialLoading && !officialError && saveN !== null,
                            note: (!officialLoading && !officialError && saveN === null) ? copy.kpiUnavailable : null,
                          },
                          {
                            key: "shares",
                            label: t("post.official.metrics.shares"),
                            value: officialError ? null : officialUnified.metrics.shares,
                            hasValue: !officialLoading && !officialError && shareN !== null,
                            note: (!officialLoading && !officialError && shareN === null) ? copy.kpiUnavailable : null,
                          },
                          {
                            key: "engagementRate",
                            label: copy.engagementRate,
                            value: er.shown,
                            hasValue: er.hasValue,
                            note: er.note,
                          },
                        ]

                        const sorted = [...kpis].sort((a, b) => Number(Boolean(b.hasValue)) - Number(Boolean(a.hasValue)))

                        return sorted.map((m, idx) => {
                          const orderClass = `order-${Math.min(idx + 1, 12)} lg:order-none`
                          const key = String((m as any).key)
                          const isInteraction = interactionKeys.has(key)
                          const isDistribution = distributionKeys.has(key)

                          const valueN =
                            key === "engagementRate"
                              ? null
                              : toNum((m as any).value)

                          const canCompare =
                            isInteraction &&
                            baseline?.hasAny &&
                            !officialLoading &&
                            !officialError &&
                            typeof valueN === "number" &&
                            Number.isFinite(valueN) &&
                            (key === "likes" || key === "comments" || key === "saves" || key === "shares")

                          const avg = canCompare ? getBaselineAvg(key as any) : null
                          const cmp = canCompare && typeof avg === "number" ? getCompare(valueN as number, avg) : null

                          const descriptionPrimary = (() => {
                            if (officialLoading) return null
                            if (officialError) return null

                            if (!Boolean((m as any).hasValue)) {
                              if (key === "engagementRate" && (m as any).note) return String((m as any).note)
                              return copy.kpiUnavailable
                            }

                            if (isDistribution) return copy.kpiDistributionNote

                            if (isInteraction) {
                              if (cmp) return cmp.text
                              return copy.kpiNoBaseline
                            }

                            return copy.kpiUnavailable
                          })()

                          const descriptionSecondary = (() => {
                            if (officialLoading) return null
                            if (officialError) return null
                            if (!Boolean((m as any).hasValue)) return null
                            if (!isInteraction) return null
                            if (!cmp) return null
                            return (m as any).note ? String((m as any).note) : null
                          })()

                          return (
                            <Card key={m.key} className={`rounded-xl border border-white/10 bg-white/5 min-w-0 ${orderClass}`}>
                              <CardContent className="p-3 sm:p-5 min-w-0">
                                <div className="text-[12px] sm:text-sm text-slate-400/70 truncate min-w-0">{m.label}</div>
                                <div className="mt-2 text-[clamp(18px,5.6vw,26px)] font-bold tabular-nums overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                                  {officialLoading ? (
                                    <span className="inline-block h-6 w-16 rounded bg-white/10" />
                                  ) : (() => {
                                      const shown =
                                        m.key === "engagementRate" ? String(m.value ?? "—") : formatNumber(m.value)
                                      return (
                                        <span className={shown === "—" ? "text-white/50" : "text-white"}>{shown}</span>
                                      )
                                    })()}
                                </div>

                                <div className="mt-2 min-h-[2.75em] text-[11px] sm:text-xs text-white/55 leading-relaxed min-w-0">
                                  {officialLoading ? (
                                    <div className="h-3 w-24 bg-white/10 rounded" />
                                  ) : officialError ? (
                                    <div className="h-3 w-24 bg-white/10 rounded" />
                                  ) : cmp ? (
                                    <div className="flex items-start gap-1 min-w-0">
                                      <div className="shrink-0 tabular-nums">{cmp.arrow}</div>
                                      <div className="min-w-0">
                                        <div className="min-w-0 truncate whitespace-nowrap">
                                          {cmp.text}
                                          <span className="ml-1 inline-flex align-middle shrink-0 text-white/35" title={cmp.tooltip}>
                                            <Info className="h-3.5 w-3.5" />
                                          </span>
                                        </div>
                                        {descriptionSecondary ? (
                                          <div className="mt-1 min-w-0 line-clamp-2 text-white/45">{descriptionSecondary}</div>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="min-w-0 line-clamp-2 text-white/55">{descriptionPrimary}</div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })
                      })()}
                    </div>

                    {!officialLoading && officialError ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                        <div className="text-sm text-white/75 leading-relaxed break-words">{copy.officialErrorFriendly}</div>
                        <div className="text-xs text-white/45 truncate">
                          {copy.errorDetail}: HTTP {String((officialError as any)?.status ?? "—")}
                          {typeof (officialError as any)?.code === "string" && (officialError as any).code
                            ? ` · ${(officialError as any).code}`
                            : ""}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            size="sm"
                            className="w-full sm:w-auto whitespace-nowrap"
                            onClick={() => void handleAnalyze(lastAnalyzedUrl || postUrl)}
                            disabled={!lastAnalyzedUrl && !postUrl}
                          >
                            {copy.retry}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto border-white/15 text-slate-200 hover:bg-white/5 whitespace-nowrap"
                            onClick={() => setManualRefreshTick((x) => x + 1)}
                          >
                            {copy.refresh}
                          </Button>
                        </div>
                      </div>
                    ) : !officialLoading && !officialUnified.hasAny ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 space-y-4">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-white">{t("post.official.emptyState.title")}</div>
                          <div className="text-sm text-white/75 leading-relaxed break-words">{t("post.official.emptyState.message")}</div>
                        </div>
                        <Button
                          size="lg"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            navigateToProtected(`/${locale}/post-analysis`)
                          }}
                        >
                          {t("post.official.connect.cta")}
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-white/10 bg-[#0b1220]/35 p-4">
                      <div className="text-sm font-semibold text-white">{copy.insightsNoticeTitle}</div>
                      <div className="mt-2 text-sm text-white/70 leading-relaxed min-w-0 whitespace-pre-line break-words">
                        {copy.insightsNoticeBody}
                      </div>
                    </div>
                  </>
                </CardContent>
              </Card>

              <Card className={`${sectionCard} overflow-hidden`}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {tt("post.health.title", "post.health.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {tt("post.health.subtitle", "post.health.subtitle")}
                      </p>
                      <p className="mt-1 text-xs text-white/45 max-w-[72ch] leading-relaxed">{tt("post.health.note", "post.health.note")}</p>
                    </div>
                    <div className="shrink-0 max-w-full">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20 shrink-0 max-w-full truncate whitespace-normal sm:whitespace-nowrap">
                        {tt("post.health.badge", "post.health.badge")}
                      </span>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inferredMetrics.map((m) => {
                      const tone = toneForStatus(m.status)
                      return (
                        <Card
                          key={m.title}
                          className="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl"
                        >
                          <CardContent className="p-5 h-full">
                            <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                              <div className="text-sm font-medium text-white min-w-0 truncate">{m.title}</div>
                              <span
                                className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border shrink-0 max-w-full truncate whitespace-normal sm:whitespace-nowrap ${tone.classes}`}
                              >
                                {inferredStatusLabel(m.status)}
                              </span>
                            </div>
                            <div className="mt-3 text-sm text-slate-300">{m.detail}</div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {tt("post.underperform.title", "post.underperform.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {tt("post.underperform.subtitle", "post.underperform.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="space-y-3">
                    {underperformReasons.map((r, idx) => (
                      <div key={r} className="flex gap-3">
                        <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-white/10 bg-white/5 text-slate-200 text-xs flex items-center justify-center">
                          {idx + 1}
                        </div>
                        <div className="text-sm text-slate-200 min-w-0 break-words">{r}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {tt("post.rewrite.title", "post.rewrite.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {tt("post.rewrite.subtitle", "post.rewrite.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white min-w-0 truncate">{tt("post.rewrite.sections.hooks", "post.rewrite.sections.hooks")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {rewriteSuggestions.hooks.map((h, i) => (
                            <div key={`hooks-${i}`} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">{tt("post.rewrite.version", "post.rewrite.version")} {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200 min-w-0 break-words">{safeSentenceOr(h, "post.quick.fallback.hook")}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white min-w-0 truncate">{tt("post.rewrite.sections.ctas", "post.rewrite.sections.ctas")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {rewriteSuggestions.ctas.map((c, i) => (
                            <div key={`ctas-${i}`} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">{tt("post.rewrite.option", "post.rewrite.option")} {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200 min-w-0 break-words">{safeSentenceOr(c, "post.quick.fallback.cta")}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-white/10 bg-white/5 lg:col-span-2 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white min-w-0 truncate">{tt("post.rewrite.sections.visuals", "post.rewrite.sections.visuals")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {rewriteSuggestions.visuals.map((v, i) => (
                            <div key={`visuals-${i}`} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">{tt("post.rewrite.option", "post.rewrite.option")} {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200 min-w-0 break-words">{safeSentenceOr(v, "post.quick.fallback.visual")}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {null}

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight min-w-0 truncate">
                        {tt("post.snapshot.title", "post.snapshot.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {tt("post.snapshot.subtitle", "post.snapshot.subtitle")}
                      </p>
                      <p className="mt-2 text-sm text-white/70 leading-relaxed max-w-[72ch]">
                        {t("post.action.closing")}
                      </p>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="flex flex-wrap items-center gap-2 mb-4 min-w-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryMode === "short" ? "default" : "outline"}
                      className={`${summaryMode === "short" ? "" : "border-white/15 text-slate-200 hover:bg-white/5"} w-full sm:w-auto min-w-0 truncate`}
                      onClick={() => setSummaryMode("short")}
                    >
                      {tt("post.snapshot.short", "post.snapshot.short")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryMode === "detailed" ? "default" : "outline"}
                      className={`${summaryMode === "detailed" ? "" : "border-white/15 text-slate-200 hover:bg-white/5"} w-full sm:w-auto min-w-0 truncate`}
                      onClick={() => setSummaryMode("detailed")}
                    >
                      {tt("post.snapshot.detailed", "post.snapshot.detailed")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                    <textarea
                      className="w-full min-h-[180px] rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200 outline-none resize-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      readOnly
                      value={summaryMode === "short" ? shortCopyBlock : copyBlock}
                    />
                    <Button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full sm:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 min-w-0 truncate"
                      onClick={async () => {
                        const ok = await copyToClipboard(summaryMode === "short" ? shortCopyBlock : copyBlock)
                        showToast(ok ? tt("post.snapshot.toast.copied", "post.toast.summaryCopied") : tt("post.snapshot.toast.copyFailed", "post.toast.copyFailed"))
                      }}
                    >
                      {tt("post.snapshot.copy", "post.snapshot.copy")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="pt-10 border-t border-white/10">
            <div className="text-xs text-slate-400">
              {t("post.footer.disclaimer")}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
