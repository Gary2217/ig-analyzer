"use client"

import { CreatorCard } from "./CreatorCard"
import { CreatorCard as CreatorCardType } from "../types"

interface CreatorCardListProps {
  cards: CreatorCardType[]
  locale: "zh-TW" | "en"
  onViewProfile: (id: string) => void
}

export function CreatorCardList({ cards, locale, onViewProfile }: CreatorCardListProps) {
  return (
    <>
      {/* Desktop: Grid Layout */}
      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {cards.map((card) => (
          <CreatorCard key={card.id} card={card} locale={locale} onViewProfile={onViewProfile} />
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
              <CreatorCard card={card} locale={locale} onViewProfile={onViewProfile} />
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
