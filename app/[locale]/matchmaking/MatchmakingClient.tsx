"use client"

import { useEffect, useMemo, useState } from "react"
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

interface MatchmakingClientProps {
  locale: Locale
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

function roundTo2(n: number) {
  return Math.round(n * 100) / 100
}

function derivePlatformsFromDeliverables(input?: string[]): Platform[] {
  const d = Array.isArray(input) ? input : []
  const set = new Set<Platform>()

  for (const raw of d) {
    const id = String(raw || "").trim().toLowerCase()
    if (!id) continue
    if (id === "tiktok") set.add("tiktok")
    else if (id === "youtube") set.add("youtube")
    else if (id === "fb_post" || id === "fb" || id === "facebook") set.add("facebook")
    else if (
      id === "posts" ||
      id === "reels" ||
      id === "stories" ||
      id === "live" ||
      id === "ugc" ||
      id === "unboxing" ||
      id === "giveaway" ||
      id === "event" ||
      id === "affiliate"
    ) {
      set.add("instagram")
    }
  }

  return Array.from(set)
}

function deriveFormatKeysFromDeliverables(input?: string[]): FormatKey[] {
  const d = Array.isArray(input) ? input : []
  const set = new Set<FormatKey>()

  for (const raw of d) {
    const id = String(raw || "").trim().toLowerCase()
    if (!id) continue

    if (id === "reels") set.add("reels")
    else if (id === "posts") set.add("posts")
    else if (id === "stories") set.add("stories")
    else set.add("other")
  }

  return Array.from(set)
}

function deriveCollabTypesFromDeliverables(input?: string[]): CollabType[] {
  const d = Array.isArray(input) ? input : []
  const set = new Set<CollabType>()

  for (const raw of d) {
    const id = String(raw || "").trim().toLowerCase()
    if (!id) continue

    if (id === "ugc") set.add("ugc")
    else if (id === "live") set.add("live")
    else if (id === "unboxing") set.add("review_unboxing")
    else if (id === "event") set.add("event")
    else if (id === "youtube") set.add("long_video")
    else if (id === "tiktok" || id === "reels" || id === "stories") set.add("short_video")
    else set.add("other")
  }

  return Array.from(set)
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const fav = useFavorites()
  const [favOpen, setFavOpen] = useState(false)

  const uiCopy = useMemo(() => getCopy(locale), [locale])

  const [cards, setCards] = useState<CreatorCard[]>(initialCards)

  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"followers_desc" | "er_desc">("followers_desc")
  const [platform, setPlatform] = useState<Platform | "any">("any")
  const [budget, setBudget] = useState<BudgetRange>("any")
  const [customBudget, setCustomBudget] = useState<string>("")
  const [typeKey, setTypeKey] = useState<TypeKey | "any">("any")

  useEffect(() => {
    setCards(initialCards)
  }, [initialCards])

  // Initialize from URL query params on first client render
  useEffect(() => {
    const qp = searchParams
    const nextQ = (qp.get("q") ?? "").slice(0, 120)
    const nextPlatform = (qp.get("platform") ?? "any") as Platform | "any"
    const nextBudget = (qp.get("budget") ?? "any") as BudgetRange
    const nextCollab = (qp.get("collab") ?? "any") as CollabType | "any"
    const nextSort = (qp.get("sort") ?? "followers_desc") as any

    setQ(nextQ)
    setPlatform(nextPlatform)
    setBudget(nextBudget)

    if (nextSort === "er_desc") setSort("er_desc")
    else setSort("followers_desc")

    // Keep URL compatibility: only initialize Type from collab param if it matches known collab values.
    const isKnownCollab: boolean =
      nextCollab === "short_video" ||
      nextCollab === "long_video" ||
      nextCollab === "ugc" ||
      nextCollab === "live" ||
      nextCollab === "review_unboxing" ||
      nextCollab === "event" ||
      nextCollab === "other"
    setTypeKey(isKnownCollab ? nextCollab : "any")

    // If budget param is not one of the known presets, fall back to any.
    const isKnownBudget: boolean =
      nextBudget === "any" ||
      nextBudget === "0_5000" ||
      nextBudget === "5000_10000" ||
      nextBudget === "10000_30000" ||
      nextBudget === "30000_60000" ||
      nextBudget === "60000_plus"
    setBudget(isKnownBudget ? nextBudget : "any")
    setCustomBudget("")

    setPlatform(nextPlatform)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync state -> URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    if (sort && sort !== "followers_desc") params.set("sort", sort)
    if (platform !== "any") params.set("platform", platform)
    // Do not introduce new URL values. Only persist known preset budgets.
    if (budget !== "any" && budget !== "custom") params.set("budget", budget)

    // Only persist collab-type selections to the existing "collab" param.
    const collabValue: CollabType | null =
      typeKey === "short_video" ||
      typeKey === "long_video" ||
      typeKey === "ugc" ||
      typeKey === "live" ||
      typeKey === "review_unboxing" ||
      typeKey === "event" ||
      typeKey === "other"
        ? typeKey
        : null
    if (collabValue) params.set("collab", collabValue)

    const qs = params.toString()
    router.replace(qs ? `?${qs}` : "?", { scroll: false })
  }, [q, sort, platform, budget, typeKey, router])

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
        const engagementRate =
          typeof stats?.engagementRatePct === "number" && Number.isFinite(stats.engagementRatePct)
            ? clampNumber(roundTo2(stats.engagementRatePct), 0, 99)
            : null

        if (cancelled) return
        setCards((prev) =>
          prev.map((c) =>
            c.id === ownerCardId
              ? {
                  ...c,
                  followerCount: followers ?? c.followerCount,
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

  const creators: CreatorCardData[] = useMemo(() => {
    return cardsWithDemos.map((c) => {
      const topics = (c.category ? [c.category] : []).filter(Boolean)
      const deliverables = Array.isArray((c as any).deliverables) ? ((c as any).deliverables as string[]) : []
      const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
      const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)
      return {
        id: c.id,
        name: c.displayName,
        handle: c.displayName ? c.displayName.replace(/^@/, "") : undefined,
        avatarUrl: c.avatarUrl,
        topics,
        platforms: derivedPlatforms.length ? derivedPlatforms : ["instagram"],
        collabTypes: derivedCollabTypes.length ? derivedCollabTypes : ["other"],
        deliverables,
        stats: {
          followers: c.followerCount,
          engagementRate: typeof c.engagementRate === "number" ? c.engagementRate : undefined,
        },
        href: c.isDemo ? "#" : c.profileUrl,
      }
    })
  }, [cardsWithDemos])

  const creatorFormatsById = useMemo(() => {
    const map = new Map<string, FormatKey[]>()
    creators.forEach((c) => {
      map.set(c.id, deriveFormatKeysFromDeliverables(c.deliverables))
    })
    return map
  }, [creators])

  const platformOptions = useMemo(() => {
    const mm = uiCopy.matchmaking
    const present = new Set<Platform>()
    creators.forEach((c) => {
      ;(c.platforms ?? []).forEach((p) => present.add(p))
    })

    const order: Platform[] = ["instagram", "facebook", "youtube", "tiktok"]
    const labelFor = (p: Platform) => {
      if (p === "instagram") return mm.platformInstagram
      if (p === "tiktok") return mm.platformTikTok
      if (p === "youtube") return mm.platformYouTube
      return mm.platformFacebook
    }

    return [
      { value: "any" as const, label: mm.allPlatforms },
      ...order.filter((p) => present.has(p)).map((p) => ({ value: p, label: labelFor(p) })),
    ]
  }, [creators, uiCopy.matchmaking])

  const typeOptions = useMemo(() => {
    const mm = uiCopy.matchmaking
    const present = new Set<TypeKey>()
    creators.forEach((c) => {
      ;(c.collabTypes ?? []).forEach((t) => present.add(t))
      ;(creatorFormatsById.get(c.id) ?? []).forEach((f) => present.add(f))
    })

    const order: TypeKey[] = [
      "reels",
      "posts",
      "stories",
      "short_video",
      "long_video",
      "ugc",
      "live",
      "review_unboxing",
      "event",
      "other",
    ]

    const labelFor = (t: TypeKey) => {
      if (t === "reels") return mm.formatReels
      if (t === "posts") return mm.formatPosts
      if (t === "stories") return mm.formatStories
      if (t === "short_video") return mm.typeShortVideo
      if (t === "long_video") return mm.typeLongVideo
      if (t === "ugc") return mm.typeUGC
      if (t === "live") return mm.typeLive
      if (t === "review_unboxing") return mm.typeReviewUnboxing
      if (t === "event") return mm.typeEvent
      return mm.typeOther
    }

    return [
      { value: "any" as const, label: mm.allTypes },
      ...order.filter((t) => present.has(t)).map((t) => ({ value: t, label: labelFor(t) })),
    ]
  }, [creators, creatorFormatsById, uiCopy.matchmaking])

  function budgetMatch(range: BudgetRange, min?: number, max?: number) {
    if (range === "any") return true
    const hi = typeof max === "number" ? max : typeof min === "number" ? min : null
    if (hi == null) return true
    if (range === "0_5000") return hi <= 5000
    if (range === "5000_10000") return hi >= 5000 && hi <= 10000
    if (range === "10000_30000") return hi >= 10000 && hi <= 30000
    if (range === "30000_60000") return hi >= 30000 && hi <= 60000
    if (range === "60000_plus") return hi >= 60000
    return true
  }

  function platformMatch(p: Platform | "any", ps?: Platform[]) {
    if (p === "any") return true
    return (ps ?? []).includes(p)
  }

  function collabMatch(c: CollabType | "any", types?: CollabType[]) {
    if (c === "any") return true
    return (types ?? []).includes(c)
  }

  function typeMatch(t: TypeKey | "any", creatorId: string, types?: CollabType[]) {
    if (t === "any") return true
    if (t === "reels" || t === "posts" || t === "stories" || t === "other") {
      return (creatorFormatsById.get(creatorId) ?? []).includes(t)
    }
    return (types ?? []).includes(t)
  }

  function budgetMatchCustom(amount: number, min?: number, max?: number) {
    if (!Number.isFinite(amount)) return true
    const hasMin = typeof min === "number" && Number.isFinite(min)
    const hasMax = typeof max === "number" && Number.isFinite(max)
    if (hasMin && hasMax) return amount >= (min as number) && amount <= (max as number)
    if (hasMin) return amount >= (min as number)
    if (hasMax) return amount <= (max as number)
    return true
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()

    let out = creators.filter((c) => {
      const hay = `${c.name} ${c.handle ?? ""} ${(c.topics ?? []).join(" ")}`.toLowerCase()
      const okQ = !qq || hay.includes(qq)
      const okPlatform = platformMatch(platform, c.platforms)

      const okType = typeMatch(typeKey, c.id, c.collabTypes)

      let okBudget = true
      if (budget === "custom") {
        const amt = Number(customBudget)
        okBudget = customBudget.trim() ? budgetMatchCustom(amt, c.budgetMin, c.budgetMax) : true
      } else {
        okBudget = budgetMatch(budget, c.budgetMin, c.budgetMax)
      }

      return okQ && okPlatform && okType && okBudget
    })

    if (sort === "followers_desc") {
      out = [...out].sort((a, b) => (b.stats?.followers ?? -1) - (a.stats?.followers ?? -1))
    } else if (sort === "er_desc") {
      out = [...out].sort((a, b) => (b.stats?.engagementRate ?? -1) - (a.stats?.engagementRate ?? -1))
    } else {
      out = [...out]
    }

    return out
  }, [creators, q, sort, platform, budget, customBudget, typeKey, creatorFormatsById])

  const favoritesList = useMemo(
    () => creators.filter((c) => fav.favoriteIds.has(c.id)),
    [creators, fav.favoriteIds]
  )

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="pt-8">
        <FiltersBar
          locale={locale}
          search={q}
          onSearch={setQ}
          platform={platform}
          onPlatform={setPlatform}
          platformOptions={platformOptions}
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
          type={typeKey}
          onType={setTypeKey}
          typeOptions={typeOptions}
          sort={sort}
          onSort={(v) => setSort(v === "er_desc" ? "er_desc" : "followers_desc")}
          total={filtered.length}
        />

        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setFavOpen(true)}
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
          >
            {uiCopy.common.favorites} ({fav.count})
          </button>
        </div>

        <CreatorGrid>
          {filtered.map((c) => (
            <MatchmakingCreatorCard
              key={c.id}
              creator={c}
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
        favorites={favoritesList}
        onClearAll={fav.clearAll}
      />
    </div>
  )
}
