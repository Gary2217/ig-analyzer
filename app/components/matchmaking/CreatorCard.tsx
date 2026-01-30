"use client"

import Link from "next/link"
import type { CreatorCardData } from "./types"

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
  isFav,
  onToggleFav,
}: {
  creator: CreatorCardData
  isFav: boolean
  onToggleFav: () => void
}) {
  const topics = (creator.topics ?? []).slice(0, 3)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 hover:bg-white/7 transition shadow-sm overflow-hidden">
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white/90 truncate">{creator.name}</div>
          <div className="text-xs text-white/50 truncate">{creator.handle ? `@${creator.handle}` : ""}</div>
        </div>

        <button
          type="button"
          onClick={onToggleFav}
          className="shrink-0 h-8 px-2 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          title={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          {isFav ? "★ Saved" : "☆ Save"}
        </button>
      </div>

      <Link href={creator.href} className="block px-3 pb-3">
        <div className="rounded-xl bg-black/20 border border-white/10 overflow-hidden">
          <div className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/10 overflow-hidden shrink-0">
              {creator.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creator.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                {topics.length ? (
                  topics.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70"
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-white/40">No topics</span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/70">
                <div className="rounded-lg bg-white/5 border border-white/10 px-2 py-1">
                  <div className="text-white/40 text-[11px]">Followers</div>
                  <div className="font-medium text-white/85">{formatNumber(creator.stats?.followers)}</div>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 px-2 py-1">
                  <div className="text-white/40 text-[11px]">Engagement</div>
                  <div className="font-medium text-white/85">{formatER(creator.stats?.engagementRate)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 pb-3 text-xs text-white/50">Click to view details →</div>
        </div>
      </Link>
    </div>
  )
}
