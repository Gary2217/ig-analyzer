export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient, createServiceClient } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function pickCookieTrim(c: Awaited<ReturnType<typeof cookies>>, ...keys: string[]) {
  for (const k of keys) {
    const v = (c.get(k)?.value ?? "").trim()
    if (v) return v
  }
  return ""
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64)
}

function makeRequestId() {
  try {
    const g = globalThis as any
    const maybeCrypto = g?.crypto
    if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
      return String(maybeCrypto.randomUUID())
    }
  } catch {
    // swallow
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function withRequestId(res: NextResponse, requestId: string) {
  try {
    res.headers.set("x-request-id", requestId)
  } catch {
    // swallow
  }
  return res
}

async function clearAvatarFieldsBestEffort(opts: {
  supabase: ReturnType<typeof createServiceClient>
  cardId: string
  userId: string
}) {
  const { supabase, cardId, userId } = opts
  const nowIso = new Date().toISOString()

  const attempt1 = await supabase
    .from("creator_cards")
    .update({
      avatar_url: null,
      avatar_storage_path: null,
      avatar_updated_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()

  if (!(attempt1 as any)?.error) return { ok: true as const }

  const attempt2 = await supabase
    .from("creator_cards")
    .update({ avatar_url: null, updated_at: nowIso })
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()

  if ((attempt2 as any)?.error) return { ok: false as const, error: (attempt2 as any).error }
  return { ok: true as const, partial: true as const }
}

export async function POST(req: NextRequest) {
  try {
    const requestId = makeRequestId()

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return withRequestId(NextResponse.json({ ok: false, error: "not_logged_in", requestId }, { status: 401 }), requestId)
    }

    const c = await cookies()
    const igUserId = pickCookieTrim(c, "ig_user_id", "igUserId", "ig_ig_id", "ig_id")
    const igUsername = pickCookieTrim(c, "ig_username", "igUsername", "ig_handle", "igHandle")

    if (!igUserId) {
      return withRequestId(NextResponse.json({ ok: false, error: "missing_ig_user_id", requestId }, { status: 400 }), requestId)
    }

    const supabase = createServiceClient()

    const findByUser = await supabase
      .from("creator_cards")
      .select("id, user_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if ((findByUser as any)?.error) {
      return withRequestId(NextResponse.json({ ok: false, error: "db_error", requestId }, { status: 500 }), requestId)
    }

    let cardId = typeof (findByUser as any)?.data?.id === "string" ? String((findByUser as any).data.id) : ""

    if (!cardId) {
      const findByIg = await supabase
        .from("creator_cards")
        .select("id, user_id")
        .eq("ig_user_id", igUserId)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if ((findByIg as any)?.error) {
        return withRequestId(NextResponse.json({ ok: false, error: "db_error", requestId }, { status: 500 }), requestId)
      }

      const row = (findByIg as any)?.data
      if (row && typeof row === "object") {
        cardId = typeof (row as any).id === "string" ? String((row as any).id) : ""
        const owner = typeof (row as any).user_id === "string" ? String((row as any).user_id) : null
        if (cardId && owner == null) {
          try {
            await supabase.from("creator_cards").update({ user_id: user.id }).eq("id", cardId)
          } catch {
            // swallow
          }
        }
      }
    }

    if (!cardId) {
      const base = slugify(igUsername || "creator") || "creator"
      let candidate = `${base}-${igUserId.slice(-6)}`.slice(0, 64)
      if (!candidate) candidate = `creator-${igUserId.slice(-6)}`

      for (let i = 0; i < 5; i++) {
        const check = await supabase.from("creator_cards").select("id").eq("handle", candidate).limit(1).maybeSingle()
        if (!(check as any)?.data) break
        candidate = `${base}-${Math.floor(1000 + Math.random() * 9000)}`
      }

      let inserted: any
      try {
        inserted = await supabase
          .from("creator_cards")
          .insert({
            user_id: user.id,
            ig_user_id: igUserId,
            ig_username: igUsername || null,
            handle: candidate,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle()
      } catch (e: unknown) {
        const errObj = asRecord(e)
        const msg = typeof errObj?.message === "string" ? errObj.message : "create_card_failed"
        return withRequestId(NextResponse.json({ ok: false, error: "create_card_failed", message: msg, requestId }, { status: 500 }), requestId)
      }

      if ((inserted as any)?.error) {
        return withRequestId(NextResponse.json({ ok: false, error: "create_card_failed", requestId }, { status: 500 }), requestId)
      }

      cardId = typeof (inserted as any)?.data?.id === "string" ? String((inserted as any).data.id) : ""
      if (!cardId) {
        return withRequestId(NextResponse.json({ ok: false, error: "create_card_failed", requestId }, { status: 500 }), requestId)
      }
    }

    const cleared = await clearAvatarFieldsBestEffort({ supabase, cardId, userId: user.id })
    if (!cleared.ok) {
      return withRequestId(NextResponse.json({ ok: false, error: "db_update_failed", requestId }, { status: 500 }), requestId)
    }

    return withRequestId(NextResponse.json({ ok: true, avatarUrl: null }), requestId)
  } catch (e: unknown) {
    const requestId = makeRequestId()
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    return withRequestId(
      NextResponse.json({ ok: false, error: "unexpected_error", message: msg.slice(0, 400), requestId }, { status: 500 }),
      requestId,
    )
  }
}
