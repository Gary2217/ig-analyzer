"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Lock } from "lucide-react"

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
      if (!res.ok) throw new Error(`http_${res.status}`)
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

export default function PostAnalysisPage() {
  const { locale, t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [isConnected, setIsConnected] = useState(false)
  const [summaryMode, setSummaryMode] = useState<"short" | "detailed">("short")
  const [toast, setToast] = useState<string | null>(null)
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
    const thumb = typeof (analysisResult as any)?.thumbnail_url === "string" ? String((analysisResult as any).thumbnail_url) : ""
    const media = typeof (analysisResult as any)?.media_url === "string" ? String((analysisResult as any).media_url) : ""
    return thumb.trim() || media.trim() || ""
  }, [analysisResult])

  const [freeUsed, setFreeUsed] = useState(0)

  const resultsRef = useRef<HTMLDivElement | null>(null)
  const urlSectionRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const freeRemaining = Math.max(0, FREE_LIMIT - freeUsed)
  const isDev = process.env.NODE_ENV === "development"
  const bypass =
    isDev ||
    searchParams.get("debug") === "1" ||
    searchParams.get("bypass") === "1"

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
    if (isAnalyzing) return
    if (!canAnalyze) return
    if (freeRemaining <= 0) {
      if (bypass) {
        handleAnalyze()
        return
      }
      goPricingFreeLimit()
      return
    }
    consumeFreeOnce()
    handleAnalyze()
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

  const platformLabel = (platform: "instagram") => t("post.platform.instagram")

  const inferredStatusLabel = (status: InferredStatus) => {
    if (status === "Good") return t("post.health.status.good")
    if (status === "Moderate") return t("post.health.status.moderate")
    return t("post.health.status.needsImprovement")
  }

  const officialLevelLabel = (value: "High" | "Medium" | "Low") => {
    if (value === "High") return t("post.level.high")
    if (value === "Medium") return t("post.level.medium")
    return t("post.level.low")
  }

  const inferredPlatform = useMemo<"instagram">(() => {
    return "instagram"
  }, [postUrl])

  const sourceDomain = useMemo(() => {
    return "instagram.com"
  }, [postUrl, t])

  const looksLikeSupportedUrl = useMemo(() => {
    const u = postUrl.toLowerCase().trim()
    if (!u) return true
    return u.includes("instagram.com")
  }, [postUrl])

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

  const postPreview = useMemo(() => {
    const postTypes = [
      t("post.preview.postType.reel"),
      t("post.preview.postType.carousel"),
      t("post.preview.postType.photo"),
    ] as const
    const idx = Math.abs(postUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % postTypes.length

    const captions = [
      t("post.preview.captions.1"),
      t("post.preview.captions.2"),
      t("post.preview.captions.3"),
    ]
    const cidx = Math.abs(postUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0) * 3, 0)) % captions.length

    const times = [
      t("post.preview.times.1"),
      t("post.preview.times.2"),
      t("post.preview.times.3"),
    ]
    const tidx = Math.abs(postUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0) * 7, 0)) % times.length

    return {
      platformLabel: platformLabel(inferredPlatform),
      postType: postTypes[idx],
      captionSnippet: captions[cidx],
      postedTime: times[tidx],
    }
  }, [inferredPlatform, postUrl, platformLabel, t])

  const underperformReasons = useMemo(
    () => [
      t("post.underperform.reasons.1"),
      t("post.underperform.reasons.2"),
      t("post.underperform.reasons.3"),
    ],
    [t]
  )

  const rewriteSuggestions = useMemo(
    () => ({
      hooks: [
        t("post.rewrite.hooks.1"),
        t("post.rewrite.hooks.2"),
        t("post.rewrite.hooks.3"),
      ],
      ctas: [
        t("post.rewrite.ctas.1"),
        t("post.rewrite.ctas.2"),
      ],
      visuals: [
        t("post.rewrite.visuals.1"),
        t("post.rewrite.visuals.2"),
        t("post.rewrite.visuals.3"),
      ],
    }),
    [t]
  )

  const officialMetrics = useMemo(
    () => ({
      reach: 12450,
      impressions: 23110,
      likes: 842,
      comments: 67,
      vsAvg: "Below Avg" as "Above Avg" | "Below Avg",
      contentQuality: "High" as "High" | "Medium" | "Low",
      actualReach: "Low" as "High" | "Medium" | "Low",
    }),
    []
  )

  const copyBlock = useMemo(() => {
    const base = `${t("post.copy.snapshotTitle")}\n\n${t("post.copy.mode")}: ${
      isConnected ? t("post.mode.official") : t("post.mode.inferred")
    }\n${t("post.copy.postUrl")}: ${postUrl || t("post.copy.notProvided")}\n\n${t("post.copy.keySignals")}\n- ${t("post.health.metrics.hook.title")}: ${inferredMetrics[0]?.status}\n- ${t("post.health.metrics.clarity.title")}: ${inferredMetrics[1]?.status}\n- ${t("post.health.metrics.readability.title")}: ${inferredMetrics[2]?.status}\n- ${t("post.health.metrics.interaction.title")}: ${inferredMetrics[3]?.status}\n- ${t("post.health.metrics.dropoff.title")}: ${inferredMetrics[4]?.status}\n`

    const c = isConnected
      ? `\n${t("post.copy.officialSection")}\n- ${t("post.official.metrics.reach")}: ${officialMetrics.reach}\n- ${t("post.official.metrics.impressions")}: ${officialMetrics.impressions}\n- ${t("post.official.metrics.likes")} / ${t("post.official.metrics.comments")}: ${officialMetrics.likes} / ${officialMetrics.comments}\n- ${t("post.copy.vsAvg")}: ${officialMetrics.vsAvg}\n`
      : ""

    const disclaimer = `\n${t("post.copy.disclaimer") }\n`

    return `${base}${c}${disclaimer}`
  }, [inferredMetrics, isConnected, officialMetrics, postUrl, t])

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

    const lines = [
      t("post.copy.summaryTitle"),
      "",
      `${t("post.copy.mode")}: ${mode} (${t("post.copy.modeHint")})`,
      linkLine,
      "",
      t("post.copy.topSignals"),
      topSignals,
      "",
      t("post.copy.recommendations"),
      suggestions,
    ]

    return `${lines.join("\n")}\n`
  }, [inferredMetrics, isConnected, postUrl, rewriteSuggestions, underperformReasons, t])

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

  const handleAnalyze = () => {
    if (!canAnalyze || isAnalyzing) return

    const url = postUrl.trim()
    setIsAnalyzing(true)

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

    ;(async () => {
      try {
        const res = await saFetchWithRetry("/api/post-analysis", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        })

        if (!res.ok) {
          setIsAnalyzing(false)
          return
        }

        const data = await res.json()
        const match =
          data &&
          typeof data === "object" &&
          typeof data?.permalink === "string" &&
          data.permalink.trim() === url

        if (match) {
          setHasAnalysis(true)
          setAnalysisResult(data)
          saWritePACache(url, { hasAnalysis: true, analysisResult: data })
        }

        setIsAnalyzing(false)

        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      } catch {
        setIsAnalyzing(false)
      }
    })()
  }

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800)
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
    router.push(`/${locale}/results${qs || ""}`)
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
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_8px_24px_rgba(168,85,247,0.35)] hover:brightness-110 active:translate-y-[1px] transition"
                onClick={handleBackToResults}
              >
                分析你的帳號
              </Button>
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/90 bg-gradient-to-b from-[#1f2937] to-[#0b1220] border border-white/10 shadow-[0_4px_0_#020617] hover:brightness-110 active:translate-y-[1px] transition"
                onClick={handleHeaderCopySummary}
                aria-busy={headerCopied ? true : undefined}
              >
                {headerCopied ? t("post.header.copied") : t("post.header.copySummary")}
              </Button>
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/90 bg-gradient-to-b from-[#1f2937] to-[#0b1220] border border-white/10 shadow-[0_4px_0_#020617] hover:brightness-110 active:translate-y-[1px] transition"
                onClick={handleHeaderExport}
                disabled={exporting}
                aria-busy={exporting ? true : undefined}
              >
                {t("post.header.export")}
              </Button>
              <Button
                size="sm"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium text-white/90 bg-gradient-to-b from-[#1f2937] to-[#0b1220] border border-white/10 shadow-[0_4px_0_#020617] hover:brightness-110 active:translate-y-[1px] transition"
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
        </div>

        <div className="mt-8 space-y-5 sm:space-y-7">
          <Card className={sectionCard}>
            <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
              <div id="post-url-section" ref={urlSectionRef} className="min-w-0 space-y-2">
                <div className="text-sm font-medium text-white">{t("post.input.label")}</div>
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
                  <Input
                    ref={inputRef}
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    placeholder={t("post.input.placeholder")}
                    className="min-w-0 truncate bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                  />
                  <div className="w-full md:w-[168px] flex flex-col gap-1 min-w-0">
                    <div className="text-xs text-white/70 leading-relaxed min-w-0">
                      {bypass && freeRemaining <= 0 ? (
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
                      <Button
                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={guardAnalyze}
                        disabled={!canAnalyze || isAnalyzing}
                        aria-busy={isAnalyzing ? true : undefined}
                      >
                        {isAnalyzing ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                            {t("post.input.analyzing")}
                          </span>
                        ) : freeRemaining <= 0 ? (
                          t("post.ctaUpgrade")
                        ) : (
                          t("post.ctaAnalyze")
                        )}
                      </Button>

                      <span
                        className="min-w-0 text-xs text-white/70 tabular-nums overflow-hidden text-ellipsis whitespace-nowrap truncate"
                        title={`免費剩餘 ${freeRemaining} / ${FREE_LIMIT}`}
                      >
                        免費剩餘 {freeRemaining} / {FREE_LIMIT}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {t("post.input.hint")}
                </div>
                {!looksLikeSupportedUrl && (
                  <div className="text-xs text-slate-400">
                    連結格式可能不正確：請確認包含 instagram.com。
                  </div>
                )}
                {!canAnalyze && <div className="text-xs text-slate-400">{t("post.input.pasteToBegin")}</div>}
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
                      const thumb =
                        (typeof p?.thumbnail_url === "string" && p.thumbnail_url ? p.thumbnail_url : "") ||
                        (typeof p?.media_url === "string" && p.media_url ? p.media_url : "")
                      const type = String(p?.media_type || "POST").toUpperCase()
                      const likes = (p?.like_count ?? p?.likes) ?? "—"
                      const comments = (p?.comments_count ?? p?.comments) ?? "—"
                      const engagement = p?.engagement ?? "—"

                      return (
                        <div
                          key={String(p?.id ?? link ?? idx)}
                          className="min-w-[240px] sm:min-w-0 rounded-xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white/5 border border-white/10">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={thumb}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    ;(e.currentTarget as HTMLImageElement).style.display = "none"
                                  }}
                                />
                              ) : null}
                              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/45 tabular-nums">
                                {type}
                              </div>
                            </div>

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
                                  className="h-8 rounded-md bg-white/10 px-3 text-xs text-white hover:bg-white/15 whitespace-nowrap"
                                  onClick={() => {
                                    if (!link) return
                                    setPostUrl(link)
                                    requestAnimationFrame(() => {
                                      urlSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                                    })
                                    window.setTimeout(() => inputRef.current?.focus?.(), 0)
                                  }}
                                  title="使用這篇"
                                >
                                  使用這篇
                                </button>

                                <button
                                  type="button"
                                  className="h-8 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10 whitespace-nowrap"
                                  onClick={async () => {
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

                              <div className="mt-2 text-[10px] text-white/40 truncate">{link || "—"}</div>
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
            <div ref={resultsRef} className="space-y-5 sm:space-y-7">
              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.preview.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.preview.subtitle")}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-200 hover:text-blue-100 underline underline-offset-4 break-all"
                      >
                        {t("post.preview.openOriginal")}
                      </a>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
                    <div className="w-full max-w-[260px]">
                      <div className="aspect-[4/5] rounded-xl border border-white/10 bg-white/5 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
                        {previewThumbSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewThumbSrc}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = "none"
                            }}
                          />
                        ) : null}
                        {!previewThumbSrc && (
                          <div className="relative text-slate-300">
                            <div className="mx-auto h-10 w-10 rounded-lg border border-white/10 bg-white/5" />
                            <div className="mt-2 text-xs">POST</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold bg-blue-500/20 text-blue-100 border border-blue-400/30">
                          {postPreview.platformLabel}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-200 border border-white/10">
                          {postPreview.postType}
                        </span>
                        <span className="text-[11px] text-slate-400">{postPreview.postedTime}</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        <span className="text-slate-500">{t("post.preview.source")}:</span> {sourceDomain}
                      </div>
                      <div className="text-xs text-slate-300 break-all">{postUrl || t("post.copy.notProvided")}</div>
                      <div className="text-sm text-slate-200">
                        <span className="text-slate-400">{t("post.preview.caption")} </span>
                        {postPreview.captionSnippet}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t("post.preview.note1")}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t("post.preview.note2")}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.quick.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.quick.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="space-y-3">
                    {([
                      {
                        id: "a1",
                        title: t("post.quick.items.a1"),
                        body: rewriteSuggestions.hooks[0],
                      },
                      {
                        id: "a2",
                        title: t("post.quick.items.a2"),
                        body: rewriteSuggestions.ctas[0],
                      },
                      {
                        id: "a3",
                        title: t("post.quick.items.a3"),
                        body: rewriteSuggestions.visuals[0],
                      },
                    ] as const).map((item) => {
                      const isOpen = Boolean(accordionOpen[item.id])
                      return (
                        <div key={item.id} className="rounded-xl border border-white/10 bg-[#0b1220]/35">
                          <button
                            type="button"
                            className="w-full flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-4 py-3 text-left hover:brightness-110 shadow-[0_6px_0_rgba(0,0,0,0.55)] active:translate-y-[1px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                            onClick={() =>
                              setAccordionOpen((p) => ({
                                ...p,
                                [item.id]: !p[item.id],
                              }))
                            }
                            aria-expanded={isOpen}
                          >
                            <span className="mt-0.5 h-5 w-5 rounded-md border border-white/20 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-white">{item.title}</div>
                            </div>
                            <div className="text-xs text-slate-300 shrink-0">
                              {isOpen ? t("post.quick.hide") : t("post.quick.show")}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4 text-[13px] sm:text-sm text-white/75 leading-relaxed">
                              {item.body}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-gradient-to-r from-purple-500/15 via-fuchsia-500/10 to-pink-500/10 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{t("post.unlock.badge")}</div>
                      <div className="text-[13px] text-white/70 max-w-[72ch] leading-relaxed">{t("post.unlock.preview.note")}</div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold text-white bg-purple-500/20 border border-purple-400/30">
                      {t("post.unlock.badge")}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.unlock.title")}
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium text-white/80 bg-white/5 border border-white/10">
                          {t("post.unlock.preview.note")}
                        </span>
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.unlock.badge")}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <Button
                        size="sm"
                        className="shrink-0 h-9 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-md shadow-purple-500/15 border border-white/10 whitespace-nowrap focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                        onClick={() => router.push(`/${locale}/pricing?src=official-insights`)}
                      >
                        {t("post.unlock.cta")}
                      </Button>
                    </div>
                  </div>
                  <div className={subtleDivider} />

                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b1220]/35 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-slate-200 truncate">
                            {t(`post.unlock.preview.items.${idx}`)}
                          </div>
                          <div className="mt-1 text-xs text-slate-400">
                            <span className="inline-block select-none blur-[1.5px] opacity-70">
                              ▒▒▒▒▒▒ ▒▒▒▒ ▒▒▒
                            </span>
                          </div>
                        </div>
                        <Lock className="h-4 w-4 text-white/35 shrink-0" />
                      </div>
                    ))}

                    <div className="pt-1 text-xs text-white/45 leading-relaxed">
                      {t("post.unlock.preview.note")}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.health.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.health.subtitle")}
                      </p>
                      <p className="mt-1 text-xs text-white/45 max-w-[72ch] leading-relaxed">{t("post.health.note")}</p>
                    </div>
                    <div className="shrink-0">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20">
                        {t("post.health.badge")}
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
                          className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl"
                        >
                          <CardContent className="p-5 h-full">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">{m.title}</div>
                              <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${tone.classes}`}>
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.underperform.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.underperform.subtitle")}
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
                        <div className="text-sm text-slate-200">{r}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.rewrite.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.rewrite.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white">{t("post.rewrite.sections.hooks")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {rewriteSuggestions.hooks.map((h, i) => (
                            <div key={h} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">{t("post.rewrite.version")} {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200">{h}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white">{t("post.rewrite.sections.ctas")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {rewriteSuggestions.ctas.map((c, i) => (
                            <div key={c} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">{t("post.rewrite.option")} {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200">{c}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-white/10 bg-white/5 lg:col-span-2 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white">{t("post.rewrite.sections.visuals")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {rewriteSuggestions.visuals.map((v) => (
                            <div key={v} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3 text-sm text-slate-200">
                              {v}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {isConnected && (
                <div className="space-y-6 sm:space-y-8">
                  <Card className={sectionCard}>
                    <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                            {t("post.official.title")}
                          </h2>
                          <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                            {t("post.official.subtitle")}
                          </p>
                        </div>
                      </div>
                      <div className={subtleDivider} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">{t("post.official.metrics.reach")}</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.reach.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">{t("post.official.metrics.impressions")}</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.impressions.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">{t("post.official.metrics.likes")}</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.likes.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">{t("post.official.metrics.comments")}</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.comments.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-white">{t("post.official.vsAvg.title")}</div>
                          <span
                            className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                              officialMetrics.vsAvg === "Above Avg"
                                ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/20"
                                : "bg-amber-500/10 text-amber-200 border-amber-400/20"
                            }`}
                          >
                            {officialMetrics.vsAvg === "Above Avg" ? t("post.official.vsAvg.above") : t("post.official.vsAvg.below")}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          {t("post.official.vsAvg.note")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className={sectionCard}>
                    <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                            {t("post.contrast.title")}
                          </h2>
                          <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                            {t("post.contrast.subtitle")}
                          </p>
                        </div>
                      </div>
                      <div className={subtleDivider} />
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                          <div className="text-sm text-slate-300">{t("post.contrast.contentQuality")}</div>
                          <div className="mt-2 text-2xl font-bold text-white">{officialLevelLabel(officialMetrics.contentQuality)}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                          <div className="text-sm text-slate-300">{t("post.contrast.actualReach")}</div>
                          <div className="mt-2 text-2xl font-bold text-white">{officialLevelLabel(officialMetrics.actualReach)}</div>
                        </div>
                      </div>
                      <div className="mt-4 text-sm text-slate-300">
                        {t("post.contrast.note")}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <Card className={sectionCard}>
                <CardContent className={`${sectionInnerCompact} ${sectionSpaceCompact}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {t("post.snapshot.title")}
                      </h2>
                      <p className="mt-1 text-[13px] sm:text-sm text-white/60 max-w-[72ch] leading-relaxed">
                        {t("post.snapshot.subtitle")}
                      </p>
                    </div>
                  </div>
                  <div className={subtleDivider} />
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryMode === "short" ? "default" : "outline"}
                      className={summaryMode === "short" ? "" : "border-white/15 text-slate-200 hover:bg-white/5"}
                      onClick={() => setSummaryMode("short")}
                    >
                      {t("post.snapshot.short")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryMode === "detailed" ? "default" : "outline"}
                      className={summaryMode === "detailed" ? "" : "border-white/15 text-slate-200 hover:bg-white/5"}
                      onClick={() => setSummaryMode("detailed")}
                    >
                      {t("post.snapshot.detailed")}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                    <textarea
                      className="w-full min-h-[180px] rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200 outline-none resize-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      readOnly
                      value={summaryMode === "short" ? shortCopyBlock : copyBlock}
                    />
                    <Button
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full lg:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                      onClick={async () => {
                        const ok = await copyToClipboard(summaryMode === "short" ? shortCopyBlock : copyBlock)
                        showToast(ok ? t("post.snapshot.toast.copied") : t("post.snapshot.toast.copyFailed"))
                      }}
                    >
                      {t("post.snapshot.copy")}
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
