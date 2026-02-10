export type CreatorTypeLocale = "zh-TW" | "en"

export const CREATOR_TYPE_MASTER: Array<{ slug: string; zh: string; en: string; sortOrder: number }> = [
  { slug: "ecommerce", zh: "電商", en: "E-commerce", sortOrder: 10 },
  { slug: "beauty", zh: "美妝", en: "Beauty", sortOrder: 20 },
  { slug: "skincare", zh: "保養", en: "Skincare", sortOrder: 30 },
  { slug: "outfits", zh: "穿搭", en: "Outfits", sortOrder: 40 },
  { slug: "fashion", zh: "時尚", en: "Fashion", sortOrder: 50 },
  { slug: "travel", zh: "旅遊", en: "Travel", sortOrder: 60 },
  { slug: "food", zh: "美食", en: "Food", sortOrder: 70 },
  { slug: "restaurant", zh: "餐飲", en: "Dining", sortOrder: 80 },
  { slug: "spots", zh: "探店", en: "Food & Spots", sortOrder: 90 },
  { slug: "fitness", zh: "健身", en: "Fitness", sortOrder: 100 },
  { slug: "sports", zh: "運動", en: "Sports", sortOrder: 110 },
  { slug: "baby", zh: "母嬰", en: "Baby & Mom", sortOrder: 120 },
  { slug: "parenting", zh: "親子", en: "Parenting", sortOrder: 130 },
  { slug: "gadgets", zh: "3C", en: "Gadgets", sortOrder: 140 },
  { slug: "tech", zh: "科技", en: "Tech", sortOrder: 150 },
  { slug: "gaming", zh: "遊戲", en: "Gaming", sortOrder: 160 },
  { slug: "pets", zh: "寵物", en: "Pets", sortOrder: 170 },
  { slug: "home", zh: "居家", en: "Home", sortOrder: 180 },
  { slug: "lifestyle", zh: "生活", en: "Lifestyle", sortOrder: 190 },
  { slug: "finance", zh: "理財", en: "Finance", sortOrder: 200 },
  { slug: "education", zh: "教育", en: "Education", sortOrder: 210 },
  { slug: "career", zh: "職場", en: "Career", sortOrder: 220 },
  { slug: "photo", zh: "攝影", en: "Photography", sortOrder: 230 },
  { slug: "art", zh: "藝術", en: "Art", sortOrder: 240 },
  { slug: "music", zh: "音樂", en: "Music", sortOrder: 250 },
  { slug: "entertainment", zh: "娛樂", en: "Entertainment", sortOrder: 260 },
  { slug: "anime", zh: "動漫", en: "Anime", sortOrder: 270 },
  { slug: "auto", zh: "汽機車", en: "Auto & Moto", sortOrder: 280 },
  { slug: "real_estate", zh: "房產", en: "Real estate", sortOrder: 290 },
  { slug: "aesthetics", zh: "醫美", en: "Aesthetics", sortOrder: 300 },
  { slug: "outdoor", zh: "戶外", en: "Outdoor", sortOrder: 310 },
  { slug: "camping", zh: "露營", en: "Camping", sortOrder: 320 },
  { slug: "books", zh: "讀書", en: "Books", sortOrder: 330 },
  { slug: "diy", zh: "手作", en: "DIY", sortOrder: 340 },
  { slug: "baking", zh: "烘焙", en: "Baking", sortOrder: 350 },
  { slug: "unboxing", zh: "開箱", en: "Unboxing", sortOrder: 360 },
  { slug: "vlog", zh: "Vlog", en: "Vlog", sortOrder: 370 },
  { slug: "podcast", zh: "Podcast", en: "Podcast", sortOrder: 380 },
  { slug: "other", zh: "其他", en: "Other", sortOrder: 999 },
]

const MASTER_BY_SLUG = new Map<string, (typeof CREATOR_TYPE_MASTER)[number]>(
  CREATOR_TYPE_MASTER.map((x) => [x.slug.toLowerCase(), x])
)
const MASTER_BY_ZH = new Map<string, (typeof CREATOR_TYPE_MASTER)[number]>(
  CREATOR_TYPE_MASTER.map((x) => [x.zh.toLowerCase(), x])
)
const MASTER_BY_EN = new Map<string, (typeof CREATOR_TYPE_MASTER)[number]>(
  CREATOR_TYPE_MASTER.map((x) => [x.en.toLowerCase(), x])
)

const LEGACY_SLUG_TO_ZH: Record<string, string> = {
  beauty: "美妝",
  fashion: "時尚",
  outfits: "穿搭",
  food: "美食",
  travel: "旅遊",
  parenting: "親子",
  fitness: "健身",
  tech: "科技",
  finance: "理財",
  education: "教育",
  gaming: "遊戲",
  lifestyle: "生活",
  pets: "寵物",
  home: "居家",
  ecommerce: "電商",
}

const GENERIC_IGNORE_TOKENS = new Set(
  [
    "creator",
    "kol",
    "網紅",
    "創作者",
    "ig",
    "instagram",
    "tiktok",
    "youtube",
    "facebook",
    "reels",
    "shorts",
  ].map((s) => s.toLowerCase())
)

function coerceToArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw == null) return []
  return [raw]
}

function toTrimmedString(v: unknown): string {
  if (typeof v !== "string") return ""
  return v.trim()
}

function mapAnyToCanonicalZh(input: string): string {
  const s = String(input || "").trim()
  if (!s) return ""
  const lowered = s.toLowerCase()

  const legacy = LEGACY_SLUG_TO_ZH[lowered]
  if (legacy) return legacy

  const bySlug = MASTER_BY_SLUG.get(lowered)
  if (bySlug) return bySlug.zh

  const byZh = MASTER_BY_ZH.get(lowered)
  if (byZh) return byZh.zh

  const byEn = MASTER_BY_EN.get(lowered)
  if (byEn) return byEn.zh

  return s
}

export function normalizeCreatorTypes(raw: unknown): string[] {
  const arr = coerceToArray(raw)
  const out: string[] = []
  const seen = new Set<string>()

  for (const item of arr) {
    const s0 =
      toTrimmedString(item) ||
      toTrimmedString((item as any)?.zh) ||
      toTrimmedString((item as any)?.slug) ||
      toTrimmedString((item as any)?.label) ||
      toTrimmedString((item as any)?.value) ||
      toTrimmedString((item as any)?.name) ||
      toTrimmedString((item as any)?.title) ||
      toTrimmedString((item as any)?.en)

    const canonical = mapAnyToCanonicalZh(s0)
    if (!canonical) continue

    const key = canonical.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(canonical)

    if (out.length >= 30) break
  }

  return out
}

function coerceToStringArrayOrNull(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string")
  if (typeof raw === "string") {
    const s = raw.trim()
    if (!s) return []
    return s
      .split(/[,，、/|·・]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return null
}

export function normalizeCreatorTypesFromCard(card: unknown): string[] {
  const c = (card && typeof card === "object") ? (card as any) : null
  if (!c) return []

  const rawCandidate =
    c.creatorTypes ??
    c.creator_types ??
    c.creatorType ??
    c.creator_type ??
    c.tagCategories ??
    c.tag_categories ??
    c.collaborationNiches ??
    c.collaboration_niches ??
    null

  const coerced = coerceToStringArrayOrNull(rawCandidate)
  const fromArr = coerced == null ? [] : normalizeCreatorTypes(coerced).slice(0, 20)
  if (fromArr.length) return fromArr

  const fallbackText =
    (typeof c.niche === "string" && c.niche.trim() ? c.niche.trim() : "") ||
    (typeof c.primaryNiche === "string" && c.primaryNiche.trim() ? c.primaryNiche.trim() : "") ||
    (typeof c.category === "string" && c.category.trim() ? c.category.trim() : "") ||
    ""

  if (!fallbackText) return []
  return deriveCreatorTypesFromText(fallbackText).slice(0, 20)
}

export function localizeCreatorTypes(
  types: unknown,
  locale: CreatorTypeLocale,
): string[] {
  const normalized = normalizeCreatorTypes(types).slice(0, 20)
  return normalized
    .map((id) => creatorTypeToDisplayLabel(id, locale))
    .map((x) => String(x || "").trim())
    .filter(Boolean)
}

export function deriveCreatorTypesFromText(text: string): string[] {
  const raw = String(text || "").trim()
  if (!raw) return []

  const chunks = raw
    .split(/[·・,，、/|]+/g)
    .map((x) => x.trim())
    .filter(Boolean)

  const out: string[] = []
  const seen = new Set<string>()

  for (const c of chunks) {
    const lowered = c.toLowerCase()
    if (GENERIC_IGNORE_TOKENS.has(lowered)) continue
    if (c.length <= 1) continue

    const canonical = mapAnyToCanonicalZh(c)
    if (!canonical) continue
    const key = canonical.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(canonical)

    if (out.length >= 30) break
  }

  return out
}

export function creatorTypeToDisplayLabel(tagZhOrSlug: string, locale: CreatorTypeLocale): string {
  const canonicalZh = mapAnyToCanonicalZh(String(tagZhOrSlug || "").trim())
  if (!canonicalZh) return ""
  if (locale === "zh-TW") return canonicalZh

  const entry = MASTER_BY_ZH.get(canonicalZh.toLowerCase())
  return entry?.en || tagZhOrSlug
}

export function getCreatorTypeOptions(locale: CreatorTypeLocale): Array<{ value: string; label: string }> {
  return [...CREATOR_TYPE_MASTER]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((x) => ({ value: x.zh, label: locale === "zh-TW" ? x.zh : x.en }))
}

export async function fetchCreatorTypeOptionsFromDbOrFallback(
  supabaseClient: any,
  locale: CreatorTypeLocale
): Promise<Array<{ value: string; label: string }>> {
  try {
    if (!supabaseClient || typeof supabaseClient.from !== "function") return getCreatorTypeOptions(locale)

    const { data, error } = await supabaseClient
      .from("creator_type_dictionary")
      .select("slug, zh_tw, en, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    if (error || !Array.isArray(data)) return getCreatorTypeOptions(locale)

    const mapped = data
      .map((row: any) => {
        const zh = typeof row?.zh_tw === "string" ? row.zh_tw.trim() : ""
        const en = typeof row?.en === "string" ? row.en.trim() : ""
        if (!zh) return null
        return { value: zh, label: locale === "zh-TW" ? zh : en || zh }
      })
      .filter(Boolean) as Array<{ value: string; label: string }>

    return mapped.length ? mapped : getCreatorTypeOptions(locale)
  } catch {
    return getCreatorTypeOptions(locale)
  }
}
