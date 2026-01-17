import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ creatorId: string }> },
) {
  try {
    const { creatorId } = await context.params
    const id = String(creatorId ?? "").trim()
    if (!id) return NextResponse.json({ ok: false, error: "missing_creator_id" }, { status: 400 })

    const { data, error } = await supabaseServer
      .from("creator_stats")
      .select("creator_id, engagement_rate_pct, followers, avg_likes, avg_comments, updated_at")
      .eq("creator_id", id)
      .limit(1)
      .maybeSingle()

    if (error) {
      if (typeof (error as any)?.message === "string" && ((error as any).message as string).includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    if (!data) return NextResponse.json({ ok: true, stats: null })

    const stats = {
      creatorId: (data as any).creator_id as string,
      engagementRatePct: (data as any).engagement_rate_pct as number | null,
      followers: (data as any).followers as number | null,
      avgLikes: (data as any).avg_likes as number | null,
      avgComments: (data as any).avg_comments as number | null,
      updatedAt: (data as any).updated_at as string | null,
    }

    return NextResponse.json({ ok: true, stats })
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "unknown"
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
