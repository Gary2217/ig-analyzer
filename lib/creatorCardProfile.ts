export type CreatorCardPortfolioItem = {
  id: string
  brand?: string
  collabType?: string
}

export type CreatorCardProfilePayload = {
  selfIntro: string
  themeTitle?: string
  themeTypes?: string[]
  audienceProfile?: string[]
  featuredItems?: CreatorCardPortfolioItem[]
}

function trimString(value: unknown, maxLen: number) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLen)
}

function normalizeStringArray(value: unknown, maxLen: number, itemMaxLen: number) {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.trim().slice(0, itemMaxLen)
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= maxLen) break
  }
  return out
}

export function sanitizeCreatorCardProfilePayload(input: unknown): CreatorCardProfilePayload {
  const obj = input && typeof input === "object" ? (input as any) : {}

  const selfIntro = trimString(obj?.selfIntro, 5000)
  const themeTitle = trimString(obj?.themeTitle, 120)
  const themeTypes = normalizeStringArray(obj?.themeTypes, 20, 40)
  const audienceProfile = normalizeStringArray(obj?.audienceProfile, 20, 40)

  const featuredItemsRaw = Array.isArray(obj?.featuredItems) ? (obj.featuredItems as any[]) : []
  const featuredItems: CreatorCardPortfolioItem[] = []
  for (let i = 0; i < featuredItemsRaw.length && i < 30; i++) {
    const it = featuredItemsRaw[i]
    if (!it || typeof it !== "object") continue
    const id = trimString((it as any).id, 80)
    if (!id) continue
    featuredItems.push({
      id,
      brand: trimString((it as any).brand, 80),
      collabType: trimString((it as any).collabType, 40),
    })
  }

  return {
    selfIntro,
    ...(themeTitle ? { themeTitle } : null),
    ...(themeTypes.length ? { themeTypes } : null),
    ...(audienceProfile.length ? { audienceProfile } : null),
    ...(featuredItems.length ? { featuredItems } : null),
  } as CreatorCardProfilePayload
}
