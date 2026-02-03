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

const BUCKET = "creator-card-avatars"
const MAX_BYTES = 5 * 1024 * 1024

function inferExt(file: File) {
  const t = (file.type || "").toLowerCase()
  if (t === "image/png") return "png"
  if (t === "image/webp") return "webp"
  if (t === "image/jpeg" || t === "image/jpg") return "jpg"

  const name = (file.name || "").trim()
  const parts = name.split(".")
  const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
  if (last === "png" || last === "webp" || last === "jpg" || last === "jpeg") return last === "jpeg" ? "jpg" : last
  return "jpg"
}

async function ensureBucketPublic(supabase: ReturnType<typeof createServiceClient>) {
  try {
    const res = await supabase.storage.getBucket(BUCKET)
    if ((res as any)?.data) return { ok: true as const }
  } catch {
  }

  try {
    const created = await supabase.storage.createBucket(BUCKET, { public: true })
    if ((created as any)?.error) {
      const msg = typeof (created as any).error?.message === "string" ? (created as any).error.message : ""
      if (msg.toLowerCase().includes("already exists")) return { ok: true as const }
      return { ok: false as const, error: msg || "create_bucket_failed" }
    }
    return { ok: true as const }
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "create_bucket_failed"
    return { ok: false as const, error: msg }
  }
}

export async function POST(req: NextRequest) {
  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 })
    }

    const c = await cookies()
    const igUserId = pickCookieTrim(c, "ig_user_id", "igUserId", "ig_ig_id", "ig_id")
    const igUsername = pickCookieTrim(c, "ig_username", "igUsername", "ig_handle", "igHandle")

    if (!igUserId) {
      return NextResponse.json({ ok: false, error: "missing_ig_user_id" }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get("file")

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 })
    }

    const type = (file.type || "").toLowerCase()
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"])
    if (!allowed.has(type)) {
      return NextResponse.json({ ok: false, error: "invalid_file_type" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "file_too_large_max_5mb" }, { status: 400 })
    }

    const supabase = createServiceClient()

    const bucketOk = await ensureBucketPublic(supabase)
    if (!bucketOk.ok) {
      return NextResponse.json({ ok: false, error: "bucket_setup_failed" }, { status: 500 })
    }

    const findByUser = await supabase
      .from("creator_cards")
      .select("id, user_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if ((findByUser as any)?.error) {
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 })
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
        return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 })
      }

      const row = (findByIg as any)?.data
      if (row && typeof row === "object") {
        cardId = typeof (row as any).id === "string" ? String((row as any).id) : ""
        const owner = typeof (row as any).user_id === "string" ? String((row as any).user_id) : null
        if (cardId && owner == null) {
          await supabase.from("creator_cards").update({ user_id: user.id }).eq("id", cardId)
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

      const inserted = await supabase
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

      if ((inserted as any)?.error) {
        return NextResponse.json({ ok: false, error: "create_card_failed" }, { status: 500 })
      }

      cardId = typeof (inserted as any)?.data?.id === "string" ? String((inserted as any).data.id) : ""
      if (!cardId) {
        return NextResponse.json({ ok: false, error: "create_card_failed" }, { status: 500 })
      }
    }

    const ext = inferExt(file)
    const objectPath = `creator_cards/${cardId}/${Date.now()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: "31536000",
      })

    if ((upload as any)?.error) {
      const msg = typeof (upload as any).error?.message === "string" ? (upload as any).error.message : "upload_failed"
      return NextResponse.json({ ok: false, error: "upload_failed", message: msg }, { status: 500 })
    }

    const pub = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
    const avatarUrl = (pub as any)?.data?.publicUrl ? String((pub as any).data.publicUrl) : ""

    if (!avatarUrl) {
      return NextResponse.json({ ok: false, error: "public_url_failed" }, { status: 500 })
    }

    const updated = await supabase
      .from("creator_cards")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .select("id")
      .maybeSingle()

    if ((updated as any)?.error) {
      return NextResponse.json({ ok: false, error: "db_update_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, avatarUrl })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    return NextResponse.json({ ok: false, error: "unexpected_error", message: msg.slice(0, 400) }, { status: 500 })
  }
}
