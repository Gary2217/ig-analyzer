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


type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return Boolean(v && typeof v === "object" && !Array.isArray(v))
}

function readNumberField(body: unknown, key: string): number {
  if (!isRecord(body)) return 0
  if (!(key in body)) return 0
  return Number(body[key])
}

function toFiniteNonNeg(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function toFiniteNonNegInt(v: unknown): number {
  const n = toFiniteNonNeg(v)
  return Math.floor(n)
}

export async function POST(req: NextRequest) {
  try {
    const creatorId = await resolveIgUserId(req)
    if (!creatorId) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 })

    const body = (await req.json().catch(() => null)) as unknown
    if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 })

    const engagementRatePct = toFiniteNonNeg(readNumberField(body, "engagementRatePct"))
    const followers = toFiniteNonNegInt(readNumberField(body, "followers"))
    const avgLikes = toFiniteNonNeg(readNumberField(body, "avgLikes"))
    const avgComments = toFiniteNonNeg(readNumberField(body, "avgComments"))

    const payload: Record<string, unknown> = {
      creator_id: creatorId,
      engagement_rate_pct: engagementRatePct,
      followers: Math.floor(followers),
      avg_likes: Math.round(avgLikes),
      avg_comments: Math.round(avgComments),
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
