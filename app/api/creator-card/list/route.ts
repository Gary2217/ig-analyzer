import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from("creator_cards")
      .select("id, ig_username, niche, profile_image_url, avatar_url, updated_at, min_price")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Error fetching public creator cards:", error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    const cards = (data || []).map((row: any) => {
      return {
        ...row,
        avatarUrl: typeof row?.avatar_url === "string" ? row.avatar_url : null,
        minPrice: typeof row?.min_price === "number" ? row.min_price : null,
      }
    })

    return NextResponse.json({ ok: true, cards })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
