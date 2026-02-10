"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FiltersBar } from "@/app/components/matchmaking/FiltersBar"
import { CreatorGrid } from "@/app/components/matchmaking/CreatorGrid"
import { CreatorCard as MatchmakingCreatorCard } from "@/app/components/matchmaking/CreatorCard"
import { FavoritesDrawer } from "@/app/components/matchmaking/FavoritesDrawer"
import { useFavorites } from "@/app/components/matchmaking/useFavorites"
import { getCopy, type Locale } from "@/app/i18n"
import { CREATOR_TYPE_MASTER, normalizeCreatorTypes, normalizeCreatorTypesFromCard } from "@/app/lib/creatorTypes"
import type {
  BudgetRange,
  CollabType,
  CreatorCardData,
  Platform,
} from "@/app/components/matchmaking/types"
import type { CreatorCard } from "./types"
const OWNER_LOOKUP_CACHE_KEY = "matchmaking_owner_lookup_v1"

interface MatchmakingClientProps {
  locale: Locale
  initialCards: CreatorCard[]
  initialMeCard?: CreatorCard | null
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
    const id = `demo_${h.toString(16)}`
    if (existingIds.has(id)) continue

    out.push({
      id,
      displayName: "",
      avatarUrl: "",
      category: "",
      followerCount: followers,
      avgLikes,
      avgComments,
      engagementRate: Math.round(er * 100) / 10000,
      isVerified: false,
      profileUrl: "",
      isDemo: true,
    })
  }

  return out
}

function safeParseContact(input: unknown): {
  emails: string[]
  phones: string[]
  lines: string[]
  primaryContactMethod?: "email" | "phone" | "line"
} {
  const empty = { emails: [] as string[], phones: [] as string[], lines: [] as string[], primaryContactMethod: undefined as any }
  if (typeof input !== "string") return empty
  const raw = input.trim()
  if (!raw) return empty
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== "object") return empty
    const readArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean) : [])
    const emails = readArr((obj as any).emails)
    const phones = readArr((obj as any).phones)
    const lines = readArr((obj as any).lines)
    const legacyOthers = readArr((obj as any).others)
    const email1 = typeof (obj as any).email === "string" ? String((obj as any).email).trim() : ""
    const phone1 = typeof (obj as any).phone === "string" ? String((obj as any).phone).trim() : ""
    const line1 = typeof (obj as any).line === "string" ? String((obj as any).line).trim() : ""
    const other1 = typeof (obj as any).other === "string" ? String((obj as any).other).trim() : ""

    const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).slice(0, 20)

    const pcmRaw = typeof (obj as any)?.primaryContactMethod === "string" ? String((obj as any).primaryContactMethod).trim() : ""
    const primaryContactMethod = pcmRaw === "email" || pcmRaw === "phone" || pcmRaw === "line" ? (pcmRaw as any) : undefined

    const finalLines = (() => {
      const merged = uniq([...(line1 ? [line1] : []), ...lines])
      if (merged.length > 0) return merged
      // Back-compat: treat legacy others/other as lines when lines is empty.
      return uniq([...(other1 ? [other1] : []), ...legacyOthers])
    })()
    return {
      emails: uniq([...(email1 ? [email1] : []), ...emails]),
      phones: uniq([...(phone1 ? [phone1] : []), ...phones]),
      lines: finalLines,
      primaryContactMethod,
    }
  } catch {
    return empty
  }
}

function pinOwnerCardFirst<T extends { id: string }>(cards: T[], ownerCardId: string | null) {
  if (!ownerCardId) return cards
  const idx = cards.findIndex((c) => c.id === ownerCardId)
  if (idx <= 0) return cards
  const owner = cards[idx]
  const rest = cards.filter((_, i) => i !== idx)
  return [owner, ...rest]
}

function sanitizeMeCard(input: any, localePrefix: string): CreatorCard | null {
  const id = typeof input?.id === "string" ? input.id : null
  if (!id) return null

  // IMPORTANT: keep `igUserId` on the pinned owner card.
  // Matchmaking stats hydration keys off igUserId -> /api/creators/:id/stats.
  const igUserId =
    typeof input?.ig_user_id === "string"
      ? input.ig_user_id
      : typeof input?.igUserId === "string"
        ? input.igUserId
        : null

  const displayNameRaw = typeof input?.ig_username === "string" ? input.ig_username : typeof input?.displayName === "string" ? input.displayName : ""
  const displayName = displayNameRaw || id
  const avatarUrl =
    typeof input?.avatar_url === "string"
      ? input.avatar_url
      : typeof input?.avatarUrl === "string"
        ? input.avatarUrl
        : typeof input?.profile_image_url === "string"
          ? input.profile_image_url
          : typeof input?.profileImageUrl === "string"
            ? input.profileImageUrl
            : svgAvatarDataUrl(String(id), displayName)

  const niche = typeof input?.niche === "string" ? input.niche : typeof input?.category === "string" ? input.category : "Creator"
  const deliverables = Array.isArray(input?.deliverables) ? (input.deliverables as unknown[]).filter((x): x is string => typeof x === "string") : []
  const isPublic = typeof input?.is_public === "boolean" ? input.is_public : typeof input?.isPublic === "boolean" ? input.isPublic : false

  const collaborationNiches = (() => {
    const raw =
      (Array.isArray(input?.collaborationNiches) ? input.collaborationNiches : null) ??
      (Array.isArray(input?.collaboration_niches) ? input.collaboration_niches : null) ??
      []
    return raw.filter((x: unknown): x is string => typeof x === "string").map((s: string) => s.trim()).filter(Boolean)
  })()

  const rawMinPrice =
    typeof input?.min_price === "number" && Number.isFinite(input.min_price)
      ? input.min_price
      : typeof input?.minPrice === "number" && Number.isFinite(input.minPrice)
        ? input.minPrice
        : null

  const contact = typeof input?.contact === "string" ? input.contact : typeof input?.contactInfo === "string" ? input.contactInfo : null

  return {
    id,
    igUserId,
    displayName,
    avatarUrl,
    category: niche || "Creator",
    deliverables,
    collaborationNiches,
    minPrice: typeof rawMinPrice === "number" ? rawMinPrice : null,
    contact,
    followerCount: 0,
    engagementRate: null,
    isVerified: false,
    profileUrl: `${localePrefix}/creator-card/view`,
  }
}

export function MatchmakingClient({ locale, initialCards, initialMeCard }: MatchmakingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const uiCopy = getCopy(locale)
  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"
  const fav = useFavorites()
  const [favOpen, setFavOpen] = useState(false)

  const initialMeCardResolved = useMemo(() => {
    const raw = initialMeCard as any
    const nested = raw && typeof raw === "object" && raw.card && typeof raw.card === "object" ? raw.card : null

    if (process.env.NODE_ENV !== "production") {
      if (nested && typeof raw?.ok !== "undefined") {
        console.warn("[matchmaking] initialMeCard looks like API response; using .card", {
          keys: Object.keys(raw || {}),
          cardKeys: Object.keys(nested || {}),
        })
      } else if (raw && typeof raw === "object" && !raw.id) {
        console.warn("[matchmaking] initialMeCard missing id; me card may not render", {
          keys: Object.keys(raw || {}),
        })
      }
    }

    return (nested ?? initialMeCard) as any
  }, [initialMeCard])

  const [meCard, setMeCard] = useState<CreatorCard | null>(() => {
    return initialMeCardResolved ? sanitizeMeCard(initialMeCardResolved, localePrefix) : null
  })

  const statsCacheRef = useRef(
    new Map<
      string,
      {
        followers?: number
        engagementRatePct?: number
      }
    >()
  )

  const statsInFlightRef = useRef(new Set<string>())
  const statsErrorRef = useRef(new Map<string, boolean>())
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [statsUiVersion, setStatsUiVersion] = useState(0)
  const [statsPrefetchRunning, setStatsPrefetchRunning] = useState(false)

  const STORAGE_KEY = "matchmaking_stats_cache_v1"
  const STORAGE_TTL_MS = 24 * 60 * 60 * 1000

  const [statsVersion, setStatsVersion] = useState(0)

  const [cards, setCards] = useState<CreatorCard[]>(initialCards)

  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"best_match" | "followers_desc" | "er_desc">("best_match")
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [selectedDealTypes, setSelectedDealTypes] = useState<CollabType[]>([])
  const [selectedTagCategories, setSelectedTagCategories] = useState<string[]>([])
  const [budget, setBudget] = useState<BudgetRange>("any")
  const [customBudget, setCustomBudget] = useState<string>("")
  const [page, setPage] = useState(1)
  const LS_SORT_KEY = "matchmaking:lastSort:v1"

  const cardsRef = useRef(cards)
  useEffect(() => {
    cardsRef.current = cards
  }, [cards])

  const ownerLookupStartedRef = useRef(false)

  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as any
      const updatedAt = typeof parsed?.updatedAt === "number" ? parsed.updatedAt : 0
      if (!updatedAt || Date.now() - updatedAt > STORAGE_TTL_MS) return

      const mapObj = parsed?.map && typeof parsed.map === "object" ? (parsed.map as Record<string, any>) : null
      if (!mapObj) return

      let changed = false
      for (const [creatorId, v] of Object.entries(mapObj)) {
        if (!/^\d+$/.test(creatorId)) continue
        const followers = typeof v?.followers === "number" && Number.isFinite(v.followers) ? Math.floor(v.followers) : undefined
        const engagementRatePct =
          typeof v?.engagementRatePct === "number" && Number.isFinite(v.engagementRatePct)
            ? clampNumber(roundTo2(v.engagementRatePct), 0, 99)
            : undefined

        if (followers == null && engagementRatePct == null) continue
        const prev = statsCacheRef.current.get(creatorId)
        const next = {
          followers: followers ?? prev?.followers,
          engagementRatePct: engagementRatePct ?? prev?.engagementRatePct,
        }
        const didChange = prev?.followers !== next.followers || prev?.engagementRatePct !== next.engagementRatePct
        statsCacheRef.current.set(creatorId, next)
        if (didChange) changed = true
      }

      if (changed) setStatsVersion((v) => v + 1)
    } catch {
      // swallow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setCards(initialCards)
  }, [initialCards])

  // Initialize from URL query params on first client render
  useEffect(() => {
    const qp = searchParams
    const nextQ = (qp.get("q") ?? "").slice(0, 120)
    const nextBudget = (qp.get("budget") ?? "any") as BudgetRange
    const nextCollab = (qp.get("collab") ?? "any") as CollabType | "any"
    const nextPageRaw = qp.get("page")
    const nextPageNum = nextPageRaw ? Number(nextPageRaw) : 1
    const nextPage = Number.isFinite(nextPageNum) ? Math.max(1, Math.floor(nextPageNum)) : 1

    setQ(nextQ)
    setBudget(nextBudget)

    // Backward-compat: if platform exists in URL, seed selectedPlatforms.
    const qpPlatform = (qp.get("platform") ?? "") as any
    const knownPlatforms: Platform[] = ["instagram", "facebook", "youtube", "tiktok"]
    if (knownPlatforms.includes(qpPlatform)) setSelectedPlatforms([qpPlatform as Platform])
    else setSelectedPlatforms([])

    // Backward-compat: initialize dealTypes from legacy collab param (single value).
    const isKnownCollab: boolean =
      nextCollab === "short_video" ||
      nextCollab === "long_video" ||
      nextCollab === "ugc" ||
      nextCollab === "live" ||
      nextCollab === "review_unboxing" ||
      nextCollab === "event" ||
      nextCollab === "other"
    setSelectedDealTypes(isKnownCollab ? [nextCollab as CollabType] : [])

    setPage(nextPage)

    // If budget param is not one of the known presets, fall back to any.
    const isKnownBudget: boolean =
      nextBudget === "any" ||
      nextBudget === "1000" ||
      nextBudget === "3000" ||
      nextBudget === "1000_5000" ||
      nextBudget === "5000_10000" ||
      nextBudget === "10000_30000" ||
      nextBudget === "30000_60000" ||
      nextBudget === "60000_100000" ||
      nextBudget === "100000_plus"
    setBudget(isKnownBudget ? nextBudget : "any")
    setCustomBudget("")

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sort is local-only: hydrate from localStorage (no URL read/write).
  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      const raw = window.localStorage.getItem(LS_SORT_KEY)
      if (raw === "followers_desc" || raw === "er_desc" || raw === "best_match") {
        setSort(raw)
      }
    } catch {
      // swallow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync state -> URL
  useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    // Do not introduce new URL values. Only persist known preset budgets.
    if (budget !== "any" && budget !== "custom") params.set("budget", budget)

    if (page > 1) params.set("page", String(page))

    const qs = params.toString()
    router.replace(qs ? `?${qs}` : "?", { scroll: false })
  }, [q, budget, page, router])

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort, budget, customBudget, selectedPlatforms.join("|"), selectedDealTypes.join("|"), selectedTagCategories.join("|")])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      let nextOwnerCardId: string | null = null
      let shouldPersistOwnerLookup = true

      try {
        if (initialMeCard) {
          shouldPersistOwnerLookup = false
          return
        }

        if (ownerLookupStartedRef.current) return
        ownerLookupStartedRef.current = true

        try {
          const raw = window.sessionStorage.getItem(OWNER_LOOKUP_CACHE_KEY)
          if (raw) {
            const cached = JSON.parse(raw) as any
            if (cached?.done) {
              shouldPersistOwnerLookup = false
              return
            }
          }
          window.sessionStorage.setItem(
            OWNER_LOOKUP_CACHE_KEY,
            JSON.stringify({ startedAt: Date.now(), done: false, ownerCardId: null }),
          )
        } catch {
          // swallow
        }

        const meRes = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const meJson = (await meRes.json().catch(() => null)) as any

        if (meRes.ok && meJson?.ok === true && meJson?.card) {
          const safe = sanitizeMeCard(meJson.card, localePrefix)
          if (safe) setMeCard(safe)
        }
        const meCardId = typeof meJson?.card?.id === "string" ? meJson.card.id : null
        if (!meCardId) return

        const ownerIgUserId =
          typeof meJson?.card?.ig_user_id === "string"
            ? meJson.card.ig_user_id
            : typeof meJson?.card?.igUserId === "string"
              ? meJson.card.igUserId
              : null

        if (!cancelled) {
          const safe = sanitizeMeCard(meJson?.card, localePrefix)
          if (safe) setMeCard(safe)
        }

        nextOwnerCardId = meCardId

        if (!ownerIgUserId) return

        const statsRes = await fetch(`/api/creators/${encodeURIComponent(ownerIgUserId)}/stats`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const statsJson = (await statsRes.json().catch(() => null)) as any
        const statsOk = Boolean(statsRes.ok && statsJson?.ok === true)
        const stats = statsOk ? statsJson?.stats : null

        if (!statsOk) {
          if (cancelled) return
          const creatorIdStr = String(ownerIgUserId)
          statsErrorRef.current.set(creatorIdStr, true)
          setStatsUiVersion((v) => v + 1)
          if (process.env.NODE_ENV !== "production") {
            console.debug("[matchmaking] owner stats non-ok", creatorIdStr, statsRes.status)
          }
          return
        }

        const followers = typeof stats?.followers === "number" && Number.isFinite(stats.followers) ? Math.floor(stats.followers) : null
        const engagementRatePct =
          typeof stats?.engagementRatePct === "number" && Number.isFinite(stats.engagementRatePct)
            ? clampNumber(roundTo2(stats.engagementRatePct), 0, 99)
            : null
        const engagementRate = typeof engagementRatePct === "number" ? engagementRatePct / 100 : null

        if (cancelled) return
        const creatorIdStr = String(ownerIgUserId)

        {
          const prevCached = statsCacheRef.current.get(creatorIdStr)
          const nextCached = {
            followers: followers ?? prevCached?.followers,
            engagementRatePct: engagementRatePct ?? prevCached?.engagementRatePct,
          }
          const changed =
            prevCached?.followers !== nextCached.followers || prevCached?.engagementRatePct !== nextCached.engagementRatePct
          statsCacheRef.current.set(creatorIdStr, nextCached)
          if (changed) setStatsVersion((v) => v + 1)
        }

        statsErrorRef.current.delete(creatorIdStr)
        setStatsUiVersion((v) => v + 1)

        setCards((prev) =>
          prev.map((c) => {
            const cId = c?.id != null ? String(c.id) : ""

            const matches = cId === String(meCardId)
            if (!matches) return c

            return {
              ...c,
              followerCount: followers ?? c.followerCount,
              engagementRate: engagementRate ?? c.engagementRate,
              stats: {
                ...(c.stats ?? {}),
                followers: followers ?? c.stats?.followers,
                engagementRatePct: engagementRatePct ?? c.stats?.engagementRatePct,
              },
            }
          })
        )
      } catch {
        // swallow
      } finally {
        if (shouldPersistOwnerLookup) {
          try {
            window.sessionStorage.setItem(
              OWNER_LOOKUP_CACHE_KEY,
              JSON.stringify({ done: true, ownerCardId: typeof nextOwnerCardId === "string" ? nextOwnerCardId : null }),
            )
          } catch {
            // swallow
          }
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const creators: Array<CreatorCardData & { creatorId?: string }> = useMemo(() => {
    return cards.map((c) => {
      const topics = (c.category ? [c.category] : []).filter(Boolean)
      const tagCategories = normalizeCreatorTypesFromCard(c as any)
      const deliverables = Array.isArray((c as any).deliverables) ? ((c as any).deliverables as string[]) : []
      const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
      const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)
      const dealTypes = derivedCollabTypes as unknown as string[]

      const creatorIdStr = typeof c.igUserId === "string" && /^\d+$/.test(c.igUserId) ? c.igUserId : null
      const cachedStats = creatorIdStr ? statsCacheRef.current.get(creatorIdStr) : undefined

      const rawHandle =
        typeof (c as any).handle === "string"
          ? String((c as any).handle).trim()
          : typeof (c as any).igUsername === "string"
            ? String((c as any).igUsername).trim()
            : typeof (c as any).username === "string"
              ? String((c as any).username).trim()
              : typeof (c as any).displayName === "string"
                ? String((c as any).displayName).trim()
                : ""
      const handle = rawHandle ? rawHandle.replace(/^@/, "") : undefined

      const parsedContact = safeParseContact((c as any).contact)
      const contactEmail = parsedContact.emails[0] || undefined
      const contactPhone = parsedContact.phones[0] || undefined
      const contactLine = parsedContact.lines[0] || undefined
      const primaryContactMethod = parsedContact.primaryContactMethod

      const rawFollowers =
        typeof cachedStats?.followers === "number" && Number.isFinite(cachedStats.followers)
          ? Math.floor(cachedStats.followers)
          : typeof (c as any)?.stats?.followers === "number" && Number.isFinite((c as any).stats.followers)
          ? Math.floor((c as any).stats.followers)
          : typeof (c as any)?.followerCount === "number" && Number.isFinite((c as any).followerCount) && (c as any).followerCount > 0
            ? Math.floor((c as any).followerCount)
            : undefined

      const rawER =
        typeof cachedStats?.engagementRatePct === "number" && Number.isFinite(cachedStats.engagementRatePct)
          ? cachedStats.engagementRatePct / 100
          : typeof (c as any)?.stats?.engagementRatePct === "number" && Number.isFinite((c as any).stats.engagementRatePct)
          ? (c as any).stats.engagementRatePct / 100
          : typeof (c as any)?.stats?.engagementRate === "number" && Number.isFinite((c as any).stats.engagementRate)
            ? (c as any).stats.engagementRate
            : typeof (c as any)?.engagementRate === "number" && Number.isFinite((c as any).engagementRate)
              ? (c as any).engagementRate
              : undefined

      const rawMinPrice =
        typeof (c as any)?.minPrice === "number" && Number.isFinite((c as any).minPrice)
          ? Math.floor((c as any).minPrice)
          : typeof (c as any)?.min_price === "number" && Number.isFinite((c as any).min_price)
            ? (c as any).min_price
            : undefined

      const normalizedMinPrice = typeof rawMinPrice === "number" && Number.isFinite(rawMinPrice) ? Math.max(0, Math.floor(rawMinPrice)) : undefined

      return {
        id: c.id,
        creatorId: creatorIdStr ?? undefined,
        name: c.displayName,
        handle,
        avatarUrl: c.avatarUrl,
        topics,
        tagCategories,
        platforms: derivedPlatforms.length ? derivedPlatforms : ["instagram"],
        dealTypes,
        collabTypes: derivedCollabTypes.length ? derivedCollabTypes : ["other"],
        deliverables,
        minPrice: normalizedMinPrice,
        stats: {
          followers: rawFollowers,
          engagementRate: rawER,
        },
        contactEmail,
        contactPhone,
        contactLine,
        primaryContactMethod,
        href: c.isDemo ? "" : c.profileUrl,
        isDemo: Boolean(c.isDemo),
      }
    })
  }, [cards, statsVersion])

  const tagCategoryOptions = useMemo(() => {
    const set = new Set<string>()
    CREATOR_TYPE_MASTER.forEach((x: { zh: string }) => {
      const s = String(x?.zh || "").trim()
      if (s) set.add(s)
    })
    creators.forEach((c) => {
      ;(c.tagCategories ?? []).forEach((x) => {
        const s = String(x || "").trim()
        if (s) set.add(s)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"))
  }, [creators])

  const dealTypeOptions = useMemo(() => {
    const mm = uiCopy.matchmaking
    const present = new Set<CollabType>()
    creators.forEach((c) => {
      ;((c.collabTypes ?? []) as CollabType[]).forEach((t) => present.add(t))
    })

    const order: CollabType[] = [
      "short_video",
      "long_video",
      "ugc",
      "live",
      "review_unboxing",
      "event",
      "other",
    ]

    const labelFor = (t: CollabType) => {
      if (t === "short_video") return mm.typeShortVideo
      if (t === "long_video") return mm.typeLongVideo
      if (t === "ugc") return mm.typeUGC
      if (t === "live") return mm.typeLive
      if (t === "review_unboxing") return mm.typeReviewUnboxing
      if (t === "event") return mm.typeEvent
      return mm.typeOther
    }

    return order.filter((t) => present.has(t)).map((t) => ({ value: t, label: labelFor(t) }))
  }, [creators, uiCopy.matchmaking])

  function budgetMaxForRange(range: BudgetRange): number | null {
    if (range === "1000") return 1000
    if (range === "3000") return 3000
    if (range === "1000_5000") return 5000
    if (range === "5000_10000") return 10000
    if (range === "10000_30000") return 30000
    if (range === "30000_60000") return 60000
    if (range === "60000_100000") return 100000
    if (range === "100000_plus") return 100000
    return null
  }

  function budgetEligibleByMinPrice(selected: BudgetRange, creatorMinPrice?: number, custom?: string) {
    if (selected === "any") return true
    const mp = typeof creatorMinPrice === "number" && Number.isFinite(creatorMinPrice) ? creatorMinPrice : null
    if (mp == null) return true

    if (selected === "custom") {
      const amt = Number((custom ?? "").trim())
      if (!Number.isFinite(amt)) return true
      return mp <= amt
    }

    const max = budgetMaxForRange(selected)
    if (max == null) return true
    return mp <= max
  }

  function platformMatchAny(selected: Platform[], ps?: Platform[]) {
    if (!selected.length) return true
    const set = new Set(ps ?? [])
    return selected.some((p) => set.has(p))
  }

  function dealTypeMatchAny(selected: CollabType[], types?: CollabType[]) {
    if (!selected.length) return true
    const set = new Set(types ?? [])
    return selected.some((t) => set.has(t))
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
      const hay = `${c.name} ${c.handle ?? ""} ${(c.topics ?? []).join(" ")} ${(c.tagCategories ?? []).join(" ")}`.toLowerCase()
      const okQ = !qq || hay.includes(qq)
      const okPlatform = platformMatchAny(selectedPlatforms, c.platforms)
      const okDealType = dealTypeMatchAny(selectedDealTypes, c.collabTypes)
      const okTags = (() => {
        if (!selectedTagCategories.length) return true
        const set = new Set((c.tagCategories ?? []).map((x) => String(x || "").trim()).filter(Boolean))
        return selectedTagCategories.some((t) => set.has(String(t || "").trim()))
      })()

      let okBudget = true
      if (budget === "custom") {
        okBudget = budgetEligibleByMinPrice(budget, c.minPrice, customBudget)
      } else {
        okBudget = budgetEligibleByMinPrice(budget, c.minPrice)
      }

      return okQ && okPlatform && okDealType && okTags && okBudget
    })

    if (sort === "best_match") {
      const maxFollowers = out.reduce((m, c) => {
        const f = typeof c.stats?.followers === "number" && Number.isFinite(c.stats.followers) ? c.stats.followers : 0
        return Math.max(m, f)
      }, 0)

      const scoreFor = (c: (typeof out)[number]) => {
        const er = typeof c.stats?.engagementRate === "number" && Number.isFinite(c.stats.engagementRate) ? c.stats.engagementRate : 0
        const followers = typeof c.stats?.followers === "number" && Number.isFinite(c.stats.followers) ? c.stats.followers : 0
        const followersNormalized = maxFollowers > 0 ? Math.min(1, Math.max(0, followers / maxFollowers)) : 0
        const seed = hashStringToInt(String(c.id))
        const rand = mulberry32(seed)()
        const randomSmallVar = Math.min(1, Math.max(0, rand))
        const budgetFit = 0.5
        return er * 0.4 + budgetFit * 0.3 + followersNormalized * 0.2 + randomSmallVar * 0.1
      }

      out = [...out].sort((a, b) => scoreFor(b) - scoreFor(a))
    } else if (sort === "followers_desc") {
      out = [...out].sort((a, b) => (b.stats?.followers ?? -1) - (a.stats?.followers ?? -1))
    } else if (sort === "er_desc") {
      out = [...out].sort((a, b) => (b.stats?.engagementRate ?? -1) - (a.stats?.engagementRate ?? -1))
    } else {
      out = [...out]
    }

    return out
  }, [creators, q, sort, budget, customBudget, selectedPlatforms, selectedDealTypes, selectedTagCategories])

  const pinnedCreator = useMemo((): (CreatorCardData & { creatorId?: string }) | null => {
    if (!meCard) return null

    const topics = (meCard.category ? [meCard.category] : []).filter(Boolean)
    const tagCategories = normalizeCreatorTypesFromCard(meCard as any)
    const deliverables = Array.isArray((meCard as any).deliverables) ? ((meCard as any).deliverables as string[]) : []
    const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
    const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)
    const dealTypes = derivedCollabTypes as unknown as string[]

    const creatorIdStr =
      typeof (meCard as any)?.igUserId === "string" && /^\d+$/.test(String((meCard as any).igUserId))
        ? String((meCard as any).igUserId)
        : null
    const cachedStats = creatorIdStr ? statsCacheRef.current.get(creatorIdStr) : undefined

    const rawFollowers =
      typeof cachedStats?.followers === "number" && Number.isFinite(cachedStats.followers)
        ? Math.floor(cachedStats.followers)
        : typeof (meCard as any)?.stats?.followers === "number" && Number.isFinite((meCard as any).stats.followers)
          ? Math.floor((meCard as any).stats.followers)
          : typeof (meCard as any)?.followerCount === "number" && Number.isFinite((meCard as any).followerCount) && (meCard as any).followerCount > 0
            ? Math.floor((meCard as any).followerCount)
            : undefined

    const rawER =
      typeof cachedStats?.engagementRatePct === "number" && Number.isFinite(cachedStats.engagementRatePct)
        ? cachedStats.engagementRatePct / 100
        : typeof (meCard as any)?.stats?.engagementRatePct === "number" && Number.isFinite((meCard as any).stats.engagementRatePct)
          ? (meCard as any).stats.engagementRatePct / 100
          : typeof (meCard as any)?.stats?.engagementRate === "number" && Number.isFinite((meCard as any).stats.engagementRate)
            ? (meCard as any).stats.engagementRate
            : typeof (meCard as any)?.engagementRate === "number" && Number.isFinite((meCard as any).engagementRate)
              ? (meCard as any).engagementRate
              : undefined

    const rawHandle =
      typeof (meCard as any).handle === "string"
        ? String((meCard as any).handle).trim()
        : typeof (meCard as any).igUsername === "string"
          ? String((meCard as any).igUsername).trim()
          : typeof (meCard as any).username === "string"
            ? String((meCard as any).username).trim()
            : typeof meCard.displayName === "string"
              ? String(meCard.displayName).trim()
              : ""
    const handle = rawHandle ? rawHandle.replace(/^@/, "") : undefined

    const rawMinPrice =
      typeof (meCard as any)?.minPrice === "number" && Number.isFinite((meCard as any).minPrice)
        ? Math.floor((meCard as any).minPrice)
        : typeof (meCard as any)?.min_price === "number" && Number.isFinite((meCard as any).min_price)
          ? Math.floor((meCard as any).min_price)
          : typeof (meCard as any)?.minPrice === "string" && (meCard as any).minPrice.trim() && Number.isFinite(Number((meCard as any).minPrice))
            ? Math.floor(Number((meCard as any).minPrice))
            : typeof (meCard as any)?.min_price === "string" && (meCard as any).min_price.trim() && Number.isFinite(Number((meCard as any).min_price))
              ? Math.floor(Number((meCard as any).min_price))
              : undefined

    const normalizedMinPrice = typeof rawMinPrice === "number" && Number.isFinite(rawMinPrice) ? Math.max(0, Math.floor(rawMinPrice)) : undefined

    return {
      id: meCard.id,
      creatorId: creatorIdStr ?? undefined,
      name: meCard.displayName,
      handle,
      avatarUrl: meCard.avatarUrl,
      topics,
      tagCategories,
      platforms: derivedPlatforms.length ? derivedPlatforms : ["instagram"],
      dealTypes,
      collabTypes: derivedCollabTypes.length ? derivedCollabTypes : ["other"],
      deliverables,
      minPrice: normalizedMinPrice,
      stats: {
        followers: rawFollowers,
        engagementRate: rawER,
      },
      contact: typeof (meCard as any)?.contact === "string" ? (meCard as any).contact : null,
      primaryContactMethod: (() => {
        const parsed = safeParseContact(typeof (meCard as any)?.contact === "string" ? (meCard as any).contact : null)
        return parsed.primaryContactMethod
      })(),
      href: meCard.profileUrl,
      isDemo: Boolean((meCard as any).isDemo),
    }
  }, [meCard, statsVersion])

  const finalCards = useMemo(() => {
    const rest = pinnedCreator ? filtered.filter((c) => c.id !== pinnedCreator.id) : filtered
    const combined = pinnedCreator ? [pinnedCreator, ...rest] : rest

    const seen = new Set<string>()
    const out: typeof combined = []
    for (const c of combined) {
      if (!c?.id) continue
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
    }
    return out
  }, [filtered, pinnedCreator])

  const pageSize = 8

  const totalPages = useMemo(() => {
    const n = finalCards.length
    return Math.max(1, Math.ceil(n / pageSize))
  }, [finalCards.length])

  const clampedPage = useMemo(() => Math.min(Math.max(1, page), totalPages), [page, totalPages])

  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage)
  }, [clampedPage, page])

  const pagedRealCards = useMemo(() => {
    const start = (clampedPage - 1) * pageSize
    return finalCards.slice(start, start + pageSize)
  }, [clampedPage, finalCards])

  const demoFillCards = useMemo((): CreatorCardData[] => {
    const need = Math.max(0, pageSize - pagedRealCards.length)
    if (!need) return []

    const existingIds = new Set(finalCards.map((c) => c.id))
    const demos = buildDemoCreators({ locale, existingIds, count: need, seedBase: `matchmaking:page:${clampedPage}` })

    const masterZh = CREATOR_TYPE_MASTER.map((x) => String(x?.zh || "").trim()).filter(Boolean)
    const pick = (arr: string[]) => arr.filter((x) => masterZh.includes(x))

    const demoTagSets: string[][] = [
      pick(["美妝", "保養", "開箱", "時尚"]),
      pick(["穿搭", "時尚", "生活"]),
      pick(["旅遊", "美食", "探店"]),
      pick(["餐飲", "美食", "探店"]),
      pick(["健身", "運動"]),
      pick(["露營", "戶外", "攝影"]),
      pick(["3C", "科技", "開箱"]),
      pick(["電商", "開箱"]),
      pick(["居家", "生活", "手作"]),
      pick(["親子", "母嬰", "生活"]),
      pick(["理財", "職場", "教育"]),
      pick(["娛樂", "音樂", "Vlog"]),
    ]

    return demos.map((c, idx) => {
      const followers = typeof (c as any)?.followerCount === "number" && Number.isFinite((c as any).followerCount) ? (c as any).followerCount : undefined
      const er = typeof (c as any)?.engagementRate === "number" && Number.isFinite((c as any).engagementRate) ? (c as any).engagementRate : undefined

      return {
        id: c.id,
        name: locale === "zh-TW" ? "示範創作者" : "Demo Creator",
        handle: locale === "zh-TW" ? "demo" : "demo",
        avatarUrl: c.avatarUrl,
        topics: locale === "zh-TW" ? ["示範"] : ["Demo"],
        tagCategories: (demoTagSets[idx % demoTagSets.length] || []).filter(Boolean).slice(0, 6),
        platforms: ["instagram"],
        dealTypes: ["other"],
        collabTypes: ["other"],
        deliverables: [],
        minPrice: 8000,
        stats: {
          followers,
          engagementRate: er,
        },
        href: "",
        isDemo: true,
      }
    })
  }, [clampedPage, finalCards, locale, pagedRealCards.length])

  const renderCards = useMemo((): Array<CreatorCardData & { creatorId?: string }> => {
    const filler = demoFillCards.map((d) => ({ ...(d as CreatorCardData), creatorId: undefined }))
    return [...pagedRealCards, ...filler]
  }, [demoFillCards, pagedRealCards])

  const selectedBudgetMax = useMemo(() => {
    if (budget === "any") return null
    if (budget === "custom") {
      const amt = Number(customBudget.trim())
      return Number.isFinite(amt) ? amt : null
    }
    return budgetMaxForRange(budget)
  }, [budget, customBudget])

  const visibleCreatorIds = useMemo(() => {
    const ids = pagedRealCards.map((c) => c.creatorId).filter((x): x is string => typeof x === "string" && x.length > 0)

    const seen = new Set<string>()
    const uniqueOrdered: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      uniqueOrdered.push(id)
    }

    return uniqueOrdered
  }, [pagedRealCards])

  const visibleCreatorIdsKey = useMemo(() => visibleCreatorIds.join("|"), [visibleCreatorIds])

  useEffect(() => {
    const ac = new AbortController()

    const unique = visibleCreatorIds
    const missing = unique.filter((id) => !statsCacheRef.current.has(id) && !statsInFlightRef.current.has(id))
    if (!missing.length) return () => ac.abort()

    if (process.env.NODE_ENV !== "production") {
      console.debug("[matchmaking] stats prefetch start", missing.slice(0, 3))
    }

    let didCancel = false
    const concurrency = 3
    let cursor = 0

    setStatsPrefetchRunning(true)

    const fetchOne = async (creatorId: string) => {
      if (statsInFlightRef.current.has(creatorId)) return
      statsInFlightRef.current.add(creatorId)
      setStatsUiVersion((v) => v + 1)

      const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/stats`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: ac.signal,
      })
      const json = (await res.json().catch(() => null)) as any
      const stats = json?.ok === true ? json?.stats : null

      if (process.env.NODE_ENV !== "production") {
        if (!res.ok || json?.ok !== true) {
          console.debug("[matchmaking] stats prefetch non-ok", creatorId, res.status)
        }
      }

      const followers = typeof stats?.followers === "number" && Number.isFinite(stats.followers) ? Math.floor(stats.followers) : null
      const engagementRatePct =
        typeof stats?.engagementRatePct === "number" && Number.isFinite(stats.engagementRatePct)
          ? clampNumber(roundTo2(stats.engagementRatePct), 0, 99)
          : null

      const prevCached = statsCacheRef.current.get(creatorId)
      const nextCached = {
        followers: followers ?? prevCached?.followers,
        engagementRatePct: engagementRatePct ?? prevCached?.engagementRatePct,
      }

      const changed =
        prevCached?.followers !== nextCached.followers || prevCached?.engagementRatePct !== nextCached.engagementRatePct
      statsCacheRef.current.set(creatorId, nextCached)
      if (changed) setStatsVersion((v) => v + 1)

      if (!res.ok || json?.ok !== true) {
        statsErrorRef.current.set(creatorId, true)
      } else {
        statsErrorRef.current.delete(creatorId)
      }

      statsInFlightRef.current.delete(creatorId)
      setStatsUiVersion((v) => v + 1)
    }

    const runWorker = async () => {
      while (!didCancel) {
        const idx = cursor
        cursor += 1
        if (idx >= missing.length) return

        const creatorId = missing[idx]
        if (!creatorId || statsCacheRef.current.has(creatorId)) continue

        try {
          await fetchOne(creatorId)
        } catch {
          // swallow
        }
      }
    }

    ;(async () => {
      const start = () => {
        const workers = Array.from({ length: Math.min(concurrency, missing.length) }, () => runWorker())
        Promise.all(workers)
          .catch(() => null)
          .finally(() => {
            if (!didCancel) setStatsPrefetchRunning(false)
          })
      }

      const w: any = typeof window !== "undefined" ? (window as any) : null
      if (w && typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(start)
      } else {
        setTimeout(start, 250)
      }
    })()

    return () => {
      didCancel = true
      ac.abort()
      setStatsPrefetchRunning(false)
    }
  }, [visibleCreatorIdsKey])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)

    persistTimerRef.current = setTimeout(() => {
      try {
        const out: Record<string, { followers?: number; engagementRatePct?: number }> = {}
        for (const [creatorId, v] of statsCacheRef.current.entries()) {
          if (!/^\d+$/.test(creatorId)) continue
          const followers = typeof v?.followers === "number" && Number.isFinite(v.followers) ? Math.floor(v.followers) : undefined
          const engagementRatePct =
            typeof v?.engagementRatePct === "number" && Number.isFinite(v.engagementRatePct)
              ? clampNumber(roundTo2(v.engagementRatePct), 0, 99)
              : undefined
          if (followers == null && engagementRatePct == null) continue
          out[creatorId] = { followers, engagementRatePct }
        }
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt: Date.now(), map: out }))
      } catch {
        // swallow
      }
    }, 400)

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [statsVersion])

  const retryStats = (creatorId: string) => {
    if (!/^\d+$/.test(creatorId)) return
    if (statsInFlightRef.current.has(creatorId)) return

    const ac = new AbortController()
    statsInFlightRef.current.add(creatorId)
    statsErrorRef.current.delete(creatorId)
    setStatsUiVersion((v) => v + 1)

    ;(async () => {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/stats`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal: ac.signal,
        })
        const json = (await res.json().catch(() => null)) as any
        const stats = json?.ok === true ? json?.stats : null

        const followers = typeof stats?.followers === "number" && Number.isFinite(stats.followers) ? Math.floor(stats.followers) : null
        const engagementRatePct =
          typeof stats?.engagementRatePct === "number" && Number.isFinite(stats.engagementRatePct)
            ? clampNumber(roundTo2(stats.engagementRatePct), 0, 99)
            : null

        const prevCached = statsCacheRef.current.get(creatorId)
        const nextCached = {
          followers: followers ?? prevCached?.followers,
          engagementRatePct: engagementRatePct ?? prevCached?.engagementRatePct,
        }
        const changed =
          prevCached?.followers !== nextCached.followers || prevCached?.engagementRatePct !== nextCached.engagementRatePct
        statsCacheRef.current.set(creatorId, nextCached)
        if (changed) setStatsVersion((v) => v + 1)

        if (!res.ok || json?.ok !== true) statsErrorRef.current.set(creatorId, true)
        else statsErrorRef.current.delete(creatorId)
      } catch {
        statsErrorRef.current.set(creatorId, true)
      } finally {
        statsInFlightRef.current.delete(creatorId)
        setStatsUiVersion((v) => v + 1)
      }
    })()

    return () => ac.abort()
  }

  const favoritesList = useMemo(
    () => creators.filter((c) => fav.favoriteIds.has(c.id)),
    [creators, fav.favoriteIds]
  )

  const isEmptyResults = useMemo(() => filtered.length === 0 && !pinnedCreator, [filtered.length, pinnedCreator])

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="pt-6 sm:pt-8 pb-1 sm:pb-2">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-[clamp(18px,3.6vw,26px)] leading-tight font-semibold text-white/90 min-w-0 truncate">
              {uiCopy.matchmaking.pageTitle}
            </h1>
            <div className="mt-2 max-w-2xl min-w-0">
              <p className="text-xs sm:text-sm leading-relaxed text-white/60 min-w-0 break-words">
                {uiCopy.matchmaking.pageSubtitleLine1}
              </p>
              <p className="mt-1 text-xs sm:text-sm leading-relaxed text-white/55 min-w-0 break-words">
                {uiCopy.matchmaking.pageSubtitleLine2}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
        <FiltersBar
          locale={locale}
          search={q}
          onSearch={setQ}
          selectedPlatforms={selectedPlatforms}
          onTogglePlatform={(p: Platform) =>
            setSelectedPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
          }
          onClearPlatforms={() => setSelectedPlatforms([])}
          selectedTagCategories={selectedTagCategories}
          tagCategoryOptions={tagCategoryOptions}
          onToggleTagCategory={(tag: string) =>
            setSelectedTagCategories((prev) => {
              const t = String(tag || "").trim()
              if (!t) return prev
              return prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
            })
          }
          onAddCustomTagCategory={(tag: string) =>
            setSelectedTagCategories((prev) => {
              const t = String(tag || "").trim()
              if (!t) return prev
              return prev.includes(t) ? prev : [...prev, t]
            })
          }
          onClearTagCategories={() => setSelectedTagCategories([])}
          selectedDealTypes={selectedDealTypes}
          onToggleDealType={(t: CollabType) =>
            setSelectedDealTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
          }
          onClearDealTypes={() => setSelectedDealTypes([])}
          dealTypeOptions={dealTypeOptions}
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
          sort={sort}
          onSort={(v) => {
            try {
              if (typeof window !== "undefined") window.localStorage.setItem(LS_SORT_KEY, v)
            } catch {
              // swallow
            }

            if (v === "followers_desc") setSort("followers_desc")
            else if (v === "er_desc") setSort("er_desc")
            else setSort("best_match")
          }}
          favoritesCount={fav.count}
          onOpenFavorites={() => setFavOpen(true)}
          statsUpdating={statsPrefetchRunning}
        />
        </div>

        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-4 min-w-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="text-xs sm:text-sm text-white/70 min-w-0 truncate">{uiCopy.matchmaking.recommendedLabel}</div>
            {statsPrefetchRunning ? (
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/45 min-w-0">
                <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin shrink-0" />
                <span className="min-w-0 truncate">{uiCopy.matchmaking.loadingHelper}</span>
              </div>
            ) : null}
          </div>
          {statsPrefetchRunning ? (
            <div className="sm:hidden mt-2 flex items-center gap-2 text-xs text-white/45 min-w-0">
              <div className="h-3 w-3 rounded-full border border-white/20 border-t-white/60 animate-spin shrink-0" />
              <span className="min-w-0 break-words">{uiCopy.matchmaking.loadingHelper}</span>
            </div>
          ) : null}
        </div>

        {isEmptyResults ? (
          <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 min-w-0">
              <div className="text-sm sm:text-base font-semibold text-white/85 min-w-0 truncate">
                {uiCopy.matchmaking.emptyResultsTitle}
              </div>
              <div className="mt-2 text-xs sm:text-sm text-white/55 leading-relaxed break-words max-w-2xl min-w-0">
                {uiCopy.matchmaking.emptyResultsHint}
              </div>
            </div>
          </div>
        ) : (
          <CreatorGrid>
            {renderCards.map((c) => {
              const creatorId = c.creatorId
              const hasFollowers = typeof c.stats?.followers === "number" && Number.isFinite(c.stats.followers)
              const hasER = typeof c.stats?.engagementRate === "number" && Number.isFinite(c.stats.engagementRate)
              const loading = Boolean(creatorId && statsInFlightRef.current.has(creatorId) && (!hasFollowers || !hasER))
              const error = Boolean(creatorId && statsErrorRef.current.get(creatorId) && !loading && (!hasFollowers || !hasER))

              return (
                <MatchmakingCreatorCard
                  key={c.id}
                  creator={c}
                  locale={locale}
                  isFav={fav.isFav(c.id)}
                  onToggleFav={() => fav.toggleFav(c.id)}
                  statsLoading={loading}
                  statsError={error}
                  selectedBudgetMax={selectedBudgetMax}
                  onRetryStats={() => {
                    if (!creatorId) return
                    retryStats(creatorId)
                  }}
                />
              )
            })}
          </CreatorGrid>
        )}

        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
              className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5"
            >
              {uiCopy.matchmaking.paginationPrev}
            </button>

            <div className="text-xs sm:text-sm text-white/60 tabular-nums whitespace-nowrap">
              {uiCopy.matchmaking.paginationPage(clampedPage, totalPages)}
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage >= totalPages}
              className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5"
            >
              {uiCopy.matchmaking.paginationNext}
            </button>
          </div>
        </div>
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
