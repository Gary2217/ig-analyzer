import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function resolveIgUserId(_req: NextRequest): Promise<string | null> {
  const c = await cookies()

  const cookieIgId = (c.get("ig_ig_id")?.value ?? "").trim()
  const legacyIgId = (c.get("ig_user_id")?.value ?? "").trim()

  if (cookieIgId) return cookieIgId
  if (legacyIgId) return legacyIgId
  return null
}

function finiteNumOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: NextRequest) {
  try {
    const creatorId = await resolveIgUserId(req)
    if (!creatorId) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 })

    const body = (await req.json().catch(() => null)) as any
    if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 })

    const engagementRatePct = finiteNumOrNull(body?.engagementRatePct)
    const followers = finiteNumOrNull(body?.followers)
    const avgLikes = finiteNumOrNull(body?.avgLikes)
    const avgComments = finiteNumOrNull(body?.avgComments)

    const payload: any = {
      creator_id: creatorId,
      engagement_rate_pct: engagementRatePct,
      followers: typeof followers === "number" ? Math.floor(followers) : null,
      avg_likes: typeof avgLikes === "number" ? Math.round(avgLikes) : null,
      avg_comments: typeof avgComments === "number" ? Math.round(avgComments) : null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseServer
      .from("creator_stats")
      .upsert(payload, { onConflict: "creator_id" })
      .select("creator_id, engagement_rate_pct, followers, avg_likes, avg_comments, updated_at")
      .maybeSingle()

    if (error) {
      if (typeof (error as any)?.message === "string" && ((error as any).message as string).includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, stats: data ?? null })
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "unknown"
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
