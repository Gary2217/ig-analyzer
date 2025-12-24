"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
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

type IgMeResponse = {
  username: string
  profile_picture_url?: string
  account_type?: string
  followers_count?: number
  recent_media?: Array<{
    id: string
    media_type?: string
    media_url?: string
    caption?: string
    timestamp?: string
  }>
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
}: {
  value: number
  label: string
  subLabel?: ReactNode
}) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div
        className="h-12 w-12 rounded-full"
        style={{
          background: `conic-gradient(#34d399 ${v}%, rgba(255,255,255,0.12) ${v}%)`,
        }}
      >
        <div className="m-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-full bg-[#0b1220]/90 flex items-center justify-center">
          <span className="text-xs font-semibold text-white">{v}%</span>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">{label}</div>
        {subLabel ? <div className="text-xs text-white/60">{subLabel}</div> : null}
      </div>
    </div>
  )
}

export default function ResultsPage() {
  console.log("[LocaleResultsPage] mounted")

  const router = useRouter()
  const pathname = usePathname() || "/"
  const searchParams = useSearchParams()
  const { t } = useI18n()

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

  const [media, setMedia] = useState<Array<{ id: string; timestamp: string }>>([])
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

  const activeLocale = (extractLocaleFromPathname(pathname).locale ?? "en") as "zh-TW" | "en"

  const isConnected = Boolean(igMe?.username)
  const connectedProvider = searchParams.get("connected")
  const isConnectedInstagram = connectedProvider === "instagram"

  const hasRealProfile = Boolean(igMe?.username)
  const allowDemoProfile = !hasRealProfile && !igMeLoading

  const recentPosts = isConnectedInstagram && topPosts.length > 0 ? topPosts : igMe?.recent_media

  useEffect(() => {
    if (!isConnected) return

    if (mediaLoaded) return

    console.log("[media] fetch (from ConnectedGate)")
    fetch("/api/instagram/media", { cache: "no-store", credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        setMedia(json.data)
        setMediaLoaded(true)
      })
      .catch((err) => {
        console.error("[media] fetch failed", err)
      })
  }, [isConnected])

  useEffect(() => {
    if (!isConnected) return
    if (!isConnectedInstagram) return
    if (topPosts.length > 0) return

    fetch("/api/instagram/media?limit=25", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        const items = Array.isArray(json?.data) ? json.data : []
        setTopPosts(
          items
            .filter((m: any) => ["IMAGE", "VIDEO", "CAROUSEL_ALBUM"].includes(String(m?.media_type || "")))
            .sort((a: any, b: any) => (Number(b?.like_count || 0) || 0) - (Number(a?.like_count || 0) || 0))
            .slice(0, 3),
        )
      })
      .catch(() => {})
  }, [isConnected, isConnectedInstagram, topPosts.length])

  const displayUsername = hasRealProfile ? (typeof igMe?.username === "string" ? igMe.username.trim() : "") : ""

  const displayName = (() => {
    if (allowDemoProfile) return mockAnalysis.profile.displayName
    const raw = (igMe as any)?.name ?? (igMe as any)?.display_name ?? (igMe as any)?.displayName
    if (typeof raw === "string" && raw.trim()) return raw.trim()
    return displayUsername ? displayUsername : "—"
  })()

  const displayHandle = (() => {
    if (allowDemoProfile) return `@${mockAnalysis.profile.username}`
    return displayUsername ? `@${displayUsername}` : "—"
  })()

  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null

  const formatNum = (n: number | null) => (n === null ? "—" : n.toLocaleString())

  const isPreview = (n: number | null) => isConnected && n === null

  const kpiFollowers = numOrNull((igMe as any)?.followers_count)
  const kpiFollowing = numOrNull((igMe as any)?.follows_count ?? (igMe as any)?.following_count)
  const kpiMediaCount = numOrNull((igMe as any)?.media_count)
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

    return mockAnalysis.topPosts.slice(0, 3).map((p) => ({ ...p, engagement: p.likes + p.comments }))
  })()

  const clamp0to100 = (n: number) => Math.max(0, Math.min(100, n))
  const safePercent = (n: number | null) => (n === null ? 0 : clamp0to100(n))
  const formatPct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`)

  const engagementRate = (() => {
    if (!isConnected) return null
    if (kpiFollowers === null || kpiFollowers <= 0) return null
    if (!Array.isArray(media) || media.length === 0) return null

    const sample = media.slice(0, 12)
    let total = 0
    let count = 0

    for (const m of sample) {
      const likes = numOrNull((m as any)?.like_count)
      const comments = numOrNull((m as any)?.comments_count)
      if (likes === null && comments === null) continue
      total += (likes ?? 0) + (comments ?? 0)
      count += 1
    }

    if (count === 0) return null
    const avg = total / count
    return (avg / kpiFollowers) * 100
  })()

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

        const data = (await r.json()) as IgMeResponse
        setIgMe(data?.username ? data : null)
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
  }, [])

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
        const r = await fetch(`/api/auth/instagram?locale=${encodeURIComponent(activeLocale)}`, {
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
          window.location.href = loc || `/api/auth/instagram?locale=${encodeURIComponent(activeLocale)}`
          return
        }

        window.location.href = `/api/auth/instagram?locale=${encodeURIComponent(activeLocale)}`
      } catch {
        window.location.href = `/api/auth/instagram?locale=${encodeURIComponent(activeLocale)}`
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
      value: isConnected ? "—" : `${(mockAnalysis.metrics.engagementRate * 100).toFixed(1)}%`,
      preview: isConnected,
    },
    {
      id: "avgLikes",
      titleKey: "results.kpis.avgLikes.title",
      descriptionKey: "results.kpis.avgLikes.description",
      value: isConnected ? "—" : mockAnalysis.metrics.avgLikes.toLocaleString(),
      preview: isConnected,
    },
    {
      id: "avgComments",
      titleKey: "results.kpis.avgComments.title",
      descriptionKey: "results.kpis.avgComments.description",
      value: isConnected ? "—" : mockAnalysis.metrics.avgComments.toLocaleString(),
      preview: isConnected,
    },
    {
      id: "engagementVolume",
      titleKey: "results.kpis.engagementVolume.title",
      descriptionKey: "results.kpis.engagementVolume.description",
      value: isConnected ? "—" : (mockAnalysis.metrics.avgLikes + mockAnalysis.metrics.avgComments).toLocaleString(),
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
                  href={`/${activeLocale}/api/auth/instagram?provider=instagram&next=/${activeLocale}/results`}
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
                    {isConnected && igMe?.profile_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={igMe.profile_picture_url}
                        alt={`@${igMe.username}`}
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
                          {isConnected ? `@${igMe!.username}` : t("results.instagram.connectPromptHandle")}
                        </span>
                      </div>
                      {isConnected && typeof igMe?.followers_count === "number" && (
                        <div className="mt-1 text-sm text-slate-300">
                          {t("results.instagram.followersLabel")}: {igMe.followers_count.toLocaleString()}
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
                    {igMe?.profile_picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={igMe.profile_picture_url}
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
                    </div>
                  </div>

                  <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center justify-center">
                    <div className="grid grid-cols-3 gap-4 xl:gap-6 md:min-w-[360px] text-center">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.instagram.followersLabel")}</div>
                        <div className="mt-1 text-2xl font-semibold text-white leading-none">
                          <span>{formatNum(followers)}</span>
                          {isPreview(kpiFollowers) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.followingLabel")}</div>
                        <div className="mt-1 text-2xl font-semibold text-white leading-none">
                          <span>{formatNum(following)}</span>
                          {isPreview(kpiFollowing) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.postsLabel")}</div>
                        <div className="mt-1 text-2xl font-semibold text-white leading-none">
                          <span>{formatNum(posts)}</span>
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
                        <div className="text-xs text-slate-400">{t("results.instagram.followersLabel")}</div>
                        <div className="mt-1 text-2xl font-semibold text-white leading-none">
                          <span>{formatNum(followers)}</span>
                          {isPreview(kpiFollowers) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.followingLabel")}</div>
                        <div className="mt-1 text-2xl font-semibold text-white leading-none">
                          <span>{formatNum(following)}</span>
                          {isPreview(kpiFollowing) && (
                            <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              預覽
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs text-slate-400">{t("results.profile.postsLabel")}</div>
                        <div className="mt-1 text-2xl font-semibold text-white leading-none">
                          <span>{formatNum(posts)}</span>
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

              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                {(() => {
                  const ring1Val = isConnected
                    ? engagementRate
                    : numOrNull(Math.round((mockAnalysis.metrics.engagementRate ?? 0) * 100))

                  const ring2Val = isConnected
                    ? cadenceScore
                    : numOrNull(Math.min(100, Math.round(((mockAnalysis.metrics.avgLikes ?? 0) / 1000) * 100)))

                  const ring3Val = isConnected
                    ? topPerformanceScore
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
                        subLabel={
                          isConnected ? (
                            <>
                              {formatPct(ring1Val)}
                              {isPreview(ring1Val) ? previewBadge : null}
                            </>
                          ) : (
                            t("results.rings.engagementRate.description")
                          )
                        }
                      />
                      <ProgressRing
                        value={safePercent(ring2Val)}
                        label={t("results.rings.likeStrength.label")}
                        subLabel={
                          isConnected ? (
                            <>
                              {formatPct(ring2Val)}
                              {isPreview(ring2Val) ? previewBadge : null}
                            </>
                          ) : (
                            t("results.rings.likeStrength.description")
                          )
                        }
                      />
                      <ProgressRing
                        value={safePercent(ring3Val)}
                        label={t("results.rings.commentStrength.label")}
                        subLabel={
                          isConnected ? (
                            <>
                              {formatPct(ring3Val)}
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

                      <div className="mt-1 text-2xl font-semibold text-white">
                        <span>{kpi.value}</span>
                        {kpi.preview ? (
                          <span className="ml-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                            預覽
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-white/75">{t(kpi.descriptionKey)}</div>
                      {safeT(`results.kpi.consequence.${kpi.id}`) ? (
                        <div className="mt-1 text-xs text-white/45">
                          {safeT(`results.kpi.consequence.${kpi.id}`)}
                        </div>
                      ) : null}

                      {evalNote ? <div className="mt-2 text-xs text-muted-foreground">{evalNote}</div> : null}

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
                  <CardTitle className="text-base text-white">{t("results.topPosts.title")}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("results.topPosts.description")}
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={() => {
                    router.push(`/${activeLocale}/post-analysis`)
                  }}
                  className="h-9 px-4 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30 border border-white/10"
                >
                  {activeLocale === "zh-TW" ? "分析貼文" : "Analyze Posts"}
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {mockAnalysis.topPosts.slice(0, 3).map((p, index) => (
                    <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-xs text-slate-400">{t("results.topPosts.card.likesLabel")}</div>
                          <div className="mt-1 text-lg font-semibold text-white">
                            {(topPerformingPosts[index]?.likes ?? p.likes).toLocaleString()}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400">{t("results.topPosts.card.commentsLabel")}</div>
                          <div className="mt-1 text-lg font-semibold text-white">
                            {(topPerformingPosts[index]?.comments ?? p.comments).toLocaleString()}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400">{t("results.topPosts.card.engagementLabel")}</div>
                          <div className="mt-1 text-lg font-semibold text-white">
                            {(topPerformingPosts[index]?.engagement ?? (p.likes + p.comments)).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground">
                        {t("results.topPosts.card.proHintFull")}
                      </div>

                      <div className="mt-4 text-sm text-muted-foreground">
                        {t("results.topPosts.card.proHint")}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {media[index]
                          ? `Post ID: ${media[index].id} · ${new Date(
                              media[index].timestamp
                            ).toLocaleDateString()}`
                          : t("results.topPosts.card.metadataFallback")}
                      </div>
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
