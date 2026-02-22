import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { supabaseServer } from "@/lib/supabase/server"
import { upsertDailySnapshot } from "@/app/api/_lib/upsertDailySnapshot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// POST /api/cron/prewarm
// Cron-safe prewarm: writes today's account_daily_snapshot row without a
// browser session. Auth via x-cron-secret header (same env as cron/daily-snapshot).
//
// Required env vars:
//   CRON_SECRET          — shared secret; must match x-cron-secret header
//
// Request body (JSON):
//   { ig_account_id: string }   — UUID from user_instagram_accounts.id
//   { debug?: true }            — optional: include extra fields in response
// ---------------------------------------------------------------------------

const BUILD_MARKER = "cron-prewarm-v1"
const GRAPH_BASE = "https://graph.facebook.com/v24.0"
const baseHeaders = { "Cache-Control": "no-store", "x-build-marker": BUILD_MARKER } as const

function isVercelCron(req: Request) {
  return req.headers.has("x-vercel-cron")
}

function redactToken(url: string): string {
  return url.replace(/([?&]access_token=)[^&]*/g, "$1REDACTED")
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

// ---------------------------------------------------------------------------
// Core: ensure today's snapshot row exists for the given ig_account_id
// Uses service-role client — no user session required.
// ---------------------------------------------------------------------------
async function ensureTodaySnapshotForAccount(params: {
  igAccountId: string
  igUserId: string
  pageId: string
  userId: string
  token: string
}): Promise<{ did: boolean; reason?: string; chosen_day?: string; today_key?: string; available_days?: string[]; graph_values?: { day: string; reach: number | null; views: number; total_interactions: number; accounts_engaged: number; call_status: { a1_reach_ok: boolean; a2_views_ok: boolean; b_totals_ok: boolean }; series_counts: { reach_values: number; views_values: number; int_values: number; engaged_values: number } }; db?: { payload_keys: Record<string, unknown>; upsert_ok: boolean; upsert_error: string | null; row_after: Record<string, unknown> | null }; graph?: { call: string; status: number; error_body: unknown; url: string }; graph_call_a2?: { call: string; status: number; error_body: unknown; url: string }; graph_call_b?: { call: string; status: number; error_body: unknown; url: string } }> {
  const { igAccountId, igUserId, pageId, userId, token } = params
  const today = todayUtc()

  // Skip if today already has a non-null reach row
  const { data: existing } = await supabaseServer
    .from("account_daily_snapshot")
    .select("id, reach")
    .eq("ig_account_id", igAccountId)
    .eq("day", today)
    .limit(1)
    .maybeSingle()

  if (existing && (existing as any).reach !== null) {
    return { did: false, reason: "already_exists" }
  }

  // Resolve page access token
  let pageToken = token
  if (pageId) {
    try {
      const ptRes = await fetch(
        `${GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${token}`,
        { cache: "no-store" }
      )
      const ptBody = await safeJson(ptRes) as any
      if (ptBody?.access_token) pageToken = String(ptBody.access_token)
    } catch { /* use user token */ }
  }

  const yesterday = (() => {
    const ms = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86400_000
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  })()

  // Call A1: reach only (period=day, no metric_type)
  const callA1Url = `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
    `?metric=reach&period=day&since=${yesterday}&until=${today}&access_token=${pageToken}`
  const reachRes = await fetch(callA1Url, { cache: "no-store" })
  if (!reachRes.ok) {
    let errorBody: unknown = null
    try { errorBody = await reachRes.json() } catch { try { errorBody = await reachRes.text() } catch { /* ignore */ } }
    return {
      did: false,
      reason: `graph_call_a1_${reachRes.status}`,
      graph: { call: "A1", status: reachRes.status, error_body: errorBody, url: redactToken(callA1Url) },
    }
  }
  const reachJson = await safeJson(reachRes) as any
  const reachValues: any[] = reachJson?.data?.find((m: any) => m?.name === "reach")?.values ?? []

  // Call A2: profile_views (period=day, metric_type=total_value) — best-effort, written into impressions column
  let viewsValues: any[] = []
  let callA2Ok = false
  let callA2Diag: { call: "A2"; status: number; error_body: unknown; url: string } | null = null
  try {
    const callA2Url = `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
      `?metric=profile_views&period=day&metric_type=total_value&since=${yesterday}&until=${today}&access_token=${pageToken}`
    const viewsRes = await fetch(callA2Url, { cache: "no-store" })
    if (viewsRes.ok) {
      const viewsJson = await safeJson(viewsRes) as any
      viewsValues = viewsJson?.data?.find((m: any) => m?.name === "profile_views")?.values ?? []
      callA2Ok = true
    } else {
      let errorBody: unknown = null
      try { errorBody = await viewsRes.json() } catch { try { errorBody = await viewsRes.text() } catch { /* ignore */ } }
      callA2Diag = { call: "A2", status: viewsRes.status, error_body: errorBody, url: redactToken(callA2Url) }
    }
  } catch { /* best-effort; impressions will be 0 */ }

  // Call B: total_value metrics (total_interactions, accounts_engaged) — best-effort
  let intValues: any[] = []
  let engagedValues: any[] = []
  let callBOk = false
  let callBDiag: { call: "B"; status: number; error_body: unknown; url: string } | null = null
  try {
    const callBUrl = `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
      `?metric=total_interactions,accounts_engaged&period=day&metric_type=total_value&since=${yesterday}&until=${today}&access_token=${pageToken}`
    const tvRes = await fetch(callBUrl, { cache: "no-store" })
    if (tvRes.ok) {
      const tvJson = await safeJson(tvRes) as any
      intValues = tvJson?.data?.find((m: any) => m?.name === "total_interactions")?.values ?? []
      engagedValues = tvJson?.data?.find((m: any) => m?.name === "accounts_engaged")?.values ?? []
      callBOk = true
    } else {
      let errorBody: unknown = null
      try { errorBody = await tvRes.json() } catch { try { errorBody = await tvRes.text() } catch { /* ignore */ } }
      callBDiag = { call: "B", status: tvRes.status, error_body: errorBody, url: redactToken(callBUrl) }
    }
  } catch { /* best-effort; continue with zeros */ }

  const byDay = new Map<string, { reach: number | null; impressions: number; total_interactions: number; accounts_engaged: number }>()
  const ensureDay = (d: string) => {
    const ex = byDay.get(d)
    if (ex) return ex
    const init = { reach: null as number | null, impressions: 0, total_interactions: 0, accounts_engaged: 0 }
    byDay.set(d, init)
    return init
  }
  for (const v of reachValues) {
    const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
    if (!d) continue
    ensureDay(d).reach = typeof v?.value === "number" && Number.isFinite(v.value) ? v.value : null
  }
  for (const v of viewsValues) {
    const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
    if (!d) continue
    ensureDay(d).impressions = typeof v?.value === "number" && Number.isFinite(v.value) ? Math.floor(v.value) : 0
  }
  for (const v of intValues) {
    const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
    if (!d) continue
    const raw = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
    ensureDay(d).total_interactions = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0
  }
  for (const v of engagedValues) {
    const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
    if (!d) continue
    const raw = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
    ensureDay(d).accounts_engaged = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0
  }

  const availableDays = Array.from(byDay.keys()).filter((d) => d.length === 10).sort()
  if (availableDays.length === 0) return { did: false, reason: "no_graph_data_for_today", available_days: [] }

  const chosenDay = byDay.has(today) ? today : availableDays[availableDays.length - 1]
  const chosenData = byDay.get(chosenDay)!

  const graphValues = {
    day: chosenDay,
    reach: chosenData.reach,
    views: chosenData.impressions,
    total_interactions: chosenData.total_interactions,
    accounts_engaged: chosenData.accounts_engaged,
    call_status: {
      a1_reach_ok: true,
      a2_views_ok: callA2Ok,
      b_totals_ok: callBOk,
    },
    series_counts: {
      reach_values: reachValues.length,
      views_values: viewsValues.length,
      int_values: intValues.length,
      engaged_values: engagedValues.length,
    },
  }

  const upsertPayloadKeys = {
    ig_account_id: igAccountId,
    user_id_text: userId,
    ig_user_id: Number(igUserId),
    page_id: pageId ? Number(pageId) : 0,
    day: chosenDay,
  }

  const upsertResult = await upsertDailySnapshot(supabaseServer, {
    ig_account_id: igAccountId,
    user_id: userId,
    ig_user_id: Number(igUserId),
    page_id: pageId ? Number(pageId) : 0,
    day: chosenDay,
    reach: chosenData.reach,
    impressions: chosenData.impressions,
    total_interactions: chosenData.total_interactions,
    accounts_engaged: chosenData.accounts_engaged,
    source_used: "cron_prewarm",
    wrote_at: nowIso(),
  })

  const upsertOk = upsertResult.ok
  const upsertError = !upsertResult.ok
    ? (upsertResult.error instanceof Error ? upsertResult.error.message : String(upsertResult.error ?? ""))
    : (upsertResult as any).skipped ? `skipped:${(upsertResult as any).reason}` : null

  // Select row back to confirm what is actually in DB
  let rowAfter: Record<string, unknown> | null = null
  try {
    const { data: rowData } = await supabaseServer
      .from("account_daily_snapshot")
      .select("id, day, updated_at, reach, impressions, total_interactions, accounts_engaged, source_used, user_id_text, ig_user_id, page_id")
      .eq("ig_account_id", igAccountId)
      .eq("day", chosenDay)
      .limit(1)
      .maybeSingle()
    if (rowData) rowAfter = rowData as Record<string, unknown>
  } catch { /* best-effort */ }

  return {
    did: true,
    chosen_day: chosenDay,
    today_key: today,
    available_days: availableDays,
    graph_values: graphValues,
    db: {
      payload_keys: upsertPayloadKeys,
      upsert_ok: upsertOk,
      upsert_error: upsertError,
      row_after: rowAfter,
    },
    ...(callA2Diag ? { graph_call_a2: callA2Diag } : {}),
    ...(callBDiag ? { graph_call_b: callBDiag } : {}),
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
  const debugMode = body.debug === true

  if (!igAccountId) {
    return NextResponse.json(
      { ok: false, error: "missing_body:ig_account_id", build_marker: BUILD_MARKER },
      { status: 400, headers: baseHeaders }
    )
  }

  // Resolve account details from user_instagram_accounts (service role — no user session)
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
  const pageId = (acct as any).page_id != null ? String((acct as any).page_id) : ""

  if (!userId || !igUserId) {
    return NextResponse.json(
      { ok: false, error: "account_missing_user_or_ig_user_id", build_marker: BUILD_MARKER },
      { status: 422, headers: baseHeaders }
    )
  }

  // Resolve access token (scoped to this user + ig_user_id — multi-tenant safe)
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
      { ok: false, error: "no_token_for_account", build_marker: BUILD_MARKER },
      { status: 422, headers: baseHeaders }
    )
  }

  console.log("[cron/prewarm] running", { igAccountId, igUserId, pageId, userId })

  let result: { did: boolean; reason?: string } = { did: false, reason: "unknown" }
  let snapshotError: string | null = null

  try {
    result = await ensureTodaySnapshotForAccount({ igAccountId, igUserId, pageId, userId, token })
  } catch (e: any) {
    snapshotError = e?.message ?? String(e)
    console.error("[cron/prewarm] snapshot error", { error: snapshotError })
  }

  console.log("[cron/prewarm] done", { did: result.did, reason: result.reason, snapshotError })

  return NextResponse.json(
    {
      ok: true,
      build_marker: BUILD_MARKER,
      snapshot: result,
      ...(snapshotError ? { snapshot_error: snapshotError } : {}),
      ...(debugMode ? {
        debug: { igAccountId, igUserId, pageId, userId, hasToken: Boolean(token) },
      } : {}),
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
