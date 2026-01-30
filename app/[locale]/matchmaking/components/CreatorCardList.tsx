"use client"

import { CreatorCard } from "./CreatorCard"
import { CreatorCard as CreatorCardType } from "../types"

interface CreatorCardListProps {
  cards: CreatorCardType[]
  locale: "zh-TW" | "en"
}

export function CreatorCardList({ cards, locale }: CreatorCardListProps) {
  const TARGET_DESKTOP_CARDS = 6
  const fillers = Math.max(0, TARGET_DESKTOP_CARDS - cards.length)

  return (
    <>
      {/* Desktop: Grid Layout */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {cards.map((card) => (
          <CreatorCard key={card.id} card={card} locale={locale} />
        ))}

        {Array.from({ length: fillers }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white/10" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-3 w-20 rounded bg-white/10" />
              <div className="mt-3 h-9 w-full rounded-xl bg-white/10" />
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: Grid Layout */}
      <div className="sm:hidden grid grid-cols-1 min-[420px]:grid-cols-2 gap-4">
        {cards.map((card) => (
          <CreatorCard key={card.id} card={card} locale={locale} />
        ))}
      </div>
    </>
  )
}
