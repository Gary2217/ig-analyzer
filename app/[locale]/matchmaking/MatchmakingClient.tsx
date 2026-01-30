"use client"

import { useEffect, useMemo, useState } from "react"
import { CreatorCardBrowser } from "./components/CreatorCardBrowser"
import { CreatorDetailsSheet } from "./components/CreatorDetailsSheet"
import { AuthGateModal } from "./components/AuthGateModal"
import { useAuthNavigation } from "@/app/lib/useAuthNavigation"
import type { CreatorCard } from "./types"

interface MatchmakingClientProps {
  locale: "zh-TW" | "en"
  initialCards: CreatorCard[]
}

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function hashStringToInt(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function svgAvatarDataUrl(seed: string, label: string) {
  const h = hashStringToInt(seed)
  const r1 = 40 + (h % 140)
  const g1 = 40 + ((h >>> 8) % 140)
  const b1 = 40 + ((h >>> 16) % 140)
  const r2 = 40 + ((h >>> 5) % 140)
  const g2 = 40 + ((h >>> 13) % 140)
  const b2 = 40 + ((h >>> 21) % 140)
  const initials = (label || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 2)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="rgb(${r1},${g1},${b1})"/>
      <stop offset="1" stop-color="rgb(${r2},${g2},${b2})"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="80" fill="url(#g)"/>
  <circle cx="256" cy="220" r="86" fill="rgba(255,255,255,0.22)"/>
  <path d="M96 448c34-78 92-118 160-118s126 40 160 118" fill="rgba(255,255,255,0.20)"/>
  <text x="256" y="260" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto" font-size="72" font-weight="800" fill="rgba(255,255,255,0.92)">${initials}</text>
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function computeEngagementRatePct(input: {
  engagementRatePct?: number | null
  followers?: number | null
  avgLikes?: number | null
  avgComments?: number | null
}) {
  const explicit = typeof input.engagementRatePct === "number" && Number.isFinite(input.engagementRatePct) ? input.engagementRatePct : null
  if (explicit !== null) return clampNumber(explicit, 0, 99)

  const followers = typeof input.followers === "number" && Number.isFinite(input.followers) ? input.followers : null
  const likes = typeof input.avgLikes === "number" && Number.isFinite(input.avgLikes) ? input.avgLikes : null
  const comments = typeof input.avgComments === "number" && Number.isFinite(input.avgComments) ? input.avgComments : null

  if (!followers || followers <= 0) return null
  const total = (likes ?? 0) + (comments ?? 0)
  if (total <= 0) return null

  const pct = (total / followers) * 100
  return clampNumber(Math.round(pct * 100) / 100, 0, 99)
}

function buildDemoCreators({
  locale,
  existingIds,
  count,
  seedBase,
}: {
  locale: "zh-TW" | "en"
  existingIds: Set<string>
  count: number
  seedBase: string
}): CreatorCard[] {
  const out: CreatorCard[] = []

  for (let i = 0; i < count; i++) {
    const seed = `${seedBase}:demo:${i}`
    const h = hashStringToInt(seed)
    const rand = mulberry32(h)

    const followers = Math.round(Math.pow(rand(), 0.35) * 480_000 + 5_000)
    const er = clampNumber(1.2 + rand() * 6.2, 0.6, 9.9)
    const avgLikes = Math.round((followers * er) / 100 * (0.82 + rand() * 0.22))
    const avgComments = Math.round(avgLikes * (0.03 + rand() * 0.06))

    const name = locale === "zh-TW" ? `示意創作者 ${i + 1}` : `Demo Creator ${i + 1}`
    const username = locale === "zh-TW" ? `demo_${(h % 10_000).toString().padStart(4, "0")}` : `demo_${(h % 10_000).toString().padStart(4, "0")}`
    const id = `demo_${h.toString(16)}`
    if (existingIds.has(id)) continue

    out.push({
      id,
      displayName: name,
      avatarUrl: svgAvatarDataUrl(seed, name),
      category: locale === "zh-TW" ? "示意" : "Demo",
      followerCount: followers,
      avgLikes,
      avgComments,
      engagementRate: Math.round(er * 100) / 100,
      isVerified: false,
      profileUrl: "",
      isDemo: true,
    })
  }

  return out
}

export function MatchmakingClient({ locale, initialCards }: MatchmakingClientProps) {
  const { isAuthenticated, navigateToProtected } = useAuthNavigation()

  const [cards, setCards] = useState<CreatorCard[]>(initialCards)

  // State for sheet and modal
  const [selectedCard, setSelectedCard] = useState<CreatorCard | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  const copy = locale === "zh-TW"
    ? {
        heading: "瀏覽創作者名片，開啟合作機會",
        placeholderLabel: "創作者名片",
      }
    : {
        heading: "Browse creator cards and collaborate",
        placeholderLabel: "Creator Card",
      }

  useEffect(() => {
    setCards(initialCards)
  }, [initialCards])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const meRes = await fetch("/api/creator-card/me", { method: "GET", cache: "no-store" })
        const meJson = (await meRes.json().catch(() => null)) as any
        const ownerIgUserId = typeof meJson?.me?.igUserId === "string" ? meJson.me.igUserId : null
        const ownerCardId = typeof meJson?.card?.id === "string" ? meJson.card.id : null
        if (!ownerIgUserId || !ownerCardId) return

        const statsRes = await fetch(`/api/creators/${encodeURIComponent(ownerIgUserId)}/stats`, {
          method: "GET",
          cache: "no-store",
        })
        const statsJson = (await statsRes.json().catch(() => null)) as any
        const stats = statsJson?.ok === true ? statsJson?.stats : null

        const followers = typeof stats?.followers === "number" && Number.isFinite(stats.followers) ? Math.floor(stats.followers) : null
        const avgLikes = typeof stats?.avgLikes === "number" && Number.isFinite(stats.avgLikes) ? Math.round(stats.avgLikes) : null
        const avgComments = typeof stats?.avgComments === "number" && Number.isFinite(stats.avgComments) ? Math.round(stats.avgComments) : null
        const engagementRate = computeEngagementRatePct({
          engagementRatePct: typeof stats?.engagementRatePct === "number" ? stats.engagementRatePct : null,
          followers,
          avgLikes,
          avgComments,
        })

        if (cancelled) return
        setCards((prev) =>
          prev.map((c) =>
            c.id === ownerCardId
              ? {
                  ...c,
                  followerCount: followers ?? c.followerCount,
                  avgLikes,
                  avgComments,
                  engagementRate,
                }
              : c
          )
        )
      } catch {
        // swallow
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const cardsWithDemos = useMemo(() => {
    const TARGET_TOTAL = 12
    const existingIds = new Set(cards.map((c) => c.id))
    const realCards = cards.filter((c) => !c.isDemo)
    const missing = Math.max(0, TARGET_TOTAL - realCards.length)
    const demos = missing > 0 ? buildDemoCreators({ locale, existingIds, count: missing, seedBase: "matchmaking" }) : []
    return [...realCards, ...demos]
  }, [cards, locale])

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="w-full max-w-6xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight max-w-3xl mx-auto text-balance">
            {copy.heading}
          </h1>
        </div>

        {/* Creator Cards with Search/Filter */}
        <CreatorCardBrowser
          cards={cardsWithDemos}
          locale={locale}
        />

        {/* Footer Note - only show if using real data */}
        {cardsWithDemos.length > 0 && (
          <div className="mt-12 text-center">
            <p className="text-xs text-white/40">
              {locale === "zh-TW"
                ? `顯示 ${cardsWithDemos.length} 位創作者`
                : `Showing ${cardsWithDemos.length} creators`}
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
