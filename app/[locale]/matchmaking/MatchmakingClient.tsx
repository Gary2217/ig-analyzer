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
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function MatchmakingClient({ locale, initialCards }: MatchmakingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fav = useFavorites()

  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const canRenderMatchmaking = authChecked && isLoggedIn

  const [cards, setCards] = useState<CreatorCard[]>(initialCards)
  const [favOpen, setFavOpen] = useState(false)

  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"best_match" | "followers_desc" | "er_desc">("best_match")
  const [platform, setPlatform] = useState<Platform | "any">("any")
  const [budget, setBudget] = useState<BudgetRange>("any")
  const [customBudget, setCustomBudget] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<TypeKey[]>([])

  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"
  const uiCopy = useMemo(() => getCopy(locale), [locale])

  /* ---------------- AUTH CHECK ---------------- */
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch("/api/creator-card/me", {
          cache: "no-store",
          credentials: "include",
        })
        const json = await res.json().catch(() => null)

        if (!cancelled) {
          setIsLoggedIn(Boolean(res.ok && json?.ok === true))
          setAuthChecked(true)
        }
      } catch {
        if (!cancelled) {
          setIsLoggedIn(false)
          setAuthChecked(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /* ---------------- URL -> STATE ---------------- */
  useEffect(() => {
    if (!canRenderMatchmaking) return

    const nextQ = (searchParams.get("q") ?? "").slice(0, 120)
    const nextPlatform = (searchParams.get("platform") ?? "any") as Platform | "any"
    const nextBudget = (searchParams.get("budget") ?? "any") as BudgetRange

    setQ(nextQ)
    setPlatform(nextPlatform)
    setBudget(nextBudget)
  }, [canRenderMatchmaking, searchParams])

  /* ---------------- STATE -> URL ---------------- */
  useEffect(() => {
    if (!canRenderMatchmaking) return

    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    if (platform !== "any") params.set("platform", platform)
    if (budget !== "any") params.set("budget", budget)

    router.replace(params.toString() ? `?${params}` : "?", { scroll: false })
  }, [canRenderMatchmaking, q, platform, budget, router])

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="pt-6 sm:pt-8">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
          <h1 className="text-[clamp(20px,4.2vw,28px)] font-semibold text-white/90">
            {uiCopy.matchmaking.pageHeadline}
          </h1>
          <p className="mt-1 text-sm text-white/60">{uiCopy.matchmaking.pageSubheadline}</p>
        </div>

        {/* AUTH GATE */}
        {!authChecked ? (
          <div className="text-center mt-20 text-white/70">
            {locale === "zh-TW" ? "載入中…" : "Loading…"}
          </div>
        ) : !isLoggedIn ? (
          <div className="text-center mt-20">
            <p className="text-white/80 mb-4">{locale === "zh-TW" ? "請先登入" : "Please log in"}</p>
            <button
              className="rounded-xl bg-white text-black px-5 py-3 font-semibold"
              onClick={() => {
                window.location.href = `/api/auth/login?next=/${locale}/matchmaking`
              }}
            >
              {locale === "zh-TW" ? "前往登入" : "Go to login"}
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              {/* ✅ 關鍵修正：註解不要放在 props 同一行尾巴 */}
              <FiltersBar
                locale={locale}
                search={q}
                onSearch={(value: string) => setQ(value)}
                platform={platform}
                platformOptions={
                  [
                    { value: "any", label: "Any" },
                    { value: "instagram", label: "Instagram" },
                    { value: "tiktok", label: "TikTok" },
                    { value: "youtube", label: "YouTube" },
                  ] as Array<{ value: Platform | "any"; label: string }>
                }
                onPlatform={setPlatform}
                budget={budget}
                onBudget={(v) => {
                  setBudget(v)
                  if (v !== "custom") setCustomBudget("")
                }}
                customBudget={customBudget}
                onCustomBudget={setCustomBudget}
                onClearCustomBudget={() => setCustomBudget("")}
                selectedTypes={selectedTypes}
                typeOptions={
                  [
                    { value: "post", label: "Post" },
                    { value: "reel", label: "Reel" },
                    { value: "story", label: "Story" },
                    { value: "shorts", label: "Shorts" },
                    { value: "live", label: "Live" },
                  ] as Array<{ value: TypeKey; label: string }>
                }
                onToggleType={(t: TypeKey) =>
                  setSelectedTypes((prev) =>
                    prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                  )
                }
                onClearTypes={() => setSelectedTypes([])}
                sort={sort}
                onSort={(v) => setSort(v)}
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
                    topics: [c.category],
                    href: c.profileUrl,
                  }}
                  locale={locale}
                  isFav={fav.isFav(c.id)}
                  onToggleFav={() => fav.toggleFav(c.id)}
                />
              ))}
            </CreatorGrid>
          </>
        )}
      </div>

      <FavoritesDrawer
        locale={locale}
        open={favOpen}
        onClose={() => setFavOpen(false)}
        favorites={cards.filter((c) => fav.favoriteIds.has(c.id)) as unknown as any[]}
        onClearAll={fav.clearAll}
      />
    </div>
  )
}
