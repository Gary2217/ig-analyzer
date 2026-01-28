import { notFound } from "next/navigation"
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

interface CreatorCardData {
  id: string
  ig_username: string | null
  display_name: string | null
  niche: string | null
  primary_niche: string | null
  profile_image_url: string | null
  is_public: boolean
  about_text: string | null
  audience: string | null
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
    profileImageUrl: card.profile_image_url,
    displayName: card.display_name || card.ig_username,
    username: card.ig_username,
    aboutText: card.about_text || card.audience,
    primaryNiche: card.primary_niche || card.niche,
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

  const { data: card, errorType } = await fetchCreatorCard(id)

  // Show friendly error UI instead of generic 404
  if (!card) {
    return <PublicCardErrorState locale={locale} errorType={errorType || "not_found"} />
  }

  const normalizedCard = normalizeCreatorCardForPreview(card)
  const messages = locale === "zh-TW" ? messagesZhTW : messagesEn

  return <PublicCardClient locale={locale} creatorCard={normalizedCard} messages={messages} />
}
