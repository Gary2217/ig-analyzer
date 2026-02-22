import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// POST /api/cron/media-sync
// Fetches IG media for a given ig_account_id, upserts into media_raw,
// then recomputes media_daily_aggregate for affected days.
// Auth: x-cron-secret header OR x-vercel-cron header.
//
// Required env vars:
//   CRON_SECRET — shared secret; must match x-cron-secret header
//
// Request body (JSON):
//   { ig_account_id: string, lookback_days?: number }
// ---------------------------------------------------------------------------

const BUILD_MARKER = "cron-media-sync-v1"
const GRAPH_BASE = "https://graph.facebook.com/v24.0"
const MAX_MEDIA_ITEMS = 300
const baseHeaders = { "Cache-Control": "no-store", "x-build-marker": BUILD_MARKER } as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVercelCron(req: Request) {
  return req.headers.has("x-vercel-cron")
}

function todayUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function nowIso() {
  return new Date().toISOString()
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

function dateFromTimestamp(ts: string): string {
  return ts.slice(0, 10)
}

function lookbackCutoff(lookbackDays: number): string {
  const ms = Date.now() - lookbackDays * 86400_000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MediaRawRow = {
  user_id_text: string
  ig_account_id: string
  media_id: string
  media_type: string | null
  permalink: string | null
  caption: string | null
  media_timestamp: string | null
  like_count: number
  comments_count: number
  save_count: number
  share_count: number
  reach: number | null
  impressions: number | null
  plays: number | null
  raw_json: Record<string, unknown>
  updated_at: string
}

type InsightFailure = {
  media_id: string
  status: number
  message: string
}

// ---------------------------------------------------------------------------
// Fetch media list with paging (up to MAX_MEDIA_ITEMS)
// ---------------------------------------------------------------------------

async function fetchMediaList(
  igUserId: string,
  token: string,
  cutoffDay: string
): Promise<{ items: any[]; pagingPages: number }> {
  const fields = "id,media_type,timestamp,permalink,caption,like_count,comments_count"
  let url: string | null =
    `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/media` +
    `?fields=${fields}&limit=100&access_token=${token}`

  const items: any[] = []
  let pagingPages = 0
  let reachedCutoff = false

  while (url && items.length < MAX_MEDIA_ITEMS && !reachedCutoff) {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) break
    const json = await safeJson(res) as any
    const page: any[] = Array.isArray(json?.data) ? json.data : []
    pagingPages++

    for (const item of page) {
      if (!item?.id) continue
      const ts: string = typeof item.timestamp === "string" ? item.timestamp : ""
      const day = ts ? dateFromTimestamp(ts) : ""
      if (day && day < cutoffDay) {
        reachedCutoff = true
        break
      }
      items.push(item)
      if (items.length >= MAX_MEDIA_ITEMS) break
    }

    url = typeof json?.paging?.next === "string" ? json.paging.next : null
  }

  return { items, pagingPages }
}

// ---------------------------------------------------------------------------
// Fetch per-media insights (best-effort)
// ---------------------------------------------------------------------------

async function fetchMediaInsights(
  mediaId: string,
  mediaType: string | null,
  token: string
): Promise<{ reach: number | null; impressions: number | null; saves: number | null; shares: number | null; plays: number | null; ok: boolean; status?: number; message?: string }> {
  const isVideo = mediaType === "VIDEO" || mediaType === "REELS"
  const metrics = isVideo
    ? "impressions,reach,saved,shares,plays,video_views"
    : "impressions,reach,saved,shares"

  const url = `${GRAPH_BASE}/${encodeURIComponent(mediaId)}/insights` +
    `?metric=${metrics}&access_token=${token}`

  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) {
      let msg = `status_${res.status}`
      try { const b = await res.json() as any; msg = b?.error?.message ?? msg } catch { /* ignore */ }
      return { reach: null, impressions: null, saves: null, shares: null, plays: null, ok: false, status: res.status, message: msg }
    }
    const json = await safeJson(res) as any
    const data: any[] = Array.isArray(json?.data) ? json.data : []
    const get = (name: string): number | null => {
      const item = data.find((m: any) => m?.name === name)
      const v = item?.values?.[0]?.value ?? item?.value
      return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null
    }
    const plays = get("plays") ?? get("video_views")
    return { reach: get("reach"), impressions: get("impressions"), saves: get("saved"), shares: get("shares"), plays, ok: true }
  } catch (e: any) {
    return { reach: null, impressions: null, saves: null, shares: null, plays: null, ok: false, status: 0, message: e?.message ?? String(e) }
  }
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

async function runMediaSync(params: {
  igAccountId: string
  igUserId: string
  userId: string
  token: string
  lookbackDays: number
}) {
  const { igAccountId, igUserId, userId, token, lookbackDays } = params
  const userIdText = userId
  const cutoffDay = lookbackCutoff(lookbackDays)

  // 1) Fetch media list
  const { items, pagingPages } = await fetchMediaList(igUserId, token, cutoffDay)
  const mediaFetched = items.length

  // 2) Per-media insights + build rows
  const rows: MediaRawRow[] = []
  let insightFailures = 0
  let firstError: InsightFailure | null = null
  const affectedDays = new Set<string>()

  for (const item of items) {
    const mediaId: string = String(item.id)
    const mediaType: string | null = typeof item.media_type === "string" ? item.media_type : null
    const permalink: string | null = typeof item.permalink === "string" ? item.permalink : null
    const caption: string | null = typeof item.caption === "string" ? item.caption : null
    const ts: string | null = typeof item.timestamp === "string" ? item.timestamp : null
    const likeCount: number = typeof item.like_count === "number" ? item.like_count : 0
    const commentsCount: number = typeof item.comments_count === "number" ? item.comments_count : 0

    if (ts) {
      const day = dateFromTimestamp(ts)
      if (day >= cutoffDay) affectedDays.add(day)
    }

    // Per-media insights (best-effort)
    const ins = await fetchMediaInsights(mediaId, mediaType, token)
    if (!ins.ok) {
      insightFailures++
      if (!firstError) firstError = { media_id: mediaId, status: ins.status ?? 0, message: ins.message ?? "" }
    }

    rows.push({
      user_id_text: userIdText,
      ig_account_id: igAccountId,
      media_id: mediaId,
      media_type: mediaType,
      permalink,
      caption,
      media_timestamp: ts,
      like_count: likeCount,
      comments_count: commentsCount,
      save_count: typeof ins.saves === "number" ? ins.saves : 0,
      share_count: typeof ins.shares === "number" ? ins.shares : 0,
      reach: ins.reach,
      impressions: ins.impressions,
      plays: ins.plays,
      raw_json: { media: item },
      updated_at: nowIso(),
    })
  }

  // 3) Upsert media_raw
  let mediaUpserted = 0
  if (rows.length > 0) {
    const { error: upsertErr } = await supabaseServer
      .from("media_raw")
      .upsert(rows, { onConflict: "user_id_text,ig_account_id,media_id" })
    if (!upsertErr) mediaUpserted = rows.length
    else console.warn("[cron/media-sync] media_raw upsert error", { message: upsertErr.message })
  }

  // 4) Recompute daily aggregates for affected days
  const daysRecomputed: string[] = []
  let rowsAggregated = 0

  for (const day of Array.from(affectedDays).sort()) {
    const { data: dayRows, error: dayErr } = await supabaseServer
      .from("media_raw")
      .select("like_count, comments_count, save_count, share_count")
      .eq("user_id_text", userIdText)
      .eq("ig_account_id", igAccountId)
      .gte("media_timestamp", `${day}T00:00:00.000Z`)
      .lt("media_timestamp", `${day}T23:59:59.999Z`)

    if (dayErr) {
      console.warn("[cron/media-sync] aggregate query error", { day, message: dayErr.message })
      continue
    }

    const dayData = Array.isArray(dayRows) ? dayRows : []
    const totalLikes = dayData.reduce((s, r: any) => s + (r.like_count ?? 0), 0)
    const totalComments = dayData.reduce((s, r: any) => s + (r.comments_count ?? 0), 0)
    const totalSaves = dayData.reduce((s, r: any) => s + (r.save_count ?? 0), 0)
    const totalShares = dayData.reduce((s, r: any) => s + (r.share_count ?? 0), 0)

    const { error: aggErr } = await supabaseServer
      .from("media_daily_aggregate")
      .upsert({
        user_id_text: userIdText,
        ig_account_id: igAccountId,
        day,
        media_count: dayData.length,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_saves: totalSaves,
        total_shares: totalShares,
        total_interactions: totalLikes + totalComments + totalSaves + totalShares,
        updated_at: nowIso(),
      }, { onConflict: "user_id_text,ig_account_id,day" })

    if (!aggErr) {
      daysRecomputed.push(day)
      rowsAggregated += dayData.length
    } else {
      console.warn("[cron/media-sync] aggregate upsert error", { day, message: aggErr.message })
    }
  }

  return {
    summary: {
      ig_account_id: igAccountId,
      lookback_days: lookbackDays,
      media_fetched: mediaFetched,
      media_upserted: mediaUpserted,
      days_recomputed: daysRecomputed.length,
      rows_aggregated: rowsAggregated,
    },
    __diag: {
      token_found: true,
      paging_pages: pagingPages,
      per_media_insights_failures: insightFailures,
      ...(firstError ? { first_error: firstError } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function runCron(req: Request) {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim()

  // Auth: Vercel cron header OR matching x-cron-secret
  if (!isVercelCron(req)) {
    const provided = (req.headers.get("x-cron-secret") ?? "").trim()
    if (!cronSecret || provided !== cronSecret) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", build_marker: BUILD_MARKER },
        { status: 401, headers: baseHeaders }
      )
    }
  }

  // Parse body
  let body: Record<string, unknown> = {}
  try { body = ((await (req as any).json()) ?? {}) } catch { /* empty body ok */ }

  const igAccountId = typeof body.ig_account_id === "string" ? body.ig_account_id.trim() : ""
  const lookbackDays = typeof body.lookback_days === "number" && body.lookback_days > 0
    ? Math.min(Math.floor(body.lookback_days), 90)
    : 14

  if (!igAccountId) {
    return NextResponse.json(
      { ok: false, error: "missing_body:ig_account_id", build_marker: BUILD_MARKER },
      { status: 400, headers: baseHeaders }
    )
  }

  // Resolve account from user_instagram_accounts (service role — no user session)
  const { data: acct, error: acctErr } = await supabaseServer
    .from("user_instagram_accounts")
    .select("id, user_id, ig_user_id, page_id")
    .eq("id", igAccountId)
    .limit(1)
    .maybeSingle()

  if (acctErr || !acct) {
    return NextResponse.json(
      { ok: false, error: "ig_account_not_found", build_marker: BUILD_MARKER },
      { status: 404, headers: baseHeaders }
    )
  }

  const userId = typeof (acct as any).user_id === "string" ? String((acct as any).user_id) : ""
  const igUserId = (acct as any).ig_user_id != null ? String((acct as any).ig_user_id) : ""

  if (!userId || !igUserId) {
    return NextResponse.json(
      { ok: false, error: "account_missing_user_or_ig_user_id", build_marker: BUILD_MARKER },
      { status: 422, headers: baseHeaders }
    )
  }

  // Resolve access token (scoped to user + ig_user_id — multi-tenant safe)
  const { data: tokenRow } = await supabaseServer
    .from("user_ig_account_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "instagram")
    .eq("ig_user_id", igUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const token = tokenRow && typeof (tokenRow as any).access_token === "string"
    ? String((tokenRow as any).access_token).trim()
    : ""

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "no_token_for_account", build_marker: BUILD_MARKER, __diag: { token_found: false } },
      { status: 422, headers: baseHeaders }
    )
  }

  console.log("[cron/media-sync] running", { igAccountId, igUserId, userId, lookbackDays })

  let result: { summary: Record<string, unknown>; __diag: Record<string, unknown> } | null = null
  let syncError: string | null = null

  try {
    result = await runMediaSync({ igAccountId, igUserId, userId, token, lookbackDays })
  } catch (e: any) {
    syncError = e?.message ?? String(e)
    console.error("[cron/media-sync] sync error", { error: syncError })
  }

  console.log("[cron/media-sync] done", { summary: result?.summary, syncError })

  return NextResponse.json(
    {
      ok: true,
      build_marker: BUILD_MARKER,
      summary: result?.summary ?? null,
      __diag: result?.__diag ?? null,
      ...(syncError ? { sync_error: syncError } : {}),
    },
    { headers: baseHeaders }
  )
}

export async function GET(req: Request) {
  return runCron(req)
}

export async function POST(req: Request) {
  return runCron(req)
}
