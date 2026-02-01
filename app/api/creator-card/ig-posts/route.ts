import { NextRequest, NextResponse } from "next/server"
import { createAuthedClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function GET(req: NextRequest) {
  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 200, headers: JSON_HEADERS })
    }

    const cardId = String(req.nextUrl.searchParams.get("cardId") ?? "").trim()
    if (!cardId || !isUuid(cardId)) {
      return NextResponse.json({ ok: false, error: "bad_card_id" }, { status: 400, headers: JSON_HEADERS })
    }

    const { data, error } = await authed
      .from("creator_card_ig_posts")
      .select("posts, snapshot_at, source")
      .eq("user_id", user.id)
      .eq("card_id", cardId)
      .limit(1)
      .maybeSingle()

    if (error) {
      const msg = typeof (error as any)?.message === "string" ? (error as any).message : "unknown"
      if (msg.includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: JSON_HEADERS })
    }

    if (!data) {
      return NextResponse.json({ ok: true, posts: null, snapshotAt: null, source: null }, { status: 200, headers: JSON_HEADERS })
    }

    const posts = Array.isArray((data as any).posts) ? ((data as any).posts as unknown[]) : null
    const snapshotAt = typeof (data as any).snapshot_at === "string" ? ((data as any).snapshot_at as string) : null
    const source = typeof (data as any).source === "string" ? ((data as any).source as string) : null

    return NextResponse.json({ ok: true, posts, snapshotAt, source }, { status: 200, headers: JSON_HEADERS })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: JSON_HEADERS })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 200, headers: JSON_HEADERS })
    }

    const bodyUnknown: unknown = await req.json().catch(() => null)
    const body = asRecord(bodyUnknown)
    if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400, headers: JSON_HEADERS })

    const cardId = typeof body.cardId === "string" ? body.cardId.trim() : ""
    if (!cardId || !isUuid(cardId)) {
      return NextResponse.json({ ok: false, error: "bad_card_id" }, { status: 400, headers: JSON_HEADERS })
    }

    const postsRaw = (body as any).posts
    const postsArr = Array.isArray(postsRaw) ? postsRaw.slice(0, 50) : null
    if (!postsArr) {
      return NextResponse.json({ ok: false, error: "bad_posts" }, { status: 400, headers: JSON_HEADERS })
    }

    const sourceRaw = (body as any).source
    const source: "local_cache" | "instagram_api" = sourceRaw === "local_cache" ? "local_cache" : "instagram_api"

    const payload = {
      user_id: user.id,
      card_id: cardId,
      posts: postsArr,
      snapshot_at: new Date().toISOString(),
      source,
    }

    const { error } = await authed
      .from("creator_card_ig_posts")
      .upsert(payload, { onConflict: "user_id,card_id" })

    if (error) {
      const msg = typeof (error as any)?.message === "string" ? (error as any).message : "unknown"
      if (msg.includes("Invalid API key")) {
        return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
      }
      return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: JSON_HEADERS })
    }

    return NextResponse.json({ ok: true }, { status: 200, headers: JSON_HEADERS })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500, headers: JSON_HEADERS })
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: JSON_HEADERS })
  }
}
