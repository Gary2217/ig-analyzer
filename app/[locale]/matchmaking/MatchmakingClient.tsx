"use client"

import { useState } from "react"
import { CreatorCardList } from "./components/CreatorCardList"
import { CreatorDetailsSheet } from "./components/CreatorDetailsSheet"
import { AuthGateModal } from "./components/AuthGateModal"
import { DEFAULT_CARD_CLICK_CONFIG, type CardClickBehavior } from "./cardClickConfig"
import { useAuthNavigation } from "@/app/lib/useAuthNavigation"
import type { CreatorCard } from "./types"

interface MatchmakingClientProps {
  locale: "zh-TW" | "en"
  initialCards: CreatorCard[]
}

export function MatchmakingClient({ locale, initialCards }: MatchmakingClientProps) {
  const { isAuthenticated, navigateToProtected } = useAuthNavigation()

  // State for sheet and modal
  const [selectedCard, setSelectedCard] = useState<CreatorCard | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  // Configure card click behavior (can be changed here)
  const cardBehavior: CardClickBehavior = DEFAULT_CARD_CLICK_CONFIG.behavior
  // Alternative behaviors to try:
  // const cardBehavior: CardClickBehavior = "OPEN_DETAILS"
  // const cardBehavior: CardClickBehavior = "GATED"

  const copy = locale === "zh-TW"
    ? {
        heading: "瀏覽創作者名片，開啟合作機會",
        comingSoon: "即將推出",
        description:
          "我們正在建立一個公開的創作者名片展示平台。品牌與創作者將能在此探索合作機會。",
        placeholderLabel: "創作者名片",
      }
    : {
        heading: "Browse creator cards and collaborate",
        comingSoon: "Coming Soon",
        description:
          "We're building a public creator card showcase. Brands and creators will be able to discover collaboration opportunities here.",
        placeholderLabel: "Creator Card",
      }

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="w-full max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight max-w-3xl mx-auto text-balance">
            {copy.heading}
          </h1>
        </div>

        {/* Coming Soon Notice */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-200 border border-amber-400/20 mb-3">
            {copy.comingSoon}
          </div>
          <p className="text-sm text-white/60 leading-relaxed">
            {copy.description}
          </p>
        </div>

        {/* Creator Cards */}
        <CreatorCardList
          cards={initialCards}
          locale={locale}
          behavior={cardBehavior}
          onCardClick={(id) => {
            const card = initialCards.find((c) => c.id === id)
            if (!card) return

            if (cardBehavior === "NAVIGATE_PROFILE") {
              // Navigation handled by Link component
              return
            }

            if (cardBehavior === "OPEN_DETAILS") {
              setSelectedCard(card)
              setIsSheetOpen(true)
              return
            }

            if (cardBehavior === "GATED") {
              if (isAuthenticated) {
                // Already authenticated, proceed to post-gate target
                const postGateTarget = DEFAULT_CARD_CLICK_CONFIG.postGateTarget || "NAVIGATE_PROFILE"
                if (postGateTarget === "NAVIGATE_PROFILE") {
                  navigateToProtected(`${card.profileUrl}`)
                } else {
                  setSelectedCard(card)
                  setIsSheetOpen(true)
                }
              } else {
                // Not authenticated, show gate modal
                setSelectedCard(card)
                setIsAuthModalOpen(true)
              }
              return
            }
          }}
        />

        {/* Footer Note - only show if using real data */}
        {initialCards.length > 0 && (
          <div className="mt-12 text-center">
            <p className="text-xs text-white/40">
              {locale === "zh-TW"
                ? `顯示 ${initialCards.length} 位創作者`
                : `Showing ${initialCards.length} creators`}
            </p>
          </div>
        )}
      </div>

      {/* Details Sheet */}
      {selectedCard && (
        <CreatorDetailsSheet
          card={selectedCard}
          locale={locale}
          isOpen={isSheetOpen}
          onClose={() => {
            setIsSheetOpen(false)
            setSelectedCard(null)
          }}
        />
      )}

      {/* Auth Gate Modal */}
      <AuthGateModal
        locale={locale}
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false)
          setSelectedCard(null)
        }}
        onLogin={() => {
          // Navigate to OAuth with return URL
          if (selectedCard) {
            navigateToProtected(`${selectedCard.profileUrl}`)
          }
        }}
      />
    </div>
  )
}
