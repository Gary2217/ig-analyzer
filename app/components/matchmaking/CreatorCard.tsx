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
  const allPlatforms = (creator.platforms ?? []).filter(Boolean)
  const platformChips = allPlatforms.slice(0, 3)
  const platformOverflow = Math.max(0, allPlatforms.length - platformChips.length)

  const platformLabel = (p: string) => {
    if (p === "instagram") return mm.platformInstagram
    if (p === "tiktok") return mm.platformTikTok
    if (p === "youtube") return mm.platformYouTube
    if (p === "facebook") return mm.platformFacebook
    return p
  }

  return (
    <div
      className={`group relative rounded-2xl border bg-white/5 hover:bg-white/[0.07] transition shadow-sm overflow-hidden ${
        isMyCard ? "border-sky-400/40 ring-1 ring-sky-400/30" : "border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={onToggleFav}
        className="absolute right-3 top-3 z-10 shrink-0 h-9 px-3 rounded-full border border-white/10 bg-black/40 text-xs text-white/90 hover:bg-black/55 backdrop-blur"
        aria-label={isFav ? copy.common.saved : copy.common.save}
        title={isFav ? copy.common.saved : copy.common.save}
      >
        {isFav ? `★ ${copy.common.saved}` : `☆ ${copy.common.save}`}
      </button>

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
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm sm:text-[15px] font-semibold text-white/90 truncate min-w-0">
                {creator.name}
              </div>
              {isMyCard ? (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200/90 whitespace-nowrap">
                  {mm.myCardBadge}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-xs text-white/55 truncate min-w-0 [overflow-wrap:anywhere]">
              {creator.handle ? `@${creator.handle}` : ""}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 min-w-0">
            {platformChips.length ? (
              <>
                {platformChips.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 max-w-full truncate whitespace-nowrap"
                  >
                    {platformLabel(p)}
                  </span>
                ))}
                {platformOverflow ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/60 tabular-nums whitespace-nowrap">
                    +{platformOverflow}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-[11px] text-white/40">{mm.noTopics}</span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
            <div className="rounded-xl bg-white/5 border border-white/10 px-2.5 py-2 min-w-0">
              <div className="text-white/40 text-[11px] truncate">{mm.followersLabel}</div>
              <div className="font-medium text-white/90 tabular-nums whitespace-nowrap">
                {formatNumber(creator.stats?.followers)}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-2.5 py-2 min-w-0">
              <div className="text-white/40 text-[11px] truncate">{mm.engagementLabel}</div>
              <div className="font-medium text-white/90 tabular-nums whitespace-nowrap">
                {formatER(creator.stats?.engagementRate)}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
