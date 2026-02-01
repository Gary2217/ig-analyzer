"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FiltersBar } from "@/app/components/matchmaking/FiltersBar"
import { CreatorGrid } from "@/app/components/matchmaking/CreatorGrid"
import { CreatorCard as MatchmakingCreatorCard } from "@/app/components/matchmaking/CreatorCard"
import { FavoritesDrawer } from "@/app/components/matchmaking/FavoritesDrawer"
import { useFavorites } from "@/app/components/matchmaking/useFavorites"
import { getCopy, type Locale } from "@/app/i18n"
import type {
  BudgetRange,
  CollabType,
  CreatorCardData,
  FormatKey,
  Platform,
  TypeKey,
} from "@/app/components/matchmaking/types"
import type { CreatorCard } from "./types"

const OWNER_LOOKUP_CACHE_KEY = "matchmaking_owner_lookup_v1"
const CC_PIN_KEY = "cc_pin_v1"

interface MatchmakingClientProps {
  locale: Locale
  initialCards: CreatorCard[]
}

type CreatorWithId = CreatorCardData & { creatorId?: string }

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function MatchmakingClient({ locale, initialCards }: MatchmakingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fav = useFavorites()

  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"
  const uiCopy = useMemo(() => getCopy(locale), [locale])

  /** =========================
   * ✅ AUTH STATE（修正重點）
   * ========================= */
  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch("/api/creator-card/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })

        /**
         * ✅ 只要不是 401 / 403，就代表「已登入 Supabase」
         * ❌ 不再用 me.ok 判斷（那是業務資料，不是登入）
         */
        const authed = res.status !== 401 && res.status !== 403

        if (cancelled) return
        setIsLoggedIn(authed)
        setAuthChecked(true)
      } catch {
        if (cancelled) return
        setIsLoggedIn(false)
        setAuthChecked(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const canRenderMatchmaking = authChecked && isLoggedIn

  /** =========================
   * DATA STATE
   * ========================= */
  const [cards, setCards] = useState<CreatorCard[]>(initialCards)
  const [favOpen, setFavOpen] = useState(false)

  useEffect(() => {
    setCards(initialCards)
  }, [initialCards])

  /** =========================
   * UI STATES（保留原邏輯）
   * ========================= */
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"best_match" | "followers_desc" | "er_desc">("best_match")
  const [platform, setPlatform] = useState<Platform | "any">("any")
  const [budget, setBudget] = useState<BudgetRange>("any")
  const [customBudget, setCustomBudget] = useState<string>("")
  const [selectedTypes, setSelectedTypes] = useState<TypeKey[]>([])

  /** =========================
   * LOGIN GATE UI
   * ========================= */
  if (!authChecked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-white/70">
        {locale === "zh-TW" ? "載入中…" : "Loading…"}
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center max-w-md">
          <div className="text-xl font-semibold text-white">
            {locale === "zh-TW" ? "請先登入" : "Please log in"}
          </div>
          <div className="mt-2 text-white/60 text-sm">
            {locale === "zh-TW"
              ? "登入後即可查看創作者配對結果"
              : "Log in to see matchmaking results"}
          </div>

          <button
            className="mt-5 w-full rounded-xl bg-white text-black font-semibold py-3"
            onClick={() => {
              const nextPath = `/${locale}/matchmaking`
              window.location.href = `/api/auth/login?next=${encodeURIComponent(nextPath)}`
            }}
          >
            {locale === "zh-TW" ? "使用 Google 登入" : "Sign in with Google"}
          </button>
        </div>
      </div>
    )
  }

  /** =========================
   * MAIN UI（已登入）
   * ========================= */
  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="pt-6 sm:pt-8">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
          <h1 className="text-2xl font-semibold text-white">
            {uiCopy.matchmaking.pageHeadline}
          </h1>
          <p className="mt-1 text-white/60 text-sm">
            {uiCopy.matchmaking.pageSubheadline}
          </p>
        </div>

        <div className="relative mt-4">
          <FiltersBar
            locale={locale}
            search={q}
            onSearch={setQ}
            platform={platform}
            onPlatform={setPlatform}
            budget={budget}
            onBudget={(v) => {
              setBudget(v)
              if (v !== "custom") setCustomBudget("")
            }}
            customBudget={customBudget}
            onCustomBudget={setCustomBudget}
            onClearCustomBudget={() => {
              setBudget("any")
              setCustomBudget("")
            }}
            selectedTypes={selectedTypes}
            onToggleType={(t) =>
              setSelectedTypes((prev) =>
                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
              )
            }
            onClearTypes={() => setSelectedTypes([])}
            sort={sort}
            onSort={setSort}
            favoritesCount={fav.count}
            onOpenFavorites={() => setFavOpen(true)}
          />
        </div>

        <CreatorGrid>
          {cards.map((c) => (
            <MatchmakingCreatorCard
              key={c.id}
              creator={{
                id: c.id,
                name: c.displayName,
                avatarUrl: c.avatarUrl,
                topics: c.category ? [c.category] : [],
                platforms: [],
                collabTypes: [],
                deliverables: c.deliverables ?? [],
                minPrice: c.minPrice ?? undefined,
                stats: {},
                contact: c.contact,
                href: c.profileUrl,
              }}
              locale={locale}
              isFav={fav.isFav(c.id)}
              onToggleFav={() => fav.toggleFav(c.id)}
            />
          ))}
        </CreatorGrid>
      </div>

      <FavoritesDrawer
        locale={locale}
        open={favOpen}
        onClose={() => setFavOpen(false)}
        favorites={cards.filter((c) => fav.favoriteIds.has(c.id))}
        onClearAll={fav.clearAll}
      />
    </div>
  )
}
