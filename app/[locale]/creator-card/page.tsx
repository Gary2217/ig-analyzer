"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { useI18n } from "../../../components/locale-provider"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"
import { Input } from "../../../components/ui/input"
import { extractLocaleFromPathname, localePathname } from "../../lib/locale-path"
import { CreatorCardPreview } from "../../components/CreatorCardPreview"
import { useInstagramMe } from "../../lib/useInstagramMe"

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

export default function CreatorCardPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [refetchTick, setRefetchTick] = useState(0)

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
  const [loadErrorKind, setLoadErrorKind] = useState<
    "not_connected" | "supabase_invalid_key" | "load_failed" | null
  >(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const [showNewCardHint, setShowNewCardHint] = useState(false)

  const meQuery = useInstagramMe({ enabled: true })

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
      setLoadErrorKind(null)
      setSaveOk(false)
      setShowNewCardHint(false)
      try {
        const res = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })

        const json: any = await res.json().catch(() => null)
        if (cancelled) return

        if (!res.ok || !json?.ok) {
          if (res.status === 401) {
            setLoadErrorKind("not_connected")
            setLoadError(t("creatorCardEditor.errors.notConnected"))
            return
          }

          if (res.status === 500 && json?.error === "supabase_invalid_key") {
            setLoadErrorKind("supabase_invalid_key")
            setLoadError(null)
            return
          }

          setLoadErrorKind("load_failed")
          setLoadError(t("creatorCardEditor.errors.loadFailed"))
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

        const isLikelyEmpty = (() => {
          const hasAnyText =
            Boolean(nextBase?.displayName && String(nextBase.displayName).trim()) ||
            Boolean(nextBase?.niche && String(nextBase.niche).trim()) ||
            Boolean(nextBase?.audience && String(nextBase.audience).trim()) ||
            Boolean(nextBase?.contact && String(nextBase.contact).trim())
          const hasAnyLists =
            normalizeStringArray(nextBase?.deliverables ?? [], 1).length > 0 ||
            normalizeStringArray(nextBase?.collaborationNiches ?? [], 1).length > 0 ||
            normalizeStringArray(nextBase?.pastCollaborations ?? [], 1).length > 0
          return !hasAnyText && !hasAnyLists
        })()

        setShowNewCardHint(isLikelyEmpty)
      } catch {
        if (cancelled) return
        setLoadErrorKind("load_failed")
        setLoadError(t("creatorCardEditor.errors.loadFailed"))
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refetchTick, t])

  const handleRetryLoad = useCallback(() => {
    setRefetchTick((x) => x + 1)
  }, [])

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

  const returnTo = useMemo(() => {
    const raw = (searchParams?.get("returnTo") ?? "").trim()
    if (raw) return raw
    return `/${activeLocale}/results#creator-card`
  }, [activeLocale, searchParams])

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push(returnTo)
  }, [returnTo, router])

  const brandHelperText = useMemo(() => {
    const max = 20
    return t("creatorCardEditor.pastCollaborations.helper").replace("{count}", String(pastCollaborations.length)).replace("{max}", String(max))
  }, [pastCollaborations.length, t])

  const igMe = meQuery.data as any
  const igProfile = ((igMe as any)?.profile ?? igMe) as any

  const displayUsername = useMemo(() => {
    const raw = typeof igProfile?.username === "string" ? String(igProfile.username).trim() : ""
    return raw
  }, [igProfile?.username])

  const displayName = useMemo(() => {
    const raw = (igProfile?.name ?? igProfile?.display_name ?? igProfile?.displayName) as any
    if (typeof raw === "string" && raw.trim()) return raw.trim()
    return displayUsername ? displayUsername : "—"
  }, [displayUsername, igProfile?.displayName, igProfile?.display_name, igProfile?.name])

  const finiteNumOrNull = useCallback((v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }, [])

  const formatNum = useCallback((n: number | null) => (n === null ? "—" : n.toLocaleString()), [])

  const followersText = useMemo(() => {
    const followers = finiteNumOrNull(igProfile?.followers_count)
    return typeof followers === "number" && Number.isFinite(followers) ? formatNum(followers) : null
  }, [finiteNumOrNull, formatNum, igProfile?.followers_count])

  const loadingSkeleton = (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0 animate-pulse">
      <div className="lg:col-span-5 space-y-4 min-w-0">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-white">
            <div className="p-6">
              <div className="h-4 w-40 bg-slate-200 rounded" />
              <div className="mt-3 h-3 w-64 bg-slate-100 rounded" />
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((__, j) => (
                  <div key={j} className="h-9 w-24 rounded-full bg-slate-100" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-7 min-w-0">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="p-6">
            <div className="h-4 w-48 bg-slate-200 rounded" />
            <div className="mt-3 h-3 w-64 bg-slate-100 rounded" />
            <div className="mt-6 h-72 w-full rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  )

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
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || loading || loadErrorKind === "not_connected" || loadErrorKind === "supabase_invalid_key"}
          >
            {saving ? t("creatorCardEditor.actions.saving") : t("creatorCardEditor.actions.save")}
          </Button>
        </div>
      </div>

      {loadErrorKind === "supabase_invalid_key" ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-semibold">{t("creatorCardEditor.errors.supabaseInvalidKey.title")}</div>
          <div className="mt-1 text-amber-100/80">{t("creatorCardEditor.errors.supabaseInvalidKey.body")}</div>
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="min-w-0 break-words [overflow-wrap:anywhere]">{loadError}</div>
          {loadErrorKind === "load_failed" ? (
            <div className="mt-3">
              <Button type="button" variant="outline" onClick={handleRetryLoad} disabled={loading || saving}>
                {t("creatorCardEditor.actions.retry")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {saveError ? (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">{saveError}</div>
      ) : null}
      {saveOk ? (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{t("creatorCardEditor.success.saved")}</div>
      ) : null}

      {showNewCardHint && !loading && !loadErrorKind ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">{t("creatorCardEditor.empty.title")}</div>
          <div className="mt-1 text-slate-600 min-w-0 break-words [overflow-wrap:anywhere]">{t("creatorCardEditor.empty.body")}</div>
        </div>
      ) : null}

      {loading ? (
        loadingSkeleton
      ) : (
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
            <CreatorCardPreview
              t={t}
              className="border-white/10 bg-transparent"
              headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
              username={displayUsername || null}
              profileImageUrl={(() => {
                const u = typeof igProfile?.profile_picture_url === "string" ? String(igProfile.profile_picture_url) : ""
                return u ? u : null
              })()}
              displayName={displayName}
              aboutText={baseCard?.audience ?? null}
              primaryNiche={baseCard?.niche ?? null}
              collaborationNiches={collaborationNiches}
              deliverables={deliverables}
              pastCollaborations={pastCollaborations}
              followersText={followersText}
              highlightTarget={highlight}
            />
          </div>
        </div>
      </div>
      )}
    </main>
  )
}
