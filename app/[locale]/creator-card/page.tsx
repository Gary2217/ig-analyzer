"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"

import { useI18n } from "../../../components/locale-provider"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { extractLocaleFromPathname, localePathname } from "../../lib/locale-path"

type CreatorCardPayload = {
  handle?: string | null
  displayName?: string | null
  niche?: string | null
  audience?: string | null
  deliverables?: string[] | null
  contact?: string | null
  portfolio?: unknown[] | null
  isPublic?: boolean | null
  collaborationNiches?: string[] | null
  pastCollaborations?: string[] | null
}

function normalizeStringArray(value: unknown, maxLen: number) {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= maxLen) break
  }
  return out
}

function toggleInArray(values: string[], value: string) {
  const idx = values.indexOf(value)
  if (idx >= 0) return [...values.slice(0, idx), ...values.slice(idx + 1)]
  return [...values, value]
}

function PreviewCard(props: {
  t: (key: string) => string
  deliverables: string[]
  collaborationNiches: string[]
  pastCollaborations: string[]
  highlight: "formats" | "niches" | "brands" | null
}) {
  const { t, deliverables, collaborationNiches, pastCollaborations, highlight } = props

  const nicheText = (() => {
    const ids = normalizeStringArray(collaborationNiches, 20)
    if (ids.length === 0) return t("results.mediaKit.collaborationNiches.empty")

    const labelMap: Record<string, string> = {
      beauty: t("creatorCardEditor.niches.options.beauty"),
      fashion: t("creatorCardEditor.niches.options.fashion"),
      food: t("creatorCardEditor.niches.options.food"),
      travel: t("creatorCardEditor.niches.options.travel"),
      parenting: t("creatorCardEditor.niches.options.parenting"),
      fitness: t("creatorCardEditor.niches.options.fitness"),
      tech: t("creatorCardEditor.niches.options.tech"),
      finance: t("creatorCardEditor.niches.options.finance"),
      education: t("creatorCardEditor.niches.options.education"),
      gaming: t("creatorCardEditor.niches.options.gaming"),
      lifestyle: t("creatorCardEditor.niches.options.lifestyle"),
      pets: t("creatorCardEditor.niches.options.pets"),
      home: t("creatorCardEditor.niches.options.home"),
      ecommerce: t("creatorCardEditor.niches.options.ecommerce"),
    }

    return ids.map((id) => labelMap[id] || id).join(" · ")
  })()

  const formats = normalizeStringArray(deliverables, 50)
  const formatLabelMap: Record<string, string> = {
    reels: t("creatorCardEditor.formats.options.reels"),
    posts: t("creatorCardEditor.formats.options.posts"),
    stories: t("creatorCardEditor.formats.options.stories"),
    live: t("creatorCardEditor.formats.options.live"),
    ugc: t("creatorCardEditor.formats.options.ugc"),
    unboxing: t("creatorCardEditor.formats.options.unboxing"),
    giveaway: t("creatorCardEditor.formats.options.giveaway"),
    event: t("creatorCardEditor.formats.options.event"),
    affiliate: t("creatorCardEditor.formats.options.affiliate"),
  }

  const brandsText = (() => {
    const brands = normalizeStringArray(pastCollaborations, 20)
    if (brands.length === 0) return t("results.mediaKit.pastCollaborations.empty")
    const max = 6
    const visible = brands.slice(0, max)
    const extra = Math.max(0, brands.length - visible.length)
    return `${visible.join(", ")}${extra > 0 ? ` +${extra}` : ""}`
  })()

  const sectionClass = (key: "formats" | "niches" | "brands") => {
    const isActive = highlight === key
    return `rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4 min-w-0 transition-colors ${
      isActive ? "ring-2 ring-emerald-400/70 bg-emerald-500/5" : ""
    }`
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">{t("results.creatorCardPreview.title")}</CardTitle>
        <div className="mt-1 text-sm text-slate-500">{t("results.creatorCardPreview.subtitle")}</div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 min-w-0">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4 min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.about.title")}</div>
            <div className="mt-2 text-[12px] leading-snug text-white/60 min-w-0 break-words [overflow-wrap:anywhere]">
              {t("results.mediaKit.about.placeholder")}
            </div>
          </div>

          <div className={sectionClass("niches")}>
            <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.collaborationNiches.label")}</div>
            <div className="mt-2 text-[12px] leading-snug text-white/45 min-w-0 break-words [overflow-wrap:anywhere]">
              {nicheText}
            </div>
          </div>

          <div className={sectionClass("formats")}>
            <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.collaborationFormats.title")}</div>
            <div className="mt-2 flex flex-wrap gap-2 min-w-0">
              {formats.length === 0 ? (
                <div className="text-[12px] leading-snug text-white/45">{t("results.mediaKit.collaborationFormats.empty")}</div>
              ) : (
                formats.slice(0, 6).map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75"
                  >
                    {formatLabelMap[id] || id}
                  </span>
                ))
              )}
              {formats.length > 6 ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/55 whitespace-nowrap">
                  +{Math.max(0, formats.length - 6)}
                </span>
              ) : null}
            </div>
          </div>

          <div className={sectionClass("brands")}>
            <div className="text-[11px] font-semibold tracking-wide text-white/70">{t("results.mediaKit.pastCollaborations.title")}</div>
            <div className="mt-2 text-[12px] leading-snug text-white/45 min-w-0 break-words [overflow-wrap:anywhere] line-clamp-4">
              {brandsText}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CreatorCardPage() {
  const { t } = useI18n()
  const router = useRouter()

  const activeLocale = useMemo(() => {
    if (typeof window === "undefined") return "en"
    return extractLocaleFromPathname(window.location.pathname)
  }, [])

  const formatOptions = useMemo(
    () =>
      [
        { id: "reels", labelKey: "creatorCardEditor.formats.options.reels" },
        { id: "posts", labelKey: "creatorCardEditor.formats.options.posts" },
        { id: "stories", labelKey: "creatorCardEditor.formats.options.stories" },
        { id: "live", labelKey: "creatorCardEditor.formats.options.live" },
        { id: "ugc", labelKey: "creatorCardEditor.formats.options.ugc" },
        { id: "unboxing", labelKey: "creatorCardEditor.formats.options.unboxing" },
        { id: "giveaway", labelKey: "creatorCardEditor.formats.options.giveaway" },
        { id: "event", labelKey: "creatorCardEditor.formats.options.event" },
        { id: "affiliate", labelKey: "creatorCardEditor.formats.options.affiliate" },
      ] as const,
    []
  )

  const nicheOptions = useMemo(
    () =>
      [
        { id: "beauty", labelKey: "creatorCardEditor.niches.options.beauty" },
        { id: "fashion", labelKey: "creatorCardEditor.niches.options.fashion" },
        { id: "food", labelKey: "creatorCardEditor.niches.options.food" },
        { id: "travel", labelKey: "creatorCardEditor.niches.options.travel" },
        { id: "parenting", labelKey: "creatorCardEditor.niches.options.parenting" },
        { id: "fitness", labelKey: "creatorCardEditor.niches.options.fitness" },
        { id: "tech", labelKey: "creatorCardEditor.niches.options.tech" },
        { id: "finance", labelKey: "creatorCardEditor.niches.options.finance" },
        { id: "education", labelKey: "creatorCardEditor.niches.options.education" },
        { id: "gaming", labelKey: "creatorCardEditor.niches.options.gaming" },
        { id: "lifestyle", labelKey: "creatorCardEditor.niches.options.lifestyle" },
        { id: "pets", labelKey: "creatorCardEditor.niches.options.pets" },
        { id: "home", labelKey: "creatorCardEditor.niches.options.home" },
        { id: "ecommerce", labelKey: "creatorCardEditor.niches.options.ecommerce" },
      ] as const,
    []
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [baseCard, setBaseCard] = useState<CreatorCardPayload | null>(null)
  const [deliverables, setDeliverables] = useState<string[]>([])
  const [collaborationNiches, setCollaborationNiches] = useState<string[]>([])
  const [pastCollaborations, setPastCollaborations] = useState<string[]>([])

  const [brandInput, setBrandInput] = useState("")
  const brandInputRef = useRef<HTMLInputElement | null>(null)

  const [highlight, setHighlight] = useState<"formats" | "niches" | "brands" | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const flashHighlight = useCallback((key: "formats" | "niches" | "brands") => {
    setHighlight(key)
    if (highlightTimerRef.current != null) {
      window.clearTimeout(highlightTimerRef.current)
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlight(null)
      highlightTimerRef.current = null
    }, 1200)
  }, [])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current != null) {
        window.clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = null
      }
    }
  }, [])

  const addBrandTag = useCallback(
    (raw: string) => {
      const next = normalizeStringArray([raw], 1)
      if (next.length === 0) return
      setPastCollaborations((prev) => normalizeStringArray([...prev, next[0]], 20))
      flashHighlight("brands")
    },
    [flashHighlight, setPastCollaborations]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      setSaveOk(false)
      try {
        const res = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })

        const json: any = await res.json().catch(() => null)
        if (cancelled) return

        if (!res.ok || !json?.ok) {
          setBaseCard(null)
          setDeliverables([])
          setCollaborationNiches([])
          setPastCollaborations([])
          if (res.status === 401) {
            setLoadError(t("creatorCardEditor.errors.notConnected"))
          } else {
            setLoadError(t("creatorCardEditor.errors.loadFailed"))
          }
          return
        }

        const card = json?.card && typeof json.card === "object" ? (json.card as any) : null

        const nextBase: CreatorCardPayload | null = card
          ? {
              handle: typeof card.handle === "string" ? card.handle : null,
              displayName: typeof card.display_name === "string" ? card.display_name : null,
              niche: typeof card.niche === "string" ? card.niche : null,
              audience: typeof card.audience === "string" ? card.audience : null,
              deliverables: Array.isArray(card.deliverables) ? card.deliverables : null,
              contact: typeof card.contact === "string" ? card.contact : null,
              portfolio: Array.isArray(card.portfolio) ? card.portfolio : null,
              isPublic: typeof card.is_public === "boolean" ? card.is_public : null,
              collaborationNiches: Array.isArray(card.collaborationNiches)
                ? card.collaborationNiches
                : Array.isArray(card.collaboration_niches)
                  ? card.collaboration_niches
                  : null,
              pastCollaborations: Array.isArray(card.pastCollaborations)
                ? card.pastCollaborations
                : Array.isArray(card.past_collaborations)
                  ? card.past_collaborations
                  : null,
            }
          : null

        setBaseCard(nextBase)
        setDeliverables(normalizeStringArray(nextBase?.deliverables ?? [], 50))
        setCollaborationNiches(normalizeStringArray(nextBase?.collaborationNiches ?? [], 20))
        setPastCollaborations(normalizeStringArray(nextBase?.pastCollaborations ?? [], 20))
      } catch {
        if (cancelled) return
        setLoadError(t("creatorCardEditor.errors.loadFailed"))
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [t])

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      const payload: any = {
        handle: baseCard?.handle ?? undefined,
        displayName: baseCard?.displayName ?? undefined,
        niche: baseCard?.niche ?? undefined,
        audience: baseCard?.audience ?? undefined,
        contact: baseCard?.contact ?? undefined,
        portfolio: baseCard?.portfolio ?? undefined,
        isPublic: baseCard?.isPublic ?? undefined,
        deliverables: normalizeStringArray(deliverables, 50),
        collaborationNiches: normalizeStringArray(collaborationNiches, 20),
        pastCollaborations: normalizeStringArray(pastCollaborations, 20),
      }

      const res = await fetch("/api/creator-card/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const json: any = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setSaveError(t("creatorCardEditor.errors.saveFailed"))
        return
      }

      setSaveOk(true)
    } catch {
      setSaveError(t("creatorCardEditor.errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }, [baseCard, collaborationNiches, deliverables, pastCollaborations, saving, t])

  const handleBack = useCallback(() => {
    router.push(localePathname("/results", activeLocale as any))
  }, [activeLocale, router])

  const brandHelperText = useMemo(() => {
    const max = 20
    return t("creatorCardEditor.pastCollaborations.helper").replace("{count}", String(pastCollaborations.length)).replace("{max}", String(max))
  }, [pastCollaborations.length, t])

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold min-w-0 truncate">{t("creatorCardEditor.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 min-w-0">{t("creatorCardEditor.subtitle")}</p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Button variant="outline" onClick={handleBack} disabled={saving}>
            {t("creatorCardEditor.actions.back")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || loading || Boolean(loadError)}>
            {saving ? t("creatorCardEditor.actions.saving") : t("creatorCardEditor.actions.save")}
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>
      ) : null}
      {saveError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>
      ) : null}
      {saveOk ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{t("creatorCardEditor.success.saved")}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
        <div className="lg:col-span-5 space-y-4 min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("creatorCardEditor.formats.title")}</CardTitle>
              <div className="mt-1 text-sm text-slate-500">{t("creatorCardEditor.formats.subtitle")}</div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {formatOptions.map((opt) => {
                  const isActive = deliverables.includes(opt.id)
                  return (
                    <Button
                      key={opt.id}
                      type="button"
                      variant="pill"
                      active={isActive}
                      onClick={() => {
                        setDeliverables((prev) => toggleInArray(prev, opt.id))
                        flashHighlight("formats")
                      }}
                    >
                      {t(opt.labelKey)}
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("creatorCardEditor.niches.title")}</CardTitle>
              <div className="mt-1 text-sm text-slate-500">{t("creatorCardEditor.niches.subtitle")}</div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {nicheOptions.map((opt) => {
                  const isActive = collaborationNiches.includes(opt.id)
                  return (
                    <Button
                      key={opt.id}
                      type="button"
                      variant="pill"
                      active={isActive}
                      onClick={() => {
                        setCollaborationNiches((prev) => toggleInArray(prev, opt.id))
                        flashHighlight("niches")
                      }}
                    >
                      {t(opt.labelKey)}
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("creatorCardEditor.pastCollaborations.title")}</CardTitle>
              <div className="mt-1 text-sm text-slate-500">{t("creatorCardEditor.pastCollaborations.subtitle")}</div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pastCollaborations.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900"
                  >
                    <span className="min-w-0 truncate max-w-[240px]">{tag}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded-full p-1 hover:bg-slate-100"
                      onClick={() => {
                        setPastCollaborations((prev) => prev.filter((x) => x !== tag))
                        flashHighlight("brands")
                      }}
                      aria-label={t("creatorCardEditor.pastCollaborations.remove")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="mt-3">
                <Input
                  ref={(node) => {
                    brandInputRef.current = node
                  }}
                  value={brandInput}
                  placeholder={t("creatorCardEditor.pastCollaborations.placeholder")}
                  onChange={(e) => setBrandInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addBrandTag(brandInput)
                      setBrandInput("")
                      return
                    }
                    if (e.key === "Backspace" && !brandInput.trim()) {
                      setPastCollaborations((prev) => {
                        const next = prev.slice(0, Math.max(0, prev.length - 1))
                        return next
                      })
                      flashHighlight("brands")
                    }
                  }}
                />
                <div className="mt-2 text-xs text-slate-500">{brandHelperText}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7 min-w-0">
          <div className="lg:sticky lg:top-24">
            <PreviewCard
              t={t}
              deliverables={deliverables}
              collaborationNiches={collaborationNiches}
              pastCollaborations={pastCollaborations}
              highlight={highlight}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
