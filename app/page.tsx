"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "../components/locale-provider"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import GrowthPaths from "../components/growth-paths"

type FakeAnalysis = {
  platform: "instagram" | "threads"
  username: string
  accountType: "Personal Account" | "Creator Account" | "Business Account"
  accountAge: "New account" | "Growing account" | "Established account"
  visibility: "Public" | "Limited visibility (simulated)"
  postingFrequency: "Low" | "Medium" | "High"
  recentActivityTrend: "Stable" | "Recent spike" | "Irregular pattern"
  contentConsistency: "Consistent" | "Mixed" | "Highly repetitive"
  engagementQuality: "Low" | "Medium" | "High"
  interactionPattern:
    | "Mostly organic"
    | "Partially automated (simulated)"
    | "Unclear interaction signals"
  automationLikelihood: "Low" | "Medium" | "High"
  abnormalBehaviorRisk: "Low" | "Medium" | "High"
  notes: string[]
  confidenceScore: number
  analysisType: "Demo analysis only"
  disclaimer: string
}

const riskBadgeStyle = (level: "Low" | "Medium" | "High") =>
  level === "High"
    ? "bg-red-500/10 border-red-500/30 text-red-200"
    : level === "Medium"
    ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

export default function Home() {
  const { locale, t } = useI18n()
  const [username, setUsername] = useState("")
  const [platform, setPlatform] = useState<"instagram" | "threads">("instagram")
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<{ title: string; desc: string } | null>(null)
  const [result, setResult] = useState<FakeAnalysis | null>(null)
  const [showDemo, setShowDemo] = useState(false)
  const [connectEnvError, setConnectEnvError] = useState<"missing_env" | null>(null)

  const datasets = useMemo(() => {
    return {
      accountTypes: ["Personal Account", "Creator Account", "Business Account"] as const,
      accountAges: ["New account", "Growing account", "Established account"] as const,
      visibility: ["Public", "Limited visibility (simulated)"] as const,
      postingFrequency: ["Low", "Medium", "High"] as const,
      activityTrend: ["Stable", "Recent spike", "Irregular pattern"] as const,
      consistency: ["Consistent", "Mixed", "Highly repetitive"] as const,
      engagementQuality: ["Low", "Medium", "High"] as const,
      interactionPattern: [
        "Mostly organic",
        "Partially automated (simulated)",
        "Unclear interaction signals",
      ] as const,
      automation: ["Low", "Medium", "High"] as const,
      abnormalRisk: ["Low", "Medium", "High"] as const,
      notesPool: [
        "Content cadence aligns with simulated human posting windows.",
        "Interactions show mixed authenticity signals (simulated).",
        "Detected repetitive captions across posts (simulated observation).",
        "Engagement velocity fluctuates — may be campaign-related (simulated).",
        "Audience mix appears organic with mild automation traces (simulated).",
        "Stories and replies cadence is irregular this week (simulated).",
        "Recent spike likely tied to promotional activity (simulated).",
      ],
      disclaimer:
        "This analysis is simulated for demonstration purposes only. No real account data or private information is accessed.",
    }
  }, [])

  const buildFakeResult = (u: string, p: "instagram" | "threads"): FakeAnalysis => {
    return {
      platform: p,
      username: u,
      accountType: pick(datasets.accountTypes),
      accountAge: pick(datasets.accountAges),
      visibility: pick(datasets.visibility),
      postingFrequency: pick(datasets.postingFrequency),
      recentActivityTrend: pick(datasets.activityTrend),
      contentConsistency: pick(datasets.consistency),
      engagementQuality: pick(datasets.engagementQuality),
      interactionPattern: pick(datasets.interactionPattern),
      automationLikelihood: pick(datasets.automation),
      abnormalBehaviorRisk: pick(datasets.abnormalRisk),
      notes: Array.from({ length: randInt(3, 5) }, () => pick(datasets.notesPool)),
      confidenceScore: randInt(65, 90),
      analysisType: "Demo analysis only",
      disclaimer: datasets.disclaimer,
    }
  }

  const router = useRouter()

  const handleConnect = () => {
    const run = async () => {
      setConnectEnvError(null)
      try {
        const r = await fetch(`/api/auth/instagram?locale=${encodeURIComponent(locale)}`, {
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
          window.location.href = loc || `/api/auth/instagram?locale=${encodeURIComponent(locale)}`
          return
        }

        window.location.href = `/api/auth/instagram?locale=${encodeURIComponent(locale)}`
      } catch {
        window.location.href = `/api/auth/instagram?locale=${encodeURIComponent(locale)}`
      }
    }

    void run()
  }

  const handleAnalyze = async () => {
    const u = username.trim().replace(/^@+/, "")
    setAlert(null)
    setResult(null)

    if (!u) {
      setAlert({ title: t("home.alerts.missingUsernameTitle"), desc: t("home.alerts.missingUsernameDesc") })
      return
    }

    setLoading(true)
    // Simulate analysis delay
    await new Promise((r) => setTimeout(r, randInt(700, 1200)))
    
    // Build the result and navigate to results page with query params
    const result = buildFakeResult(u, platform)
    const params = new URLSearchParams({
      username: result.username,
      platform: result.platform,
      accountType: result.accountType,
      confidenceScore: result.confidenceScore.toString(),
      automationLikelihood: result.automationLikelihood,
      abnormalBehaviorRisk: result.abnormalBehaviorRisk,
      engagementQuality: result.engagementQuality
    })
    
    router.push(`/${locale}/results?${params.toString()}`)
  }

  return (
    <main className="w-full flex items-center justify-center bg-[#0b1220] px-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          {!showDemo && (
            <>
              <CardTitle className="text-3xl">{t("home.connect.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("home.connect.subtitle")}
              </p>
            </>
          )}
          {showDemo && (
            <>
              <div className="text-xs tracking-widest text-muted-foreground">DEMO TOOL</div>
              <CardTitle className="text-3xl">{t("home.hero.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t("home.hero.subtitle")}
              </p>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {alert && (
            <Alert>
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.desc}</AlertDescription>
            </Alert>
          )}

          {!showDemo && (
            <>
              {connectEnvError === "missing_env" && (
                <Alert>
                  <AlertTitle>{t("home.connect.missingEnv.title")}</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-2">
                      <div>{t("home.connect.missingEnv.desc")}</div>
                      <div className="font-mono text-xs break-all">
                        APP_BASE_URL / META_APP_ID / META_APP_SECRET
                      </div>
                      <div>{t("home.connect.missingEnv.restartHint")}</div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="w-full overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                  <Button
                    type="button"
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg"
                    onClick={handleConnect}
                  >
                    {t("home.connect.cta")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg"
                    onClick={() => {
                      setConnectEnvError(null)
                      setShowDemo(true)
                    }}
                  >
                    {t("home.connect.viewDemo")}
                  </Button>
                </div>
              </div>
            </>
          )}

          {showDemo && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              await handleAnalyze();
            }} className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={platform === "instagram" ? "default" : "outline"}
                onClick={() => setPlatform("instagram")}
              >
                {t("home.tabs.instagram")}
              </Button>
              <Button
                type="button"
                variant={platform === "threads" ? "default" : "outline"}
                onClick={() => setPlatform("threads")}
              >
                {t("home.tabs.threads")}
              </Button>
            </div>

            <Input
              placeholder={t("home.input.placeholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <div className="w-full overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg"
                  disabled={loading}
                >
                  {loading ? t("home.cta.analyzingAccount") : t("home.cta.analyzeAccount")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/15 text-slate-200 hover:bg-white/5 px-6 py-3 rounded-lg"
                  onClick={() => router.push(`/${locale}/post-analysis`)}
                >
                  {t("home.cta.analyzePost")}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {t("home.helper.postAnalysisNote")}
              </div>
            </div>
              <div className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-200 hover:bg-white/5"
                  onClick={() => setShowDemo(false)}
                >
                  {t("home.connect.hideDemo")}
                </Button>
              </div>
            </form>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>{t("home.loading.analyzing")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
