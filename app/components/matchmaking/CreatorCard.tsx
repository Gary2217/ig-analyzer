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
}: {
  creator: CreatorCardData
  locale: Locale
  isFav: boolean
  onToggleFav: () => void
}) {
  const copy = getCopy(locale)
  const mm = copy.matchmaking
  const topics = (creator.topics ?? []).slice(0, 3)

  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition shadow-sm overflow-hidden">
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
            <div className="text-sm sm:text-[15px] font-semibold text-white/90 truncate min-w-0">
              {creator.name}
            </div>
            <div className="mt-0.5 text-xs text-white/55 truncate min-w-0 [overflow-wrap:anywhere]">
              {creator.handle ? `@${creator.handle}` : ""}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 min-w-0">
            {topics.length ? (
              topics.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 max-w-full truncate"
                >
                  {t}
                </span>
              ))
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

          <div className="mt-3 text-xs text-white/50">{mm.viewDetails}</div>
        </div>
      </Link>
    </div>
  )
}
