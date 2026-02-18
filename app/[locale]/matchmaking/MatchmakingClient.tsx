"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FiltersBar } from "@/app/components/matchmaking/FiltersBar"
import { CreatorGrid } from "@/app/components/matchmaking/CreatorGrid"
import { CreatorCard as MatchmakingCreatorCard } from "@/app/components/matchmaking/CreatorCard"
import { FavoritesDrawer } from "@/app/components/matchmaking/FavoritesDrawer"
import { useFavorites } from "@/app/components/matchmaking/useFavorites"
import { loadDemoAvatars } from "@/app/components/matchmaking/demoAvatarStorage"
import { getCopy, type Locale } from "@/app/i18n"
import { CREATOR_TYPE_MASTER, normalizeCreatorTypes, normalizeCreatorTypesFromCard } from "@/app/lib/creatorTypes"
import {
  applyPinnedOwnerCard,
  getCreatorCollabTypes,
  getCreatorPlatforms,
  normalizeSelectedCollabTypes,
  normalizeSelectedPlatforms,
  shouldIncludeDemoFill,
} from "@/app/lib/matchmaking/search"
import { buildDemoFillCards } from "@/app/lib/matchmaking/demoFill"
import { formatPriceLabel } from "@/app/lib/client/priceLabel"
import type {
  BudgetRange,
  CollabType,
  CreatorCardData,
  Platform,
} from "@/app/components/matchmaking/types"
import type { CreatorCard } from "./types"
const MM_DEBUG = process.env.NODE_ENV !== "production"

function clampNumber(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, v))
}


function tokenizeQuery(raw: string): string[] {
  const s = String(raw ?? "")
  if (!s.trim()) return []

  // Split by whitespace and common separators. Keep symbols like '_' '.' '#' as part of tokens.
  const parts = s.split(/[\s,，;；|/]+/g)
  const out: string[] = []
  for (const p of parts) {
    const t = normalizeSearchText(p)
    if (!t) continue
    out.push(t)
    if (out.length >= 6) break
  }
  return out
}

function buildCreatorIdentityHay(c: any): string {
  const parts: string[] = []
  pushFlattenedStrings(parts, c?.name)
  pushFlattenedStrings(parts, c?.displayName)
  pushFlattenedStrings(parts, c?.display_name)
  pushFlattenedStrings(parts, c?.handle)
  pushFlattenedStrings(parts, c?.username)
  pushFlattenedStrings(parts, c?.igUsername)
  pushFlattenedStrings(parts, c?.ig_username)

  const raw = c?.__rawCard
  if (raw && typeof raw === "object") {
    pushFlattenedStrings(parts, (raw as any)?.name)
    pushFlattenedStrings(parts, (raw as any)?.displayName)
    pushFlattenedStrings(parts, (raw as any)?.display_name)
    pushFlattenedStrings(parts, (raw as any)?.handle)
    pushFlattenedStrings(parts, (raw as any)?.username)
    pushFlattenedStrings(parts, (raw as any)?.igUsername)
    pushFlattenedStrings(parts, (raw as any)?.ig_username)
  }

  return normalizeSearchText(parts.join("\n"))
}

function buildCreatorSearchHay(c: any): string {
  const parts: string[] = []
  pushFlattenedStrings(parts, buildCreatorIdentityHay(c))

  pushFlattenedStrings(parts, c?.platforms)
  pushFlattenedStrings(parts, c?.deliverables)
  pushFlattenedStrings(parts, c?.topics)
  pushFlattenedStrings(parts, c?.tagCategories)
  pushFlattenedStrings(parts, c?.tag_categories)
  pushFlattenedStrings(parts, c?.tags)

  try {
    const collabTypes = getCreatorCollabTypes(c)
    pushFlattenedStrings(parts, collabTypes)
  } catch {
    // ignore
  }

  const raw = c?.__rawCard
  if (raw && typeof raw === "object") {
    pushFlattenedStrings(parts, (raw as any)?.platforms)
    pushFlattenedStrings(parts, (raw as any)?.deliverables)
    pushFlattenedStrings(parts, (raw as any)?.topics)
    pushFlattenedStrings(parts, (raw as any)?.tagCategories)
    pushFlattenedStrings(parts, (raw as any)?.tag_categories)
    pushFlattenedStrings(parts, (raw as any)?.tags)
    pushFlattenedStrings(parts, (raw as any)?.collabTypes)
    pushFlattenedStrings(parts, (raw as any)?.collab_types)
  }

  return normalizeSearchText(parts.join("\n"))
}

const searchKeyForCardLike = (c: any): string => {
  const creatorIdStr = typeof c?.igUserId === "string" && /^\d+$/.test(c.igUserId) ? c.igUserId : null
  return String(creatorIdStr ?? c?.creatorId ?? c?.id ?? c?.username ?? c?.handle ?? getCardDisplayName(c) ?? "")
}

const getNumericCreatorId = (c: any): string | null => {
  const candidates: unknown[] = [c?.numericId, c?.statsFetchId, c?.creatorNumericId, c?.creatorId, c?.igUserId, c?.ig_user_id, c?.id]
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v))
    if (typeof v === "string") {
      const s = v.trim()
      if (s && /^\d+$/.test(s)) return s
    }
  }

  const raw = c?.__rawCard
  if (raw && typeof raw === "object") {
    const r: any = raw as any
    const rawCandidates: unknown[] = [r?.numericId, r?.statsFetchId, r?.creatorNumericId, r?.creatorId, r?.igUserId, r?.ig_user_id, r?.id]
    for (const v of rawCandidates) {
      if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v))
      if (typeof v === "string") {
        const s = v.trim()
        if (s && /^\d+$/.test(s)) return s
      }
    }
  }

  return null
}

function getStatsCacheKey(card: any): string | null {
  const numericId = getNumericCreatorId(card) ?? getNumericCreatorId(card?.__rawCard)
  if (numericId != null) return String(numericId)

  const fallback = card?.creatorId ?? card?.__rawCard?.creatorId ?? card?.igUserId ?? card?.id
  return typeof fallback === "string" && fallback.length > 0 ? fallback : null
}

function getStatsFetchId(card: any): string | null {
  const direct =
    card?.statsFetchId ??
    card?.numericId ??
    card?.creatorNumericId ??
    card?.ig_user_id ??
    card?.__rawCard?.statsFetchId ??
    card?.__rawCard?.numericId ??
    card?.__rawCard?.creatorNumericId ??
    card?.__rawCard?.ig_user_id

  const directStr = typeof direct === "string" ? direct.trim() : ""
  const fetchId =
    (directStr && /^\d+$/.test(directStr) ? directStr : null) ??
    (typeof direct === "number" && Number.isFinite(direct) ? String(Math.trunc(direct)) : null) ??
    getNumericCreatorId(card) ??
    getNumericCreatorId(card?.__rawCard)

  if (!fetchId) {
    try {
      console.warn("[stats][debug] missing fetchId for card:", {
        id: (card as any)?.id ?? null,
        creatorId: (card as any)?.creatorId ?? null,
        username: (card as any)?.username ?? null,
        handle: (card as any)?.handle ?? null,
        igUsername: (card as any)?.igUsername ?? null,
        platform: (card as any)?.platform ?? null,
        platforms: (card as any)?.platforms ?? null,
      })
    } catch {}
  }

  try {
    // eslint-disable-next-line no-console
    console.log("[stats][debug] fetchId inputs", {
      direct: direct ?? null,
      directStr: directStr ?? null,
      fetchId: fetchId ?? null,
      card_numericId: card?.numericId ?? null,
      card_statsFetchId: card?.statsFetchId ?? null,
      raw_numericId: card?.__rawCard?.numericId ?? null,
      raw_statsFetchId: card?.__rawCard?.statsFetchId ?? null,
      raw_creatorNumericId: card?.__rawCard?.creatorNumericId ?? null,
      getNumeric_card: getNumericCreatorId(card) ?? null,
      getNumeric_raw: getNumericCreatorId(card?.__rawCard) ?? null,
    })
  } catch {}

  return fetchId
}

const sanitizeSelectedTagCategories = (input: unknown): string[] => {
  const arr = Array.isArray(input) ? input : []
  return arr
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((x) => x !== "全部" && x.toLowerCase() !== "all")
}

const toCreatorTagSet = (tagCategories: unknown): Set<string> => {
  const arr = Array.isArray(tagCategories) ? tagCategories : []
  return new Set(arr.map((x) => String(x ?? "").trim()).filter(Boolean))
}

interface MatchmakingClientProps {
  locale: Locale
  initialCards: CreatorCard[]
  initialMeCard?: CreatorCard | null
}

function normalizeSearchText(input: string): string {
  const s = String(input ?? "")
  try {
    return s
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
  } catch {
    return s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
  }
}

function pushFlattenedStrings(out: string[], v: unknown, depth = 0): void {
  if (v == null) return
  if (typeof v === "string") {
    const s = v.trim()
    if (s) out.push(s)
    return
  }
  if (typeof v === "number") {
    if (Number.isFinite(v)) out.push(String(v))
    return
  }
  if (typeof v === "boolean") {
    return
  }
  if (Array.isArray(v)) {
    for (const item of v) pushFlattenedStrings(out, item, depth + 1)
    return
  }
  if (typeof v === "object") {
    if (depth >= 2) return
    const obj = v as Record<string, unknown>
    for (const vv of Object.values(obj)) {
      if (typeof vv === "string") pushFlattenedStrings(out, vv, depth + 1)
    }
    for (const vv of Object.values(obj)) {
      if (vv != null && typeof vv === "object") pushFlattenedStrings(out, vv, depth + 1)
    }
  }
}

function buildCreatorTypeSearchParts(input: {
  tagCategories?: unknown
  creatorTypeOptions: string[]
}): string[] {
  const rawParts: string[] = []
  pushFlattenedStrings(rawParts, input.tagCategories)
  const normalizedRaw = new Set(rawParts.map((s) => normalizeSearchText(s)).filter(Boolean))
  if (!normalizedRaw.size) return []

  const out: string[] = []
  for (const opt of input.creatorTypeOptions) {
    const o = String(opt || "").trim()
    if (!o) continue
    if (normalizedRaw.has(normalizeSearchText(o))) out.push(o)
  }

  for (const s of rawParts) {
    const t = String(s || "").trim()
    if (t) out.push(t)
  }
  return out
}

const getCardDisplayName = (c: any) => String(c?.displayName ?? c?.name ?? "").trim()

const dedupeByKey = <T,>(arr: T[], keyFn: (x: T) => string) => {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of arr) {
    const k = keyFn(x)
    if (!k) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

const creatorKey = (c: any) => String(c?.creatorId ?? c?.id ?? c?.username ?? c?.handle ?? getCardDisplayName(c) ?? "")

function cardSearchBlob(card: CreatorCardData): string {
  const c: any = card as any
  const parts: string[] = []

  pushFlattenedStrings(parts, c.name)
  pushFlattenedStrings(parts, c.displayName)
  pushFlattenedStrings(parts, c.display_name)
  pushFlattenedStrings(parts, c.handle)
  pushFlattenedStrings(parts, c.ig_handle)
  pushFlattenedStrings(parts, c.igHandle)
  pushFlattenedStrings(parts, c.igUsername)
  pushFlattenedStrings(parts, c.ig_username)
  pushFlattenedStrings(parts, c.username)

  pushFlattenedStrings(parts, c.platforms)
  pushFlattenedStrings(parts, c.tags)
  pushFlattenedStrings(parts, c.tagCategories)
  pushFlattenedStrings(parts, c.topics)
  pushFlattenedStrings(parts, c.deliverables)
  pushFlattenedStrings(parts, c.collabTypes)
  pushFlattenedStrings(parts, c.collab_types)
  pushFlattenedStrings(parts, c.dealTypes)

  if (typeof c.minPrice === "number" && Number.isFinite(c.minPrice)) parts.push(String(Math.floor(c.minPrice)))
  if (c.__rawMinPrice === null) parts.push("洽談報價")

  pushFlattenedStrings(parts, c.contact)

  const raw = c.__rawCard
  if (raw && typeof raw === "object") {
    const r: any = raw as any
    pushFlattenedStrings(parts, r.name)
    pushFlattenedStrings(parts, r.displayName)
    pushFlattenedStrings(parts, r.display_name)
    pushFlattenedStrings(parts, r.handle)
    pushFlattenedStrings(parts, r.ig_handle)
    pushFlattenedStrings(parts, r.igHandle)
    pushFlattenedStrings(parts, r.igUsername)
    pushFlattenedStrings(parts, r.ig_username)
    pushFlattenedStrings(parts, r.username)
    pushFlattenedStrings(parts, r.platforms)
    pushFlattenedStrings(parts, r.tags)
    pushFlattenedStrings(parts, r.tagCategories)
    pushFlattenedStrings(parts, r.tag_categories)
    pushFlattenedStrings(parts, r.topics)
  }

  return normalizeSearchText(parts.join(" "))
}

function buildVisibleSearchBlob(card: CreatorCardData): string {
  const c: any = card
  const parts: string[] = []

  // Primary visible text
  parts.push(c.name, c.displayName, c.display_name, c.handle, c.ig_handle, c.igHandle, c.igUsername, c.username)

  // Arrays rendered in UI
  parts.push(...(c.platforms ?? []))
  parts.push(...(c.tags ?? []))
  parts.push(...(c.tagCategories ?? []))
  parts.push(...(c.topics ?? []))

  // Raw supabase payload (prod uses snake_case)
  if (c.__rawCard && typeof c.__rawCard === "object") {
    const r: any = c.__rawCard
    parts.push(r.name, r.display_name, r.ig_handle, r.username, ...(r.tags ?? []), ...(r.tag_categories ?? []))
  }

  return normalizeSearchText(parts.filter(Boolean).join(" "))
}

function buildCardHaystack(input: {
  creator: CreatorCardData & {
    handle?: string
    displayName?: string
    username?: string
    igUsername?: string
    topics?: string[]
    tagCategories?: string[]
    platforms?: Platform[]
    deliverables?: string[]
    collabTypes?: CollabType[]
    dealTypes?: string[]
    minPrice?: number | null
    contact?: string | null
    __rawCard?: unknown
    __rawMinPrice?: number | null | undefined
  }
  creatorTypeOptions: string[]
  locale: Locale
  creatorTypeSynonyms: Map<string, string[]>
}): string {
  const c = input.creator
  const parts: string[] = []

  pushFlattenedStrings(parts, (c as any).displayName)
  pushFlattenedStrings(parts, (c as any).display_name)
  pushFlattenedStrings(parts, c.name)
  pushFlattenedStrings(parts, c.handle)
  pushFlattenedStrings(parts, (c as any).ig_handle)
  pushFlattenedStrings(parts, (c as any).igHandle)
  pushFlattenedStrings(parts, (c as any).igUsername)
  pushFlattenedStrings(parts, (c as any).ig_username)
  pushFlattenedStrings(parts, (c as any).username)

  // CreatorCard renders the visible title as `creator.name`.
  // Search haystack must be derived from the same normalized object (`creator`) used for rendering.

  parts.push(cardSearchBlob(c as any))

  pushFlattenedStrings(parts, c.topics)
  const creatorTypeParts = buildCreatorTypeSearchParts({ tagCategories: c.tagCategories, creatorTypeOptions: input.creatorTypeOptions })
  pushFlattenedStrings(parts, creatorTypeParts)
  for (const t of creatorTypeParts) {
    const key = normalizeSearchText(t)
    const syns = input.creatorTypeSynonyms.get(key)
    if (syns?.length) pushFlattenedStrings(parts, syns)
  }

  pushFlattenedStrings(parts, c.platforms)
  pushFlattenedStrings(parts, c.deliverables)
  pushFlattenedStrings(parts, c.collabTypes)
  pushFlattenedStrings(parts, c.dealTypes)

  if (typeof c.minPrice === "number" && Number.isFinite(c.minPrice)) {
    parts.push(String(Math.floor(c.minPrice)))
    pushFlattenedStrings(parts, formatPriceLabel({ minPrice: c.minPrice, locale: input.locale }))
  } else if (c.__rawMinPrice === null) {
    parts.push("洽談報價")
    parts.push("contact for quote")
    pushFlattenedStrings(parts, formatPriceLabel({ minPrice: null, locale: input.locale }))
  }

  pushFlattenedStrings(parts, c.contact)

  return normalizeSearchText(parts.join(" "))
}

function hashStringToInt(seed: string) {
  let h = 2166136261
  for (let i = 0; i <seed.length; i++) {
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
  const bg = `rgb(${r1},${g1},${b1})`

  const raw = String(label || "?").trim()
  const initials = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase()

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">\n  <rect width="512" height="512" rx="96" fill="${bg}"/>\n  <text x="256" y="300" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto" font-size="152" font-weight="800" fill="rgba(255,255,255,0.92)">${initials || "?"}</text>\n</svg>`

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

function moveOwnerCardFirst<T extends { id?: unknown }>(cards: T[], isOwner: (c: T) => boolean): T[] {
  if (!Array.isArray(cards)) return cards
  const idx = cards.findIndex((c) => {
    try {
      return Boolean(isOwner(c))
    } catch {
      return false
    }
  })
  if (idx < 0) return cards

  const owner = cards[idx]
  const ownerId = typeof (owner as any)?.id === "string" ? String((owner as any).id) : ""
  const rest = cards.filter((c, i) => {
    if (i === idx) return false
    if (!ownerId) return true
    const cid = typeof (c as any)?.id === "string" ? String((c as any).id) : ""
    return cid !== ownerId
  })

  if (idx === 0 && rest.length === cards.length - 1) return cards
  return [owner, ...rest]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
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
    profileUrl: `${localePrefix}/card/${encodeURIComponent(id)}`,
  }
}

function MatchmakingClient(props: MatchmakingClientProps) {
  const { locale, initialCards, initialMeCard } = props

  const router = useRouter()
  const searchParams = useSearchParams()
  const uiCopy = getCopy(locale)
  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"
  const fav = useFavorites()
  const [favOpen, setFavOpen] = useState(false)
  const [demoAvatarMap, setDemoAvatarMap] = useState<Record<string, string>>({})
  const [canEditDemoAvatars, setCanEditDemoAvatars] = useState(false)

  const refreshDemoAvatars = useCallback(() => {
    try {
      setDemoAvatarMap(loadDemoAvatars())
    } catch {
      setDemoAvatarMap({})
    }
  }, [])

  useEffect(() => {
    refreshDemoAvatars()
  }, [refreshDemoAvatars])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mm_demo_avatars_v1") refreshDemoAvatars()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [refreshDemoAvatars])

  useEffect(() => {
    const LS_KEY = "mm_demo_edit_enabled_v1"
    try {
      const sp = searchParams
      if (sp?.get("demoEdit") === "1") {
        window.localStorage.setItem(LS_KEY, "1")
      }
      setCanEditDemoAvatars(window.localStorage.getItem(LS_KEY) === "1")
    } catch {
      setCanEditDemoAvatars(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disableDemoEdit = useCallback(() => {
    const LS_KEY = "mm_demo_edit_enabled_v1"
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY)
    } catch {
      // swallow
    }
    setCanEditDemoAvatars(false)
  }, [])

  const initialMeCardResolved = useMemo(() => {
    const raw = initialMeCard as any
    const nested = raw && typeof raw === "object" && raw.card && typeof raw.card === "object" ? raw.card : null

    return (nested ?? initialMeCard) as any
  }, [initialMeCard])

  const [ownerInitLoading, setOwnerInitLoading] = useState(() => !Boolean(initialMeCardResolved))

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

  const [allCards, setAllCards] = useState<CreatorCard[]>(initialCards)

  const [searchInput, setSearchInput] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [remoteRawCards, setRemoteRawCards] = useState<CreatorCard[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const remoteDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isComposingRef = useRef(false)
  const lastFetchedQRef = useRef<string>("")
  const remoteReqIdRef = useRef(0)
  const lastUrlQRef = useRef<string>("")

  const MIN_REMOTE_Q_LEN = 2
  const REMOTE_CACHE_TTL_MS = 5 * 60 * 1000
  const REMOTE_CACHE_MAX = 50

  type RemoteCacheEntry<T> = {
    at: number
    data: T
  }

  const remoteCacheRef = useRef<Map<string, RemoteCacheEntry<CreatorCard[]>>>(new Map())
  const remoteInFlightRef = useRef<Map<string, Promise<CreatorCard[]>>>(new Map())

  const getRemoteCache = useCallback(<T,>(q: string): T | null => {
    const hit = remoteCacheRef.current.get(q)
    if (!hit) return null
    if (Date.now() - hit.at > REMOTE_CACHE_TTL_MS) {
      remoteCacheRef.current.delete(q)
      return null
    }
    return hit.data as unknown as T
  }, [])

  const setRemoteCache = useCallback(<T,>(q: string, data: T) => {
    const m = remoteCacheRef.current
    if (m.has(q)) m.delete(q)
    m.set(q, { at: Date.now(), data: data as unknown as CreatorCard[] })
    while (m.size > REMOTE_CACHE_MAX) {
      const oldestKey = m.keys().next().value as string | undefined
      if (!oldestKey) break
      m.delete(oldestKey)
    }
  }, [])

  const [sort, setSort] = useState<"best_match" | "followers_desc" | "er_desc">("best_match")
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([])
  const [selectedDealTypes, setSelectedDealTypes] = useState<CollabType[]>([])
  const [selectedTagCategories, setSelectedTagCategories] = useState<string[]>([])
  const [budget, setBudget] = useState<BudgetRange>("any")
  const [customBudget, setCustomBudget] = useState<string>("")
  const [page, setPage] = useState(1)
  const [focusNonce, setFocusNonce] = useState(0)
  const LS_SORT_KEY = "matchmaking:lastSort:v1"

  const cardsRef = useRef(allCards)
  useEffect(() => {
    cardsRef.current = allCards
  }, [allCards])

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
    setAllCards(initialCards)
  }, [initialCards])

  // Initialize from URL query params on first client render
  useEffect(() => {
    const qp = searchParams
    const nextQ = (qp.get("q") ?? "").slice(0, 120)
    const nextBudget = (qp.get("budget") ?? "any") as BudgetRange
    const nextPageRaw = qp.get("page")
    const nextPageNum = nextPageRaw ? Number(nextPageRaw) : 1
    const nextPage = Number.isFinite(nextPageNum) ? Math.max(1, Math.floor(nextPageNum)) : 1

    const platformSet = new Set<Platform>(["instagram", "tiktok", "youtube", "facebook"])
    const nextPlatforms = qp
      .getAll("platform")
      .map((s) => String(s ?? "").trim().toLowerCase())
      .filter((s): s is Platform => platformSet.has(s as Platform))

    const collabSet = new Set<CollabType>([
      "short_video",
      "long_video",
      "ugc",
      "live",
      "review_unboxing",
      "event",
      "other",
    ])
    const nextDealTypes = qp
      .getAll("collab")
      .map((s) => String(s ?? "").trim())
      .filter((s): s is CollabType => collabSet.has(s as CollabType))

    const nextTagCategories = (() => {
      const all = qp.getAll("tagCategories").flatMap((x) => String(x ?? "").split(","))
      const joined = all.map((s) => s.trim()).filter(Boolean)
      return Array.from(new Set(joined)).slice(0, 50)
    })()

    setSearchInput(nextQ)
    setDebouncedQ(nextQ)
    setBudget(nextBudget)
    setCustomBudget(nextBudget === "custom" ? (qp.get("customBudget") ?? "") : "")
    setSelectedPlatforms(nextPlatforms)
    setSelectedDealTypes(nextDealTypes)
    setSelectedTagCategories(nextTagCategories)
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

  // Reset to page 1 when filters change.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, sort, budget, customBudget, selectedPlatforms.join("|"), selectedDealTypes.join("|"), selectedTagCategories.join("|")])

  useEffect(() => {
    if (remoteDebounceTimerRef.current) clearTimeout(remoteDebounceTimerRef.current)

    if (isComposingRef.current) return

    remoteDebounceTimerRef.current = setTimeout(() => {
      setDebouncedQ(String(searchInput ?? ""))
    }, 350)
    return () => {
      if (remoteDebounceTimerRef.current) clearTimeout(remoteDebounceTimerRef.current)
    }
  }, [searchInput])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      let nextOwnerCardId: string | null = null
      let shouldPersistOwnerLookup = true

      try {
        if (initialMeCard) {
          shouldPersistOwnerLookup = false
          if (!cancelled) setOwnerInitLoading(false)
          return
        }

        if (ownerLookupStartedRef.current) return
        ownerLookupStartedRef.current = true

        if (!cancelled) setOwnerInitLoading(true)

        const meRes = await fetch("/api/creator-card/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        })
        const meJson = (await meRes.json().catch(() => null)) as any

        if (MM_DEBUG) {
          try {
            // eslint-disable-next-line no-console
            console.log("[Matchmaking] meCard fetch result:", {
              httpOk: Boolean(meRes.ok),
              ok: Boolean(meJson?.ok),
              error: typeof meJson?.error === "string" ? meJson.error : null,
              cardId: typeof meJson?.card?.id === "string" ? meJson.card.id : null,
            })
          } catch {
            // ignore
          }
        }

        if (meRes.ok && meJson?.ok === true && meJson?.card) {
          const safe = sanitizeMeCard(meJson.card, localePrefix)
          if (safe) setMeCard(safe)
        }
        const meCardId = typeof meJson?.card?.id === "string" ? meJson.card.id : null

        if (!meRes.ok) {
          return
        }

        if (meJson?.ok !== true) {
          return
        }

        if (!meCardId) {
          return
        }

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

        setAllCards((prev: CreatorCard[]) =>
          prev.map((c: CreatorCard) => {
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
        if (!shouldPersistOwnerLookup) return
        if (!cancelled) setOwnerInitLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initialMeCard, localePrefix, meCard])

  useEffect(() => {
    if (initialMeCardResolved) setOwnerInitLoading(false)
  }, [initialMeCardResolved])

  const creators: Array<CreatorCardData & { creatorId?: string; __rawCard?: unknown; __rawMinPrice?: number | null | undefined }> = useMemo(() => {
    return allCards.map((c) => {
      const displayNameResolved =
        typeof (c as any).displayName === "string" && String((c as any).displayName).trim()
          ? String((c as any).displayName).trim()
          : typeof (c as any).name === "string" && String((c as any).name).trim()
            ? String((c as any).name).trim()
            : typeof (c as any).creatorName === "string" && String((c as any).creatorName).trim()
              ? String((c as any).creatorName).trim()
              : typeof (c as any).title === "string" && String((c as any).title).trim()
                ? String((c as any).title).trim()
                : ""

      const topics = (c.category ? [c.category] : []).filter(Boolean)
      const tagCategories = normalizeCreatorTypesFromCard(c as any)
      const deliverables = Array.isArray((c as any).deliverables) ? ((c as any).deliverables as string[]) : []
      const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
      const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)
      const dealTypes = derivedCollabTypes as unknown as string[]

      const cacheKey = getStatsCacheKey(c)
      const numericCreatorId = getNumericCreatorId(c)
      const cachedStats = cacheKey != null ? statsCacheRef.current.get(cacheKey) : undefined

      const rawHandle =
        typeof (c as any).handle === "string"
          ? String((c as any).handle).trim()
          : typeof (c as any).igUsername === "string"
            ? String((c as any).igUsername).trim()
            : typeof (c as any).username === "string"
              ? String((c as any).username).trim()
              : displayNameResolved
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

      const rawMinPriceCandidate =
        typeof (c as any)?.minPrice === "number" && Number.isFinite((c as any).minPrice)
          ? Math.floor((c as any).minPrice)
          : (c as any)?.minPrice === null
            ? null
            : typeof (c as any)?.min_price === "number" && Number.isFinite((c as any).min_price)
              ? Math.floor((c as any).min_price)
              : (c as any)?.min_price === null
                ? null
                : undefined

      const normalizedMinPrice = typeof rawMinPriceCandidate === "number" && Number.isFinite(rawMinPriceCandidate) ? Math.max(0, Math.floor(rawMinPriceCandidate)) : undefined

      return {
        id: c.id,
        creatorId: cacheKey ?? undefined,
        numericId: numericCreatorId ?? undefined,
        statsFetchId: numericCreatorId ?? undefined,
        name: displayNameResolved,
        displayName: displayNameResolved,
        username:
          typeof (c as any).username === "string"
            ? String((c as any).username).trim()
            : undefined,
        igUsername:
          typeof (c as any).igUsername === "string"
            ? String((c as any).igUsername).trim()
            : undefined,
        handle,
        avatarUrl: c.avatarUrl,
        topics,
        tagCategories,
        platforms: derivedPlatforms.length ? derivedPlatforms : ["instagram"],
        dealTypes,
        collabTypes: derivedCollabTypes.length ? derivedCollabTypes : ["other"],
        deliverables,
        minPrice: rawMinPriceCandidate === null ? null : normalizedMinPrice,
        __rawMinPrice: rawMinPriceCandidate,
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
        __rawCard: c as any,
      }
    })
  }, [allCards, statsVersion])

  const localByNumericId = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of allCards as any[]) {
      const id = getNumericCreatorId(c)
      if (!id) continue
      if (!m.has(id)) m.set(id, c)
    }
    return m
  }, [allCards])

  const localByHandle = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of allCards as any[]) {
      const h =
        (typeof (c as any)?.handle === "string" && (c as any).handle.trim()) ||
        (typeof (c as any)?.username === "string" && (c as any).username.trim()) ||
        (typeof (c as any)?.igUsername === "string" && (c as any).igUsername.trim()) ||
        (typeof (c as any)?.__rawCard?.handle === "string" && (c as any).__rawCard.handle.trim()) ||
        (typeof (c as any)?.__rawCard?.username === "string" && (c as any).__rawCard.username.trim()) ||
        null
      if (!h) continue
      const key = h.toLowerCase()
      if (!m.has(key)) m.set(key, c)
    }
    return m
  }, [allCards])

  const localSearchHayByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of allCards as any[]) {
      const k = searchKeyForCardLike(c)
      if (!k) continue
      if (m.has(k)) continue
      m.set(k, buildCreatorSearchHay(c))
    }
    return m
  }, [allCards])

  const localIdentityHayByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of allCards as any[]) {
      const k = searchKeyForCardLike(c)
      if (!k) continue
      if (m.has(k)) continue
      m.set(k, buildCreatorIdentityHay(c))
    }
    return m
  }, [allCards])

  const remoteCreators: Array<CreatorCardData & { creatorId?: string; __rawCard?: unknown; __rawMinPrice?: number | null | undefined }> = useMemo(() => {
    return remoteRawCards.map((c) => {
      const displayNameResolved =
        typeof (c as any).displayName === "string" && String((c as any).displayName).trim()
          ? String((c as any).displayName).trim()
          : typeof (c as any).name === "string" && String((c as any).name).trim()
            ? String((c as any).name).trim()
            : typeof (c as any).creatorName === "string" && String((c as any).creatorName).trim()
              ? String((c as any).creatorName).trim()
              : typeof (c as any).title === "string" && String((c as any).title).trim()
                ? String((c as any).title).trim()
                : ""

      const topics = (c.category ? [c.category] : []).filter(Boolean)
      const tagCategories = normalizeCreatorTypesFromCard(c as any)
      const deliverables = Array.isArray((c as any).deliverables) ? ((c as any).deliverables as string[]) : []
      const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
      const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)
      const dealTypes = derivedCollabTypes as unknown as string[]

      const cacheKey = getStatsCacheKey(c)
      const remoteNumericId = getNumericCreatorId(c) ?? getNumericCreatorId((c as any)?.__rawCard)

      const remoteHandle =
        (typeof (c as any)?.handle === "string" ? (c as any).handle : null) ??
        (typeof (c as any)?.username === "string" ? (c as any).username : null) ??
        (typeof (c as any)?.igUsername === "string" ? (c as any).igUsername : null) ??
        (typeof (c as any)?.__rawCard?.handle === "string" ? (c as any).__rawCard.handle : null) ??
        (typeof (c as any)?.__rawCard?.username === "string" ? (c as any).__rawCard.username : null) ??
        null
      const remoteHandleLower = remoteHandle ? String(remoteHandle).trim().replace(/^@+/, "").toLowerCase() : null
      const localHitByHandle = remoteHandleLower ? localByHandle.get(remoteHandleLower) : null

      const localNumericId = localHitByHandle ? getNumericCreatorId(localHitByHandle) : null
      const effectiveNumericIdStr: string | null = remoteNumericId ?? localNumericId ?? null
      const effectiveNumericIdNum: number | null =
        typeof effectiveNumericIdStr === "string" && /^\d+$/.test(effectiveNumericIdStr)
          ? Number(effectiveNumericIdStr)
          : null
      const effectiveNumericIdSafeNum: number | null =
        effectiveNumericIdNum != null && Number.isSafeInteger(effectiveNumericIdNum) ? effectiveNumericIdNum : null
      const localHit = effectiveNumericIdStr ? localByNumericId.get(effectiveNumericIdStr) : null

      const cachedStats = cacheKey != null ? statsCacheRef.current.get(cacheKey) : undefined

      const localBase = (localHit && typeof localHit === "object" ? localHit : null) ?? (localHitByHandle && typeof localHitByHandle === "object" ? localHitByHandle : null)
      const statsFromLocal = localBase ? (localBase as any)?.stats : undefined
      const resolvedStats = cachedStats ?? statsFromLocal

      const rawHandle =
        typeof (c as any).handle === "string"
          ? String((c as any).handle).trim()
          : typeof (c as any).igUsername === "string"
            ? String((c as any).igUsername).trim()
            : typeof (c as any).username === "string"
              ? String((c as any).username).trim()
              : displayNameResolved
      const handle = rawHandle ? rawHandle.replace(/^@/, "") : undefined

      const parsedContact = safeParseContact((c as any).contact)
      const contactEmail = parsedContact.emails[0] || undefined
      const contactPhone = parsedContact.phones[0] || undefined
      const contactLine = parsedContact.lines[0] || undefined
      const primaryContactMethod = parsedContact.primaryContactMethod

      const rawFollowers =
        typeof (resolvedStats as any)?.followers === "number" && Number.isFinite((resolvedStats as any).followers)
          ? Math.floor((resolvedStats as any).followers)
          : typeof (c as any)?.stats?.followers === "number" && Number.isFinite((c as any).stats.followers)
            ? Math.floor((c as any).stats.followers)
            : typeof (c as any)?.followerCount === "number" && Number.isFinite((c as any).followerCount) && (c as any).followerCount > 0
              ? Math.floor((c as any).followerCount)
              : undefined

      const rawER =
        typeof (resolvedStats as any)?.engagementRatePct === "number" && Number.isFinite((resolvedStats as any).engagementRatePct)
          ? (resolvedStats as any).engagementRatePct / 100
          : typeof (resolvedStats as any)?.engagementRate === "number" && Number.isFinite((resolvedStats as any).engagementRate)
            ? (resolvedStats as any).engagementRate
          : typeof (c as any)?.stats?.engagementRatePct === "number" && Number.isFinite((c as any).stats.engagementRatePct)
            ? (c as any).stats.engagementRatePct / 100
            : typeof (c as any)?.stats?.engagementRate === "number" && Number.isFinite((c as any).stats.engagementRate)
              ? (c as any).stats.engagementRate
              : typeof (c as any)?.engagementRate === "number" && Number.isFinite((c as any).engagementRate)
                ? (c as any).engagementRate
                : undefined

      const rawMinPriceCandidate =
        typeof (c as any)?.minPrice === "number" && Number.isFinite((c as any).minPrice)
          ? Math.floor((c as any).minPrice)
          : (c as any)?.minPrice === null
            ? null
            : typeof (c as any)?.min_price === "number" && Number.isFinite((c as any).min_price)
              ? Math.floor((c as any).min_price)
              : (c as any)?.min_price === null
                ? null
                : undefined

      const normalizedMinPrice = typeof rawMinPriceCandidate === "number" && Number.isFinite(rawMinPriceCandidate) ? Math.max(0, Math.floor(rawMinPriceCandidate)) : undefined

      return {
        id: c.id,
        creatorId: cacheKey ?? undefined,
        // 🔥 CRITICAL: expose numericId for stats fetching
        numericId: effectiveNumericIdSafeNum != null ? effectiveNumericIdSafeNum : undefined,

        // 🔥 CRITICAL: expose statsFetchId for stats fetching
        statsFetchId: effectiveNumericIdStr != null ? effectiveNumericIdStr : undefined,
        name: displayNameResolved,
        displayName: displayNameResolved,
        username:
          typeof (c as any).username === "string"
            ? String((c as any).username).trim()
            : undefined,
        igUsername:
          typeof (c as any).igUsername === "string"
            ? String((c as any).igUsername).trim()
            : undefined,
        handle,
        avatarUrl: c.avatarUrl,
        topics,
        tagCategories,
        platforms: derivedPlatforms.length ? derivedPlatforms : ["instagram"],
        dealTypes,
        collabTypes: derivedCollabTypes.length ? derivedCollabTypes : ["other"],
        deliverables,
        minPrice: rawMinPriceCandidate === null ? null : normalizedMinPrice,
        __rawMinPrice: rawMinPriceCandidate,
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
        // 🔥 CRITICAL: enrich __rawCard so fallback resolution always works
        __rawCard: {
          ...((c as any)?.__rawCard ?? (c as any)),

          // keep the digit-string source of truth
          creatorNumericId: effectiveNumericIdStr != null ? effectiveNumericIdStr : ((c as any)?.creatorNumericId ?? undefined),
          statsFetchId: effectiveNumericIdStr != null ? effectiveNumericIdStr : ((c as any)?.statsFetchId ?? undefined),

          // only set numericId when safe to represent as a JS number
          numericId:
            effectiveNumericIdSafeNum != null
              ? effectiveNumericIdSafeNum
              : ((c as any)?.numericId ?? undefined),
        },
      }
    })
  }, [remoteRawCards, statsVersion, localByNumericId, localByHandle])

  const remoteSearchHayByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of remoteRawCards as any[]) {
      const k = searchKeyForCardLike(c)
      if (!k) continue
      if (m.has(k)) continue
      m.set(k, buildCreatorSearchHay(c))
    }
    return m
  }, [remoteRawCards])

  const remoteIdentityHayByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of remoteRawCards as any[]) {
      const k = searchKeyForCardLike(c)
      if (!k) continue
      if (m.has(k)) continue
      m.set(k, buildCreatorIdentityHay(c))
    }
    return m
  }, [remoteRawCards])

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

  const creatorTypeSynonyms = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const x of CREATOR_TYPE_MASTER) {
      const zh = String((x as any)?.zh || "").trim()
      const en = String((x as any)?.en || "").trim()
      const slug = String((x as any)?.slug || "").trim()
      const syns = [zh, en, slug].filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
      if (!syns.length) continue

      const keyZh = normalizeSearchText(zh)
      if (keyZh) map.set(keyZh, syns)
      const keyEn = normalizeSearchText(en)
      if (keyEn) map.set(keyEn, syns)
      const keySlug = normalizeSearchText(slug)
      if (keySlug) map.set(keySlug, syns)
    }
    return map
  }, [])

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

  const debugOverlayEnabled = useMemo(() => {
    if (process.env.NODE_ENV === "production") return false
    try {
      return (searchParams?.get("debug") ?? "") === "1"
    } catch {
      return false
    }
  }, [searchParams])

  const qTrim = useMemo(() => String(debouncedQ ?? "").trim(), [debouncedQ])

  const localQ = qTrim

  const normalizedQ = typeof searchInput === "string" ? searchInput.trim() : ""
  const normalizedDebouncedQ = typeof debouncedQ === "string" ? debouncedQ.trim() : ""

  // Use debouncedQ if available, otherwise fallback to live search input.
  // This guarantees remote search works even if debounce fails.
  const remoteQ = normalizedDebouncedQ.length > 0 ? normalizedDebouncedQ : normalizedQ

  const localRawQuery = useMemo(() => String(debouncedQ ?? ""), [debouncedQ])
  const localTokens = useMemo(() => tokenizeQuery(localRawQuery), [localRawQuery])
  const primaryToken = useMemo(() => localTokens[0] ?? "", [localTokens])

  const hasSearchActive = useMemo(() => localQ.length > 0, [localQ])
  const hasRemoteSearchActive = useMemo(() => remoteQ.length >= MIN_REMOTE_Q_LEN, [remoteQ, MIN_REMOTE_Q_LEN])

  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.log("[mm][debug] search state", {
        q: normalizedQ,
        debouncedQ: normalizedDebouncedQ,
        remoteQ,
        hasRemoteSearchActive,
      })
    } catch {}
  }, [
    normalizedQ,
    normalizedDebouncedQ,
    remoteQ,
    hasRemoteSearchActive,
  ])

  const shouldFetchRemote = typeof remoteQ === "string" && remoteQ.length >= MIN_REMOTE_Q_LEN

  useEffect(() => {
    if (!shouldFetchRemote) return

    try {
      // eslint-disable-next-line no-console
      console.log("[mm][debug] remote search triggered", {
        remoteQ,
        length: remoteQ.length,
      })
    } catch {}
  }, [shouldFetchRemote, remoteQ])

  useEffect(() => {
    // Sync URL query param q from debouncedQ without causing ping-pong.
    try {
      const next = String(remoteQ ?? "").slice(0, 120)
      const current = String(searchParams?.get("q") ?? "")
      if (current === next) {
        lastUrlQRef.current = current
        return
      }
      if (lastUrlQRef.current === next) return

      const sp = new URLSearchParams(searchParams?.toString() || "")
      if (next) sp.set("q", next)
      else sp.delete("q")
      sp.delete("page")
      const qs = sp.toString()
      lastUrlQRef.current = next
      router.replace(qs ? `?${qs}` : "?", { scroll: false })
    } catch {
      // swallow
    }
  }, [remoteQ, router, searchParams])

  useEffect(() => {
    const q = String(remoteQ ?? "").trim()

    if (q.length < MIN_REMOTE_Q_LEN) {
      lastFetchedQRef.current = ""
      remoteReqIdRef.current += 1
      setRemoteLoading(false)
      setRemoteError(null)
      setRemoteRawCards([])
      if (process.env.NODE_ENV !== "production") {
        try {
          // eslint-disable-next-line no-console
          console.debug("[mm] remote skip (too short)", { q, len: q.length })
        } catch {
          // ignore
        }
      }
      return
    }

    if (lastFetchedQRef.current === q) return
    lastFetchedQRef.current = q

    remoteReqIdRef.current += 1
    const reqId = remoteReqIdRef.current
    setRemoteLoading(true)
    setRemoteError(null)

    const cached = getRemoteCache<CreatorCard[]>(q)
    if (cached) {
      if (process.env.NODE_ENV !== "production") {
        try {
          // eslint-disable-next-line no-console
          console.debug("[mm] remote cache hit", { q, reqId, count: cached.length })
        } catch {
          // ignore
        }
      }

      if (reqId === remoteReqIdRef.current) {
        setRemoteRawCards(cached)
        setRemoteLoading(false)
      }
      return
    }

    if (MM_DEBUG) {
      try {
        // eslint-disable-next-line no-console
        console.debug("[Matchmaking] remote search start", { q, reqId })
      } catch {
        // ignore
      }
    }

    ;(async () => {
      try {
        const existing = remoteInFlightRef.current.get(q)
        const doFetch: Promise<CreatorCard[]> =
          existing ??
          (async () => {
            const url = `/api/matchmaking/search?q=${encodeURIComponent(q)}&limit=50&offset=0`
            const res = await fetch(url, { method: "GET", cache: "no-store" })
            const json = (await res.json().catch(() => null)) as any
            if (!res.ok) {
              const msg = typeof json?.error === "string" ? json.error : `remote_search_failed_${res.status}`
              throw new Error(msg)
            }
            const rawItems = (json?.items ?? json?.cards ?? json?.results) as unknown
            const items = Array.isArray(rawItems) ? (rawItems as CreatorCard[]) : []
            return items.filter((r: any) => r && ((r as any).is_public === true || (r as any).isPublic === true))
          })()

        if (!existing) remoteInFlightRef.current.set(q, doFetch)

        const publicOnly = await doFetch
        if (!existing) {
          remoteInFlightRef.current.delete(q)
          setRemoteCache(q, publicOnly)
        }

        if (reqId !== remoteReqIdRef.current) return
        setRemoteRawCards(publicOnly)
        setRemoteError(null)
      } catch (e: any) {
        remoteInFlightRef.current.delete(q)
        if (reqId !== remoteReqIdRef.current) return
        const errObj = asRecord(e)
        const msg = typeof errObj?.message === "string" ? errObj.message : "remote_search_failed"
        setRemoteRawCards([])
        setRemoteError(msg)
      } finally {
        if (reqId === remoteReqIdRef.current) setRemoteLoading(false)
        if (MM_DEBUG) {
          try {
            // eslint-disable-next-line no-console
            console.debug("[Matchmaking] remote search end", { q, reqId, applied: reqId === remoteReqIdRef.current })
          } catch {
            // ignore
          }
        }
      }
    })()
  }, [MIN_REMOTE_Q_LEN, remoteQ, getRemoteCache, setRemoteCache])

  const hasPlatformFilterActive = useMemo(() => {
    const canonPlatformLocal = (v: any): "instagram" | "youtube" | "tiktok" | "facebook" | null => {
      const s = String(v?.value ?? v?.id ?? v?.platform ?? v?.name ?? v ?? "")
        .trim()
        .toLowerCase()
      if (!s) return null
      if (s === "instagram" || s === "ig" || s === "insta") return "instagram"
      if (s === "youtube" || s === "yt") return "youtube"
      if (s === "tiktok" || s === "tt") return "tiktok"
      if (s === "facebook" || s === "fb") return "facebook"
      return null
    }

    const set = new Set<string>()
    for (const x of selectedPlatforms ?? []) {
      const c = canonPlatformLocal(x)
      if (c) set.add(c)
    }
    return set.size > 0
  }, [selectedPlatforms])

  const hasCollabTypeFilterActive = useMemo(() => {
    return normalizeSelectedCollabTypes(selectedDealTypes).length > 0
  }, [selectedDealTypes])

  const hasTagFilterActive = useMemo(() => {
    return sanitizeSelectedTagCategories(selectedTagCategories).length > 0
  }, [selectedTagCategories])

  const hasBudgetFilterActive = useMemo(() => {
    return budget !== "any" && (budget !== "custom" || customBudget.trim().length > 0)
  }, [budget, customBudget])

  const hasOtherExplicitFilters = useMemo(() => {
    return hasCollabTypeFilterActive || hasTagFilterActive || hasBudgetFilterActive
  }, [hasCollabTypeFilterActive, hasTagFilterActive, hasBudgetFilterActive])

  const shouldIncludeDemoFillLocal = shouldIncludeDemoFill({ hasTagFilterActive, hasCollabTypeFilterActive, hasBudgetFilterActive })

  const pageSize = 8

  const onSearchInput = useCallback(
    (v: unknown) => {
      const next = typeof v === "string" ? v : String((v as any)?.currentTarget?.value ?? (v as any)?.target?.value ?? v ?? "")
      setSearchInput(next)
    },
    []
  )

  const onSearchCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const onSearchCompositionEnd = useCallback((finalValue: string) => {
    isComposingRef.current = false
    if (remoteDebounceTimerRef.current) clearTimeout(remoteDebounceTimerRef.current)
    setDebouncedQ(String(finalValue ?? ""))
  }, [])

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

  type PlatformCanon = "instagram" | "youtube" | "tiktok" | "facebook"

  const canonPlatform = (v: any): PlatformCanon | null => {
    const s = String(v?.value ?? v?.id ?? v?.platform ?? v?.name ?? v ?? "")
      .trim()
      .toLowerCase()
    if (!s) return null

    if (s === "instagram" || s === "ig" || s === "insta") return "instagram"
    if (s === "youtube" || s === "yt") return "youtube"
    if (s === "tiktok" || s === "tt") return "tiktok"
    if (s === "facebook" || s === "fb") return "facebook"
    return null
  }

  const canonSet = (arr: any[] | undefined | null) => {
    const set = new Set<PlatformCanon>()
    for (const x of arr ?? []) {
      const c = canonPlatform(x)
      if (c) set.add(c)
    }
    return set
  }

  function platformMatchAny(selected: any[], creatorPlatforms: any[] | undefined | null) {
    if (!selected || selected.length === 0) return true

    const sel = canonSet(selected)
    if (sel.size === 0) return true

    const cps = canonSet(creatorPlatforms)
    if (cps.size === 0) return false

    for (const p of sel) if (cps.has(p)) return true
    return false
  }

  function dealTypeMatchAny(selected: any, c: any) {
    const selectedNorm = normalizeSelectedCollabTypes(selected)
    if (!selectedNorm.length) return true
    const creatorNorm = getCreatorCollabTypes(c)
    if (!creatorNorm.length) return false
    const set = new Set(creatorNorm)
    return selectedNorm.some((t) => set.has(t))
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

  const matchesDropdownFilters = useCallback(
    (c: (typeof creators)[number]) => {
      const selectedPlatformsArr = normalizeSelectedPlatforms(selectedPlatforms)
      const okPlatform = platformMatchAny(selectedPlatformsArr as any, getCreatorPlatforms(c))
      const okDealType = dealTypeMatchAny(selectedDealTypes, c)
      const okTags = (() => {
        const cleanedSelectedTags = sanitizeSelectedTagCategories(selectedTagCategories)
        if (!cleanedSelectedTags.length) return true
        const set = toCreatorTagSet(c.tagCategories)
        return cleanedSelectedTags.some((t) => set.has(t))
      })()

      const minPriceNumberOrUndef = typeof c.minPrice === "number" && Number.isFinite(c.minPrice) ? c.minPrice : undefined
      const okBudget =
        budget === "custom"
          ? budgetEligibleByMinPrice(budget, minPriceNumberOrUndef, customBudget)
          : budgetEligibleByMinPrice(budget, minPriceNumberOrUndef)

      return okPlatform && okDealType && okTags && okBudget
    },
    [selectedPlatforms, selectedDealTypes, selectedTagCategories, budget, customBudget]
  )

  const hasUsableRemoteResults =
    hasRemoteSearchActive && remoteCreators.length > 0

  const baseList = useMemo(() => {
    const useRemote =
      hasUsableRemoteResults &&
      Array.isArray(remoteCreators) &&
      remoteCreators.length > 0

    const source = useRemote
      ? remoteCreators
      : creators

    return source.filter(matchesDropdownFilters)
  }, [
    creators,
    remoteCreators,
    matchesDropdownFilters,
    hasUsableRemoteResults,
  ])

  useEffect(() => {
    try {
      const useRemote =
        hasUsableRemoteResults &&
        Array.isArray(remoteCreators) &&
        remoteCreators.length > 0

      // eslint-disable-next-line no-console
      console.log("[mm][debug] baseList source", {
        useRemote,
        hasUsableRemoteResults,
        hasRemoteSearchActive,
        remoteCreatorsLen: Array.isArray(remoteCreators) ? remoteCreators.length : -1,
        creatorsLen: Array.isArray(creators) ? creators.length : -1,
        baseListLen: Array.isArray(baseList) ? baseList.length : -1,
        // show the first item keys to see if numericId/statsFetchId exist
        firstBase: (baseList ?? [])[0]
          ? {
              id: (baseList as any)[0]?.id,
              creatorId: (baseList as any)[0]?.creatorId,
              numericId: (baseList as any)[0]?.numericId,
              statsFetchId: (baseList as any)[0]?.statsFetchId,
              handle: (baseList as any)[0]?.handle,
              username: (baseList as any)[0]?.username,
              igUsername: (baseList as any)[0]?.igUsername,
              raw_numericId: (baseList as any)[0]?.__rawCard?.numericId,
              raw_statsFetchId: (baseList as any)[0]?.__rawCard?.statsFetchId,
              raw_creatorNumericId: (baseList as any)[0]?.__rawCard?.creatorNumericId,
            }
          : null,
      })
    } catch {}
  }, [
    baseList,
    creators,
    remoteCreators,
    hasUsableRemoteResults,
    hasRemoteSearchActive,
  ])

  const demoFillCards = useMemo((): CreatorCardData[] => {
    if (!shouldIncludeDemoFillLocal) return []
    return buildDemoFillCards({ creators, page, pageSize, locale, demoAvatarMap })
  }, [page, creators, demoAvatarMap, shouldIncludeDemoFillLocal, locale])

  const dedupeById = useCallback(<T extends { id?: unknown; creatorId?: unknown }>(list: T[]): T[] => {
    const seen = new Set<string>()
    const out: T[] = []
    for (const c of list) {
      const keyRaw = (c as any)?.creatorId ?? (c as any)?.id
      const key = keyRaw == null ? "" : String(keyRaw)

      // If key is missing, DO NOT drop the card. Keep it and avoid deduping it.
      if (!key) {
        out.push(c)
        continue
      }

      if (seen.has(key)) continue
      seen.add(key)
      out.push(c)
    }
    return out
  }, [])

  const searchPool = useMemo(() => {
    if (!shouldIncludeDemoFillLocal) return baseList
    const filler = demoFillCards.map((d) => ({ ...(d as CreatorCardData), creatorId: undefined }))
    return [...baseList, ...filler]
  }, [baseList, demoFillCards, shouldIncludeDemoFillLocal])

  const pinnedCreator = useMemo((): (CreatorCardData & { creatorId?: string; __rawCard?: unknown; __rawMinPrice?: number | null | undefined }) | null => {
    if (!meCard) return null

    const topics = (meCard.category ? [meCard.category] : []).filter(Boolean)
    const tagCategories = normalizeCreatorTypesFromCard(meCard as any)
    const deliverables = Array.isArray((meCard as any).deliverables) ? ((meCard as any).deliverables as string[]) : []
    const derivedPlatforms = derivePlatformsFromDeliverables(deliverables)
    const derivedCollabTypes = deriveCollabTypesFromDeliverables(deliverables)
    const dealTypes = derivedCollabTypes as unknown as string[]

    const cacheKey = getStatsCacheKey(meCard)
    const creatorIdStr =
      typeof (meCard as any)?.igUserId === "string" && /^\d+$/.test(String((meCard as any).igUserId))
        ? String((meCard as any).igUserId)
        : null
    const cachedStats = cacheKey != null ? statsCacheRef.current.get(cacheKey) : undefined

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

    const rawMinPriceCandidate =
      typeof (meCard as any)?.minPrice === "number" && Number.isFinite((meCard as any).minPrice)
        ? Math.floor((meCard as any).minPrice)
        : (meCard as any)?.minPrice === null
          ? null
          : typeof (meCard as any)?.min_price === "number" && Number.isFinite((meCard as any).min_price)
            ? Math.floor((meCard as any).min_price)
            : (meCard as any)?.min_price === null
              ? null
              : typeof (meCard as any)?.minPrice === "string" && (meCard as any).minPrice.trim() && Number.isFinite(Number((meCard as any).minPrice))
                ? Math.floor(Number((meCard as any).minPrice))
                : typeof (meCard as any)?.min_price === "string" && (meCard as any).min_price.trim() && Number.isFinite(Number((meCard as any).min_price))
                  ? Math.floor(Number((meCard as any).min_price))
                  : undefined

    const normalizedMinPrice =
      typeof rawMinPriceCandidate === "number" && Number.isFinite(rawMinPriceCandidate)
        ? Math.max(0, Math.floor(rawMinPriceCandidate))
        : undefined

    return {
      id: meCard.id,
      creatorId: cacheKey ?? undefined,
      name: meCard.displayName,
      handle,
      avatarUrl: meCard.avatarUrl,
      topics,
      tagCategories,
      platforms: derivedPlatforms.length ? derivedPlatforms : ["instagram"],
      dealTypes,
      collabTypes: derivedCollabTypes.length ? derivedCollabTypes : ["other"],
      deliverables,
      minPrice: rawMinPriceCandidate === null ? null : normalizedMinPrice,
      __rawMinPrice: rawMinPriceCandidate,
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
      __rawCard: meCard as any,
    }
  }, [meCard, statsVersion])

  useEffect(() => {
    if (!MM_DEBUG) return
    try {
      // eslint-disable-next-line no-console
      console.log("[Matchmaking] pinnedCreator:", pinnedCreator ? { id: pinnedCreator.id } : null)
    } catch {
      // ignore
    }
  }, [pinnedCreator])

  const searchedList = useMemo(() => {
    if (!localTokens.length) return searchPool

    const useIdentityOnly = localTokens.some((t) => t.length <= 1)
    const hayMap = hasUsableRemoteResults
      ? useIdentityOnly
        ? remoteIdentityHayByKey
        : remoteSearchHayByKey
      : useIdentityOnly
        ? localIdentityHayByKey
        : localSearchHayByKey

    return searchPool.filter((c) => {
      const k = searchKeyForCardLike(c)
      const hay = (k && hayMap.get(k)) || (useIdentityOnly ? buildCreatorIdentityHay(c) : buildCreatorSearchHay(c))
      return localTokens.every((t) => hay.includes(t))
    })
  }, [
    searchPool,
    localTokens,
    hasUsableRemoteResults,
    remoteIdentityHayByKey,
    remoteSearchHayByKey,
    localIdentityHayByKey,
    localSearchHayByKey,
  ])

  const filtered = useMemo(() => {
    let out = searchedList

    if (sort === "best_match") {
      const maxFollowers = out.reduce((m, c) => {
        const f = typeof c.stats?.followers === "number" ? c.stats.followers : 0
        return Math.max(m, f)
      }, 0)

      const scoreFor = (c: (typeof out)[number]) => {
        const er = typeof c.stats?.engagementRate === "number" ? c.stats.engagementRate : 0
        const followers = typeof c.stats?.followers === "number" ? c.stats.followers : 0
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
  }, [searchedList, sort])

  const finalCards = useMemo(() => {
    const selectedPlatformsArr = normalizeSelectedPlatforms(selectedPlatforms)

    const cleanedSelectedTags = sanitizeSelectedTagCategories(selectedTagCategories)

    const isFilteringActive =
      (selectedPlatformsArr.length > 0 && canonSet(selectedPlatformsArr).size > 0) ||
      (selectedDealTypes?.length ?? 0) > 0 ||
      cleanedSelectedTags.length > 0 ||
      (budget !== "any" && (budget !== "custom" || customBudget.trim().length > 0))

    const pinnedApplied = applyPinnedOwnerCard({
      list: filtered,
      pinned: pinnedCreator,
      hasSearchActive,
      isFilteringActive,
    })

    const deduped = dedupeById(pinnedApplied)
    const ownerId = typeof (meCard as any)?.id === "string" ? String((meCard as any).id) : null
    if (!ownerId) return deduped

    return moveOwnerCardFirst(deduped, (c: any) => {
      const cid = typeof c?.id === "string" ? String(c.id) : ""
      return Boolean(cid) && cid === ownerId
    })
  }, [filtered, pinnedCreator, matchesDropdownFilters, hasSearchActive, searchInput, selectedPlatforms, selectedDealTypes, selectedTagCategories, budget, customBudget, meCard])

  useEffect(() => {
    if (!MM_DEBUG) return
    try {
      // eslint-disable-next-line no-console
      console.debug("[Matchmaking] q + final unique", { debouncedQ, finalUnique: finalCards.length })
    } catch {
      // ignore
    }
  }, [MM_DEBUG, debouncedQ, finalCards.length])

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

  function mergeStatsPreferDefined(remoteStats: any, localStats: any) {
    const r = remoteStats && typeof remoteStats === "object" ? remoteStats : null
    const l = localStats && typeof localStats === "object" ? localStats : null

    const pickNum = (a: any, b: any) => {
      const va = typeof a === "number" && Number.isFinite(a) ? a : null
      const vb = typeof b === "number" && Number.isFinite(b) ? b : null
      return va != null ? va : vb != null ? vb : undefined
    }

    const followers = pickNum(r?.followers, l?.followers)
    const engagementRate = pickNum(r?.engagementRate, l?.engagementRate)

    if (followers == null && engagementRate == null) return r ?? l ?? undefined

    return {
      ...(l ?? {}),
      ...(r ?? {}),
      followers,
      engagementRate,
    }
  }

  const pagedRealCardsResolved = useMemo(() => {
    if (!Array.isArray(pagedRealCards)) return pagedRealCards

    return pagedRealCards.map((c: any) => {
      const rawHandle =
        c?.handle ??
        c?.username ??
        c?.igUsername ??
        c?.__rawCard?.handle ??
        c?.__rawCard?.username ??
        c?.__rawCard?.igUsername ??
        c?.profile?.handle ??
        c?.profile?.username ??
        c?.profile?.igUsername

      const normalizedHandle = rawHandle ? String(rawHandle).trim().replace(/^@+/, "").toLowerCase() : null

      const localHitByHandle = normalizedHandle && localByHandle?.get?.(normalizedHandle) ? localByHandle.get(normalizedHandle) : null

      // numericId fallback (if your file already has localByNumericId in scope)
      const remoteNumericId = c?.numericId ?? c?.creatorNumericId ?? c?.creatorIdNumeric ?? c?.__rawCard?.numericId ?? c?.__rawCard?.creatorNumericId ?? null

      const localHitByNumericId = remoteNumericId != null && typeof localByNumericId?.get === "function" ? localByNumericId.get(remoteNumericId) : null

      const localMatch = localHitByHandle ?? localHitByNumericId

      if (!localMatch) return c

      const mergedStats = mergeStatsPreferDefined((c as any)?.stats, (localMatch as any)?.stats)
      const mergedRawStats = mergeStatsPreferDefined((((c as any)?.__rawCard ?? c) as any)?.stats, (localMatch as any)?.stats)

      const remoteAvatarUrl = typeof (c as any)?.avatarUrl === "string" ? String((c as any).avatarUrl).trim() : ""
      const localAvatarUrl = typeof (localMatch as any)?.avatarUrl === "string" ? String((localMatch as any).avatarUrl).trim() : ""
      const localRawAvatarUrl =
        typeof (localMatch as any)?.__rawCard?.avatarUrl === "string" ? String((localMatch as any).__rawCard.avatarUrl).trim() : ""
      const mergedAvatarUrl = localAvatarUrl || localRawAvatarUrl || remoteAvatarUrl || undefined

      const merged = {
        ...(c as any),
        ...(localMatch as any),
      }

      const directFromC =
        (c as any)?.statsFetchId ??
        (c as any)?.numericId ??
        (c as any)?.creatorNumericId ??
        (c as any)?.__rawCard?.statsFetchId ??
        (c as any)?.__rawCard?.numericId ??
        (c as any)?.__rawCard?.creatorNumericId

      const directFromLocal =
        (localMatch as any)?.statsFetchId ??
        (localMatch as any)?.numericId ??
        (localMatch as any)?.creatorNumericId ??
        (localMatch as any)?.__rawCard?.statsFetchId ??
        (localMatch as any)?.__rawCard?.numericId ??
        (localMatch as any)?.__rawCard?.creatorNumericId

      const stableFetchId =
        directFromC ??
        directFromLocal ??
        (merged as any)?.statsFetchId ??
        (merged as any)?.numericId ??
        (merged as any)?.creatorNumericId

      return {
        ...merged,

        avatarUrl: mergedAvatarUrl,

        stats: mergedStats,

        // preserve numeric ids for stats fetching (do NOT let undefined from local overwrite remote)
        numericId: (merged as any)?.numericId ?? stableFetchId ?? undefined,
        statsFetchId: (merged as any)?.statsFetchId ?? (stableFetchId != null ? String(stableFetchId) : undefined),

        __rawCard: {
          ...((c as any)?.__rawCard ?? c),
          ...(localMatch as any),

          avatarUrl: mergedAvatarUrl,

          stats: mergedRawStats,

          // same preservation inside __rawCard
          numericId: (((c as any)?.__rawCard ?? c) as any)?.numericId ?? stableFetchId ?? undefined,
          creatorNumericId: (((c as any)?.__rawCard ?? c) as any)?.creatorNumericId ?? stableFetchId ?? undefined,
          statsFetchId: (((c as any)?.__rawCard ?? c) as any)?.statsFetchId ?? (stableFetchId != null ? String(stableFetchId) : undefined),
        },
      }
    })
  }, [pagedRealCards, localByHandle, localByNumericId])

  const resultCount = useMemo(() => finalCards.length, [finalCards.length])
  const hasAnySearchActive = useMemo(() => hasSearchActive || hasRemoteSearchActive, [hasSearchActive, hasRemoteSearchActive])
  const isSearching = useMemo(() => hasRemoteSearchActive && remoteLoading, [hasRemoteSearchActive, remoteLoading])

  const selectedBudgetMax = useMemo(() => {
    if (budget === "any") return null
    if (budget === "custom") {
      const amt = Number(customBudget.trim())
      return Number.isFinite(amt) && amt > 0 ? amt : null
    }
    return budgetMaxForRange(budget)
  }, [budget, customBudget])

  const popularCreatorId = useMemo(() => {
    function calcPopularScore(c: any): number {
      const er = typeof c?.stats?.engagementRate === "number" ? c.stats.engagementRate : 0
      const followers = typeof c?.stats?.followers === "number" ? c.stats.followers : 0

      const followerFactor = Math.log10(Math.max(1, followers))
      const erClamped = Math.max(0, Math.min(er, 0.25))
      return erClamped * 100 + followerFactor * 6
    }

    const candidates = creators.filter((c: any) => !c?.isDemo && !String(c?.id || "").startsWith("demo-"))
    if (!candidates.length) return null

    const MIN_FOLLOWERS = 3000
    const filtered = candidates.filter((c: any) => (c?.stats?.followers ?? 0) >= MIN_FOLLOWERS)
    const pool = filtered.length ? filtered : candidates

    let best = pool[0]
    let bestScore = calcPopularScore(best)
    for (let i = 1; i < pool.length; i++) {
      const s = calcPopularScore(pool[i])
      if (s > bestScore) {
        best = pool[i]
        bestScore = s
      }
    }

    return (best as any)?.creatorId || (best as any)?.id || null
  }, [creators])

  const visibleCreatorIds = useMemo(() => {
    const ids = pagedRealCards
      .map((c) => getStatsCacheKey(c))
      .filter((x): x is string => typeof x === "string" && x.length > 0)

    const seen = new Set<string>()
    const uniqueOrdered: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      uniqueOrdered.push(id)
    }

    return uniqueOrdered
  }, [pagedRealCards])

  const statsSourceCards = pagedRealCardsResolved

  const statsFetchIds = useMemo(() => {
    const ids = statsSourceCards
      .map((c) => getStatsFetchId(c))
      .filter((x): x is string => typeof x === "string" && /^\d+$/.test(x))

    const seen = new Set<string>()
    const uniqueOrdered: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      uniqueOrdered.push(id)
    }
    return uniqueOrdered
  }, [statsSourceCards])

  const statsFetchIdsKey = useMemo(() => statsFetchIds.join("|"), [statsFetchIds])

  const statsCacheKeysByFetchId = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of statsSourceCards) {
      const fetchId = getStatsFetchId(c)
      if (!fetchId || !/^\d+$/.test(fetchId)) continue
      const cacheKey = getStatsCacheKey(c)
      if (!cacheKey) continue
      const arr = m.get(fetchId)
      if (!arr) m.set(fetchId, [cacheKey])
      else if (!arr.includes(cacheKey)) arr.push(cacheKey)
    }
    return m
  }, [statsSourceCards])

  useEffect(() => {
    try {
      console.log("[stats][debug] statsSourceCards.length =", statsSourceCards?.length ?? 0);

      console.log(
        "[stats][debug] firstCards =",
        (statsSourceCards ?? []).slice(0, 5).map((c: any) => ({
          id: c?.id ?? null,
          creatorId: c?.creatorId ?? null,
          username: c?.username ?? null,
          handle: c?.handle ?? null,
          igUsername: c?.igUsername ?? null,
          platform: c?.platform ?? null,
          platforms: c?.platforms ?? null,
        }))
      );

      console.log("[stats][debug] statsFetchIds.length =", statsFetchIds?.length ?? 0);
      console.log("[stats][debug] statsFetchIds =", statsFetchIds ?? []);
      console.log(
        "[stats][debug] statsCacheKeysByFetchId keys =",
        statsCacheKeysByFetchId ? Object.keys(statsCacheKeysByFetchId) : []
      );
    } catch (err) {
      console.error("[stats][debug] error during debug logging", err);
    }
  }, [statsSourceCards, statsFetchIds, statsCacheKeysByFetchId]);

  const visibleCreatorIdsKey = useMemo(() => visibleCreatorIds.join("|"), [visibleCreatorIds])

  useEffect(() => {
    let alive = true
    const unique = statsFetchIds
    const missing = unique.filter((id) => !statsCacheRef.current.has(id) && !statsInFlightRef.current.has(id))
    let didCancel = false
    if (!missing.length) {
      return () => {
        alive = false
        didCancel = true
      }
    }

    const concurrency = 3
    let cursor = 0

    if (alive) setStatsPrefetchRunning(true)

    const fetchOne = async (creatorId: string) => {
      if (!creatorId || !/^\d+$/.test(creatorId)) return
      if (statsInFlightRef.current.has(creatorId)) return
      statsInFlightRef.current.add(creatorId)
      if (alive) setStatsUiVersion((v) => v + 1)

      const res = await fetch(`/api/creators/${encodeURIComponent(creatorId)}/stats`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
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
      const extraKeys = statsCacheKeysByFetchId.get(creatorId)
      if (extraKeys && extraKeys.length) {
        for (const k of extraKeys) {
          if (k && k !== creatorId) statsCacheRef.current.set(k, nextCached)
        }
      }
      if (changed && alive) setStatsVersion((v) => v + 1)

      if (!res.ok || json?.ok !== true) {
        statsErrorRef.current.set(creatorId, true)
      } else {
        statsErrorRef.current.delete(creatorId)
      }

      statsInFlightRef.current.delete(creatorId)
      if (alive) setStatsUiVersion((v) => v + 1)
    }

    const runWorker = async () => {
      while (!didCancel) {
        const idx = cursor
        cursor += 1
        if (idx >= missing.length) return

        const creatorId = missing[idx]
        if (!creatorId || !/^\d+$/.test(creatorId) || statsCacheRef.current.has(creatorId)) continue

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
            if (!didCancel && alive) setStatsPrefetchRunning(false)
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
      alive = false
      didCancel = true
      setStatsPrefetchRunning(false)
    }
  }, [statsFetchIdsKey, statsCacheKeysByFetchId])

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

  const creatorsById = useMemo(() => {
    const map = new Map<string, CreatorCardData>()
    for (const c of pagedRealCards) map.set(String(c.id), c)
    return map
  }, [pagedRealCards])

  const favoriteIdsArray = useMemo(() => Array.from(fav.favoriteIds), [fav.favoriteIds])

  const isEmptyResults = useMemo(
    () => resultCount === 0 && hasAnySearchActive && !isSearching,
    [resultCount, hasAnySearchActive, isSearching]
  )

  const showSkeleton = useMemo(
    () => (ownerInitLoading && !initialMeCardResolved) || (hasRemoteSearchActive && remoteLoading && pagedRealCards.length === 0),
    [hasRemoteSearchActive, initialMeCardResolved, ownerInitLoading, pagedRealCards.length, remoteLoading]
  )

  const clearSearchFromEmptyCta = useCallback(() => {
    setSearchInput("")
    setDebouncedQ("")
    setPage(1)
    setFocusNonce((n) => n + 1)
  }, [])

  return (
    <div className="min-h-[calc(100dvh-220px)] w-full">
      {debugOverlayEnabled ? (
        <div className="fixed bottom-3 right-3 z-[1000] w-[min(420px,calc(100vw-24px))] rounded-xl border border-white/10 bg-black/70 backdrop-blur-md p-3 text-[12px] text-white/80">
          <div className="font-semibold text-white/90">MM Debug</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
            <div>allCards</div>
            <div className="text-right">{allCards.length}</div>
            <div>creators</div>
            <div className="text-right">{creators.length}</div>
            <div>baseList</div>
            <div className="text-right">{baseList.length}</div>
            <div>searchedList</div>
            <div className="text-right">{searchedList.length}</div>
            <div>finalCards</div>
            <div className="text-right">{finalCards.length}</div>
            <div>pagedRealCards</div>
            <div className="text-right">{pagedRealCards.length}</div>
          </div>
          <div className="mt-2 text-white/70">q: <span className="text-white/90">{String(searchInput || "")}</span></div>
          <div className="mt-2 text-white/70">sample names:</div>
          <div className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-words text-white/85">
            {filtered
              .slice(0, 5)
              .map((c) => String((c as any)?.name || ""))
              .filter(Boolean)
              .join("\n") || "(none)"}
          </div>
        </div>
      ) : null}
      <div className="pt-6 sm:pt-8 pb-1 sm:pb-2">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3 min-w-0">
              <h1 className="text-[clamp(18px,3.6vw,26px)] leading-tight font-semibold text-white/90 min-w-0 truncate">
                {uiCopy.matchmaking.pageTitle}
              </h1>
            </div>

            {canEditDemoAvatars ? (
              <div className="mt-3 flex items-center gap-2">
                <div className="text-xs text-emerald-200/80">{uiCopy.matchmaking.demoEditModeLabel}</div>
                <button
                  type="button"
                  onClick={disableDemoEdit}
                  className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10"
                >
                  {uiCopy.matchmaking.turnOffLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="sticky top-[52px] z-40 sm:static sm:top-auto">
            <FiltersBar
              locale={locale}
              search={searchInput}
              onSearch={onSearchInput}
              onSearchCompositionStart={onSearchCompositionStart}
              onSearchCompositionEnd={onSearchCompositionEnd}
              remoteActive={hasRemoteSearchActive}
              remoteLoading={remoteLoading}
              remoteError={remoteError}
              resultCount={resultCount}
              hasSearchActive={hasAnySearchActive}
              isSearching={isSearching}
              focusNonce={focusNonce}
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
        </div>

        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 mt-5 sm:mt-6 min-w-0">
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
              <div className="mt-4">
                <button
                  type="button"
                  onClick={clearSearchFromEmptyCta}
                  className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10"
                >
                  {uiCopy.matchmaking.clearSearchCta}
                </button>
              </div>
            </div>
          </div>
        ) : showSkeleton ? (
          <CreatorGrid>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="group relative rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="w-full bg-black/30 border-b border-white/10 overflow-hidden aspect-[16/10] sm:aspect-[4/5]">
                  <div className="w-full h-full bg-white/5 animate-pulse" />
                </div>
                <div className="p-3 min-w-0">
                  <div className="h-4 w-2/3 rounded-md bg-white/10 animate-pulse" />
                  <div className="mt-2 h-3 w-1/2 rounded-md bg-white/10 animate-pulse" />
                  <div className="mt-3 h-10 w-full rounded-xl bg-white/[0.06] animate-pulse" />
                </div>
              </div>
            ))}
          </CreatorGrid>
        ) : (
          <CreatorGrid>
            {pagedRealCardsResolved.map((c, idx) => {
              const isOwnerCard = Boolean(pinnedCreator && c.id === pinnedCreator.id)
              const creatorId = getNumericCreatorId(c) ?? c.creatorId
              const hasFollowers = typeof c.stats?.followers === "number" && Number.isFinite(c.stats.followers)
              const hasER = typeof c.stats?.engagementRate === "number" && Number.isFinite(c.stats.engagementRate)
              const loading = Boolean(creatorId && statsInFlightRef.current.has(creatorId) && (!hasFollowers || !hasER))
              const error = Boolean(creatorId && statsErrorRef.current.get(creatorId) && !loading && (!hasFollowers || !hasER))
              const popularKey = String(creatorId || c.id)
              const isPopularPicked = popularCreatorId ? popularKey === String(popularCreatorId) : undefined

              return (
                <MatchmakingCreatorCard
                  key={`${String((c as any)?.id ?? "")}:${String((c as any)?.creatorId ?? "")}:${String((c as any)?.statsFetchId ?? "")}:${String((c as any)?.numericId ?? "")}:${String((c as any)?.handle ?? "")}:${idx}`}
                  creator={c}
                  locale={locale}
                  highlightQuery={primaryToken}
                  isOwner={isOwnerCard}
                  isFav={fav.isFav(c.id)}
                  onToggleFav={() => fav.toggleFav(c.id)}
                  onDemoAvatarChanged={refreshDemoAvatars}
                  canEditDemoAvatars={canEditDemoAvatars}
                  isPopularPicked={isPopularPicked}
                  statsLoading={loading}
                  statsError={error}
                  selectedBudgetMax={selectedBudgetMax}
                  onRetryStats={() => {
                    const id = getNumericCreatorId(c) ?? creatorId
                    if (!id) return
                    retryStats(id)
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
        favoriteIds={favoriteIdsArray}
        getCreatorById={(id) => creatorsById.get(String(id))}
        onClearAll={fav.clearAll}
      />
    </div>
  )
}

export { MatchmakingClient }
export default MatchmakingClient
