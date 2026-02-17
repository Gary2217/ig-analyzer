import type { SupabaseClient } from "@supabase/supabase-js"

type ReadMediaParams = {
  authed: SupabaseClient
  userId: string
  igUserId: string
  limit: number
  staleMs: number
}

export async function readIgMediaItems(params: ReadMediaParams) {
  const { data, error } = await params.authed
    .from("ig_media_items")
    .select("media_id, media_type, permalink, caption, taken_at, thumbnail_url, media_url, like_count, comments_count, updated_at, raw")
    .eq("user_id", params.userId)
    .eq("ig_user_id", params.igUserId)
    .order("taken_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, params.limit)))

  if (error) return { ok: false as const, error }
  const list = Array.isArray(data) ? data : []
  const first = list[0] as any
  const updatedAtMs = typeof first?.updated_at === "string" ? Date.parse(first.updated_at) : NaN
  const isFresh = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= params.staleMs
  return { ok: true as const, list, isFresh }
}

export async function upsertIgMediaItems(params: {
  authed: SupabaseClient
  rows: any[]
}) {
  const rows = Array.isArray(params.rows) ? params.rows : []
  if (rows.length === 0) return { ok: true as const }

  const { error } = await params.authed.from("ig_media_items").upsert(rows as any, {
    onConflict: "user_id,ig_user_id,media_id",
  })

  if (error) return { ok: false as const, error }
  return { ok: true as const }
}

export async function readIgPostAnalysisCache(params: {
  authed: SupabaseClient
  userId: string
  normalizedPermalink: string
  staleMs: number
}) {
  const { data, error } = await params.authed
    .from("ig_post_analysis_cache")
    .select(
      "normalized_permalink, original_permalink, media_id, media_type, permalink, taken_at, caption, thumbnail_url, media_url, like_count, comments_count, insights, computed, raw, analyzed_at, created_at, updated_at",
    )
    .eq("user_id", params.userId)
    .eq("normalized_permalink", params.normalizedPermalink)
    .limit(1)
    .maybeSingle()

  if (error || !data) return { ok: false as const }
  const updatedAtMs = typeof (data as any).updated_at === "string" ? Date.parse((data as any).updated_at) : NaN
  const isFresh = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= params.staleMs
  return { ok: true as const, row: data as any, isFresh }
}

export async function upsertIgPostAnalysisCache(params: {
  authed: SupabaseClient
  row: Record<string, unknown>
}) {
  const { error } = await params.authed.from("ig_post_analysis_cache").upsert(params.row as any, {
    onConflict: "user_id,normalized_permalink",
  })

  if (error) return { ok: false as const, error }
  return { ok: true as const }
}
