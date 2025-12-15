"use client"

import { useMemo, useState, type CSSProperties } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

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
  interactionPattern: "Mostly organic" | "Partially automated (simulated)" | "Unclear interaction signals"
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
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState<{ title: string; desc: string } | null>(null)
  const [result, setResult] = useState<FakeAnalysis | null>(null)

  const datasets = useMemo(() => {
    return {
      platforms: ["instagram", "threads"] as const,
      accountTypes: ["Personal Account", "Creator Account", "Business Account"] as const,
      accountAges: ["New account", "Growing account", "Established account"] as const,
      visibility: ["Public", "Limited visibility (simulated)"] as const,
      postingFrequency: ["Low", "Medium", "High"] as const,
      activityTrend: ["Stable", "Recent spike", "Irregular pattern"] as const,
      consistency: ["Consistent", "Mixed", "Highly repetitive"] as const,
      engagementQuality: ["Low", "Medium", "High"] as const,
      interactionPattern: ["Mostly organic", "Partially automated (simulated)", "Unclear interaction signals"] as const,
      automation: ["Low", "Medium", "High"] as const,
      abnormalRisk: ["Low", "Medium", "High"] as const,
      notesPool: [
        "Content cadence aligns with simulated human posting windows.",
        "Interactions show mixed authenticity signals (simulated).",
        "Detected repetitive captions across posts (simulated observation).",
        "Engagement velocity fluctuates — may be campaign-related (simulated).",
        "Audience mix appears organic with mild automation traces (simulated).",
        "Stories and replies cadence is irregular this week (simulated).",
        "No private data accessed — demo-only synthesis.",
        "Recent spike likely tied to promotional activity (simulated).",
      ],
      disclaimer:
        "This analysis is simulated for demonstration purposes only. No real account data or private information is accessed.",
    }
  }, [])

  const buildFakeResult = (u: string): FakeAnalysis => {
    const automationLikelihood = pick(datasets.automation)
    const abnormalBehaviorRisk = pick(datasets.abnormalRisk)
    const notesCount = randInt(3, 6)
    const notes = Array.from({ length: notesCount }, () => pick(datasets.notesPool))

    return {
      platform: pick(datasets.platforms),
      username: u,
      accountType: pick(datasets.accountTypes),
      accountAge: pick(datasets.accountAges),
      visibility: pick(datasets.visibility),
      postingFrequency: pick(datasets.postingFrequency),
      recentActivityTrend: pick(datasets.activityTrend),
      contentConsistency: pick(datasets.consistency),
      engagementQuality: pick(datasets.engagementQuality),
      interactionPattern: pick(datasets.interactionPattern),
      automationLikelihood,
      abnormalBehaviorRisk,
      notes,
      confidenceScore: randInt(60, 95),
      analysisType: "Demo analysis only",
      disclaimer: datasets.disclaimer,
    }
  }

  const handleAnalyze = async () => {
    const u = username.trim().replace(/^@+/, "")
    setAlert(null)
    setResult(null)

    if (!u) {
      setAlert({ title: "Missing username", desc: "Please enter a public IG or Threads username (demo)." })
      return
    }

    setLoading(true)

    const delay = randInt(800, 1200)
    await new Promise((r) => setTimeout(r, delay))

    setResult(buildFakeResult(u))
    setLoading(false)
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="space-y-2">
          <div className="text-xs tracking-widest text-muted-foreground">DEMO TOOL</div>
          <CardTitle className="text-3xl">IG / Threads Account Analyzer (Simulated)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter a public username to generate a simulated account analysis. No real data is queried.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {alert && (
            <Alert>
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.desc}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">IG / Threads Username</div>
            <Input
              placeholder="Enter @username (demo only)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAnalyze()
              }}
            />
          </div>

          <Button className="w-full" onClick={handleAnalyze} disabled={loading}>
            {loading ? "Analyzing account… (simulated)" : "Analyze"}
          </Button>

          {loading && (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Running demo checks</div>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Reviewing public posting cadence (simulated)</li>
                <li>Estimating engagement quality signals (simulated)</li>
                <li>Scoring behavior risk & confidence (simulated)</li>
              </ul>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">Simulated Analysis Result</div>
                  <div className={`text-xs px-2 py-1 rounded-full border ${riskBadgeStyle(result.abnormalBehaviorRisk)}`}>
                    Risk: {result.abnormalBehaviorRisk}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-lg font-semibold">
                  <span>@{result.username}</span>
                  <span className="text-sm rounded-full bg-slate-50/5 px-2 py-1 text-muted-foreground border">
                    {result.platform === "instagram" ? "Instagram" : "Threads"}
                  </span>
                  <span className="text-xs rounded-full bg-slate-50/5 px-2 py-1 text-muted-foreground border">
                    {result.analysisType}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50/5 p-4 space-y-2">
                    <div className="text-xs text-muted-foreground tracking-wide">Account status (simulated)</div>
                    <div className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Account type</span>
                        <span className="font-medium">{result.accountType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Account age</span>
                        <span className="font-medium">{result.accountAge}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Visibility</span>
                        <span className="font-medium">{result.visibility}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-slate-50/5 p-4 space-y-2">
                    <div className="text-xs text-muted-foreground tracking-wide">Behavior patterns (simulated)</div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Posting</span>
                        <span className="font-medium">{result.postingFrequency}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Activity trend</span>
                        <span className="font-medium">{result.recentActivityTrend}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Content consistency</span>
                        <span className="font-medium">{result.contentConsistency}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-slate-50/5 p-4 space-y-2">
                    <div className="text-xs text-muted-foreground tracking-wide">Engagement quality (simulated)</div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Engagement</span>
                        <span className="font-medium">{result.engagementQuality}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Interaction pattern</span>
                        <span className="font-medium">{result.interactionPattern}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-slate-50/5 p-4 space-y-2">
                    <div className="text-xs text-muted-foreground tracking-wide">Risk signals (simulated)</div>
                    <div className="text-sm space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Automation likelihood</span>
                        <span className={`font-medium px-2 py-0.5 rounded-full border ${riskBadgeStyle(result.automationLikelihood)}`}>
                          {result.automationLikelihood}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Abnormal behavior risk</span>
                        <span className={`font-medium px-2 py-0.5 rounded-full border ${riskBadgeStyle(result.abnormalBehaviorRisk)}`}>
                          {result.abnormalBehaviorRisk}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-medium">{result.confidenceScore}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-medium">Notes (simulated)</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <Alert>
                <AlertTitle>Demo disclaimer</AlertTitle>
                <AlertDescription>{result.disclaimer}</AlertDescription>
              </Alert>

              <div className="text-xs text-center text-muted-foreground">
                Demo only • No real IG/Threads data queried • Simulated analysis output
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
