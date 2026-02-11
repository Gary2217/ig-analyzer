"use client"

import Link from "next/link"
import type { CreatorCardData } from "./types"
import { getCopy, type Locale } from "@/app/i18n"

export function FavoritesDrawer({
  locale,
  open,
  onClose,
  favoriteIds,
  getCreatorById,
  onClearAll,
}: {
  locale: Locale
  open: boolean
  onClose: () => void
  favoriteIds: string[]
  getCreatorById: (id: string) => CreatorCardData | undefined
  onClearAll: () => void
}) {
  const copy = getCopy(locale)
  const mm = copy.matchmaking
  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"

  const resolved = favoriteIds
    .map((id) => getCreatorById(id))
    .filter((c): c is CreatorCardData => Boolean(c))

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-[92vw] sm:w-[420px] bg-slate-950/95 border-l border-white/10 backdrop-blur transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
          <div className="text-sm font-semibold text-white/90 min-w-0 truncate">{mm.favoritesTitle}</div>
          <button
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
            onClick={onClose}
          >
            {mm.close}
          </button>
        </div>

        <div className="p-3 flex items-center justify-between">
          <div className="text-xs text-white/50 tabular-nums whitespace-nowrap">{mm.favoritesCount(favoriteIds.length)}</div>
          <button
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
            onClick={onClearAll}
            disabled={!favoriteIds.length}
          >
            {mm.clearAll}
          </button>
        </div>

        <div className="px-3 pb-6 overflow-y-auto h-[calc(100%-110px)]">
          {favoriteIds.length ? (
            <div className="space-y-2">
              {resolved.map((c) => (
                <Link
                  key={c.id}
                  href={(typeof c.href === "string" && c.href.trim().length > 0 ? c.href : `${localePrefix}/creator-card/view`) as any}
                  className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 sm:p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
                  onClick={onClose}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full overflow-hidden border border-white/10 bg-white/5">
                        {c.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.avatarUrl} alt={c.name || ""} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full bg-white/10" />
                        )}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white/90 min-w-0 truncate">{c.name}</div>
                      <div className="text-xs text-white/50 min-w-0 truncate [overflow-wrap:anywhere]">{c.handle ? `@${c.handle}` : ""}</div>
                    </div>

                    <div className="shrink-0 text-right tabular-nums">
                      <div className="sm:hidden">
                        <div className="text-[11px] text-cyan-100/75 whitespace-nowrap">
                          {mm.followersLabel}: <span className="text-white/85">{c.stats?.followers ?? "—"}</span>
                        </div>
                        <div className="text-[11px] text-emerald-100/75 whitespace-nowrap">
                          {mm.engagementLabel}: <span className="text-white/85">{c.stats?.engagementRate ?? "—"}</span>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center justify-end gap-2">
                        <div className="px-2 py-1 rounded-lg border border-white/10 bg-cyan-500/10 text-[11px] text-cyan-100/85 whitespace-nowrap">
                          {mm.followersLabel}: <span className="text-white/90">{c.stats?.followers ?? "—"}</span>
                        </div>
                        <div className="px-2 py-1 rounded-lg border border-white/10 bg-emerald-500/10 text-[11px] text-emerald-100/85 whitespace-nowrap">
                          {mm.engagementLabel}: <span className="text-white/90">{c.stats?.engagementRate ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/50 p-4 border border-dashed border-white/10 rounded-xl">
              {mm.emptyFavorites}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
