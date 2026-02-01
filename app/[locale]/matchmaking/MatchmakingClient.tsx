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
  instagrams: string[]
  others: string[]
} {
  const empty = { emails: [] as string[], instagrams: [] as string[], others: [] as string[] }
  if (typeof input !== "string") return empty
  const raw = input.trim()
  if (!raw) return empty
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== "object") return empty
    const readArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean) : [])
    const emails = readArr((obj as any).emails)
    const instagrams = readArr((obj as any).instagrams)
    const others = readArr((obj as any).others)
    const email1 = typeof (obj as any).email === "string" ? String((obj as any).email).trim() : ""
    const ig1 = typeof (obj as any).instagram === "string" ? String((obj as any).instagram).trim() : ""
    const other1 = typeof (obj as any).other === "string" ? String((obj as any).other).trim() : ""
    const mergedEmails = [...(email1 ? [email1] : []), ...emails]
    const mergedIgs = [...(ig1 ? [ig1] : []), ...instagrams]
    const mergedOthers = [...(other1 ? [other1] : []), ...others]

    const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).slice(0, 20)
    return { emails: uniq(mergedEmails), instagrams: uniq(mergedIgs), others: uniq(mergedOthers) }
  } catch {
    return empty
  }
}

function getLocalDateYYYYMMDD() {
  const d = new Date()
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function buildCcPinCardPayload(rawCard: unknown) {
  const card = rawCard && typeof rawCard === "object" ? (rawCard as Record<string, unknown>) : null
  if (!card) return null
  const id = typeof card.id === "string" ? card.id : null
  if (!id) return null

  const igUserId =
    typeof (card as any).ig_user_id === "string"
      ? String((card as any).ig_user_id)
      : typeof (card as any).igUserId === "string"
        ? String((card as any).igUserId)
        : null

  const igUsername =
    typeof (card as any).ig_username === "string"
      ? String((card as any).ig_username)
      : typeof (card as any).igUsername === "string"
        ? String((card as any).igUsername)
        : null

  const profileImageUrl =
    typeof (card as any).profileImageUrl === "string"
      ? String((card as any).profileImageUrl)
      : typeof (card as any).profile_image_url === "string"
        ? String((card as any).profile_image_url)
        : null

  const minPrice =
    typeof (card as any).minPrice === "number" && Number.isFinite((card as any).minPrice)
      ? Math.floor((card as any).minPrice)
      : typeof (card as any).min_price === "number" && Number.isFinite((card as any).min_price)
        ? Math.floor((card as any).min_price)
        : null

  return {
    id,
    ig_user_id: igUserId,
    ig_username: igUsername,
    profile_image_url: profileImageUrl,
    niche: typeof (card as any).niche === "string" ? String((card as any).niche) : null,
    deliverables: Array.isArray((card as any).deliverables) ? (card as any).deliverables : null,
    min_price: minPrice,
    contact: typeof (card as any).contact === "string" ? String((card as any).contact) : null,
    is_public: typeof (card as any).is_public === "boolean" ? (card as any).is_public : null,
  }
}

function writeCcPin(cardId: string, rawCard: unknown) {
  try {
    if (typeof window === "undefined") return
    const payloadCard = buildCcPinCardPayload(rawCard)
    if (!payloadCard) return
    const expires = getLocalDateYYYYMMDD()
    window.localStorage.setItem(CC_PIN_KEY, JSON.stringify({ cardId, expires, card: payloadCard }))
  } catch {
    // swallow
  }
}

function readCcPin(): { cardId: string; card: Record<string, unknown> } | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(CC_PIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as any
    const expires = typeof parsed?.expires === "string" ? String(parsed.expires) : ""
    const today = getLocalDateYYYYMMDD()
    if (expires !== today) {
      try {
        window.localStorage.removeItem(CC_PIN_KEY)
      } catch {
        // swallow
      }
      return null
    }

    const cardId = typeof parsed?.cardId === "string" ? String(parsed.cardId) : ""
    const card = parsed?.card && typeof parsed.card === "object" ? (parsed.card as Record<string, unknown>) : null
    if (!cardId || !card) {
      try {
        window.localStorage.removeItem(CC_PIN_KEY)
      } catch {
        // swallow
      }
      return null
    }

    return { cardId, card }
  } catch {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(CC_PIN_KEY)
    } catch {
      // swallow
    }
    return null
  }
}

function adaptPinnedCardToMatchmakingCard(raw: Record<string, unknown>, localePrefix: string): CreatorCard | null {
  const id = typeof raw.id === "string" ? raw.id : null
  if (!id) return null

  const igUserId =
    typeof (raw as any).ig_user_id === "string" ? String((raw as any).ig_user_id) : typeof (raw as any).igUserId === "string" ? String((raw as any).igUserId) : null
  const igUsername =
    typeof (raw as any).ig_username === "string"
      ? String((raw as any).ig_username).trim()
      : typeof (raw as any).igUsername === "string"
        ? String((raw as any).igUsername).trim()
        : ""

  const displayName = igUsername || id

  const rawPiu =
    typeof (raw as any).profileImageUrl === "string"
      ? String((raw as any).profileImageUrl).trim()
      : typeof (raw as any).profile_image_url === "string"
        ? String((raw as any).profile_image_url).trim()
        : ""
  const avatarUrl = rawPiu ? rawPiu : svgAvatarDataUrl(String(id), displayName)

  const category = typeof (raw as any).niche === "string" && String((raw as any).niche).trim() ? String((raw as any).niche).trim() : "Creator"
  const deliverables = Array.isArray((raw as any).deliverables) ? ((raw as any).deliverables as string[]) : []
  const minPrice =
    typeof (raw as any).minPrice === "number" && Number.isFinite((raw as any).minPrice)
      ? Math.floor((raw as any).minPrice)
      : typeof (raw as any).min_price === "number" && Number.isFinite((raw as any).min_price)
        ? Math.floor((raw as any).min_price)
        : null
  const contact = typeof (raw as any).contact === "string" ? String((raw as any).contact) : null

  return {
    id,
    igUserId,
    displayName,
    avatarUrl,
    category,
    deliverables,
    minPrice,
    contact,
    followerCount: 0,
    engagementRate: null,
    isVerified: false,
    profileUrl: `${localePrefix}/card/${id}`,
  }
}

export function MatchmakingClient({ locale, initialCards }: MatchmakingClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fav = useFavorites()
  const [favOpen, setFavOpen] = useState(false)

  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"

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

  const uiCopy = useMemo(() => getCopy(locale), [locale])

  const [authChecked, setAuthChecked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const canRenderMatchmaking = authChecked && isLoggedIn

  const [cards, setCards] = useState<CreatorCard[]>(initialCards)

  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"best_match" | "followers_desc" | "er_desc">("best_match")
  const [platform, setPlatform] = useState<Platform | "any">("any")
  const [budget, setBudget] = useState<BudgetRange>("any")
  const [customBudget, setCustomBudget] = useState<string>("")
  const [selectedTypes, setSelectedTypes] = useState<TypeKey[]>([])
  const [ownerCardId, setOwnerCardId] = useState<string | null>(null)
  const ccPinInjectedIdRef = useRef<string | null>(null)

  const initialMeRef = useRef<{ ok: boolean; json: any } | null>(null)

  const [devCcPinExists, setDevCcPinExists] = useState(false)
  const [devCcPinExpires, setDevCcPinExpires] = useState<string | null>(null)
  const devHasOwnerInCards = useMemo(() => {
    if (!ownerCardId) return false
    return cards.some((c) => c.id === ownerCardId)
  }, [cards, ownerCardId])
  const debugOwner = useMemo(() => {
    try {
      if (typeof window === "undefined") return false
      const qp = new URLSearchParams(window.location.search)
      return qp.get("debugOwner") === "1"
    } catch {
      return false
    }
  }, [])
  const showDevBadge = debugOwner

  const LS_SORT_KEY = "matchmaking:lastSort:v1"

  const cardsRef = useRef(cards)
  useEffect(() => {
    cardsRef.current = cards
  }, [cards])

  const ownerLookupStartedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const meRes = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const meJson = (await meRes.json().catch(() => null)) as any
        const ok = Boolean(meRes.ok && meJson?.ok === true)

        if (cancelled) return
        initialMeRef.current = { ok, json: meJson }
        setIsLoggedIn(ok)
        setAuthChecked(true)
      } catch {
        if (cancelled) return
        initialMeRef.current = { ok: false, json: null }
        setIsLoggedIn(false)
        setAuthChecked(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!canRenderMatchmaking) return
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
  }, [canRenderMatchmaking])

  useEffect(() => {
    setCards(initialCards)
  }, [initialCards])

  useEffect(() => {
    if (!showDevBadge) return
    if (!canRenderMatchmaking) return
    try {
      const raw = window.localStorage.getItem(CC_PIN_KEY)
      if (!raw) {
        setDevCcPinExists(false)
        setDevCcPinExpires(null)
        return
      }
      setDevCcPinExists(true)
      const parsed = JSON.parse(raw) as any
      const expires = typeof parsed?.expires === "string" ? String(parsed.expires) : null
      setDevCcPinExpires(expires)
    } catch {
      setDevCcPinExists(false)
      setDevCcPinExpires(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderMatchmaking, showDevBadge])

  useEffect(() => {
    if (!canRenderMatchmaking) return
    const pin = readCcPin()
    if (!pin) return
    const adapted = adaptPinnedCardToMatchmakingCard(pin.card, localePrefix)
    if (!adapted) return

    setOwnerCardId((prev) => (prev ? prev : pin.cardId))
    setCards((prev) => {
      const already = prev.some((c) => c.id === pin.cardId)
      if (already) return prev
      ccPinInjectedIdRef.current = pin.cardId
      return [adapted, ...prev]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderMatchmaking])

  // Initialize from URL query params on first client render
  useEffect(() => {
    if (!canRenderMatchmaking) return
    const qp = searchParams
    const nextQ = (qp.get("q") ?? "").slice(0, 120)
    const nextPlatform = (qp.get("platform") ?? "any") as Platform | "any"
    const nextBudget = (qp.get("budget") ?? "any") as BudgetRange
    const nextCollab = (qp.get("collab") ?? "any") as CollabType | "any"

    setQ(nextQ)
    setPlatform(nextPlatform)
    setBudget(nextBudget)

    // Keep URL compatibility: initialize selected types from the existing collab param (single value).
    const isKnownCollab: boolean =
      nextCollab === "short_video" ||
      nextCollab === "long_video" ||
      nextCollab === "ugc" ||
      nextCollab === "live" ||
      nextCollab === "review_unboxing" ||
      nextCollab === "event" ||
      nextCollab === "other"
    setSelectedTypes(isKnownCollab ? ([nextCollab as CollabType] as TypeKey[]) : [])

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

    setPlatform(nextPlatform)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderMatchmaking])

  // Sort is local-only: hydrate from localStorage (no URL read/write).
  useEffect(() => {
    if (!canRenderMatchmaking) return
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
    if (!canRenderMatchmaking) return
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    if (platform !== "any") params.set("platform", platform)
    // Do not introduce new URL values. Only persist known preset budgets.
    if (budget !== "any" && budget !== "custom") params.set("budget", budget)

    // URL compatibility: only persist to the existing "collab" param when exactly one collab type is selected.
    const single = selectedTypes.length === 1 ? selectedTypes[0] : null
    const collabValue: CollabType | null =
      single === "short_video" ||
      single === "long_video" ||
      single === "ugc" ||
      single === "live" ||
      single === "review_unboxing" ||
      single === "event" ||
      single === "other"
        ? single
        : null
    if (collabValue) params.set("collab", collabValue)

    const qs = params.toString()
    router.replace(qs ? `?${qs}` : "?", { scroll: false })
  }, [canRenderMatchmaking, q, platform, budget, selectedTypes, router])


  useEffect(() => {
    if (!canRenderMatchmaking) return
    let cancelled = false

    ;(async () => {
      let nextOwnerCardId: string | null = null
      let shouldPersistOwnerLookup = true

      try {
        if (ownerLookupStartedRef.current) return
        ownerLookupStartedRef.current = true

        try {
          const raw = window.sessionStorage.getItem(OWNER_LOOKUP_CACHE_KEY)
          if (raw) {
            const cached = JSON.parse(raw) as any
            if (cached?.done) {
              const cachedOwnerCardId = typeof cached?.ownerCardId === "string" ? cached.ownerCardId : null
              const pin = readCcPin()
              const pinCardId = pin?.cardId ?? null

              if (cachedOwnerCardId && (!pinCardId || pinCardId === cachedOwnerCardId)) {
                shouldPersistOwnerLookup = false
                if (!cancelled) setOwnerCardId(cachedOwnerCardId)
                return
              }

              if (!cachedOwnerCardId) {
                // Cache says done but no id stored; continue with /me.
              } else {
                // Cache id differs from today's pin token; continue with /me to refresh truth.
              }
            }
          }
          window.sessionStorage.setItem(
            OWNER_LOOKUP_CACHE_KEY,
            JSON.stringify({ startedAt: Date.now(), done: false, ownerCardId: null }),
          )
        } catch {
          // swallow
        }

        let meResOk = false
        let meJson: any = null

        if (initialMeRef.current) {
          meResOk = Boolean(initialMeRef.current.ok)
          meJson = initialMeRef.current.json
          initialMeRef.current = null
        } else {
          const meRes = await fetch("/api/creator-card/me", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          })
          meJson = (await meRes.json().catch(() => null)) as any
          meResOk = Boolean(meRes.ok && meJson?.ok === true)
        }

        if (!meResOk) return

        const ownerIgUserId = typeof meJson?.me?.igUserId === "string" ? meJson.me.igUserId : null
        const meCardId = typeof meJson?.card?.id === "string" ? meJson.card.id : null
        if (!meCardId) return

        nextOwnerCardId = meCardId
        if (!cancelled) setOwnerCardId(meCardId)

        writeCcPin(meCardId, meJson?.card)

        if (ccPinInjectedIdRef.current && ccPinInjectedIdRef.current !== meCardId) {
          const staleId = ccPinInjectedIdRef.current
          ccPinInjectedIdRef.current = null
          setCards((prev) => prev.filter((c) => c.id !== staleId))
        }

        if (!cancelled) {
          const rawCard = meJson?.card && typeof meJson.card === "object" ? (meJson.card as any) : null
          if (rawCard) {
            const displayName =
              typeof rawCard.ig_username === "string" && rawCard.ig_username.trim()
                ? String(rawCard.ig_username).trim()
                : typeof meJson?.me?.igUsername === "string" && meJson.me.igUsername.trim()
                  ? String(meJson.me.igUsername).trim()
                  : meCardId

            const avatarUrl =
              typeof rawCard.profileImageUrl === "string" && rawCard.profileImageUrl.trim()
                ? String(rawCard.profileImageUrl).trim()
                : typeof rawCard.profile_image_url === "string" && rawCard.profile_image_url.trim()
                  ? String(rawCard.profile_image_url).trim()
                  : svgAvatarDataUrl(String(meCardId), displayName)

            const category = typeof rawCard.niche === "string" && rawCard.niche.trim() ? String(rawCard.niche).trim() : "Creator"
            const deliverables = Array.isArray(rawCard.deliverables) ? (rawCard.deliverables as string[]) : []
            const minPrice =
              typeof rawCard.minPrice === "number" && Number.isFinite(rawCard.minPrice)
                ? Math.floor(rawCard.minPrice)
                : typeof rawCard.min_price === "number" && Number.isFinite(rawCard.min_price)
                  ? Math.floor(rawCard.min_price)
                  : null
            const contact = typeof rawCard.contact === "string" ? rawCard.contact : null

            const ownerCard: CreatorCard = {
              id: meCardId,
              igUserId: ownerIgUserId,
              displayName,
              avatarUrl,
              category,
              deliverables,
              minPrice,
              contact,
              followerCount: 0,
              engagementRate: null,
              isVerified: false,
              profileUrl: `${localePrefix}/card/${meCardId}`,
            }

            setCards((prev) => {
              const alreadyPresent = prev.some((c) => c.id === meCardId)
              if (alreadyPresent) return prev
              return [ownerCard, ...prev]
            })
          }
        }

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
  }, [canRenderMatchmaking])

  const cardsWithDemos = useMemo(() => {
    if (!canRenderMatchmaking) return []
    const TARGET_TOTAL = 12
    const existingIds = new Set(cards.map((c) => c.id))
    const realCards = cards.filter((c) => !c.isDemo)
    const missing = Math.min(3, Math.max(0, TARGET_TOTAL - realCards.length))
    const demos = missing > 0 ? buildDemoCreators({ locale, existingIds, count: missing, seedBase: "matchmaking" }) : []
    return [...realCards, ...demos]
  }, [canRenderMatchmaking, cards, locale])

  const creators: CreatorWithId[] = useMemo(() => {
    if (!canRenderMatchmaking) return []

    return cardsWithDemos.map((c) => {
      const topics = (c.category ? [c.category] : []).filter(Boolean)
      const deliverables = Array.isArray((c as any).deliverables) ? ((c as any).deliverables as string[]) : []
      const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
      const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)

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
      const contactLine = parsedContact.others[0] || undefined

      const rawFollowers =
        typeof cachedStats?.followers === "number" && Number.isFinite(cachedStats.followers)
          ? Math.floor(cachedStats.followers)
          : typeof (c as any)?.stats?.followers === "number" && Number.isFinite((c as any).stats.followers)
            ? Math.floor((c as any).stats.followers)
            : typeof (c as any)?.followerCount === "number" &&
                Number.isFinite((c as any).followerCount) &&
                (c as any).followerCount > 0
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
        typeof (c as any).minPrice === "number" && Number.isFinite((c as any).minPrice)
          ? (c as any).minPrice
          : typeof (c as any).min_price === "number" && Number.isFinite((c as any).min_price)
            ? (c as any).min_price
            : undefined

      const avatarUrl = typeof c.avatarUrl === "string" && c.avatarUrl.trim() ? c.avatarUrl.trim() : undefined

      const followers = typeof rawFollowers === "number" && Number.isFinite(rawFollowers) ? rawFollowers : null
      const engagementRate = typeof rawER === "number" && Number.isFinite(rawER) ? rawER : null
      const minPrice = typeof rawMinPrice === "number" && Number.isFinite(rawMinPrice) ? rawMinPrice : undefined

      return {
        id: c.id,
        name: c.displayName,
        handle,
        avatarUrl,
        topics,
        platforms: derivedPlatforms,
        collabTypes: derivedCollabTypes,
        deliverables,
        minPrice,
        stats: {
          followers: followers ?? undefined,
          engagementRate: engagementRate ?? undefined,
        },
        contact: typeof (c as any).contact === "string" ? String((c as any).contact) : null,
        contactEmail,
        contactLine,
        href: c.isDemo ? "#" : c.profileUrl,
        isDemo: Boolean((c as any).isDemo),
        creatorId: creatorIdStr ?? undefined,
      } as CreatorWithId
    })
  }, [canRenderMatchmaking, cardsWithDemos])

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

  function platformMatch(p: Platform | "any", ps?: Platform[]) {
    if (p === "any") return true
    return (ps ?? []).includes(p)
  }

  function collabMatch(c: CollabType | "any", types?: CollabType[]) {
    if (c === "any") return true
    return (types ?? []).includes(c)
  }

  function typeMatchAny(selected: TypeKey[], creatorId: string, types?: CollabType[]) {
    if (!selected.length) return true

    for (const t of selected) {
      if (t === "reels" || t === "posts" || t === "stories" || t === "other") {
        if ((creatorFormatsById.get(creatorId) ?? []).includes(t)) return true
      } else {
        if ((types ?? []).includes(t)) return true
      }
    }
    return false
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

  const ownerCreator = useMemo(() => {
    if (!canRenderMatchmaking) return null
    if (!ownerCardId) return null
    return creators.find((c) => c.id === ownerCardId) ?? null
  }, [canRenderMatchmaking, creators, ownerCardId])

  const nonOwnerCreators = useMemo(() => {
    if (!canRenderMatchmaking) return []
    if (!ownerCardId) return creators
    return creators.filter((c) => c.id !== ownerCardId)
  }, [canRenderMatchmaking, creators, ownerCardId])

  const filteredNonOwner = useMemo(() => {
    if (!canRenderMatchmaking) return []
    const qq = q.trim().toLowerCase()

    let out = nonOwnerCreators.filter((c) => {
      const hay = `${c.name} ${c.handle ?? ""} ${(c.topics ?? []).join(" ")}`.toLowerCase()
      const okQ = !qq || hay.includes(qq)
      const okPlatform = platformMatch(platform, c.platforms)

      const okType = typeMatchAny(selectedTypes, c.id, c.collabTypes)

      let okBudget = true
      if (budget === "custom") {
        okBudget = budgetEligibleByMinPrice(budget, c.minPrice, customBudget)
      } else {
        okBudget = budgetEligibleByMinPrice(budget, c.minPrice)
      }

      return okQ && okPlatform && okType && okBudget
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
  }, [canRenderMatchmaking, nonOwnerCreators, q, sort, platform, budget, customBudget, selectedTypes, creatorFormatsById])

  const finalCards = useMemo(() => {
    if (!canRenderMatchmaking) return []
    if (!ownerCreator) return filteredNonOwner
    return [ownerCreator, ...filteredNonOwner]
  }, [canRenderMatchmaking, filteredNonOwner, ownerCreator])

  const selectedBudgetMax = useMemo(() => {
    if (!canRenderMatchmaking) return null
    if (budget === "any") return null
    if (budget === "custom") {
      const amt = Number(customBudget.trim())
      return Number.isFinite(amt) ? amt : null
    }
    return budgetMaxForRange(budget)
  }, [canRenderMatchmaking, budget, customBudget])

  const visibleCreatorIds = useMemo(() => {
    if (!canRenderMatchmaking) return []
    const ids = finalCards.map((c) => c.creatorId).filter((x): x is string => typeof x === "string" && x.length > 0)

    const seen = new Set<string>()
    const uniqueOrdered: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      uniqueOrdered.push(id)
    }

    return uniqueOrdered
  }, [canRenderMatchmaking, finalCards])

  const visibleCreatorIdsKey = useMemo(() => visibleCreatorIds.join("|"), [visibleCreatorIds])

  useEffect(() => {
    if (!canRenderMatchmaking) return
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
  }, [canRenderMatchmaking, visibleCreatorIdsKey])

  useEffect(() => {
    if (!canRenderMatchmaking) return
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
  }, [canRenderMatchmaking, statsVersion])

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

  const favoritesList = useMemo(() => {
    if (!canRenderMatchmaking) return []
    return creators.filter((c) => fav.favoriteIds.has(c.id))
  }, [canRenderMatchmaking, creators, fav.favoriteIds])

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      <div className="pt-6 sm:pt-8">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-[clamp(20px,4.2vw,28px)] leading-tight font-semibold text-white/90 min-w-0 truncate">
              {uiCopy.matchmaking.pageHeadline}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-white/55 max-w-full break-words min-w-0">
              {uiCopy.matchmaking.pageSubheadline}
            </p>
          </div>
        </div>

        {/* AUTH GATE START */}
        {!authChecked ? (
          <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-10">
            <div className="min-h-[45dvh] flex items-center justify-center">
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-6 sm:px-6 text-center">
                <div className="text-lg sm:text-xl font-semibold text-white/90">
                  {locale === "zh-TW" ? "載入中…" : "Loading…"}
                </div>
              </div>
            </div>
          </div>
        ) : !isLoggedIn ? (
          <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-10">
            <div className="min-h-[45dvh] flex items-center justify-center">
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 px-4 py-6 sm:px-6 text-center">
                <div className="text-lg sm:text-xl font-semibold text-white/90">
                  {locale === "zh-TW" ? "請先登入" : "Please log in"}
                </div>
                <div className="mt-2 text-sm sm:text-base text-white/60 break-words">
                  {locale === "zh-TW"
                    ? "登入後即可看到為你排序的創作者配對結果"
                    : "Log in to see your personalized matchmaking results"}
                </div>

                <button
                  type="button"
                  className="mt-5 w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white text-black font-semibold px-5 py-3 text-base"
                  onClick={() => {
                    const nextPath = `/${locale}/matchmaking`
                    const oauthUrl = `/api/auth/login?next=${encodeURIComponent(nextPath)}`
                    if (typeof window !== "undefined") {
                      window.location.href = oauthUrl
                    }
                  }}
                >
                  {locale === "zh-TW" ? "前往登入" : "Go to login"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {/* AUTH GATE END */}

        {!canRenderMatchmaking ? null : (
          <>
            <div className="relative">
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
                selectedTypes={selectedTypes}
                onToggleType={(t: TypeKey) =>
                  setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
                }
                onClearTypes={() => setSelectedTypes([])}
                typeOptions={typeOptions}
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

              {showDevBadge ? (
                <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/40 px-2 py-1 text-[10px] leading-tight text-white/70">
                  <div>ownerCardId: {ownerCardId ?? "null"}</div>
                  <div>
                    cc_pin_v1: {devCcPinExists ? "yes" : "no"}
                    {devCcPinExists ? ` exp:${devCcPinExpires ?? "?"}` : ""}
                  </div>
                  <div>cards has owner: {devHasOwnerInCards ? "yes" : "no"}</div>
                  <div>first5: {finalCards.slice(0, 5).map((c) => c.id).join(",")}</div>
                </div>
              ) : null}
            </div>

            <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-4">
              <div className="text-xs sm:text-sm text-white/70 min-w-0 truncate">{uiCopy.matchmaking.recommendedLabel}</div>
            </div>

            <CreatorGrid>
              {finalCards.map((c) => {
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
          </>
        )}
      </div>

      {!canRenderMatchmaking ? null : (
        <FavoritesDrawer
          locale={locale}
          open={favOpen}
          onClose={() => setFavOpen(false)}
          favorites={favoritesList}
          onClearAll={fav.clearAll}
        />
      )}
    </div>
  )
}
