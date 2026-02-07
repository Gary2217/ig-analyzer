import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { createServiceClient } from "@/lib/supabase/server"
import { PublicCardClient } from "./PublicCardClient"
import { PublicCardErrorState } from "./PublicCardErrorState"
import messagesZhTW from "@/messages/zh-TW.json"
import messagesEn from "@/messages/en.json"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PublicCardPageProps {
  params: Promise<{
    locale: string
    id: string
  }>
}

function getSiteOrigin() {
  const fromPublic = (process.env.NEXT_PUBLIC_SITE_URL || "").trim()
  if (fromPublic && fromPublic.startsWith("http")) return fromPublic.replace(/\/$/, "")

  const vercelUrl = (process.env.VERCEL_URL || "").trim()
  if (vercelUrl) return `https://${vercelUrl}`

  return "http://localhost:3000"
}

function toAbsoluteUrl(origin: string, maybeRelative: string | null | undefined) {
  const s = String(maybeRelative || "").trim()
  if (!s) return null
  if (s.startsWith("http://") || s.startsWith("https://")) return s
  if (s.startsWith("//")) return `https:${s}`
  if (s.startsWith("/")) return `${origin}${s}`
  return `${origin}/${s}`
}

function sanitizeOneLine(s: string) {
  return String(s)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function clampDescription(s: string, max = 160) {
  const one = sanitizeOneLine(s)
  if (one.length <= max) return one
  return `${one.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function pickFirstFeaturedImage(normalized: ReturnType<typeof normalizeCreatorCardForPreview>) {
  const items = Array.isArray(normalized.featuredItems) ? normalized.featuredItems : []
  for (const it of items) {
    const u = (it as any)?.thumbnailUrl || (it as any)?.thumbnail_url
    if (typeof u === "string" && u.trim()) return u.trim()
  }
  return null
}

function buildLocalizedSeo(
  locale: "zh-TW" | "en",
  fields: {
    displayName: string
    username: string | null
    primaryNiche: string | null
    aboutText: string | null
  },
) {
  const name = sanitizeOneLine(fields.displayName || (locale === "zh-TW" ? "IG 創作者" : "Instagram Creator"))
  const niche = fields.primaryNiche ? sanitizeOneLine(fields.primaryNiche) : ""

  const title =
    locale === "zh-TW"
      ? `${name}｜IG 創作者名片`
      : `${name} | Instagram Creator Card`

  const descBase =
    locale === "zh-TW"
      ? niche
        ? `${name}，專注於 ${niche}。查看作品、合作內容與創作者資訊。`
        : `${name} 的 IG 創作者名片。查看作品、合作內容與創作者資訊。`
      : niche
        ? `${name} is an Instagram creator focused on ${niche}. View profile, work, and collaborations.`
        : `${name}'s Instagram creator card. View profile, work, and collaborations.`

  const about = fields.aboutText ? sanitizeOneLine(fields.aboutText) : ""
  const description = clampDescription(about && about.length >= 24 ? about : descBase, 160)

  const alt =
    locale === "zh-TW"
      ? `${name} 的 IG 創作者名片`
      : `${name}'s Instagram creator card`

  return { title, description, alt }
}

export async function generateMetadata({ params }: PublicCardPageProps): Promise<Metadata> {
  const resolvedParams = await params
  const locale: "zh-TW" | "en" = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const id = resolvedParams.id

  const origin = getSiteOrigin()
  const canonicalPath = `/${locale}/card/${encodeURIComponent(id)}`
  const canonicalUrl = `${origin}${canonicalPath}`

  const generic = buildLocalizedSeo(locale, {
    displayName: locale === "zh-TW" ? "IG 創作者" : "Instagram Creator",
    username: null,
    primaryNiche: null,
    aboutText: null,
  })

  try {
    const viaApi = await fetchCreatorCardViaPublicEndpoint(id)
    const cardRes = viaApi.data ? viaApi : await fetchCreatorCard(id)
    const card = cardRes.data

    if (!card) {
      return {
        title: generic.title,
        description: generic.description,
        alternates: { canonical: canonicalUrl },
        openGraph: {
          title: generic.title,
          description: generic.description,
          url: canonicalUrl,
          type: "website",
        },
        twitter: {
          card: "summary_large_image",
          title: generic.title,
          description: generic.description,
        },
      }
    }

    const normalized = normalizeCreatorCardForPreview(card)
    const seo = buildLocalizedSeo(locale, {
      displayName: normalized.displayName || (locale === "zh-TW" ? "IG 創作者" : "Instagram Creator"),
      username: normalized.username ? String(normalized.username) : null,
      primaryNiche: normalized.primaryNiche ? String(normalized.primaryNiche) : null,
      aboutText: normalized.aboutText ? String(normalized.aboutText) : null,
    })

    const profileImg = normalized.profileImageUrl ? String(normalized.profileImageUrl) : null
    const featuredImg = pickFirstFeaturedImage(normalized)
    const imageAbs = toAbsoluteUrl(origin, profileImg || featuredImg)

    const handleForTitle = normalized.username ? `@${sanitizeOneLine(String(normalized.username))}` : ""
    const title = handleForTitle ? `${seo.title} (${handleForTitle})` : seo.title

    return {
      title,
      description: seo.description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title,
        description: seo.description,
        url: canonicalUrl,
        type: "profile",
        ...(imageAbs
          ? {
              images: [
                {
                  url: imageAbs,
                  alt: seo.alt,
                },
              ],
            }
          : null),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: seo.description,
        ...(imageAbs ? { images: [imageAbs] } : null),
      },
    }
  } catch {
    return {
      title: generic.title,
      description: generic.description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: generic.title,
        description: generic.description,
        url: canonicalUrl,
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: generic.title,
        description: generic.description,
      },
    }
  }
}

async function fetchCreatorCardViaPublicEndpoint(id: string): Promise<FetchResult> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || ""
    const origin = base && base.startsWith("http") ? base : null
    const url = new URL("/api/creator-card/public-card", origin ?? "http://localhost:3000")
    url.searchParams.set("id", id)

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" })
    const json: any = await res.json().catch(() => null)
    if (!res.ok || !json?.ok || !json?.card) {
      return { data: null, errorType: res.status === 404 ? "not_found" : "service_error" }
    }

    // Adapt to CreatorCardData-ish shape expected by normalizer
    const c = json.card
    const data: any = {
      id: String(c.cardId || c.id || id),
      ig_username: typeof c.username === "string" ? c.username : null,
      display_name: typeof c.displayName === "string" ? c.displayName : null,
      niche: typeof c.primaryNiche === "string" ? c.primaryNiche : null,
      primary_niche: typeof c.primaryNiche === "string" ? c.primaryNiche : null,
      profile_image_url: typeof c.profileImageUrl === "string" ? c.profileImageUrl : null,
      avatar_url: typeof c.profileImageUrl === "string" ? c.profileImageUrl : null,
      is_public: true,
      about_text: typeof c.aboutText === "string" ? c.aboutText : null,
      audience: typeof c.aboutText === "string" ? c.aboutText : null,
      theme_types: Array.isArray(c.themeTypes) ? c.themeTypes : null,
      audience_profiles: Array.isArray(c.audienceProfiles) ? c.audienceProfiles : null,
      deliverables: Array.isArray(c.deliverables) ? c.deliverables : null,
      collaboration_niches: Array.isArray(c.collaborationNiches) ? c.collaborationNiches : null,
      past_collaborations: Array.isArray(c.pastCollaborations) ? c.pastCollaborations : null,
      portfolio: Array.isArray(c.featuredItems) ? c.featuredItems : null,
      contact: null,
    }

    return { data }
  } catch {
    return { data: null, errorType: "service_error" }
  }
}

interface CreatorCardData {
  id: string
  ig_username: string | null
  display_name: string | null
  niche: string | null
  primary_niche: string | null
  profile_image_url: string | null
  avatar_url?: string | null
  is_public: boolean
  about_text: string | null
  audience: string | null
  min_price?: number | null
  theme_types: string[] | null
  audience_profiles: string[] | null
  deliverables: string[] | null
  collaboration_niches: string[] | null
  past_collaborations: string[] | null
  portfolio: unknown[] | null
  contact: any
}

interface FetchResult {
  data: CreatorCardData | null
  errorType?: "env_missing" | "service_error" | "not_found"
}

async function fetchCreatorCard(id: string): Promise<FetchResult> {
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    // Check if service role key is available
    if (!hasServiceRoleKey) {
      console.error(JSON.stringify({
        route: "public-card",
        id,
        hasServiceRoleKey: false,
        errorType: "env_missing",
        queryStage: "env_check",
        returnedNull: true,
      }))
      return { data: null, errorType: "env_missing" }
    }

    // Use service client to bypass RLS, but enforce is_public=true for safety
    const supabase = createServiceClient()

    // Simplified query - select only essential fields that definitely exist
    const { data, error } = await supabase
      .from("creator_cards")
      .select("*")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle()

    if (error) {
      console.error(JSON.stringify({
        route: "public-card",
        id,
        hasServiceRoleKey,
        queryStage: "base_card",
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        returnedNull: true,
      }))
      return { data: null, errorType: "service_error" }
    }

    if (!data) {
      console.error(JSON.stringify({
        route: "public-card",
        id,
        hasServiceRoleKey,
        queryStage: "base_card",
        errorType: "not_found",
        returnedNull: true,
      }))
      return { data: null, errorType: "not_found" }
    }

    return { data }
  } catch (error) {
    console.error(JSON.stringify({
      route: "public-card",
      id,
      hasServiceRoleKey,
      queryStage: "catch_block",
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      returnedNull: true,
    }))
    return { data: null, errorType: "service_error" }
  }
}

// Helper: Proxy URL through /api/ig/thumbnail if needed
function ensureProxiedThumbnail(url: string): string {
  if (!url) return ""
  if (url.startsWith("/api/ig/thumbnail?url=")) return url
  if (url.startsWith("http")) {
    return `/api/ig/thumbnail?url=${encodeURIComponent(url)}`
  }
  return url
}

// Normalize creator card data to match shared component expectations
function normalizeCreatorCardForPreview(card: CreatorCardData) {
  const rawMinPrice = typeof card.min_price === "number" && Number.isFinite(card.min_price) ? Math.floor(card.min_price) : null
  const minPrice = rawMinPrice == null ? null : Math.max(1000, rawMinPrice)

  // Extract featured items from portfolio-ish fields (priority order)
  const candidates = [
    card.portfolio,
    (card.portfolio as any)?.items,
    (card as any).featuredItems,
    (card as any).featured_items,
    (card as any).featuredItems?.items,
    (card as any).featured_items?.items,
  ]

  let rawItems: any[] = []
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      rawItems = candidate
      break
    }
  }

  const featuredItems = rawItems
    .map((item: any, idx: number) => {
      if (!item || typeof item !== "object") return null

      // Extract URL from various possible keys
      const url = item.url || item.permalink || item.link || item.href || item.postUrl || item.post_url || ""

      // Extract raw thumbnail - avoid .mp4 files
      let rawThumb = item.thumbnailUrl || item.thumbnail_url || item.media_url || item.mediaUrl || item.thumbUrl || item.thumb_url || item.imageUrl || item.image_url || ""
      
      // If rawThumb is .mp4, skip it and try other fields
      if (rawThumb && /\.mp4(\?|$)/i.test(rawThumb)) {
        rawThumb = item.thumbnail_url || item.thumbnailUrl || ""
      }

      // Determine thumbnail URL
      const proxiedThumb = rawThumb ? ensureProxiedThumbnail(rawThumb) : ""

      if (!url && !proxiedThumb) return null

      return {
        ...item,
        id: item.id || `manual-${idx}`,
        type: "ig",
        isAdded: true,
        url: url || undefined,
        thumbnailUrl: proxiedThumb,
        thumbnail_url: proxiedThumb,
      }
    })
    .filter(Boolean)

  return {
    profileImageUrl: card.avatar_url || card.profile_image_url,
    displayName: card.display_name || card.ig_username,
    username: card.ig_username,
    aboutText: card.about_text || card.audience,
    primaryNiche: card.primary_niche || card.niche,
    minPrice,
    contact: card.contact,
    featuredItems,
    deliverables: card.deliverables || [],
    collaborationNiches: card.collaboration_niches || [],
    themeTypes: card.theme_types || [],
    audienceProfiles: card.audience_profiles || [],
    pastCollaborations: card.past_collaborations || [],
    cardId: card.id,
  }
}

export default async function PublicCardPage({ params }: PublicCardPageProps) {
  const resolvedParams = await params
  const locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const id = resolvedParams.id

  const viaApi = await fetchCreatorCardViaPublicEndpoint(id)
  const { data: card, errorType } = viaApi.data ? viaApi : await fetchCreatorCard(id)

  // Show friendly error UI instead of generic 404
  if (!card) {
    return <PublicCardErrorState locale={locale} errorType={errorType || "not_found"} />
  }

  const normalizedCard = normalizeCreatorCardForPreview(card)
  const messages = locale === "zh-TW" ? messagesZhTW : messagesEn

  return <PublicCardClient locale={locale} creatorCard={normalizedCard} messages={messages} />
}
