import { MatchmakingClient } from "./MatchmakingClient"
import { createPublicClient } from "@/lib/supabase/server"
import type { CreatorCard } from "./types"

export const dynamic = "force-dynamic"

interface MatchmakingPageProps {
  params: Promise<{
    locale: string
  }>
}

async function fetchPublicCreatorCards(localePrefix: string): Promise<CreatorCard[]> {
  try {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_cards")
      .select("id, ig_username, niche, profile_image_url, is_verified, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Error fetching public creator cards:", error)
      return []
    }

    // Map DB fields to CreatorCard type
    return (data || []).map((card) => ({
      id: card.id,
      displayName: card.ig_username,
      avatarUrl: card.profile_image_url || "",
      category: card.niche || "Creator",
      followerCount: 0,
      engagementRate: null,
      isVerified: card.is_verified ?? false,
      profileUrl: `${localePrefix}/creator/${card.ig_username}`,
    }))
  } catch (error) {
    console.error("Error fetching creator cards:", error)
    return []
  }
}

export default async function MatchmakingPage({ params }: MatchmakingPageProps) {
  const resolvedParams = await params
  const locale = resolvedParams.locale === "zh-TW" ? "zh-TW" : "en"
  const localePrefix = locale === "zh-TW" ? "/zh-TW" : "/en"

  // Fetch real creator cards ordered by updated_at desc
  const creatorCards = await fetchPublicCreatorCards(localePrefix)

  return <MatchmakingClient locale={locale} initialCards={creatorCards} />
}
