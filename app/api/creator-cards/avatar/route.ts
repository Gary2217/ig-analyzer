export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient, createServiceClient } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
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
    const g = globalThis as any
    const maybeCrypto = g?.crypto
    if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
      return String(maybeCrypto.randomUUID())
    }
  } catch {
    // ignore
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function withRequestId(res: NextResponse, requestId: string) {
  try {
    res.headers.set("x-request-id", requestId)
  } catch {
    // ignore
  }
  return res
}

const BUCKET = "creator-avatars"
const MAX_BYTES = 5 * 1024 * 1024

function isBucketNotReadyStorageError(err: any) {
  const msg = typeof err?.message === "string" ? err.message.toLowerCase() : ""
  const code = typeof err?.code === "string" ? err.code.toLowerCase() : ""
  const status = typeof err?.statusCode === "number" ? err.statusCode : typeof err?.status === "number" ? err.status : null

  if (status === 403 || status === 404) return true
  if (code.includes("bucket") && (code.includes("not") || code.includes("missing") || code.includes("forbidden"))) return true
  if (msg.includes("bucket") && (msg.includes("not") || msg.includes("missing") || msg.includes("exist") || msg.includes("forbidden") || msg.includes("permission"))) {
    return true
  }
  return false
}

async function updateAvatarFieldsBestEffort(opts: {
  supabase: ReturnType<typeof createServiceClient>
  cardId: string
  userId: string
  avatarUrl: string
  storagePath: string
}) {
  const { supabase, cardId, userId, avatarUrl, storagePath } = opts
  const nowIso = new Date().toISOString()

  const attempt1 = await supabase
    .from("creator_cards")
    .update({
      avatar_url: avatarUrl,
      avatar_storage_path: storagePath,
      avatar_updated_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()

  if (!(attempt1 as any)?.error) return { ok: true as const }

  const msg = typeof (attempt1 as any).error?.message === "string" ? String((attempt1 as any).error.message) : "db_update_failed"

  const attempt2 = await supabase
    .from("creator_cards")
    .update({
      avatar_url: avatarUrl,
      updated_at: nowIso,
    })
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()

  if ((attempt2 as any)?.error) {
    return { ok: false as const, error: msg }
  }

  return { ok: true as const, partial: true as const, warning: msg }
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

    const ct = req.headers.get("content-type") || ""
    if (!ct.toLowerCase().includes("multipart/form-data")) {
      return withRequestId(NextResponse.json({ ok: false, error: "invalid_content_type", requestId }, { status: 415 }), requestId)
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch (e: unknown) {
      const errObj = asRecord(e)
      const msg = typeof errObj?.message === "string" ? errObj.message : "formdata_parse_failed"
      return withRequestId(NextResponse.json({ ok: false, error: "invalid_multipart", message: msg, requestId }, { status: 400 }), requestId)
    }

    const file = formData.get("file")
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

    const findByUser = await supabase.from("creator_cards").select("id, user_id").eq("user_id", user.id).limit(1).maybeSingle()
    if ((findByUser as any)?.error) {
      return withRequestId(NextResponse.json({ ok: false, error: "db_error", requestId }, { status: 500 }), requestId)
    }

    const cardId = typeof (findByUser as any)?.data?.id === "string" ? String((findByUser as any).data.id) : ""
    if (!cardId) {
      return withRequestId(NextResponse.json({ ok: false, error: "no_creator_card", requestId }, { status: 400 }), requestId)
    }

    const ext = inferExt(file)
    const ts = Date.now()
    const storagePath = `${user.id}/${cardId}/avatar-${ts}.${ext}`

    let buffer: Buffer
    try {
      buffer = Buffer.from(await file.arrayBuffer())
    } catch (e: unknown) {
      const errObj = asRecord(e)
      const msg = typeof errObj?.message === "string" ? errObj.message : "file_read_failed"
      return withRequestId(NextResponse.json({ ok: false, error: "file_read_failed", message: msg, requestId }, { status: 500 }), requestId)
    }

    const upload = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "31536000",
    })

    if ((upload as any)?.error) {
      const err = (upload as any).error
      if (isBucketNotReadyStorageError(err)) {
        return withRequestId(
          NextResponse.json(
            { ok: false, error: "bucket_not_ready", message: "creator-avatars bucket missing or not permitted", requestId },
            { status: 500 },
          ),
          requestId,
        )
      }

      const msg = typeof err?.message === "string" ? err.message : "upload_failed"
      return withRequestId(NextResponse.json({ ok: false, error: "upload_failed", message: msg, requestId }, { status: 500 }), requestId)
    }

    const pub = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    const avatarUrl = (pub as any)?.data?.publicUrl ? String((pub as any).data.publicUrl) : ""

    if (!avatarUrl) {
      return withRequestId(NextResponse.json({ ok: false, error: "public_url_failed", requestId }, { status: 500 }), requestId)
    }

    const updated = await updateAvatarFieldsBestEffort({ supabase, cardId, userId: user.id, avatarUrl, storagePath })
    if (!updated.ok) {
      return withRequestId(NextResponse.json({ ok: false, error: "db_update_failed", requestId }, { status: 500 }), requestId)
    }

    return withRequestId(
      NextResponse.json({ ok: true, avatarUrl, avatarStoragePath: storagePath, requestId, warning: (updated as any).warning ?? null }),
      requestId,
    )
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
