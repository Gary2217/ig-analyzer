import { CREATOR_TYPE_MASTER } from "@/app/lib/creatorTypes"

type AnyRecord = Record<string, unknown>

const toArray = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : [])

const toArrayAny = (v: any): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : [])

const getCardDisplayName = (c: any) => String(c?.displayName ?? c?.name ?? "").trim()

const toTagLabel = (tag: any) => {
  const raw = String(tag ?? "").trim()
  if (!raw) return ""

  const key = raw.toLowerCase()
  const found = CREATOR_TYPE_MASTER.find((x) => {
    const zh = String((x as any)?.zh ?? "").trim().toLowerCase()
    const en = String((x as any)?.en ?? "").trim().toLowerCase()
    const slug = String((x as any)?.slug ?? "").trim().toLowerCase()
    return key === zh || key === en || key === slug
  })

  return String((found as any)?.zh ?? raw).trim()
}

export const buildSearchHaystack = (c: any) => {
  const name = getCardDisplayName(c)

  const username =
    c?.username ?? c?.handle ?? c?.igHandle ?? c?.ig_handle ?? c?.instagram ?? c?.instagramHandle ?? ""

  const creatorTypes = [
    ...toArray(c?.creatorTypes),
    ...toArray(c?.creatorType),
    ...toArray(c?.creator_types),
    ...toArray(c?.tagCategories),
    ...toArray(c?.tag_categories),
    ...toArray(c?.tags),
    ...toArray(c?.categories),
    ...toArray(c?.niches),
    ...toArray(c?.verticals),
    ...toArray(c?.topics),
  ]

  const rawSources = [c?.__rawCard, c?.raw, c?.card].filter((x) => x && typeof x === "object") as AnyRecord[]
  for (const r of rawSources) {
    creatorTypes.push(
      ...toArray((r as any)?.creatorTypes),
      ...toArray((r as any)?.creatorType),
      ...toArray((r as any)?.creator_types),
      ...toArray((r as any)?.tagCategories),
      ...toArray((r as any)?.tag_categories),
      ...toArray((r as any)?.tags),
      ...toArray((r as any)?.categories),
      ...toArray((r as any)?.niches),
      ...toArray((r as any)?.verticals),
      ...toArray((r as any)?.topics)
    )
  }
  const tagLabels = creatorTypes.map(toTagLabel)

  return [name, username, ...creatorTypes, ...tagLabels].filter(Boolean).join(" ")
}

export const matchesCreatorQuery = (c: any, rawQuery: string) => {
  const q = (rawQuery ?? "").toString().trim().toLowerCase()
  if (!q) return true

  const startsWithAny = (value: unknown) => {
    const s = typeof value === "string" ? value.trim().toLowerCase() : ""
    if (!s) return false
    const sNoAt = s.startsWith("@") ? s.slice(1) : s
    return sNoAt.startsWith(q)
  }

  const baseOk =
    startsWithAny((c as any)?.handle) ||
    startsWithAny((c as any)?.username) ||
    startsWithAny((c as any)?.igUsername) ||
    startsWithAny((c as any)?.displayName) ||
    startsWithAny((c as any)?.name) ||
    startsWithAny((c as any)?.creatorName)

  if (baseOk) return true

  const nestedOk =
    startsWithAny((c as any)?.profile?.username) ||
    startsWithAny((c as any)?.profile?.handle) ||
    startsWithAny((c as any)?.social?.instagram?.username) ||
    startsWithAny((c as any)?.instagramUsername) ||
    startsWithAny((c as any)?.igHandle) ||
    startsWithAny((c as any)?.ig_handle) ||
    startsWithAny((c as any)?.owner?.handle)

  if (nestedOk) return true

  const rawSources = [c?.__rawCard, c?.raw, c?.card].filter((x) => x && typeof x === "object") as AnyRecord[]
  for (const r of rawSources) {
    if (
      startsWithAny((r as any)?.handle) ||
      startsWithAny((r as any)?.username) ||
      startsWithAny((r as any)?.igUsername) ||
      startsWithAny((r as any)?.displayName) ||
      startsWithAny((r as any)?.name) ||
      startsWithAny((r as any)?.creatorName) ||
      startsWithAny((r as any)?.instagramUsername) ||
      startsWithAny((r as any)?.igHandle) ||
      startsWithAny((r as any)?.ig_handle) ||
      startsWithAny((r as any)?.profile?.username) ||
      startsWithAny((r as any)?.profile?.handle) ||
      startsWithAny((r as any)?.social?.instagram?.username) ||
      startsWithAny((r as any)?.owner?.handle)
    ) {
      return true
    }
  }

  return false
}

export function applyPinnedOwnerCard<T extends { id?: string | null }>(input: {
  list: T[]
  pinned: T | null
  hasSearchActive: boolean
  isFilteringActive: boolean
}): T[] {
  const { list, pinned, hasSearchActive, isFilteringActive } = input
  if (!pinned) return list
  if (hasSearchActive || isFilteringActive) return list

  const out: T[] = []
  const seen = new Set<string>()

  const add = (c: T) => {
    const id = typeof c?.id === "string" ? c.id : ""
    if (!id) return
    if (seen.has(id)) return
    seen.add(id)
    out.push(c)
  }

  add(pinned)
  for (const c of list) add(c)
  return out
}

export const normalizeSelectedPlatforms = (v: any): any[] => {
  const arr = Array.isArray(v) ? v : v ? [v] : []
  return arr
    .map((x) => {
      if (x && typeof x === "object") {
        const inner = (x as any).value
        if (inner && typeof inner === "object") return inner
        return x
      }
      return x
    })
    .filter(Boolean)
}

export const normalizeSelectedCollabTypes = (v: any): string[] => {
  const arr = Array.isArray(v) ? v : v ? [v] : []
  const out: string[] = []

  for (let x of arr) {
    let cur: any = x
    let guard = 0
    while (cur && typeof cur === "object" && "value" in cur && guard < 6) {
      cur = (cur as any).value
      guard++
    }

    const s = String((cur as any)?.id ?? (cur as any)?.name ?? (cur as any)?.value ?? cur ?? "")
      .trim()
      .toLowerCase()
    if (s) out.push(s)
  }

  return Array.from(new Set(out))
}

export const getCreatorPlatforms = (c: any): string[] => {
  const rawSources = [c?.__rawCard, c?.raw, c?.card].filter((x) => x && typeof x === "object") as AnyRecord[]
  const candidates = [
    ...toArrayAny(c?.platforms),
    ...toArrayAny(c?.platform),
    ...toArrayAny(c?.platform_list),
    ...toArrayAny(c?.platformsUsed),
    ...toArrayAny(c?.platforms_used),
    ...rawSources.flatMap((r) => [
      ...toArrayAny((r as any)?.platforms),
      ...toArrayAny((r as any)?.platform),
      ...toArrayAny((r as any)?.platform_list),
      ...toArrayAny((r as any)?.platformsUsed),
      ...toArrayAny((r as any)?.platforms_used),
    ]),
  ]

  return candidates.map((x) => String(x || "").trim()).filter(Boolean)
}

export const getCreatorCollabTypes = (c: any): string[] => {
  const unwrapValueObject = (input: any) => {
    let cur = input
    let guard = 0
    while (cur && typeof cur === "object" && "value" in cur && guard < 10) {
      cur = (cur as any).value
      guard++
    }
    return cur
  }

  const flatten = (input: any, out: any[], depth = 0) => {
    if (input == null) return
    if (depth > 20) return
    const cur = unwrapValueObject(input)
    if (Array.isArray(cur)) {
      for (const x of cur) flatten(x, out, depth + 1)
      return
    }
    out.push(cur)
  }

  const normalize = (inputs: any[]): string[] => {
    const flat: any[] = []
    for (const v of inputs) flatten(v, flat)

    const seen = new Set<string>()
    const out: string[] = []
    for (const v of flat) {
      const s = String(v ?? "")
        .trim()
        .toLowerCase()
      if (!s) continue
      if (seen.has(s)) continue
      seen.add(s)
      out.push(s)
    }
    return out
  }

  const keys = [
    "collabTypes",
    "collab_types",
    "collabType",
    "collab_type",
    "collaboration_methods",
    "collaborationMethods",
  ]

  const candidates: any[] = []
  const pushFrom = (obj: any) => {
    if (!obj || typeof obj !== "object") return
    for (const k of keys) candidates.push((obj as any)[k])
  }

  // Top-level
  pushFrom(c)

  // Mirrors
  pushFrom((c as any)?.__rawCard)
  pushFrom((c as any)?.__rawCard?.raw)
  pushFrom((c as any)?.__rawCard?.card)

  pushFrom((c as any)?.raw)
  pushFrom((c as any)?.card)

  return normalize(candidates)
}

export function shouldIncludeDemoFill(input: { hasTagFilterActive: boolean; hasCollabTypeFilterActive: boolean; hasBudgetFilterActive: boolean }) {
  return !input.hasTagFilterActive && !input.hasCollabTypeFilterActive && !input.hasBudgetFilterActive
}
