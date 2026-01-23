import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_cards")
      .select("id, ig_username, niche, follower_count, engagement_rate, profile_image_url, is_verified, collaboration_methods, updated_at")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Error fetching public creator cards:", error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, cards: data || [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
