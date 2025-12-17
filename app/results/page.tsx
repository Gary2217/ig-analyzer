"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { ArrowLeft } from "lucide-react"
import GrowthPaths from "../../components/growth-paths"
import AccountScores from "../../components/account-scores"
import { MonetizationSection } from "../../components/monetization-section"
import { ShareResults } from "../../components/share-results"

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
  const { locale, t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [result, setResult] = useState<FakeAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [headerCopied, setHeaderCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [exporting, setExporting] = useState(false)

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
        analysisType: 'Demo analysis',
        disclaimer: 'This is a simulated analysis for demonstration purposes.'
      })
      setLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [searchParams])

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

  const hasSidebar = Boolean(safeResult.username)

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

  const headerInsight = (() => {
    const growth =
      safeResult.engagementQuality === "High"
        ? "Strong engagement signals detected"
        : "Engagement signals look uneven"
    const monetization = isSubscribed ? "with clear monetization paths" : "but monetization readiness is underutilized"
    const risk =
      safeResult.automationLikelihood === "High" ? "Automation risk signals require attention." : ""
    return [growth, monetization, risk].filter(Boolean).join(", ")
  })()

  const reportSummaryLine = (() => {
    const strength = safeResult.engagementQuality === "High" ? "Strength: engagement quality" : "Strength: consistent account signals"
    const bottleneck =
      !isSubscribed
        ? "Bottleneck: monetization readiness"
        : safeResult.automationLikelihood === "High"
        ? "Bottleneck: automation risk"
        : "Bottleneck: prioritization"
    const nextStep =
      safeResult.engagementQuality === "Low"
        ? "Next step: strengthen hooks and comment velocity"
        : safeResult.automationLikelihood === "High"
        ? "Next step: reduce automation patterns and stabilize activity"
        : "Next step: execute the top three improvements this week"
    return `${strength} • ${bottleneck} • ${nextStep}.`
  })()

  const summaryText = (() => {
    return `Account Analysis Summary\n\nAccount: @${safeResult.username}\nPlatform: ${safeResult.platform === "instagram" ? "Instagram" : "Threads"}\n\nPrimary signals\n- Account Authenticity: ${safeResult.confidenceScore}% (${authenticityStatus})\n- Engagement Quality: ${engagementPercent}% (${engagementStatus})\n- Automation Risk: ${automationRiskPercent}% (${automationStatus})\n\nRecommendation\n- ${reportSummaryLine}\n\nThis report reflects inferred analysis based on public signals, not official platform-provided metrics.\n`
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
    showToast(t("results.toast.comingSoon"))
    router.push(`/${locale}`)
  }

  const handleConnect = () => {
    showToast(t("results.toast.connectSoon"))
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
      {loading ? (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p>{t("results.states.loading")}</p>
          </div>
        </main>
      ) : !hasResult ? (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0b1220] px-4 overflow-x-hidden">
          <Alert>
            <AlertTitle>{t("results.states.noResultsTitle")}</AlertTitle>
            <AlertDescription>
              {t("results.states.noResultsDesc")}
            </AlertDescription>
            <Button className="mt-4" onClick={() => router.push(`/${locale}`)}>{t("results.actions.backToHome")}</Button>
          </Alert>
        </main>
      ) : (
        <main className="min-h-screen w-full bg-gradient-to-b from-[#0b1220]/100 via-[#0b1220]/95 to-[#0b1220]/90 overflow-x-hidden">
          <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1220]/80 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-200 border border-white/10">
                      Demo data / Sample output
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20">
                      {safeResult.platform === "instagram" ? "Instagram" : "Threads"}
                    </span>
                    <span className="text-[11px] text-slate-300 truncate">@{safeResult.username}</span>
                  </div>
                  <div className="text-sm font-semibold text-white truncate">{t("results.title")}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={() => router.push(`/${locale}/post-analysis`)}
                  >
                    {t("results.actions.analyzePost")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={handleCopySummary}
                    aria-busy={headerCopied ? true : undefined}
                  >
                    {headerCopied ? t("results.actions.copied") : t("results.actions.copySummary")}
                  </Button>
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={handleShare}
                    aria-busy={shareCopied ? true : undefined}
                  >
                    {shareCopied ? t("results.actions.copied") : t("results.actions.share")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{t("results.title")}</h1>
              <p className="text-sm text-slate-300 max-w-2xl">
                {t("results.subtitle")}
              </p>
            </div>

          <Card className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <div className="text-sm text-slate-300">Overview</div>
                  <div className="text-3xl sm:text-4xl font-bold text-white tracking-tight">@{safeResult.username}</div>
                  <div className="text-sm text-slate-300 max-w-2xl">{headerInsight}</div>
                  {safeResult.platform === "threads" && (
                    <div className="text-xs text-slate-400 max-w-2xl">
                      Threads-related insights are inferred from content cadence and engagement overlap signals.
                    </div>
                  )}
                  <div className="text-sm text-slate-200/90 max-w-3xl">
                    {reportSummaryLine}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={handleUpgrade}
                  >
                    {t("results.actions.upgrade")}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                    onClick={() => showToast("Summary panel coming soon")}
                  >
                    {t("results.actions.viewSummary")}
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(() => {
                  const t = metricTone(authenticityStatus)
                  return (
                    <Card className={`rounded-xl border ${t.border} ${t.bg} h-full transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl`}>
                      <CardContent className="p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-200">Account Authenticity</div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${t.text} ${t.bg}`}>
                            {t.label}
                          </span>
                        </div>
                        <div className="mt-3 text-3xl font-bold text-white">{safeResult.confidenceScore}%</div>
                        <div className="mt-1 text-sm text-slate-300">
                          Signals consistent with organic human-like activity based on public engagement patterns.
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          This is an inferred signal, not a verification of identity.
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {(() => {
                  const t = metricTone(engagementStatus)
                  return (
                    <Card className={`rounded-xl border ${t.border} ${t.bg} h-full transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl`}>
                      <CardContent className="p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-200">Engagement Quality</div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${t.text} ${t.bg}`}>
                            {t.label}
                          </span>
                        </div>
                        <div className="mt-3 text-3xl font-bold text-white">{engagementPercent}%</div>
                        <div className="mt-1 text-sm text-slate-300">
                          Evaluated using publicly observable interaction depth, comment structure, and engagement consistency.
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {(() => {
                  const t = metricTone(automationStatus)
                  return (
                    <Card className={`rounded-xl border ${t.border} ${t.bg} h-full transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl`}>
                      <CardContent className="p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-slate-200">Automation Risk</div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${t.text} ${t.bg}`}>
                            {t.label}
                          </span>
                        </div>
                        <div className="mt-3 text-3xl font-bold text-white">{automationRiskPercent}%</div>
                        <div className="mt-1 text-sm text-slate-300">
                          Confidence score indicating likelihood of automated-like or abnormal activity patterns based on timing and interaction signals.
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}
              </div>
            </CardContent>
          </Card>

          <div className="mt-10 space-y-12">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-300">Performance Overview</div>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">How your account performs across growth-critical dimensions</h2>
              </div>
              <Button variant="ghost" onClick={() => router.back()} className="text-slate-200 hover:bg-white/5">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </div>

            {/* Responsive grid: 手機 1 欄；有 sidebar 時 md+ 並排，無 sidebar 則單欄撐滿 */}
            <div className="grid grid-cols-1 gap-8 lg:gap-6">
              <div className="w-full lg:col-span-2 space-y-6 lg:space-y-4">
                <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                  <CardHeader className="border-b border-white/10">
                    <CardTitle className="text-2xl lg:text-2xl font-bold">
                      Performance Overview
                      <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-800/50">
                        {safeResult.platform === 'instagram' ? 'Instagram' : 'Threads'}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-medium text-white">Radar & Signal Summary</div>
                        <div className="text-sm text-slate-300">
                          This section summarizes growth signals across authenticity, engagement, content consistency, and risk patterns.
                        </div>
                      </div>
                    <AccountScores 
                      result={{
                        confidenceScore: safeResult.confidenceScore,
                        automationLikelihood: safeResult.automationLikelihood as "Low" | "Medium" | "High",
                        abnormalBehaviorRisk: safeResult.abnormalBehaviorRisk as "Low" | "Medium" | "High",
                        engagementQuality: safeResult.engagementQuality as "Low" | "Medium" | "High",
                        contentConsistency: safeResult.contentConsistency as "Low" | "Medium" | "High",
                        postingFrequency: safeResult.postingFrequency as "Low" | "Medium" | "High"
                      }} 
                    />
                      <div className="pt-2 border-t border-white/10 text-sm text-slate-300">
                        How to interpret: prioritize the lowest dimension first; it usually caps overall growth.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                  <CardHeader className="border-b border-white/10">
                    <CardTitle className="text-xl lg:text-xl font-bold">Monetization Readiness</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-slate-400 mb-3">
                      Based on historical patterns observed across similar public creator profiles.
                    </p>
                    <div className="relative rounded-xl border border-white/10 bg-white/5 p-5">
                      <div className={!isSubscribed ? "blur-sm pointer-events-none select-none" : undefined}>
                        <MonetizationSection 
                          monetizationGap={18} // This would be calculated from the analysis in a real app
                          isSubscribed={isSubscribed}
                        />
                      </div>

                      {!isSubscribed && (
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-[#0b1220]/80 backdrop-blur-sm p-6">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                              <div className="space-y-3">
                                <div className="text-sm text-slate-200">
                                  Only 18% of accounts with this profile consistently monetize.
                                </div>
                                <div className="text-sm text-slate-300">
                                  Best for creators and teams who want a repeatable revenue path without sacrificing growth.
                                </div>
                                <div className="pt-2">
                                  <div className="text-xs text-slate-300">Unlocks</div>
                                  <ul className="mt-2 text-sm text-slate-200 space-y-2">
                                    <li>Personalized growth levers</li>
                                    <li>Monetization timing insights</li>
                                    <li>Platform-specific optimization actions</li>
                                    <li>Priority action plan for the next 14 days</li>
                                  </ul>
                                </div>
                              </div>
                              <div className="w-full lg:w-auto flex flex-col gap-2">
                                <Button
                                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full lg:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                                  onClick={handleUpgrade}
                                >
                                  Unlock the full monetization roadmap
                                </Button>
                                <Button
                                  variant="outline"
                                  className="border-white/15 text-slate-200 hover:bg-white/5 w-full lg:w-auto focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                                  onClick={handleConnect}
                                >
                                  {t("results.actions.connect")}
                                </Button>
                                <div className="text-xs text-slate-300">
                                  You’ll receive a clear plan, priorities, and platform-specific actions.
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                  <CardHeader className="border-b border-white/10">
                    <CardTitle className="text-xl lg:text-xl font-bold">Account Insights</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 lg:space-y-3">
                      <div className="grid grid-cols-2 gap-6 lg:gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Account Type</p>
                          <p className="font-medium">{safeResult.accountType}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Account Age</p>
                          <p className="font-medium">{safeResult.accountAge}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Visibility</p>
                          <p className="font-medium">{safeResult.visibility}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Posting Frequency</p>
                          <p className="font-medium">{safeResult.postingFrequency}</p>
                        </div>
                      </div>

                      {safeResult.notes.length > 0 && (
                        <div>
                          <h3 className="text-sm font-medium mb-2">Key Findings</h3>
                          <ul className="space-y-2 lg:space-y-1.5">
                            {safeResult.notes.map((note, i) => (
                              <li key={i} className="flex items-start">
                                <span className="text-green-500 mr-2">•</span>
                                <span>{note}</span>
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
                  <Card className="sticky top-4 max-h-[calc(100vh-6rem)] rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                    <CardHeader className="border-b border-white/10">
                      <CardTitle className="text-base">Growth Opportunities</CardTitle>
                      <p className="text-sm text-slate-400 mt-1 lg:mt-0.5">
                        Personalized recommendations for @{safeResult.username}
                      </p>
                    </CardHeader>
                    <div className="flex-1 overflow-y-auto">
                      <CardContent className="pb-6 lg:pb-4">
                        <GrowthPaths
                          result={{
                            handle: safeResult.username,
                            platform: safeResult.platform,
                            confidence: safeResult.confidenceScore,
                            abnormalBehaviorRisk: safeResult.abnormalBehaviorRisk as "Low" | "Medium" | "High",
                            automationLikelihood: safeResult.automationLikelihood as "Low" | "Medium" | "High",
                          }}
                        />
                      </CardContent>
                    </div>
                  </Card>
                </div>
              )}
            </div>

            <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="text-xl lg:text-xl font-bold">Recommended Next Actions</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  A focused 3-step plan mapped to the strongest signals and current constraints.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {(() => {
                    const status =
                      safeResult.contentConsistency === "Consistent"
                        ? "good"
                        : safeResult.contentConsistency === "Mixed"
                        ? "warning"
                        : "risk"
                    const t = metricTone(status)
                    const priority = status === "risk" ? "High priority" : status === "warning" ? "Medium priority" : "Maintain"
                    return (
                      <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                        <CardContent className="p-5 h-full">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">Step 1</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${t.text} ${t.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-2 text-base font-semibold text-white">Improve content consistency</div>
                          <div className="mt-2 text-sm text-slate-300">Reduce variability to improve distribution.</div>
                          <div className="mt-1 text-sm text-slate-300">
                            Focus on a repeatable format and cadence for the next 7 days.
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })()}

                  {(() => {
                    const status = engagementStatus
                    const t = metricTone(status)
                    const priority = status === "risk" ? "High priority" : status === "warning" ? "Medium priority" : "Maintain"
                    return (
                      <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                        <CardContent className="p-5 h-full">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">Step 2</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${t.text} ${t.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-2 text-base font-semibold text-white">Optimize engagement hooks</div>
                          <div className="mt-2 text-sm text-slate-300">
                            Increase early retention and qualified interactions.
                          </div>
                          <div className="mt-1 text-sm text-slate-300">
                            Use clearer CTAs and comment prompts in the first 2 lines.
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })()}

                  {(() => {
                    const status = isSubscribed ? "good" : "warning"
                    const t = metricTone(status)
                    const priority = status === "warning" ? "High priority" : "Maintain"
                    return (
                      <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                        <CardContent className="p-5 h-full">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-white">Step 3</div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border border-white/10 ${t.text} ${t.bg}`}
                            >
                              {priority}
                            </span>
                          </div>
                          <div className="mt-2 text-base font-semibold text-white">Activate monetization signals</div>
                          <div className="mt-2 text-sm text-slate-300">Align content, offers, and positioning.</div>
                          <div className="mt-1 text-sm text-slate-300">
                            Introduce consistent callouts to offers, case studies, or lead magnets.
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
              <CardHeader className="border-b border-white/10">
                <CardTitle className="text-xl lg:text-xl font-bold">Copyable Summary</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  Share a compact snapshot with your team or clients.
                </p>
              </CardHeader>
              <CardContent>
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
                    Copy
                  </Button>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Analysis is based on publicly observable data, historical patterns, and inferred behavioral models. No private data or direct account access is used.
                </p>
              </CardContent>
            </Card>

            <div className="mt-12 lg:mt-8 space-y-8 lg:space-y-6">
              <ShareResults 
                platform={safeResult.platform === 'instagram' ? 'Instagram' : 'Threads'}
                username={safeResult.username}
                monetizationGap={18}
              />
              <div className="text-center text-sm text-slate-400 pt-4 lg:pt-3 border-t border-slate-800">
                <p>{safeResult.disclaimer}</p>
              </div>
            </div>
            <div className="mt-16 pt-8 border-t border-gray-800/50">
              <div className="text-center text-gray-400 text-sm">
                <p>Used by creators, agencies, and growth teams to evaluate social account potential.</p>
                <Button
                  className="mt-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg transition-all focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                  onClick={handleUpgrade}
                >
                  Upgrade to Pro
                </Button>
              </div>
            </div>
          </div>
          </div>
        </main>
      )}
    </>
  )
}
