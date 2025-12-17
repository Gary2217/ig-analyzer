"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "../../components/locale-provider"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Input } from "../../components/ui/input"

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
  const [postUrl, setPostUrl] = useState("")
  const [hasAnalysis, setHasAnalysis] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [summaryMode, setSummaryMode] = useState<"short" | "detailed">("short")
  const [toast, setToast] = useState<string | null>(null)
  const [headerCopied, setHeaderCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({
    a1: true,
    a2: false,
    a3: false,
  })

  const resultsRef = useRef<HTMLDivElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const inferredPlatform = useMemo<"instagram" | "threads">(() => {
    const u = postUrl.toLowerCase()
    if (u.includes("threads.net")) return "threads"
    if (u.includes("instagram.com")) return "instagram"
    return "instagram"
  }, [postUrl])

  const sourceDomain = useMemo(() => {
    const u = postUrl.toLowerCase()
    if (u.includes("threads.net")) return "threads.net"
    if (u.includes("instagram.com")) return "instagram.com"
    return "(link)"
  }, [postUrl])

  const looksLikeSupportedUrl = useMemo(() => {
    const u = postUrl.toLowerCase().trim()
    if (!u) return true
    return u.includes("instagram.com") || u.includes("threads.net")
  }, [postUrl])

  const inferredMetrics: InferredMetric[] = useMemo(
    () => [
      {
        title: "Hook Strength",
        status: "Moderate",
        detail: "Signals suggest the first-frame value proposition is present but may not be explicit enough for cold viewers.",
      },
      {
        title: "Content Clarity",
        status: "Moderate",
        detail: "Likely impacted by dense phrasing or competing focal points that increase cognitive load.",
      },
      {
        title: "Visual Readability",
        status: "Needs Improvement",
        detail: "Signals suggest on-screen text hierarchy and contrast may reduce fast comprehension on mobile.",
      },
      {
        title: "Interaction Cues",
        status: "Moderate",
        detail: "Likely impacted by CTA placement; the cue exists but may not be strong enough to trigger comments or saves.",
      },
      {
        title: "Drop-off Risk",
        status: "Needs Improvement",
        detail: "Signals suggest early-scrolling or swipe-away risk due to delayed payoff within the first seconds.",
      },
    ],
    []
  )

  const postPreview = useMemo(() => {
    const postTypes = ["Reel", "Carousel", "Photo"] as const
    const idx = Math.abs(postUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % postTypes.length

    const captions = [
      "A quick breakdown of what most creators miss in the first 2 seconds…",
      "If your post stalls early, this is usually the hidden bottleneck.",
      "Before you post today, consider this one change to improve clarity.",
    ]
    const cidx = Math.abs(postUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0) * 3, 0)) % captions.length

    const times = ["Today · 2:14 PM", "Yesterday · 9:05 AM", "3 days ago · 7:42 PM"]
    const tidx = Math.abs(postUrl.split("").reduce((acc, c) => acc + c.charCodeAt(0) * 7, 0)) % times.length

    return {
      platformLabel: inferredPlatform === "instagram" ? "Instagram" : "Threads",
      postType: postTypes[idx],
      captionSnippet: captions[cidx],
      postedTime: times[tidx],
    }
  }, [inferredPlatform, postUrl])

  const underperformReasons = useMemo(
    () => [
      "The initial hook may not clearly communicate the value within the first visible frame.",
      "Visual hierarchy may increase interpretation cost, especially on small screens.",
      "Interaction prompts are present, but likely not specific enough to drive replies or saves.",
    ],
    []
  )

  const rewriteSuggestions = useMemo(
    () => ({
      hooks: [
        "If you're doing X, you're losing reach — here's the 10‑second fix.",
        "Most creators miss this one signal. Fix it, and your next post performs better.",
        "Before you post today, check this — it likely affects distribution.",
      ],
      ctas: [
        "Comment 'PLAN' and I'll share the checklist.",
        "Save this for your next post — and tell me which part you'd improve first.",
      ],
      visuals: [
        "Keep the first on-screen line under ~7 words and lead with a single keyword.",
        "Align text to one edge and increase contrast for fast scanning.",
        "Use one primary focal point per frame; avoid competing callouts.",
      ],
    }),
    []
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
    const base = `Post Analysis Snapshot\n\nMode: ${isConnected ? "C (Official Metrics)" : "A (Inferred)"}\nPost URL: ${postUrl || "(not provided)"}\n\nKey inferred signals\n- Hook Strength: ${inferredMetrics[0]?.status}\n- Content Clarity: ${inferredMetrics[1]?.status}\n- Visual Readability: ${inferredMetrics[2]?.status}\n- Interaction Cues: ${inferredMetrics[3]?.status}\n- Drop-off Risk: ${inferredMetrics[4]?.status}\n`

    const c = isConnected
      ? `\nOfficial post performance (platform-provided)\n- Reach: ${officialMetrics.reach}\n- Impressions: ${officialMetrics.impressions}\n- Likes / Comments: ${officialMetrics.likes} / ${officialMetrics.comments}\n- vs account average: ${officialMetrics.vsAvg}\n`
      : ""

    const disclaimer =
      "\nAnalysis in A mode is based on publicly observable signals and inferred models. Official metrics are only shown after explicit platform authorization.\n\nA 模式為推論分析；官方指標僅於授權後顯示。\n"

    return `${base}${c}${disclaimer}`
  }, [inferredMetrics, isConnected, officialMetrics, postUrl])

  const shortCopyBlock = useMemo(() => {
    const lines = [
      `Post Analysis (A) — Inferred snapshot`,
      `Source: ${sourceDomain}`,
      `Link: ${postUrl || "(not provided)"}`,
      "",
      `Top signals`,
      `- Hook: ${inferredMetrics[0]?.status}`,
      `- Clarity: ${inferredMetrics[1]?.status}`,
      `- Readability: ${inferredMetrics[2]?.status}`,
      "",
      "A-mode is inferred from public signals. Official metrics unlock after authorization.",
      "A 模式為推論分析；官方指標僅於授權後顯示。",
    ]
    return `${lines.join("\n")}\n`
  }, [inferredMetrics, postUrl, sourceDomain])

  const proSummaryText = useMemo(() => {
    const mode = isConnected ? "C（官方）" : "A（推論）"
    const linkLine = `Link: ${postUrl || "(not provided)"}`
    const topSignals = [
      `- Hook: ${inferredMetrics[0]?.status}`,
      `- Clarity: ${inferredMetrics[1]?.status}`,
      `- Readability: ${inferredMetrics[2]?.status}`,
    ].join("\n")

    const suggestions = [
      `1) Make the first frame explicit: ${rewriteSuggestions.hooks[0]}`,
      `2) Add a specific CTA: ${rewriteSuggestions.ctas[0]}`,
      `3) Improve readability: ${rewriteSuggestions.visuals[0]}`,
      `4) Reduce early drop-off risk: ${underperformReasons[0]}`,
    ]
      .filter(Boolean)
      .slice(0, 5)
      .join("\n")

    const lines = [
      "Post Analysis — Summary",
      "",
      `Mode: ${mode} (A = inferred / C = official after authorization)`,
      linkLine,
      "",
      "Top signals",
      topSignals,
      "",
      "Recommendations",
      suggestions,
    ]

    return `${lines.join("\n")}\n`
  }, [inferredMetrics, isConnected, postUrl, rewriteSuggestions, underperformReasons])

  const fullExportText = useMemo(() => {
    const lines = [
      proSummaryText.trimEnd(),
      "",
      "Assumptions: inferred only (A mode)",
      "Not official metrics unless C mode is explicitly authorized.",
      "",
      "A 模式為推論分析；官方指標僅於授權後顯示。",
    ]
    return `${lines.join("\n")}\n`
  }, [proSummaryText])

  const canAnalyze = postUrl.trim().length > 0

  const handleAnalyze = () => {
    if (!canAnalyze || isAnalyzing) return

    setIsAnalyzing(true)
    setHasAnalysis(false)

    const delay = 800 + Math.floor(Math.random() * 401)
    setTimeout(() => {
      setIsAnalyzing(false)
      setHasAnalysis(true)

      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }, delay)
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
    <main className="min-h-screen w-full bg-gradient-to-b from-[#0b1220]/100 via-[#0b1220]/95 to-[#0b1220]/90 overflow-x-hidden">
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
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-200 border border-white/10">
                  {t("post.header.badge")}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20">
                  {inferredPlatform === "instagram" ? "Instagram" : "Threads"}
                </span>
                <span className="text-[11px] text-slate-300 truncate">{isConnected ? t("post.mode.official") : t("post.mode.inferred")}</span>
              </div>
              <div className="text-sm font-semibold text-white truncate">{t("post.header.title")}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                onClick={handleBackToResults}
              >
                {t("post.header.backToAccount")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                onClick={handleHeaderCopySummary}
                aria-busy={headerCopied ? true : undefined}
              >
                {headerCopied ? t("post.header.copied") : t("post.header.copySummary")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                onClick={handleHeaderExport}
                disabled={exporting}
                aria-busy={exporting ? true : undefined}
              >
                {t("post.header.export")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-white/15 text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
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

        <div className="mt-8 space-y-12">
          <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
            <CardHeader className="border-b border-white/10">
              <CardTitle className="text-xl font-bold text-white">{t("post.input.sectionTitle")}</CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                {t("post.input.sectionSubtitle")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-2">
                <div className="text-sm font-medium text-white">{t("post.input.label")}</div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
                  <Input
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    placeholder={t("post.input.placeholder")}
                    className="bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                  />
                  <Button
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg w-full md:w-[168px] focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={handleAnalyze}
                    disabled={!canAnalyze || isAnalyzing}
                    aria-busy={isAnalyzing ? true : undefined}
                  >
                    {isAnalyzing ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        {t("post.input.analyzing")}
                      </span>
                    ) : (
                      t("post.input.analyze")
                    )}
                  </Button>
                </div>
                <div className="text-xs text-slate-400">
                  {t("post.input.hint")}
                </div>
                {!looksLikeSupportedUrl && (
                  <div className="text-xs text-slate-400">
                    {t("post.input.invalidUrl")}
                  </div>
                )}
                {!canAnalyze && <div className="text-xs text-slate-400">{t("post.input.pasteToBegin")}</div>}
              </div>
            </CardContent>
          </Card>

          {isAnalyzing && (
            <div className="space-y-6">
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">Results</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">Preparing inferred signals and draft recommendations…</p>
                </CardHeader>
                <CardContent className="p-6">
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
            <div ref={resultsRef} className="space-y-12">
              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl font-bold text-white">Post Preview</CardTitle>
                      <p className="text-sm text-slate-400 mt-1">Preview (mock) derived from the provided link.</p>
                    </div>
                    <a
                      href={postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-200 hover:text-blue-100 underline underline-offset-4 shrink-0 mt-1 break-all"
                    >
                      Open original
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
                    <div className="w-full max-w-[260px]">
                      <div className="aspect-[4/5] rounded-xl border border-white/10 bg-white/5 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
                        <div className="relative text-slate-300">
                          <div className="mx-auto h-10 w-10 rounded-lg border border-white/10 bg-white/5" />
                          <div className="mt-2 text-xs">Thumbnail (mock)</div>
                        </div>
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
                        <span className="text-slate-500">Source:</span> {sourceDomain}
                      </div>
                      <div className="text-xs text-slate-300 break-all">{postUrl || "(not provided)"}</div>
                      <div className="text-sm text-slate-200">
                        <span className="text-slate-400">Caption (mock): </span>
                        {postPreview.captionSnippet}
                      </div>
                      <div className="text-xs text-slate-400">
                        No image parsing is performed. This preview is a placeholder for UI flow.
                      </div>
                      <div className="text-xs text-slate-400">
                        貼文預覽為版型模擬，不進行圖片解析或實際內容擷取。
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">Quick Recommendations</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">Expandable suggestions based on inferred friction points.</p>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {([
                      {
                        id: "a1",
                        title: "Make the hook explicit",
                        body: rewriteSuggestions.hooks[0],
                      },
                      {
                        id: "a2",
                        title: "Add a specific CTA",
                        body: rewriteSuggestions.ctas[0],
                      },
                      {
                        id: "a3",
                        title: "Improve readability on mobile",
                        body: rewriteSuggestions.visuals[0],
                      },
                    ] as const).map((item) => {
                      const isOpen = Boolean(accordionOpen[item.id])
                      return (
                        <div key={item.id} className="rounded-xl border border-white/10 bg-[#0b1220]/35">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                            onClick={() =>
                              setAccordionOpen((p) => ({
                                ...p,
                                [item.id]: !p[item.id],
                              }))
                            }
                            aria-expanded={isOpen}
                          >
                            <div className="text-sm font-medium text-white">{item.title}</div>
                            <div className="text-xs text-slate-300">{isOpen ? "Hide" : "Show"}</div>
                          </button>
                          {isOpen && <div className="px-4 pb-4 text-sm text-slate-200">{item.body}</div>}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold text-white">🔒 Unlock official post performance</CardTitle>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-200 border border-purple-400/20">
                      官方 (C)
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">授權後即可查看此貼文的官方指標與對照基準（C 模式）。</p>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    <div className="space-y-3">
                      <ul className="text-sm text-slate-200 space-y-2">
                        <li>實際觸及與曝光（官方）</li>
                        <li>與帳號平均表現對比（官方）</li>
                        <li>發佈時段／初期互動影響（以官方數據為準）</li>
                      </ul>
                    </div>
                    <div className="space-y-2">
                      <Button
                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-6 py-3 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0"
                        onClick={() => setIsConnected(true)}
                      >
                        Connect Instagram Account
                      </Button>
                      <div className="text-xs text-slate-400">僅唯讀授權，不會發文、不會讀取私訊。</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl font-bold text-white">2) Post Health Summary</CardTitle>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-200 border border-blue-400/20">
                      推論 (A)
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Inferred indicators based on publicly observable signals and patterns.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">本段為推論建議，非官方後台指標。</p>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inferredMetrics.map((m) => {
                      const t = toneForStatus(m.status)
                      return (
                        <Card
                          key={m.title}
                          className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl"
                        >
                          <CardContent className="p-5 h-full">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">{m.title}</div>
                              <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${t.classes}`}>{t.label}</span>
                            </div>
                            <div className="mt-3 text-sm text-slate-300">{m.detail}</div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">3) Why This Post May Underperform</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">
                    Consultant-style diagnosis based on likely constraints (non-accusatory, inferred).
                  </p>
                </CardHeader>
                <CardContent className="p-6">
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

              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">4) Actionable Rewrite Suggestions</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">
                    Copy-ready rewrites and visual guidance based on inferred friction points.
                  </p>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white">Hook rewrites (3)</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {rewriteSuggestions.hooks.map((h, i) => (
                            <div key={h} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">Version {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200">{h}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white">CTA rewrites (2)</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {rewriteSuggestions.ctas.map((c, i) => (
                            <div key={c} className="rounded-lg border border-white/10 bg-[#0b1220]/40 p-3">
                              <div className="text-[11px] text-slate-400">Option {i + 1}</div>
                              <div className="mt-1 text-sm text-slate-200">{c}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-white/10 bg-white/5 lg:col-span-2 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold text-white">Visual optimization suggestions</CardTitle>
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
                <div className="space-y-10">
                  <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                    <CardHeader className="border-b border-white/10">
                      <CardTitle className="text-xl font-bold text-white">5) Official Post Performance (C)</CardTitle>
                      <p className="text-sm text-slate-400 mt-1">Official platform-provided metrics</p>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">Reach</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.reach.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">Impressions</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.impressions.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">Likes</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.likes.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                        <Card className="rounded-xl border border-white/10 bg-white/5 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                          <CardContent className="p-5">
                            <div className="text-sm text-slate-300">Comments</div>
                            <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.comments.toLocaleString()}</div>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-white">Compared to account average</div>
                          <span
                            className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                              officialMetrics.vsAvg === "Above Avg"
                                ? "bg-emerald-500/10 text-emerald-200 border-emerald-400/20"
                                : "bg-amber-500/10 text-amber-200 border-amber-400/20"
                            }`}
                          >
                            {officialMetrics.vsAvg}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-300">
                          Benchmarking uses your recent post baseline after authorization.
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                    <CardHeader className="border-b border-white/10">
                      <CardTitle className="text-xl font-bold text-white">6) Content Quality vs Actual Performance</CardTitle>
                      <p className="text-sm text-slate-400 mt-1">A diagnostic contrast between inferred quality and observed outcomes</p>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                          <div className="text-sm text-slate-300">Content Quality</div>
                          <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.contentQuality}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                          <div className="text-sm text-slate-300">Actual Reach</div>
                          <div className="mt-2 text-2xl font-bold text-white">{officialMetrics.actualReach}</div>
                        </div>
                      </div>
                      <div className="mt-4 text-sm text-slate-300">
                        This suggests distribution or timing constraints rather than content quality issues.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl">
                <CardHeader className="border-b border-white/10">
                  <CardTitle className="text-xl font-bold text-white">Copyable Snapshot</CardTitle>
                  <p className="text-sm text-slate-400 mt-1">A compact summary you can paste into a doc or share with a client.</p>
                  <p className="text-xs text-slate-400 mt-1">適合貼給客戶、簡報或 Notion 報告使用。</p>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryMode === "short" ? "default" : "outline"}
                      className={summaryMode === "short" ? "" : "border-white/15 text-slate-200 hover:bg-white/5"}
                      onClick={() => setSummaryMode("short")}
                    >
                      Short
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={summaryMode === "detailed" ? "default" : "outline"}
                      className={summaryMode === "detailed" ? "" : "border-white/15 text-slate-200 hover:bg-white/5"}
                      onClick={() => setSummaryMode("detailed")}
                    >
                      Detailed
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
                        showToast(ok ? "Copied" : "Copy failed")
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="pt-10 border-t border-white/10">
            <div className="text-xs text-slate-400">
              A 模式分析基於公開可觀察訊號與推論模型；官方數據僅於使用者明確授權後讀取並顯示。
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
