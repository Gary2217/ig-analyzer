"use client"

import Link from "next/link"
import type { CreatorCardData } from "./types"

export function FavoritesDrawer({
  open,
  onClose,
  favorites,
  onClearAll,
}: {
  open: boolean
  onClose: () => void
  favorites: CreatorCardData[]
  onClearAll: () => void
}) {
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
          <div className="text-sm font-semibold text-white/90">Saved creators</div>
          <button
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-3 flex items-center justify-between">
          <div className="text-xs text-white/50">{favorites.length} saved</div>
          <button
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
            onClick={onClearAll}
            disabled={!favorites.length}
          >
            Clear all
          </button>
        </div>

        <div className="px-3 pb-6 overflow-y-auto h-[calc(100%-110px)]">
          {favorites.length ? (
            <div className="space-y-2">
              {favorites.map((c) => (
                <Link
                  key={c.id}
                  href={c.href}
                  className="block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3"
                  onClick={onClose}
                >
                  <div className="text-sm font-semibold text-white/90">{c.name}</div>
                  <div className="text-xs text-white/50">{c.handle ? `@${c.handle}` : ""}</div>
                  <div className="mt-2 text-xs text-white/60">
                    Followers: {c.stats?.followers ?? "—"} · ER: {c.stats?.engagementRate ?? "—"}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/50 p-4 border border-dashed border-white/10 rounded-xl">
              No saved creators yet. Click “Save” on a card.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
