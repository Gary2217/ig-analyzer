import type { CreatorCardData, Platform } from "@/app/components/matchmaking/types"
import { CREATOR_TYPE_MASTER } from "@/app/lib/creatorTypes"
import type { Locale } from "@/app/i18n"
import { demoCreators } from "@/app/components/matchmaking/demoCreators"

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

const chooseSubset = <T,>(items: T[], rng: () => number, minCount: number, maxCount: number): T[] => {
  const list = Array.isArray(items) ? [...items] : []
  if (!list.length) return []

  const min = Math.max(0, Math.min(list.length, Math.floor(minCount)))
  const max = Math.max(min, Math.min(list.length, Math.floor(maxCount)))
  const count = min === max ? min : min + Math.floor(rng() * (max - min + 1))
  if (count <= 0) return []

  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }

  return list.slice(0, count)
}

function pickDemoBudget(seedKey: string) {
  const seed = hashStringToInt(seedKey)
  const r = mulberry32(seed)()

  const buckets = [
    { min: 2000, max: 5000 },
    { min: 5000, max: 10000 },
    { min: 10000, max: 30000 },
    { min: 30000, max: 60000 },
  ]

  const idx = Math.floor(r * buckets.length)
  const b = buckets[Math.max(0, Math.min(buckets.length - 1, idx))]
  return { min: b.min, max: b.max }
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

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n  <rect width="128" height="128" rx="24" fill="${bg}"/>\n  <text x="64" y="72" text-anchor="middle" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI" font-size="44" font-weight="700" fill="white">${initials || "?"}</text>\n</svg>`

  const encoded = (() => {
    const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : null
    if (g && typeof g.btoa === "function") {
      return g.btoa(unescape(encodeURIComponent(svg)))
    }
    const B: any = g?.Buffer
    if (B && typeof B.from === "function") return B.from(svg, "utf8").toString("base64")
    return ""
  })()
  return `data:image/svg+xml;base64,${encoded}`
}

export function buildDemoFillCards(input: {
  creators: CreatorCardData[]
  page: number
  pageSize: number
  locale: Locale
  demoAvatarMap: Record<string, string>
}): CreatorCardData[] {
  const safePage = Number.isFinite(input.page) ? Math.max(1, Math.floor(input.page)) : 1
  const start = (safePage - 1) * input.pageSize
  const remainingReal = Math.max(0, input.creators.length - start)
  const realOnPage = Math.max(0, Math.min(input.pageSize, remainingReal))
  const need = Math.max(0, input.pageSize - realOnPage)
  if (!need) return []

  const existingIds = new Set(input.creators.map((c) => c.id))
  const pickedSeeds: typeof demoCreators = []
  const offset = ((safePage - 1) * input.pageSize) % Math.max(1, demoCreators.length)
  let i = 0

  while (pickedSeeds.length < need && i < need * 10) {
    const d = demoCreators[(offset + i) % demoCreators.length]
    if (d && !existingIds.has(d.id) && !pickedSeeds.some((x) => x.id === d.id)) {
      pickedSeeds.push(d)
    }
    i++
  }

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

  const synthStatsFor = (seedId: string) => {
    const h = hashStringToInt(String(seedId))
    const rand = mulberry32(h)
    const followers = Math.round(Math.pow(rand(), 0.42) * 160_000 + 2_500)
    const erPct = clampNumber(1.0 + rand() * 7.0, 0.6, 12)
    return { followers, engagementRate: Math.round((erPct / 100) * 10000) / 10000 }
  }

  return pickedSeeds.map((d, idx) => {
    const st = synthStatsFor(d.id)
    const avatarUrl = input.demoAvatarMap[d.id] || svgAvatarDataUrl(d.id, d.displayName)

    const { min, max } = pickDemoBudget(String(d.id ?? d.handle ?? d.displayName ?? "demo"))

    const rng = mulberry32(hashStringToInt(String(d.id ?? d.handle ?? d.displayName ?? "demo")))
    const ALL_PLATFORMS: Platform[] = ["instagram", "youtube", "tiktok", "facebook"]
    const platforms = chooseSubset(ALL_PLATFORMS, rng, 1, 3)

    return {
      id: d.id,
      name: d.displayName,
      handle: d.handle,
      avatarUrl,
      topics: input.locale === "zh-TW" ? ["示範"] : ["Demo"],
      tagCategories: (demoTagSets[idx % demoTagSets.length] || []).filter(Boolean).slice(0, 6),
      platforms: platforms.length ? platforms : ["instagram"],
      dealTypes: ["other"],
      collabTypes: ["other"],
      deliverables: [],
      dealMin: min,
      dealMax: max,
      budgetMin: min,
      budgetMax: max,
      minPrice: min,
      maxPrice: max,
      stats: {
        followers: st.followers,
        engagementRate: st.engagementRate,
      },
      href: "",
      isDemo: true,
      __rawCard: {
        platforms: platforms.length ? platforms : ["instagram"],
        collabTypes: ["other"],
        dealMin: min,
        dealMax: max,
        budgetMin: min,
        budgetMax: max,
        minPrice: min,
        maxPrice: max,
      },
    } as any
  })
}
