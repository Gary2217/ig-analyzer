"use client"

import Link from "next/link"
import type { CreatorCardData } from "./types"
import { getCopy, type Locale } from "@/app/i18n"

function formatNumber(n?: number) {
  if (n == null || Number.isNaN(n)) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function formatER(er?: number) {
  if (er == null || Number.isNaN(er)) return "—"
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
  isMyCard,
}: {
  creator: CreatorCardData
  locale: Locale
  isFav: boolean
  onToggleFav: () => void
  isMyCard?: boolean
}) {
  const copy = getCopy(locale)
  const mm = copy.matchmaking
  const isEmpty = Boolean(creator.isDemo)
  const allPlatforms = (creator.platforms ?? []).filter(Boolean)
  const deliverableFormats = deriveFormatKeysFromDeliverables(creator.deliverables)

  const shouldShowHandle = (() => {
    const handle = typeof creator.handle === "string" ? creator.handle.trim() : ""
    if (!handle) return false
    const name = typeof creator.name === "string" ? creator.name.trim() : ""
    const normalizedName = name.replace(/^@/, "").toLowerCase()
    const normalizedHandle = handle.replace(/^@/, "").toLowerCase()
    return normalizedName !== normalizedHandle
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

  const primaryType = (creator.collabTypes ?? [])[0]
  const primaryFormat = deliverableFormats[0]
  const topChips: Array<{ key: string; label: string }> = []
  if (allPlatforms[0]) topChips.push({ key: allPlatforms[0], label: platformLabel(allPlatforms[0]) })
  if (primaryType) topChips.push({ key: primaryType, label: typeLabel(primaryType) })
  else if (primaryFormat) topChips.push({ key: primaryFormat, label: typeLabel(primaryFormat) })
  const displayChips = topChips.slice(0, 2)

  return (
    <div
      className={`group relative rounded-2xl border bg-white/5 hover:bg-white/[0.07] transition shadow-sm overflow-hidden ${
        isMyCard ? "border-sky-400/40 ring-1 ring-sky-400/30" : "border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={onToggleFav}
        className={`absolute right-3 top-3 z-10 grid place-items-center h-9 w-9 rounded-full border border-white/10 bg-black/40 text-sm text-white/90 hover:bg-black/55 backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${
          isEmpty ? "pointer-events-none opacity-0" : ""
        }`}
        aria-label={isFav ? mm.favoriteRemoveAria : mm.favoriteAddAria}
        title={isFav ? mm.favoriteRemoveAria : mm.favoriteAddAria}
      >
        {isFav ? "★" : "☆"}
      </button>

      {isEmpty ? (
        <div className="block">
          <div className="relative w-full bg-black/30 border-b border-white/10 overflow-hidden aspect-[16/10] sm:aspect-[4/5]">
            <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/5" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          </div>

          <div className="p-3 sm:p-4 min-w-0">
            <div className="h-4 w-40 max-w-full rounded bg-white/10" />
            <div className="mt-2 h-3 w-28 max-w-full rounded bg-white/10" />

            <div className="mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-3">
              <div className="text-xs text-white/50 truncate">{mm.profileNotSet}</div>
              <div className="mt-2 h-6 w-24 rounded bg-white/10" />
              <div className="mt-2 h-4 w-16 rounded bg-white/10" />
            </div>
          </div>
        </div>
      ) : (
        <Link href={creator.href} className="block">
        <div className="relative w-full bg-black/30 border-b border-white/10 overflow-hidden aspect-[16/10] sm:aspect-[4/5]">
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-white/10 to-white/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        </div>

        <div className="p-3 sm:p-4 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {isMyCard ? (
              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200/90 whitespace-nowrap">
                {mm.myCardBadge}
              </span>
            ) : null}
            <div className="text-sm sm:text-[15px] font-semibold text-white/90 truncate min-w-0">
              {creator.name}
            </div>
          </div>

          <div className="mt-0.5 text-xs text-white/55 truncate min-w-0 [overflow-wrap:anywhere]">
            {shouldShowHandle && creator.handle ? `@${creator.handle}` : ""}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 min-w-0">
            {displayChips.length ? (
              displayChips.map((c) => (
                <span
                  key={c.key}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 max-w-full truncate whitespace-nowrap"
                >
                  {c.label}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-white/40">{mm.noTopics}</span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 min-w-0 transition-shadow sm:hover:shadow-[0_0_0_1px_rgba(34,211,238,0.20),0_12px_30px_-18px_rgba(59,130,246,0.35)]">
              <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-cyan-400/40 to-blue-500/30" />
              <div className="text-[11px] text-white/45 truncate min-w-0">{mm.followersLabel}</div>
              <div className="mt-1 text-[clamp(18px,4.5vw,26px)] leading-none font-semibold tabular-nums whitespace-nowrap truncate min-w-0 text-transparent bg-clip-text bg-gradient-to-r from-cyan-200/95 to-blue-100/90">
                {formatNumber(creator.stats?.followers)}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 min-w-0 transition-shadow sm:hover:shadow-[0_0_0_1px_rgba(167,139,250,0.20),0_12px_30px_-18px_rgba(236,72,153,0.35)]">
              <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-violet-400/40 to-fuchsia-500/30" />
              <div className="text-[11px] text-white/45 truncate min-w-0">{mm.engagementLabel}</div>
              <div className="mt-1 text-[clamp(18px,4.5vw,26px)] leading-none font-semibold tabular-nums whitespace-nowrap truncate min-w-0 text-transparent bg-clip-text bg-gradient-to-r from-violet-200/95 to-fuchsia-100/90">
                {formatER(creator.stats?.engagementRate)}
              </div>
            </div>

            {typeof creator.minPrice === "number" && Number.isFinite(creator.minPrice) ? (
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] px-3 py-3 min-w-0 transition-shadow sm:hover:shadow-[0_0_0_1px_rgba(52,211,153,0.22),0_12px_30px_-18px_rgba(34,211,238,0.25)] sm:col-span-2">
                <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-emerald-400/40 to-cyan-300/30" />
                <div className="text-[11px] text-white/45 truncate min-w-0">{mm.budgetLabel}</div>
                <div className="mt-1 text-sm font-semibold text-white/85 tabular-nums whitespace-nowrap truncate min-w-0">
                  {mm.minPriceFrom(formatNTD(creator.minPrice) ?? "")}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        </Link>
      )}
    </div>
  )
}
