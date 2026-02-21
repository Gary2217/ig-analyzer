export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// POST /api/instagram/daily-snapshot/backfill
// Auth required. Backfills missing account_daily_snapshot rows from IG Graph.
// Body (JSON): { ig_account_id?: string, days?: number (default 90, max 120) }
// Returns: { ok, inserted, skipped, missing, debug? }
// ---------------------------------------------------------------------------

const GRAPH_BASE = "https://graph.facebook.com/v24.0"
const MAX_DAYS = 120
const DEFAULT_DAYS = 90

function todayUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function utcDayOffset(daysAgo: number): string {
  const ms = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - daysAgo * 86400_000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    // --- Service client (runtime env, bypasses RLS for writes) ---
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 })
    }
    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    // --- Auth ---
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 })
    }

    // --- Parse body ---
    let body: Record<string, unknown> = {}
    try { body = (await req.json()) ?? {} } catch { /* empty body ok */ }
    const days = Math.min(MAX_DAYS, Math.max(1, typeof body.days === "number" ? Math.floor(body.days) : DEFAULT_DAYS))
    const requestedAccountId = typeof body.ig_account_id === "string" ? body.ig_account_id.trim() : ""
    const debugMode = body.debug === true

    // --- Resolve ig_account (SSOT user_ig_accounts row) ---
    let igAccountId = ""
    let igUserId = ""
    let pageId = ""

    if (requestedAccountId) {
      const { data: acct } = await authed
        .from("user_ig_accounts")
        .select("id, ig_user_id, page_id")
        .eq("id", requestedAccountId)
        .eq("user_id", user.id)
        .eq("provider", "instagram")
        .limit(1)
        .maybeSingle()
      igAccountId = acct && typeof (acct as any).id === "string" ? String((acct as any).id) : ""
      igUserId = acct && (acct as any).ig_user_id != null ? String((acct as any).ig_user_id) : ""
      pageId = acct && (acct as any).page_id != null ? String((acct as any).page_id) : ""
    }

    if (!igAccountId) {
      const { data: latest } = await authed
        .from("user_ig_accounts")
        .select("id, ig_user_id, page_id")
        .eq("user_id", user.id)
        .eq("provider", "instagram")
        .is("revoked_at", null)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      igAccountId = latest && typeof (latest as any).id === "string" ? String((latest as any).id) : ""
      igUserId = latest && (latest as any).ig_user_id != null ? String((latest as any).ig_user_id) : ""
      pageId = latest && (latest as any).page_id != null ? String((latest as any).page_id) : ""
    }

    if (!igAccountId || !igUserId) {
      return NextResponse.json({ ok: false, error: "no_ig_account" }, { status: 400 })
    }

    // --- Resolve access token ---
    // user_ig_account_tokens is keyed by (user_id, provider, ig_user_id) — no ig_account_id column.
    const { data: tokenRow } = await authed
      .from("user_ig_account_tokens")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "instagram")
      .eq("ig_user_id", igUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    // Per-user/account token only — no global fallback (multi-user SaaS safety)
    const token = tokenRow && typeof (tokenRow as any).access_token === "string"
      ? String((tokenRow as any).access_token).trim()
      : ""

    if (!token) {
      return NextResponse.json({
        ok: false,
        error: "missing_cookie:ig_access_token",
        message: "No Instagram token found for this account. Reconnect Instagram.",
      }, { status: 401 })
    }

    // --- Resolve page access token ---
    let pageAccessToken = token
    if (pageId) {
      try {
        const ptRes = await fetch(
          `${GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${token}`,
          { cache: "no-store" }
        )
        const ptBody = await safeJson(ptRes) as any
        if (ptBody?.access_token) pageAccessToken = String(ptBody.access_token)
      } catch { /* use user token as fallback */ }
    }

    // --- Find existing days in DB ---
    const today = todayUtc()
    const rangeStart = utcDayOffset(days - 1)

    const { data: existingRows } = await supabaseServer
      .from("account_daily_snapshot")
      .select("day, reach")
      .eq("ig_account_id", igAccountId)
      .gte("day", rangeStart)
      .lte("day", today)
      .order("day", { ascending: true })

    const existingByDay = new Map<string, boolean>()
    for (const r of (Array.isArray(existingRows) ? existingRows : []) as any[]) {
      const d = typeof r?.day === "string" ? String(r.day).slice(0, 10) : ""
      if (d) existingByDay.set(d, r?.reach !== null && r?.reach !== undefined)
    }

    // Days missing entirely or with null reach
    const missingDays: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = utcDayOffset(i)
      if (d === today) continue // skip today (partial)
      if (!existingByDay.has(d) || !existingByDay.get(d)) missingDays.push(d)
    }

    if (missingDays.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        skipped: days,
        missing: [],
        ...(debugMode ? { debug: { igAccountId, igUserId, pageId, days, rangeStart, today } } : {}),
      })
    }

    // --- Fetch from IG Graph ---
    // Sort deterministically — do NOT assume missingDays order.
    const daysSorted = [...missingDays].sort() // YYYY-MM-DD lexical sort is correct
    const sinceDay = daysSorted[0]                          // oldest
    const untilDay = daysSorted[daysSorted.length - 1]      // newest

    // Graph API: use unix timestamps (seconds), UTC midnight.
    // until is made inclusive by adding 1 day (86400 s).
    const sinceTs = Math.floor(Date.parse(`${sinceDay}T00:00:00.000Z`) / 1000)
    const untilTs = Math.floor(Date.parse(`${untilDay}T00:00:00.000Z`) / 1000) + 86400

    // Graph API rejects requests where (until - since) > 30 days.
    // Chunk the range into windows of at most 30 days (2 592 000 s).
    const MAX_SPAN_SECONDS = 30 * 86400
    const chunks: Array<{ chunkSince: number; chunkUntil: number }> = []
    let cur = sinceTs
    while (cur < untilTs) {
      const chunkUntil = Math.min(cur + MAX_SPAN_SECONDS, untilTs)
      chunks.push({ chunkSince: cur, chunkUntil })
      cur = chunkUntil
    }

    // Build day -> values map (populated across all chunks)
    const byDay = new Map<string, { reach: number | null; total_interactions: number; impressions: number; accounts_engaged: number }>()

    for (const { chunkSince, chunkUntil } of chunks) {
      // --- Call A: time-series metrics (reach + views) — no metric_type ---
      let tsRes = await fetch(
        `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
          `?metric=reach,views` +
          `&period=day` +
          `&since=${chunkSince}` +
          `&until=${chunkUntil}` +
          `&access_token=${pageAccessToken}`,
        { cache: "no-store" }
      )
      let tsJson = await safeJson(tsRes) as any
      // Fallback to reach-only if views rejected
      if (!tsRes.ok) {
        const graphCode = tsJson?.error?.code
        const graphMsg = String(tsJson?.error?.message ?? "")
        const isUnsupported = graphCode === 100 || graphMsg.includes("metric_type") || graphMsg.includes("unsupported") || graphMsg.includes("invalid")
        if (isUnsupported) {
          tsRes = await fetch(
            `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
              `?metric=reach` +
              `&period=day` +
              `&since=${chunkSince}` +
              `&until=${chunkUntil}` +
              `&access_token=${pageAccessToken}`,
            { cache: "no-store" }
          )
          tsJson = await safeJson(tsRes) as any
        }
      }

      if (!tsRes.ok) {
        const graphMsg = tsJson?.error?.message ?? "graph_error"
        return NextResponse.json({
          ok: false,
          error: "graph_fetch_failed",
          status: tsRes.status,
          message: graphMsg,
          missing: missingDays,
          ...(debugMode ? { debug: { chunkSince, chunkUntil } } : {}),
        }, { status: 502 })
      }

      const tsData: any[] = Array.isArray(tsJson?.data) ? tsJson.data : []
      const extractTs = (name: string): any[] => tsData.find((m: any) => m?.name === name)?.values ?? []
      const reachSeries: any[] = extractTs("reach")
      const viewsSeries: any[] = extractTs("views")

      // --- Call B: total_value metrics — best-effort, do NOT fail backfill if this fails ---
      let interactionsSeries: any[] = []
      let engagedSeries: any[] = []
      try {
        const tvRes = await fetch(
          `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
            `?metric=total_interactions,accounts_engaged` +
            `&period=day` +
            `&metric_type=total_value` +
            `&since=${chunkSince}` +
            `&until=${chunkUntil}` +
            `&access_token=${pageAccessToken}`,
          { cache: "no-store" }
        )
        if (tvRes.ok) {
          const tvJson = await safeJson(tvRes) as any
          const tvData: any[] = Array.isArray(tvJson?.data) ? tvJson.data : []
          const extractTv = (name: string): any[] => tvData.find((m: any) => m?.name === name)?.values ?? []
          interactionsSeries = extractTv("total_interactions")
          engagedSeries = extractTv("accounts_engaged")
        }
      } catch {
        // best-effort: leave interactions/engaged as 0
      }

      for (const v of reachSeries) {
        const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
        if (!d) continue
        const ex = byDay.get(d) ?? { reach: null, total_interactions: 0, impressions: 0, accounts_engaged: 0 }
        const n = typeof v?.value === "number" && Number.isFinite(v.value) ? v.value : null
        ex.reach = n
        byDay.set(d, ex)
      }
      for (const v of viewsSeries) {
        const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
        if (!d) continue
        const ex = byDay.get(d) ?? { reach: null, total_interactions: 0, impressions: 0, accounts_engaged: 0 }
        ex.impressions = typeof v?.value === "number" && Number.isFinite(v.value) ? Math.floor(v.value) : 0
        byDay.set(d, ex)
      }
      for (const v of interactionsSeries) {
        const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
        if (!d) continue
        const ex = byDay.get(d) ?? { reach: null, total_interactions: 0, impressions: 0, accounts_engaged: 0 }
        // total_value shape: { end_time, total_value: { value } } or { end_time, value }
        const raw = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
        ex.total_interactions = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0
        byDay.set(d, ex)
      }
      for (const v of engagedSeries) {
        const d = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
        if (!d) continue
        const ex = byDay.get(d) ?? { reach: null, total_interactions: 0, impressions: 0, accounts_engaged: 0 }
        const raw = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
        ex.accounts_engaged = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 0
        byDay.set(d, ex)
      }
    } // end chunk loop

    // Only upsert days that have data from Graph
    const wroteAt = new Date().toISOString()
    const rows = missingDays
      .filter((d) => byDay.has(d))
      .map((d) => {
        const v = byDay.get(d)!
        return {
          ig_account_id: igAccountId,
          user_id: user.id,
          user_id_text: user.id,
          ig_user_id: Number(igUserId),
          page_id: pageId ? Number(pageId) : 0,
          day: d,
          reach: v.reach,
          total_interactions: v.total_interactions,
          impressions: v.impressions,
          accounts_engaged: v.accounts_engaged,
          source_used: "backfill_graph",
          wrote_at: wroteAt,
        }
      })

    const skippedNoData = missingDays.filter((d) => !byDay.has(d))

    if (rows.length > 0) {
      const { error: upsertErr } = await service
        .from("account_daily_snapshot")
        .upsert(rows as any, { onConflict: "user_id_text,ig_user_id,page_id,day" })
      if (upsertErr) {
        return NextResponse.json({
          ok: false,
          error: "upsert_failed",
          message: typeof upsertErr.message === "string" ? upsertErr.message : "db_error",
          inserted: 0,
          missing: missingDays,
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
      skipped: existingByDay.size,
      missing: skippedNoData,
      ...(debugMode ? {
        debug: {
          igAccountId, igUserId, pageId, days,
          rangeStart, today,
          sinceDay, untilDay, sinceTs, untilTs,
          missingCount: missingDays.length,
          missingRequested: missingDays.length,
          chunkCount: chunks.length,
          chunks,
          graphReturned: byDay.size,
          upsertedDays: rows.map((r) => r.day),
          noDataFromGraph: skippedNoData,
        },
      } : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: "unexpected_error", message: msg.slice(0, 400) }, { status: 500 })
  }
}
