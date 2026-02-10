"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import type { CreatorCardData } from "./types"
import { getCopy, type Locale } from "@/app/i18n"
import { localizeCreatorTypes, normalizeCreatorTypesFromCard } from "@/app/lib/creatorTypes"

function formatNumber(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function formatER(er?: number) {
  if (typeof er !== "number" || !Number.isFinite(er)) return "—"
  const v = er > 1 ? er : er * 100
  return `${v.toFixed(1)}%`
}

function formatNTD(n?: number) {
  if (n == null || Number.isNaN(n)) return null
  const v = Math.max(0, Math.floor(n))
  return v.toLocaleString()
}

function deriveFormatKeysFromDeliverables(input?: string[]) {
  const d = Array.isArray(input) ? input : []
  const set = new Set<"reels" | "posts" | "stories" | "other">()
  for (const raw of d) {
    const id = String(raw || "").trim().toLowerCase()
    if (!id) continue
    if (id === "reels") set.add("reels")
    else if (id === "posts") set.add("posts")
    else if (id === "stories") set.add("stories")
    else set.add("other")
  }
  return Array.from(set)
}

function safeParseCreatorContact(input: unknown): {
  emails: string[]
  phones: string[]
  lines: string[]
  primaryContactMethod?: "email" | "phone" | "line"
} {
  const empty = { emails: [] as string[], phones: [] as string[], lines: [] as string[], primaryContactMethod: undefined as any }
  if (typeof input !== "string") return empty
  const raw = input.trim()
  if (!raw) return empty
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== "object") return empty
    const readArr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean) : []

    const emails = readArr((obj as any).emails)
    const phones = readArr((obj as any).phones)
    const lines = readArr((obj as any).lines)
    const legacyOthers = readArr((obj as any).others)

    const email1 = typeof (obj as any).email === "string" ? String((obj as any).email).trim() : ""
    const phone1 = typeof (obj as any).phone === "string" ? String((obj as any).phone).trim() : ""
    const line1 = typeof (obj as any).line === "string" ? String((obj as any).line).trim() : ""
    const other1 = typeof (obj as any).other === "string" ? String((obj as any).other).trim() : ""

    const pcmRaw = typeof (obj as any).primaryContactMethod === "string" ? String((obj as any).primaryContactMethod).trim() : ""
    const primaryContactMethod = pcmRaw === "email" || pcmRaw === "phone" || pcmRaw === "line" ? (pcmRaw as any) : undefined

    const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).slice(0, 20)

    const finalLines = (() => {
      const merged = uniq([...(line1 ? [line1] : []), ...lines])
      if (merged.length > 0) return merged
      // Back-compat: treat legacy others/other as lines when lines is empty.
      return uniq([...(other1 ? [other1] : []), ...legacyOthers])
    })()
    return {
      emails: uniq([...(email1 ? [email1] : []), ...emails]),
      phones: uniq([...(phone1 ? [phone1] : []), ...phones]),
      lines: finalLines,
      primaryContactMethod,
    }
  } catch {
    return empty
  }
}

function normalizeTelNumber(input: string) {
  const raw = String(input || "").trim()
  if (!raw) return ""
  const hasPlus = raw.startsWith("+")
  const stripped = raw.replace(/[\s\-().]/g, "")
  const digits = stripped.replace(/[^0-9+]/g, "")
  const core = hasPlus ? digits.replace(/\+/g, "+") : digits.replace(/\+/g, "")
  return core
}

function normalizeLineToHrefOrNull(input: string): { display: string; href?: string } {
  const trimmed = String(input || "").trim()
  if (!trimmed) return { display: "" }

  const isLikelyUrl = /^https?:\/\//i.test(trimmed) || /^line:\/\//i.test(trimmed) || /line\.me\//i.test(trimmed)
  if (isLikelyUrl) return { display: trimmed, href: trimmed }

  const lineId = trimmed.replace(/^@/, "").replace(/\s+/g, "")
  if (!lineId) return { display: trimmed }
  return { display: lineId, href: `https://line.me/R/ti/p/~${encodeURIComponent(lineId)}` }
}

function normalizePhoneDisplay(raw: string) {
  return String(raw || "").trim()
}

export function CreatorCard({
  creator,
  locale,
  isFav,
  onToggleFav,
  statsLoading,
  statsError,
  onRetryStats,
  selectedBudgetMax,
}: {
  creator: CreatorCardData
  locale: Locale
  isFav: boolean
  onToggleFav: () => void
  statsLoading?: boolean
  statsError?: boolean
  onRetryStats?: () => void
  selectedBudgetMax?: number | null
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const copy = getCopy(locale)
  const mm = copy.matchmaking
  const isEmpty = Boolean(creator.isDemo)
  const [showContact, setShowContact] = useState(false)
  const [ctaToast, setCtaToast] = useState<string | null>(null)
  const ctaToastTimerRef = useRef<number | null>(null)
  const [copiedKey, setCopiedKey] = useState<null | "email" | "phone" | "line">(null)
  const copiedTimerRef = useRef<number | null>(null)
  const allPlatforms = (creator.platforms ?? []).filter(Boolean)
  const deliverableFormats = deriveFormatKeysFromDeliverables(creator.deliverables)

  useEffect(() => {
    return () => {
      if (ctaToastTimerRef.current != null) window.clearTimeout(ctaToastTimerRef.current)
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const isPopular =
    (typeof creator.stats?.followers === "number" && Number.isFinite(creator.stats.followers) && creator.stats.followers > 5000) ||
    (typeof creator.stats?.engagementRate === "number" && Number.isFinite(creator.stats.engagementRate) && creator.stats.engagementRate > 0.03)

  const showHighEngagement =
    typeof creator.stats?.engagementRate === "number" && Number.isFinite(creator.stats.engagementRate) && creator.stats.engagementRate > 0.02

  const profileComplete =
    !isEmpty &&
    Boolean((creator.platforms ?? []).length) &&
    Boolean((creator.topics ?? []).length) &&
    Boolean((creator.deliverables ?? []).length || (creator.collabTypes ?? []).length) &&
    typeof creator.minPrice === "number" &&
    Number.isFinite(creator.minPrice)

  const withinBudget =
    !isEmpty &&
    typeof selectedBudgetMax === "number" &&
    Number.isFinite(selectedBudgetMax) &&
    typeof creator.minPrice === "number" &&
    Number.isFinite(creator.minPrice) &&
    creator.minPrice <= selectedBudgetMax

  const shouldShowHandle = (() => {
    const handle = typeof creator.handle === "string" ? creator.handle.trim() : ""
    if (!handle) return false
    const name = typeof creator.name === "string" ? creator.name.trim() : ""
    const normalizedName = name.replace(/^@/, "").toLowerCase()
    const normalizedHandle = handle.replace(/^@/, "").toLowerCase()
    return normalizedName !== normalizedHandle
  })()

  const href = (() => {
    const raw = typeof creator.href === "string" ? creator.href : ""
    if (!raw) return raw

    const fromPath = (() => {
      const p = typeof pathname === "string" ? pathname : ""
      const q = typeof searchParams?.toString === "function" ? searchParams.toString() : ""
      return q ? `${p}?${q}` : p
    })()

    // Only propagate `from` when navigating from matchmaking to the read-only creator card preview.
    if (!fromPath || !/\/matchmaking(\/|$)/i.test(fromPath)) return raw
    if (!/\/creator-card\/view(\?|$|\/)/i.test(raw)) return raw
    if (/[?&]from=/.test(raw)) return raw

    const encoded = encodeURIComponent(fromPath)
    return raw.includes("?") ? `${raw}&from=${encoded}` : `${raw}?from=${encoded}`
  })()

  const typeLabel = (t: string) => {
    if (t === "short_video") return mm.typeShortVideo
    if (t === "long_video") return mm.typeLongVideo
    if (t === "ugc") return mm.typeUGC
    if (t === "live") return mm.typeLive
    if (t === "review_unboxing") return mm.typeReviewUnboxing
    if (t === "event") return mm.typeEvent
    if (t === "reels") return mm.formatReels
    if (t === "posts") return mm.formatPosts
    if (t === "stories") return mm.formatStories
    if (t === "other") return mm.typeOther
    return t
  }

  const platformLabel = (p: string) => {
    if (p === "instagram") return mm.platformInstagram
    if (p === "tiktok") return mm.platformTikTok
    if (p === "youtube") return mm.platformYouTube
    if (p === "facebook") return mm.platformFacebook
    return p
  }

  const platformBadges = (creator.platforms ?? []).filter(Boolean)
  const dealTypeBadges = (creator.dealTypes ?? []).filter((x): x is string => typeof x === "string" && x.length > 0)
  const tagBadges = localizeCreatorTypes(normalizeCreatorTypesFromCard(creator as any), locale)
  const topBadges = [...platformBadges.map((p) => ({ key: `p:${p}`, label: platformLabel(p) })), ...dealTypeBadges.map((t) => ({ key: `t:${t}`, label: typeLabel(t) }))]
  const displayBadges = topBadges.slice(0, 4)
  const displayTagBadges = tagBadges.slice(0, 6)

  const badgeClassName = (key: string) => {
    if (key.startsWith("p:")) return "bg-emerald-500/10 border-emerald-400/20 text-emerald-100/85"
    if (key.startsWith("t:")) return "bg-violet-500/10 border-violet-400/20 text-violet-100/85"
    return "bg-sky-500/10 border-sky-400/20 text-sky-100/85"
  }

  const parsedContact = safeParseCreatorContact((creator as any)?.contact)
  const primaryContactMethod = (() => {
    const raw = typeof (creator as any)?.primaryContactMethod === "string" ? String((creator as any).primaryContactMethod).trim() : ""
    if (raw === "email" || raw === "phone" || raw === "line") return raw
    return parsedContact.primaryContactMethod ?? null
  })()

  const contactItems = (() => {
    const out: Array<{
      key: "email" | "phone" | "line"
      value: string
      className: string
      href?: string
      ariaLabel?: string
      isPrimary?: boolean
    }> = []
    const email =
      typeof creator.contactEmail === "string"
        ? creator.contactEmail.trim()
        : typeof parsedContact.emails[0] === "string"
          ? parsedContact.emails[0].trim()
        : typeof (creator as any)?.creatorCard?.contactEmail === "string"
          ? String((creator as any)?.creatorCard?.contactEmail).trim()
          : typeof (creator as any)?.profile?.contactEmail === "string"
            ? String((creator as any)?.profile?.contactEmail).trim()
            : ""

    const phone =
      typeof creator.contactPhone === "string"
        ? creator.contactPhone.trim()
        : typeof parsedContact.phones[0] === "string"
          ? parsedContact.phones[0].trim()
          : typeof (creator as any)?.creatorCard?.contactPhone === "string"
            ? String((creator as any)?.creatorCard?.contactPhone).trim()
            : typeof (creator as any)?.profile?.contactPhone === "string"
              ? String((creator as any)?.profile?.contactPhone).trim()
              : ""

    const line =
      typeof creator.contactLine === "string"
        ? creator.contactLine.trim()
        : typeof parsedContact.lines[0] === "string"
          ? parsedContact.lines[0].trim()
          : typeof (creator as any)?.creatorCard?.contactLine === "string"
            ? String((creator as any)?.creatorCard?.contactLine).trim()
            : typeof (creator as any)?.profile?.contactLine === "string"
              ? String((creator as any)?.profile?.contactLine).trim()
              : ""

    if (email) {
      const subject = encodeURIComponent("合作洽談 / Collaboration request")
      const body = encodeURIComponent(
        `你好 ${creator.name}，\n我在 Matchmaking 上看到你的資料，想跟你合作。\n\nHi ${creator.name},\nI saw your profile on Matchmaking and would like to collaborate.\n`,
      )
      const href = `mailto:${email}?subject=${subject}&body=${body}`
      out.push({
        key: "email",
        value: email,
        className: "",
        href,
        ariaLabel: `Email ${creator.name}`,
        isPrimary: primaryContactMethod === "email",
      })
    }

    if (phone) {
      const display = normalizePhoneDisplay(phone)
      const tel = normalizeTelNumber(display)
      if (tel) {
        out.push({
          key: "phone",
          value: display,
          className: "",
          href: `tel:${tel}`,
          ariaLabel: `Call ${creator.name}`,
          isPrimary: primaryContactMethod === "phone",
        })
      } else {
        out.push({ key: "phone", value: display, className: "", isPrimary: primaryContactMethod === "phone" })
      }
    }

    if (line) {
      const normalized = normalizeLineToHrefOrNull(line)
      if (normalized.display) {
        out.push({
          key: "line",
          value: normalized.display,
          className: "",
          href: normalized.href,
          ariaLabel: `LINE ${creator.name}`,
          isPrimary: primaryContactMethod === "line",
        })
      }
    }

    // Primary first, stable order.
    const order: Array<(typeof out)[number]["key"]> = ["email", "phone", "line"]
    return [...out]
      .sort((a, b) => {
        const pa = a.isPrimary ? 1 : 0
        const pb = b.isPrimary ? 1 : 0
        if (pa !== pb) return pb - pa
        return order.indexOf(a.key) - order.indexOf(b.key)
      })
  })()

  const copyValue = async (key: "email" | "phone" | "line", value: string) => {
    const v = String(value || "").trim()
    if (!v) return
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(v)
      } else {
        const ta = document.createElement("textarea")
        ta.value = v
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopiedKey(key)
      if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedKey(null)
        copiedTimerRef.current = null
      }, 1400)
    } catch {
      // swallow
    }
  }

  const CardBody = (
    <>
      <div className="relative w-full bg-black/30 border-b border-white/10 overflow-hidden aspect-[16/10] sm:aspect-[4/5]">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creator.avatarUrl}
            alt={creator.name || ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      </div>

      <div className="p-3 sm:p-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/90 truncate min-w-0">{creator.name}</div>
            {shouldShowHandle ? <div className="text-xs text-white/50 truncate min-w-0">@{creator.handle}</div> : null}

            <div className="mt-2 flex flex-wrap gap-1.5 min-w-0">
              {displayBadges.length ? (
                displayBadges.map((c) => (
                  <span
                    key={c.key}
                    className={`text-[11px] px-2 py-0.5 rounded-full border max-w-full truncate whitespace-nowrap ${badgeClassName(c.key)}`}
                    title={c.label}
                  >
                    {c.label}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-white/40">{mm.noTopics}</span>
              )}
            </div>

            {displayTagBadges.length ? (
              <div className="mt-2 min-w-0">
                <div className="text-[11px] text-white/45 mb-1">{mm.creatorTypeLabel}</div>
                <div className="-mx-1 px-1 flex gap-1.5 min-w-0 overflow-x-auto sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {displayTagBadges.map((tag) => (
                    <span
                      key={tag}
                      className="shrink-0 text-[11px] leading-none px-2 py-1 rounded-full border bg-sky-500/10 border-sky-400/20 text-sky-100/85 max-w-full truncate whitespace-nowrap"
                      title={tag}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 min-w-0 transition-shadow sm:hover:shadow-[0_0_0_1px_rgba(34,211,238,0.20),0_12px_30px_-18px_rgba(59,130,246,0.35)]">
                <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-cyan-400/40 to-blue-500/30" />
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="text-[11px] text-white/45 truncate min-w-0">{mm.labelFollowers}</div>
                  {statsError && onRetryStats ? (
                    <button
                      type="button"
                      onClick={onRetryStats}
                      className="shrink-0 h-6 w-6 grid place-items-center rounded-md border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                      aria-label={mm.retryStatsAria}
                      title={mm.retryStatsAria}
                    >
                      ↻
                    </button>
                  ) : null}
                </div>
                {statsLoading ? (
                  <div className="mt-2 h-[22px] w-[110px] max-w-full rounded-md bg-white/10 animate-pulse" />
                ) : (
                  <div className="mt-1 text-[clamp(18px,4.5vw,26px)] leading-none font-semibold tabular-nums whitespace-nowrap truncate min-w-0 text-transparent bg-clip-text bg-gradient-to-r from-cyan-200/95 to-blue-100/90">
                    {formatNumber(creator.stats?.followers)}
                  </div>
                )}
              </div>

              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 min-w-0 transition-shadow sm:hover:shadow-[0_0_0_1px_rgba(167,139,250,0.20),0_12px_30px_-18px_rgba(236,72,153,0.35)]">
                <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-violet-400/40 to-fuchsia-500/30" />
                <div className="text-[11px] text-white/45 truncate min-w-0">{mm.labelEngagement}</div>
                {statsLoading ? (
                  <div className="mt-2 h-[22px] w-[90px] max-w-full rounded-md bg-white/10 animate-pulse" />
                ) : (
                  <div className="mt-1 text-[clamp(18px,4.5vw,26px)] leading-none font-semibold tabular-nums whitespace-nowrap truncate min-w-0 text-transparent bg-clip-text bg-gradient-to-r from-violet-200/95 to-fuchsia-100/90">
                    {formatER(creator.stats?.engagementRate)}
                  </div>
                )}
              </div>

              {typeof creator.minPrice === "number" && Number.isFinite(creator.minPrice) ? (
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 min-w-0 transition-shadow sm:hover:shadow-[0_0_0_1px_rgba(52,211,153,0.22),0_12px_30px_-18px_rgba(34,211,238,0.25)] sm:col-span-2">
                  <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-emerald-400/40 to-cyan-300/30" />
                  <div className="text-[11px] text-white/45 truncate min-w-0">{mm.budgetLabel}</div>
                  <div className="mt-1 text-sm font-semibold text-white/85 tabular-nums whitespace-nowrap truncate min-w-0">
                    {mm.minPriceFrom(formatNTD(creator.minPrice) ?? "")}
                  </div>
                </div>
              ) : null}
            </div>

            {showHighEngagement ? <div className="mt-2 text-[11px] text-white/55 truncate min-w-0">{mm.highEngagementLabel}</div> : null}
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div
      className="group relative rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition shadow-sm overflow-hidden flex flex-col h-full"
    >
      {isPopular && !isEmpty ? (
        <div className="absolute top-2 left-2 z-10">
          <div className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-200/90 whitespace-nowrap">
            {mm.popularBadge}
          </div>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="block flex-1 relative z-0 cursor-default">
          <div className="absolute top-2 right-2 z-10">
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/70 whitespace-nowrap">
              {mm.demoBadge}
            </div>
          </div>
          {CardBody}
        </div>
      ) : href ? (
        <Link href={href} className="block flex-1 relative z-0">
          {CardBody}
        </Link>
      ) : (
        <div className="block flex-1 relative z-0">
          {CardBody}
        </div>
      )}

      <div className="px-3 pb-3 sm:px-3 sm:pb-3 mt-3 relative z-20 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (isEmpty) return
            if (!contactItems.length) {
              setShowContact(false)
              setCtaToast("沒有提供聯絡方式 / No contact info provided")
              if (ctaToastTimerRef.current != null) window.clearTimeout(ctaToastTimerRef.current)
              ctaToastTimerRef.current = window.setTimeout(() => {
                setCtaToast(null)
                ctaToastTimerRef.current = null
              }, 1600)
              return
            }

            setCtaToast(null)
            setShowContact((v) => !v)
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/85 to-cyan-500/70 px-4 h-11 text-sm font-medium text-white hover:brightness-110 transition-all min-w-0 disabled:opacity-60 disabled:hover:brightness-100"
          disabled={isEmpty}
        >
          <span className="min-w-0 truncate">{mm.ctaStartCollaboration}</span>
        </button>

        <div aria-live="polite" className="sr-only">
          {ctaToast ?? ""}
        </div>
        {ctaToast ? (
          <div className="mt-2">
            <div className="rounded-xl border border-white/10 bg-[#0b1220]/85 backdrop-blur-md px-3 py-2 text-xs text-slate-200 shadow-lg break-words [overflow-wrap:anywhere]">
              {ctaToast}
            </div>
          </div>
        ) : null}

        {showContact && contactItems.length ? (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/80 min-w-0">
            {contactItems.map((it) => {
              const isPrimary = Boolean(it.isPrimary)
              const copied = copiedKey === it.key
              const label = it.key === "email" ? "Email: " : it.key === "phone" ? "Phone: " : "LINE: "
              return (
                <div
                  key={it.key}
                  className={`max-w-full overflow-hidden rounded-xl border px-3 py-2 min-w-0 ${
                    isPrimary ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <div className="text-[11px] text-white/50 uppercase tracking-wider">{it.key}</div>
                      <div className="mt-1">
                        {it.href ? (
                          <a
                            href={it.href}
                            onClick={(e) => e.stopPropagation()}
                            className="block max-w-full truncate underline underline-offset-2 decoration-white/20 hover:decoration-white/50"
                            aria-label={it.ariaLabel}
                            title={it.value}
                          >
                            {label}
                            {it.value}
                          </a>
                        ) : (
                          <span className="block max-w-full truncate" title={it.value}>
                            {label}
                            {it.value}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        copyValue(it.key, it.value)
                      }}
                      className={`shrink-0 h-8 px-3 rounded-lg border text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
                        copied
                          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                      aria-label={copied ? "Copied" : "Copy"}
                      title={copied ? "Copied" : "Copy"}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
