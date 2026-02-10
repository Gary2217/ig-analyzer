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
            className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden animate-pulse"
          >
            <div className="relative w-full bg-white/10 aspect-[16/10] rounded-xl" />
            <div className="p-4">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="mt-2 h-3 w-20 rounded bg-white/10" />

              <div className="mt-3 flex gap-2">
                <div className="h-5 w-14 rounded-full bg-white/10" />
                <div className="h-5 w-16 rounded-full bg-white/10" />
                <div className="h-5 w-12 rounded-full bg-white/10" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="h-12 rounded-xl bg-white/10" />
                <div className="h-12 rounded-xl bg-white/10" />
                <div className="col-span-2 h-12 rounded-xl bg-white/10" />
              </div>

              <div className="mt-4 h-11 w-full rounded-xl bg-white/10" />
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
