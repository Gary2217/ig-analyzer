import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const THUMB_BUCKET = "thumb-cache"
const THUMB_TABLE = "ig_thumbnail_cache"
const BATCH_LIMIT = 500

export async function GET(request: NextRequest) {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim()
  const auth = request.headers.get("authorization") ?? ""
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase env vars" }, { status: 500 })
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  try {
    // 1) Fetch expired rows (url_hash + storage_path)
    const { data: rows, error: selErr } = await sb
      .from(THUMB_TABLE)
      .select("url_hash, storage_path")
      .lte("expires_at", new Date().toISOString())
      .limit(BATCH_LIMIT)

    if (selErr) {
      console.error("[cron/purge-thumbnail-cache] select error", selErr.message)
      return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 })
    }

    const expired = rows ?? []
    if (expired.length === 0) {
      console.log("[cron/purge-thumbnail-cache] nothing to purge")
      return NextResponse.json({ ok: true, purged: 0, storagePurged: 0 })
    }

    const hashes = expired.map((r) => r.url_hash as string)
    const paths = expired.map((r) => r.storage_path as string)

    // 2) Delete DB rows
    const { error: delErr } = await sb
      .from(THUMB_TABLE)
      .delete()
      .in("url_hash", hashes)

    if (delErr) {
      console.error("[cron/purge-thumbnail-cache] delete error", delErr.message)
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
    }

    // 3) Best-effort Storage removal
    let storagePurged = 0
    try {
      const { data: removed } = await sb.storage.from(THUMB_BUCKET).remove(paths)
      storagePurged = removed?.length ?? 0
    } catch {
      // best-effort; ignore storage errors
    }

    console.log(`[cron/purge-thumbnail-cache] purged ${expired.length} DB rows, ${storagePurged} storage objects`)
    return NextResponse.json({ ok: true, purged: expired.length, storagePurged })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[cron/purge-thumbnail-cache] unexpected error", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
