"use client"

import { CreatorCard } from "./CreatorCard"
import { CreatorCard as CreatorCardType } from "../types"
import { CardClickBehavior } from "../cardClickConfig"

interface CreatorCardListProps {
  cards: CreatorCardType[]
  locale: "zh-TW" | "en"
  behavior: CardClickBehavior
  onCardClick: (id: string) => void
}

export function CreatorCardList({ cards, locale, behavior, onCardClick }: CreatorCardListProps) {
  const TARGET_DESKTOP_CARDS = 6
  const fillers = Math.max(0, TARGET_DESKTOP_CARDS - cards.length)

  return (
    <>
      {/* Desktop: Grid Layout */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {cards.map((card) => (
          <CreatorCard key={card.id} card={card} locale={locale} behavior={behavior} onClick={onCardClick} />
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

      {/* Mobile: Horizontal Swipeable Cards */}
      <div className="sm:hidden -mx-4 px-4">
        <div
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {cards.map((card) => (
            <div key={card.id} className="snap-start shrink-0 w-[85vw] max-w-[340px]">
              <CreatorCard card={card} locale={locale} behavior={behavior} onClick={onCardClick} />
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </>
  )
}
