"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import type { CreatorCardData } from "./types"
import { getCopy, type Locale } from "@/app/i18n"
import { localizeCreatorTypes, normalizeCreatorTypesFromCard } from "@/app/lib/creatorTypes"
import { clearDemoAvatar, fileToCompressedDataUrl, setDemoAvatar } from "@/app/components/matchmaking/demoAvatarStorage"
import { useAvatarBuster, withAvatarBuster } from "@/app/lib/client/avatarBuster"
import { formatPriceLabel } from "@/app/lib/client/priceLabel"

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

export function CreatorCard({
  creator,
  locale,
  isFav,
  onToggleFav,
  onDemoAvatarChanged,
  canEditDemoAvatars,
  isPopularPicked,
  statsLoading,
  statsError,
  onRetryStats,
  selectedBudgetMax,
}: {
  creator: CreatorCardData
  locale: Locale
  isFav: boolean
  onToggleFav: () => void
  onDemoAvatarChanged?: () => void
  canEditDemoAvatars?: boolean
  isPopularPicked?: boolean
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
  const allPlatforms = (creator.platforms ?? []).filter(Boolean)
  const deliverableFormats = deriveFormatKeysFromDeliverables(creator.deliverables)

  const canEditDemos = Boolean(canEditDemoAvatars)

  const avatarBuster = useAvatarBuster()
  const avatarSrc = withAvatarBuster(creator.avatarUrl, avatarBuster)

  const isDemo = Boolean((creator as any)?.isDemo) || String((creator as any)?.id || "").startsWith("demo-")

  useEffect(() => {
    return () => {
      // no-op
    }
  }, [])

  const isPopular =
    (typeof creator.stats?.followers === "number" && Number.isFinite(creator.stats.followers) && creator.stats.followers > 5000) ||
    (typeof creator.stats?.engagementRate === "number" && Number.isFinite(creator.stats.engagementRate) && creator.stats.engagementRate > 0.03)

  const showPopularBadge =
    isPopularPicked === true ? true : isPopularPicked === false ? false : isPopular && !isEmpty

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

  const priceText = formatPriceLabel({ minPrice: creator.minPrice ?? null, locale })

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

  const CardBody = (
    <>
      <div className="relative w-full bg-black/30 border-b border-white/10 overflow-hidden aspect-[16/10] sm:aspect-[4/5]">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt={creator.name || ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/10" />
          </div>
        )}

        <div className="absolute bottom-2 right-2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleFav()
            }}
            className={`h-10 w-10 rounded-full border grid place-items-center backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 ${
              isFav
                ? "bg-emerald-500/25 border-emerald-400/30 text-emerald-100"
                : "bg-black/40 border-white/15 text-white/85 hover:bg-black/55"
            }`}
            aria-label={isFav ? "Remove favorite / 取消收藏" : "Add favorite / 加入收藏"}
            title={isFav ? "Remove favorite / 取消收藏" : "Add favorite / 加入收藏"}
          >
            <span className="text-base leading-none">{isFav ? "♥" : "♡"}</span>
          </button>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      </div>

      {isDemo && canEditDemos && process.env.NODE_ENV !== "production" ? (
        <div className="px-3 pt-3 sm:px-3">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10 cursor-pointer whitespace-nowrap">
              {locale === "zh-TW" ? "上傳圖片" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const dataUrl = await fileToCompressedDataUrl(f)
                    setDemoAvatar(String((creator as any).id), dataUrl)
                    onDemoAvatarChanged?.()
                  } catch {
                    // swallow
                  } finally {
                    e.currentTarget.value = ""
                  }
                }}
              />
            </label>

            <button
              type="button"
              className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/60 hover:bg-white/10 whitespace-nowrap"
              onClick={() => {
                clearDemoAvatar(String((creator as any).id))
                onDemoAvatarChanged?.()
              }}
            >
              {locale === "zh-TW" ? "重設" : "Reset"}
            </button>
          </div>
        </div>
      ) : null}

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
                    {priceText}
                  </div>
                </div>
              ) : null}
            </div>

          </div>
        </div>
      </div>
    </>
  )

  return (
    <div
      className="group relative rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition shadow-sm overflow-hidden flex flex-col h-full md:hover:border-white/20 md:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_46px_-28px_rgba(0,0,0,0.65)] md:focus-within:border-white/20 md:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_46px_-28px_rgba(0,0,0,0.65)]"
    >
      {showPopularBadge && !isEmpty ? (
        <div className="absolute top-2 left-2 z-10">
          <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold bg-black/55 text-emerald-200 border border-white/15 shadow-sm backdrop-blur-sm whitespace-nowrap">
            {mm.popularBadge}
          </div>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="block flex-1 relative z-0 cursor-default">
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
    </div>
  )
}
