"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { ArrowLeft, Instagram, AtSign } from "lucide-react"
import GrowthPaths from "../../components/growth-paths"
import { MonetizationSection } from "../../components/monetization-section"
import { ShareResults } from "../../components/share-results"
import { extractLocaleFromPathname, localePathname } from "../lib/locale-path"

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

export default function ResultsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname() || "/"
  const searchParams = useSearchParams()
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

  const displayUsername = isConnected ? igMe!.username : ""

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
    // In a real app, you would fetch the analysis results here
    // For demo purposes, we'll simulate a loading state and then set the result
    const timer = setTimeout(() => {
      setResult({
        platform: searchParams.get('platform') as "instagram" | "threads" || "instagram",
        username: searchParams.get('username') || '',
        accountType: searchParams.get('accountType') || 'Personal Account',
        accountAge: 'Established account',
        visibility: 'Public',
        postingFrequency: 'High',
        recentActivityTrend: 'Stable',
        contentConsistency: 'Consistent',
        engagementQuality: 'High',
        interactionPattern: 'Mostly organic',
        automationLikelihood: 'Low',
        abnormalBehaviorRisk: 'Low',
        notes: [
          'Content cadence aligns with human posting windows.',
          'Engagement appears organic and consistent.',
          'No signs of automation detected.'
        ],
        confidenceScore: 92,
        analysisType: t('results.demo.analysisType'),
        disclaimer: t('results.demo.disclaimer')
      })
      setLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [searchParams, t])

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

  return (
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
      {igMeLoading || loading ? (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p>{t("results.states.loading")}</p>
          </div>
        </main>
      ) : igMeUnauthorized ? (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
          <Card className="w-full max-w-2xl rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-white">
                {t("results.instagram.connectGate.title")}
              </CardTitle>
              <p className="text-sm text-slate-300 mt-2">
                {t("results.instagram.connectGate.desc")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectEnvError === "missing_env" && (
                <Alert>
                  <AlertTitle>{t("results.instagram.missingEnv.title")}</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2">
                      <div>{t("results.instagram.missingEnv.desc")}</div>
                      <div className="font-mono text-xs break-all">
                        APP_BASE_URL / META_APP_ID / META_APP_SECRET
                      </div>
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
      ) : !hasResult ? (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
          <Alert>
            <AlertTitle>{t("results.states.noResultsTitle")}</AlertTitle>
            <AlertDescription>
              {t("results.states.noResultsDesc")}
            </AlertDescription>
            <Button className="mt-4" onClick={() => router.push(localePathname("/", activeLocale))}>{t("results.actions.backToHome")}</Button>
          </Alert>
        </main>
      ) : (
        <main className="min-h-screen w-full bg-gradient-to-b from-[#0b1220]/100 via-[#0b1220]/95 to-[#0b1220]/90 overflow-x-hidden">
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

          <Card className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
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
                        className="h-12 w-12 rounded-full border border-white/10 object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-600/40 border border-white/10 flex items-center justify-center shrink-0">
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

          <div className="mt-10 space-y-12">
            {isConnected && (
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">{t("results.instagram.recentPostsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {Array.isArray(igMe?.recent_media) && igMe!.recent_media!.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {igMe!.recent_media!.slice(0, 3).map((m) => {
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

                <Card id="results-section-insights" className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
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

                {/* Share Results Section - Moved to bottom of main content */}
              </div>

              {hasSidebar && (
                <div className="lg:col-span-1 w-full">
                  <Card className="sticky top-4 max-h-[calc(100vh-6rem)] rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
                    <CardHeader className="border-b border-white/10">
                      <CardTitle className="text-base">{t("results.sidebar.title")}</CardTitle>
                      <p className="text-sm text-slate-400 mt-1 lg:mt-0.5">
                        {t("results.sidebar.subtitle")} @{displayUsername}
                      </p>
                    </CardHeader>
                    <div className="flex-1 overflow-y-auto">
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

            <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:shadow-lg">
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
              <div className={`rounded-xl border border-white/10 bg-white/5 px-4 md:px-6 py-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg ${upgradeHighlight ? "ring-2 ring-blue-500/50" : ""}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-200 leading-relaxed">{t("results.footer.proPitchTitle")}</div>
                    <div className="mt-1 text-xs text-slate-400 leading-relaxed">{t("results.footer.proPitchDesc")}</div>
                  </div>
                  <Button
                    id="results-pro-upgrade"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 w-full md:w-auto"
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
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsProModalOpen(false)}
          />
          <div className="absolute inset-x-4 sm:inset-x-6 md:inset-x-0 md:left-1/2 md:-translate-x-1/2 top-24 md:top-28 md:w-[640px] rounded-2xl border border-white/10 bg-[#0b1220]/95 backdrop-blur-md shadow-2xl">
            <div className="p-4 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mt-1 text-lg font-semibold text-white leading-snug">
                    {t("results.footer.proModalTitle")}
                  </div>
                  <div className="mt-1 text-sm text-slate-300 leading-relaxed">
                    {t("results.footer.proModalDesc")}
                  </div>
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
      )}
    </>
  )
}
