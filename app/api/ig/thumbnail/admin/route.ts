import { NextRequest, NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { __thumbCache, THUMB_TTL_MS, THUMB_CACHE_MAX, THUMB_TABLE, THUMB_BUCKET } from "../_lib/cache"

export const runtime = "nodejs"

// ---------------------------------------------------------------------------
// Lazy Supabase admin client (service role, server-only)
// ---------------------------------------------------------------------------
let __sb: SupabaseClient | null = null
let __sbMissing = false

function getSupabaseAdmin(): SupabaseClient | null {
  if (__sbMissing) return null
  if (__sb) return __sb
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  if (!url || !key) { __sbMissing = true; return null }
  __sb = createClient(url, key, { auth: { persistSession: false } })
  return __sb
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function checkAuth(request: NextRequest): boolean {
  const secret = (process.env.ADMIN_SECRET ?? "").trim()
  if (!secret) return false
  return request.headers.get("x-admin-secret") === secret
}

// ---------------------------------------------------------------------------
// GET — memory + store stats
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let total: number | null = null
  let fresh: number | null = null
  let inlined: number | null = null

  const sb = getSupabaseAdmin()
  if (sb) {
    try {
      const now = new Date().toISOString()
      const [r1, r2, r3] = await Promise.all([
        sb.from(THUMB_TABLE).select("*", { count: "exact", head: true }),
        sb.from(THUMB_TABLE).select("*", { count: "exact", head: true }).gt("expires_at", now),
        sb.from(THUMB_TABLE).select("*", { count: "exact", head: true }).not("inline_bytes", "is", null),
      ])
      if (r1.error == null) total = r1.count ?? 0
      if (r2.error == null) fresh = r2.count ?? 0
      if (r3.error == null) inlined = r3.count ?? 0
    } catch {
      // leave as null
    }
  }

  return NextResponse.json({
    ok: true,
    memory: {
      size: __thumbCache.size,
      maxSize: THUMB_CACHE_MAX,
      ttlMs: THUMB_TTL_MS,
    },
    store: {
      table: THUMB_TABLE,
      bucket: THUMB_BUCKET,
      total,
      fresh,
      inlined,
    },
  })
}

// ---------------------------------------------------------------------------
// DELETE — purge memory cache + expired DB rows
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const memPurged = __thumbCache.size
  __thumbCache.clear()

  let expiredPurged: number | null = null
  const sb = getSupabaseAdmin()
  if (sb) {
    try {
      const { error, count } = await sb
        .from(THUMB_TABLE)
        .delete({ count: "exact" })
        .lte("expires_at", new Date().toISOString())
      if (!error) expiredPurged = count ?? 0
    } catch {
      // leave as null
    }
  }

  return NextResponse.json({
    ok: true,
    memory: { purged: memPurged },
    store: { expiredPurged },
  })
}
