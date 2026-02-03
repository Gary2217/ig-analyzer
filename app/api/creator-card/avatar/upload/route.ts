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

function parseSupabasePublicObjectPathFromAvatarUrl(opts: {
  avatarUrl: string
  supabaseUrl: string
  bucket: string
  requiredPrefix: string
}): string | null {
  const { avatarUrl, supabaseUrl, bucket, requiredPrefix } = opts
  const raw = (avatarUrl || "").trim()
  if (!raw) return null

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }

  let supa: URL
  try {
    supa = new URL((supabaseUrl || "").trim())
  } catch {
    return null
  }

  if (!u.hostname || u.hostname !== supa.hostname) return null

  const publicPrefix = `/storage/v1/object/public/${bucket}/`
  if (!u.pathname.startsWith(publicPrefix)) return null

  const objectPath = u.pathname.slice(publicPrefix.length)
  if (!objectPath.startsWith(requiredPrefix)) return null

  return objectPath
}

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

function makeRequestId() {
  try {
    const g = (globalThis as any)
    const maybeCrypto = g?.crypto
    if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
      return String(maybeCrypto.randomUUID())
    }
  } catch {
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function withRequestId(res: NextResponse, requestId: string) {
  try {
    res.headers.set("x-request-id", requestId)
  } catch {
  }
  return res
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
    const requestId = makeRequestId()
    const ct = req.headers.get("content-type") || ""
    const ua = req.headers.get("user-agent") || ""
    const pathname = (() => {
      try {
        return new URL(req.url).pathname
      } catch {
        return ""
      }
    })()
    console.log("[creator-card avatar] upload request", { requestId, method: req.method, path: pathname, contentType: ct, userAgent: ua })

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return withRequestId(NextResponse.json({ ok: false, error: "not_logged_in", requestId }, { status: 401 }), requestId)
    }

    if (!ct.toLowerCase().includes("multipart/form-data")) {
      return withRequestId(NextResponse.json({ ok: false, error: "invalid_content_type", requestId }, { status: 415 }), requestId)
    }

    const c = await cookies()
    const igUserId = pickCookieTrim(c, "ig_user_id", "igUserId", "ig_ig_id", "ig_id")
    const igUsername = pickCookieTrim(c, "ig_username", "igUsername", "ig_handle", "igHandle")

    if (!igUserId) {
      return withRequestId(NextResponse.json({ ok: false, error: "missing_ig_user_id", requestId }, { status: 400 }), requestId)
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch (e: unknown) {
      const errObj = asRecord(e)
      const msg = typeof errObj?.message === "string" ? errObj.message : "formdata_parse_failed"
      console.error("[creator-card avatar] formData parse failed", { requestId, message: msg })
      return withRequestId(NextResponse.json({ ok: false, error: "invalid_multipart", requestId }, { status: 400 }), requestId)
    }

    const keys = Array.from(formData.keys())
    console.log("[creator-card avatar] formData keys", { requestId, keys })
    for (const k of keys) {
      const v = formData.get(k)
      if (v instanceof File) {
        console.log("[creator-card avatar] formData file", {
          requestId,
          key: k,
          name: v.name,
          type: v.type,
          size: v.size,
        })
      } else {
        console.log("[creator-card avatar] formData field", {
          requestId,
          key: k,
          type: typeof v,
        })
      }
    }

    const file = formData.get("file") ?? formData.get("avatar") ?? formData.get("image")

    if (!file || !(file instanceof File)) {
      return withRequestId(NextResponse.json({ ok: false, error: "file_missing", requestId }, { status: 400 }), requestId)
    }

    const type = (file.type || "").toLowerCase()
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"])
    if (!allowed.has(type)) {
      return withRequestId(NextResponse.json({ ok: false, error: "invalid_file_type", requestId }, { status: 400 }), requestId)
    }

    if (file.size > MAX_BYTES) {
      return withRequestId(NextResponse.json({ ok: false, error: "file_too_large_max_5mb", requestId }, { status: 400 }), requestId)
    }

    const supabase = createServiceClient()

    const bucketOk = await ensureBucketPublic(supabase)
    if (!bucketOk.ok) {
      console.error("[creator-card avatar] bucket setup failed", { requestId, error: (bucketOk as any).error })
      return withRequestId(NextResponse.json({ ok: false, error: "bucket_setup_failed", requestId }, { status: 500 }), requestId)
    }

    const findByUser = await supabase
      .from("creator_cards")
      .select("id, user_id, avatar_url")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if ((findByUser as any)?.error) {
      console.error("[creator-card avatar] db lookup by user failed", {
        requestId,
        message: typeof (findByUser as any).error?.message === "string" ? (findByUser as any).error.message : "db_error",
      })
      return withRequestId(NextResponse.json({ ok: false, error: "db_error", requestId }, { status: 500 }), requestId)
    }

    let cardId = typeof (findByUser as any)?.data?.id === "string" ? String((findByUser as any).data.id) : ""
    let oldAvatarUrl = typeof (findByUser as any)?.data?.avatar_url === "string" ? String((findByUser as any).data.avatar_url) : ""

    if (!cardId) {
      const findByIg = await supabase
        .from("creator_cards")
        .select("id, user_id, avatar_url")
        .eq("ig_user_id", igUserId)
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if ((findByIg as any)?.error) {
        console.error("[creator-card avatar] db lookup by ig failed", {
          requestId,
          message: typeof (findByIg as any).error?.message === "string" ? (findByIg as any).error.message : "db_error",
        })
        return withRequestId(NextResponse.json({ ok: false, error: "db_error", requestId }, { status: 500 }), requestId)
      }

      const row = (findByIg as any)?.data
      if (row && typeof row === "object") {
        cardId = typeof (row as any).id === "string" ? String((row as any).id) : ""
        oldAvatarUrl = typeof (row as any).avatar_url === "string" ? String((row as any).avatar_url) : ""
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
        console.error("[creator-card avatar] create card failed", {
          requestId,
          message: typeof (inserted as any).error?.message === "string" ? (inserted as any).error.message : "create_card_failed",
        })
        return withRequestId(NextResponse.json({ ok: false, error: "create_card_failed", requestId }, { status: 500 }), requestId)
      }

      cardId = typeof (inserted as any)?.data?.id === "string" ? String((inserted as any).data.id) : ""
      if (!cardId) {
        return withRequestId(NextResponse.json({ ok: false, error: "create_card_failed", requestId }, { status: 500 }), requestId)
      }
    }

    const ext = inferExt(file)
    const objectPath = `creator_cards/${cardId}/${Date.now()}.${ext}`
    const oldObjectPath = oldAvatarUrl
      ? parseSupabasePublicObjectPathFromAvatarUrl({
          avatarUrl: oldAvatarUrl,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
          bucket: BUCKET,
          requiredPrefix: `creator_cards/${cardId}/`,
        })
      : null

    let buffer: Buffer
    try {
      buffer = Buffer.from(await file.arrayBuffer())
    } catch (e: unknown) {
      const errObj = asRecord(e)
      const msg = typeof errObj?.message === "string" ? errObj.message : "file_read_failed"
      console.error("[creator-card avatar] file read failed", { requestId, message: msg, fileType: file.type, fileSize: file.size })
      return withRequestId(NextResponse.json({ ok: false, error: "file_read_failed", requestId }, { status: 500 }), requestId)
    }

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: "31536000",
      })

    if ((upload as any)?.error) {
      const msg = typeof (upload as any).error?.message === "string" ? (upload as any).error.message : "upload_failed"
      console.error("[creator-card avatar] storage upload failed", { requestId, message: msg, bucket: BUCKET, objectPath })
      return withRequestId(NextResponse.json({ ok: false, error: "upload_failed", message: msg, requestId }, { status: 500 }), requestId)
    }

    const pub = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
    const avatarUrl = (pub as any)?.data?.publicUrl ? String((pub as any).data.publicUrl) : ""

    if (!avatarUrl) {
      console.error("[creator-card avatar] public url failed", { requestId, bucket: BUCKET, objectPath })
      return withRequestId(NextResponse.json({ ok: false, error: "public_url_failed", requestId }, { status: 500 }), requestId)
    }

    const updated = await supabase
      .from("creator_cards")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .select("id")
      .maybeSingle()

    if ((updated as any)?.error) {
      console.error("[creator-card avatar] db update failed", {
        requestId,
        message: typeof (updated as any).error?.message === "string" ? (updated as any).error.message : "db_update_failed",
      })
      return withRequestId(NextResponse.json({ ok: false, error: "db_update_failed", requestId }, { status: 500 }), requestId)
    }

    if (oldObjectPath && oldObjectPath !== objectPath) {
      try {
        const del = await supabase.storage.from(BUCKET).remove([oldObjectPath])
        if ((del as any)?.error) {
          const msg = typeof (del as any).error?.message === "string" ? (del as any).error.message : "delete_failed"
          console.warn("[creator-card avatar] old avatar delete failed", { requestId, cardId, oldObjectPath, message: msg })
        }
      } catch (e: unknown) {
        const errObj = asRecord(e)
        const msg = typeof errObj?.message === "string" ? errObj.message : "delete_failed"
        console.warn("[creator-card avatar] old avatar delete failed", { requestId, cardId, oldObjectPath, message: msg })
      }
    }

    return withRequestId(NextResponse.json({ ok: true, avatarUrl }), requestId)
  } catch (e: unknown) {
    const requestId = makeRequestId()
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    return withRequestId(
      NextResponse.json({ ok: false, error: "unexpected_error", message: msg.slice(0, 400), requestId }, { status: 500 }),
      requestId
    )
  }
}
