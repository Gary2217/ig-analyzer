import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"
import { createHash } from "crypto"
import { upsertDailySnapshot } from "@/app/api/_lib/upsertDailySnapshot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUILD_MARKER = "daily-snapshot-points-v2"

const HANDLER_FILE = "app/api/instagram/daily-snapshot/route.ts"
const HANDLER_VERSION = "ds-v24-reach-1"
const HANDLER_HEADERS = {
  "X-Handler-File": HANDLER_FILE,
  "X-Handler-Version": HANDLER_VERSION,
  "X-Handler-Build-Marker": BUILD_MARKER,
} as const

const DS_DEBUG_VERSION = "ds-reach-null-v1"

const __DEBUG_DAILY_SNAPSHOT__ = process.env.IG_GRAPH_DEBUG === "1"

const __DEV__ = process.env.NODE_ENV !== "production"

type DsResponsePayload = {
  body: any
  status: number
  source: "db" | "graph" | "error"
  etag: string
}

type CacheEntry<T> = { at: number; ttl: number; value: T }

type ActiveIgAccount = { id: string; ig_user_id: string } | null

const __dsInflight = new Map<string, Promise<DsResponsePayload>>()
const __dsInflightJoinCount = new Map<string, number>()
const __dsCache = new Map<
  string,
  CacheEntry<{ body: any; status: number; source: DsResponsePayload["source"]; etag: string }>
>()

const __dsIdsCache = new Map<string, CacheEntry<{ pageId: string; igId: string }>>()

const __dsTotalsCache = new Map<string, CacheEntry<{ ok: boolean; insights_daily: any }>>()
const __dsFollowersCache = new Map<string, CacheEntry<{ followersCount: number | null; capturedAt: string }>>()
const __dsFollowersInflight = new Map<string, Promise<void>>()

const __dsReachSyncAt = new Map<string, number>()

const REACH_SYNC_TTL_HOURS = 6
const REACH_SYNC_RECENT_DAYS_SCAN = 3
const REACH_SYNC_FETCH_DAYS = 7
const MAX_REACH_BACKFILL_DAYS = 90

function nowMs() {
  return Date.now()
}

function readCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const e = map.get(key)
  if (!e) return null
  if (nowMs() - e.at > e.ttl) {
    map.delete(key)
    return null
  }
  return e.value
}

function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  map.set(key, { at: nowMs(), ttl, value })
}

function pruneOldest<T>(map: Map<string, CacheEntry<T>>, maxEntries: number) {
  if (map.size <= maxEntries) return
  const items = Array.from(map.entries())
  items.sort((a, b) => a[1].at - b[1].at)
  const removeN = Math.max(1, map.size - maxEntries)
  for (let i = 0; i < removeN; i++) {
    const k = items[i]?.[0]
    if (k) map.delete(k)
  }
}

async function resolveActiveIgAccountForRequest(): Promise<ActiveIgAccount> {
  try {
    let c: any = null
    try {
      c = await (cookies() as any)
    } catch {
      c = null
    }

    const cookieId =
      (typeof c?.get === "function" ? String(c.get("ig_account_id")?.value ?? "").trim() : "") ||
      (typeof c?.get === "function" ? String(c.get("ig_active_account_id")?.value ?? "").trim() : "") ||
      (typeof c?.get === "function" ? String(c.get("ig_active_ig_account_id")?.value ?? "").trim() : "")

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) return null

    // B) If cookieId exists (usually SSOT user_ig_accounts.id), try it first.
    if (cookieId) {
      const { data } = await authed
        .from("user_ig_accounts")
        .select("id,ig_user_id")
        .eq("id", cookieId)
        .eq("user_id", user.id)
        .eq("provider", "instagram")
        .limit(1)
        .maybeSingle()

      const id = data && typeof (data as any).id === "string" ? String((data as any).id) : ""
      const ig_user_id = data && (data as any).ig_user_id != null ? String((data as any).ig_user_id) : ""
      if (id) return { id, ig_user_id }
    }

    // C) Try user_instagram_accounts active mapping: ig_user_id -> user_ig_accounts.id (SSOT uuid)
    try {
      const { data: activeIg } = await authed
        .from("user_instagram_accounts")
        .select("ig_user_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle()

      const activeIgUserId = activeIg && (activeIg as any).ig_user_id != null ? String((activeIg as any).ig_user_id) : ""
      if (activeIgUserId) {
        const { data: ssotRow } = await authed
          .from("user_ig_accounts")
          .select("id,ig_user_id")
          .eq("user_id", user.id)
          .eq("provider", "instagram")
          .eq("ig_user_id", activeIgUserId)
          .limit(1)
          .maybeSingle()

        const id = ssotRow && typeof (ssotRow as any).id === "string" ? String((ssotRow as any).id) : ""
        const ig_user_id = ssotRow && (ssotRow as any).ig_user_id != null ? String((ssotRow as any).ig_user_id) : activeIgUserId
        if (id) return { id, ig_user_id }
      }
    } catch {
      // ignore; continue to final fallback
    }

    // D) Fallback: latest connected user_ig_accounts row
    const { data: latest } = await authed
      .from("user_ig_accounts")
      .select("id,ig_user_id")
      .eq("user_id", user.id)
      .eq("provider", "instagram")
      .is("revoked_at", null)
      .order("connected_at", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const id = latest && typeof (latest as any).id === "string" ? String((latest as any).id) : ""
    const ig_user_id = latest && (latest as any).ig_user_id != null ? String((latest as any).ig_user_id) : ""
    if (id) return { id, ig_user_id }
  } catch {
    // ignore
  }
  return null
}

type SsotResolution = {
  ig_account_id: string | null
  strategy: "snapshot_rows" | "created_at_fallback" | "none"
  snapshot_rows: number
  candidate_count: number
}

async function resolveSsotBySnapshotRows(params: {
  sb: { from: (t: string) => any }
  igUserId: string | number
  userId: string
}): Promise<SsotResolution> {
  const igUserIdNum = typeof params.igUserId === "string" ? Number(params.igUserId) : params.igUserId
  if (!igUserIdNum || !Number.isFinite(igUserIdNum)) {
    return { ig_account_id: null, strategy: "none", snapshot_rows: 0, candidate_count: 0 }
  }
  if (!params.userId) {
    return { ig_account_id: null, strategy: "none", snapshot_rows: 0, candidate_count: 0 }
  }

  try {
    // Fetch all candidate user_instagram_accounts rows for this ig_user_id, scoped to this user (multi-tenant safety)
    const { data: candidates } = await params.sb
      .from("user_instagram_accounts")
      .select("id,created_at")
      .eq("user_id", params.userId)
      .eq("ig_user_id", igUserIdNum)
      .order("created_at", { ascending: false })
      .limit(20)

    let rows: Array<{ id: string; created_at: string }> = Array.isArray(candidates) ? candidates : []

    // Fallback: if user_instagram_accounts has no rows, try user_ig_accounts (SSOT table).
    // user_ig_accounts.ig_user_id is TEXT — compare as string.
    if (rows.length === 0) {
      try {
        const { data: igAcctCandidates } = await params.sb
          .from("user_ig_accounts")
          .select("id,connected_at")
          .eq("user_id", params.userId)
          .eq("ig_user_id", String(igUserIdNum))
          .is("revoked_at", null)
          .order("connected_at", { ascending: false })
          .limit(20)

        const igAcctRows = Array.isArray(igAcctCandidates) ? igAcctCandidates : []
        // Normalize connected_at -> created_at so the rest of the function is unchanged
        rows = igAcctRows.map((r: any) => ({
          id: String(r.id ?? ""),
          created_at: String(r.connected_at ?? r.created_at ?? ""),
        })).filter((r) => r.id)
      } catch {
        // best-effort; leave rows empty
      }
    }

    if (rows.length === 0) return { ig_account_id: null, strategy: "none", snapshot_rows: 0, candidate_count: 0 }

    // For each candidate, count snapshot rows
    const counted: Array<{ id: string; created_at: string; snap_count: number }> = await Promise.all(
      rows.map(async (r) => {
        try {
          const { count } = await params.sb
            .from("account_daily_snapshot")
            .select("id", { count: "exact", head: true })
            .eq("ig_account_id", r.id)
          return { ...r, snap_count: typeof count === "number" ? count : 0 }
        } catch {
          return { ...r, snap_count: 0 }
        }
      })
    )

    // Sort: most snapshot rows first, then newest created_at
    counted.sort((a, b) => {
      if (b.snap_count !== a.snap_count) return b.snap_count - a.snap_count
      return b.created_at.localeCompare(a.created_at)
    })

    const best = counted[0]
    const strategy: SsotResolution["strategy"] = best.snap_count > 0 ? "snapshot_rows" : "created_at_fallback"
    return {
      ig_account_id: best.id,
      strategy,
      snapshot_rows: best.snap_count,
      candidate_count: rows.length,
    }
  } catch {
    return { ig_account_id: null, strategy: "none", snapshot_rows: 0, candidate_count: 0 }
  }
}

async function readFollowersDailyRows(params: { igId: string; start: string; today: string; ssotId?: string | null }) {
  try {
    type FollowersDailyRow = { day: string; followers_count: number | null; captured_at: string | null }
    let followersUsedSource: "ssot" | "legacy_fallback" | "legacy_only" | "error" = "legacy_only"

    const makeBase = () =>
      supabaseServer
        .from("ig_daily_followers")
        .select("day,followers_count,captured_at")
        .gte("day", params.start)
        .lte("day", params.today)
        .order("day", { ascending: true })

    const runByAccountId = async (id: string) => {
      return await makeBase().eq("ig_account_id", String(id))
    }

    const runByIgUserId = async (igId: string) => {
      return await makeBase().eq("ig_user_id", String(igId))
    }

    let data: FollowersDailyRow[] | null = null
    let error: unknown = null

    if (params.ssotId) {
      const r1 = await runByAccountId(params.ssotId)
      data = (r1 as any)?.data ?? null
      error = (r1 as any)?.error ?? null

      if (!error && Array.isArray(data) && data.length === 0) {
        followersUsedSource = "legacy_fallback"
        console.log("[daily-snapshot] followers SSOT returned 0 rows; fallback to legacy ig_user_id", { ssotId: params.ssotId, igId: params.igId })
        const r2 = await runByIgUserId(params.igId)
        data = (r2 as any)?.data ?? null
        error = (r2 as any)?.error ?? null
      } else {
        followersUsedSource = "ssot"
      }
    } else {
      followersUsedSource = "legacy_only"
      const r = await runByIgUserId(params.igId)
      data = (r as any)?.data ?? null
      error = (r as any)?.error ?? null
    }

    if (error || !Array.isArray(data)) {
      followersUsedSource = "error"
      return {
        rows: [] as Array<{ day: string; followers_count: number }>,
        availableDays: 0,
        lastWriteAt: null as string | null,
        followers_used_source: followersUsedSource,
      }
    }

    const set = new Set<string>()
    let maxCapturedAt: string | null = null
    const rows = (Array.isArray(data) ? data : [])
      .map((r: any) => {
        const day = typeof r?.day === "string" ? String(r.day).trim() : ""
        const nRaw = r?.followers_count
        const n = typeof nRaw === "number" ? nRaw : Number(nRaw)
        if (!day || !Number.isFinite(n)) return null

        set.add(day)

        const ca = typeof r?.captured_at === "string" ? String(r.captured_at).trim() : ""
        if (ca && (!maxCapturedAt || ca > maxCapturedAt)) maxCapturedAt = ca

        return { day, followers_count: Math.floor(n) }
      })
      .filter((x: any): x is { day: string; followers_count: number } => x !== null)

    return {
      rows,
      availableDays: set.size,
      lastWriteAt: maxCapturedAt,
      followers_used_source: followersUsedSource,
    }
  } catch {
    const followersUsedSource: "ssot" | "legacy_fallback" | "legacy_only" | "error" = "error"
    return {
      rows: [] as Array<{ day: string; followers_count: number }>,
      availableDays: 0,
      lastWriteAt: null as string | null,
      followers_used_source: followersUsedSource,
    }
  }
}

function tokenSignature(rawToken: string) {
  const t = String(rawToken || "").trim()
  if (!t) return ""
  try {
    return createHash("sha256").update(t).digest("hex").slice(0, 16)
  } catch {
    // ultra-conservative fallback (still avoids storing raw token)
    return `${t.slice(0, 2)}_${t.slice(-2)}`
  }
}

async function getTotalsCached(params: {
  totalsKey: string
  token: string
  envToken: string
  pageId: string
  igId: string
  days: number
}) {
  const cached = readCache(__dsTotalsCache, params.totalsKey)
  if (cached) return cached

  const ttl = 180_000
  const value = await fetchTotalsBestEffort({
    token: params.token,
    envToken: params.envToken,
    pageId: params.pageId,
    igId: params.igId,
    days: params.days,
  })

  writeCache(__dsTotalsCache, params.totalsKey, value, ttl)
  pruneOldest(__dsTotalsCache, 200)
  return value
}

async function writeFollowersBestEffortCached(params: {
  followersKey: string
  token: string
  igId: string
  ssotId?: string | null
  authed?: any
  authedUserId?: string
  diag?: Record<string, unknown>
}) {
  // Best-effort: never throw, never fail the request.
  try {
    // Require authed client and authenticated user_id (needed for RLS)
    if (!params.authed || !params.authedUserId) return

    const existing = readCache(__dsFollowersCache, params.followersKey)
    if (existing) return

    const inflight = __dsFollowersInflight.get(params.followersKey)
    if (inflight) {
      await inflight.catch(() => null)
      return
    }

    const p = (async () => {
      try {
        const meUrl = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}`)
        meUrl.searchParams.set("fields", "followers_count")
        meUrl.searchParams.set("access_token", params.token)

        const r = await fetch(meUrl.toString(), { method: "GET", cache: "no-store" })
        const body = await safeJson(r)
        const followersCountRaw = (body as any)?.followers_count
        const followersCount = toFiniteNumOrNull(followersCountRaw)
        const capturedAt = new Date().toISOString()

        // Cache even null for a short TTL to prevent repeated hot-loop fetches.
        writeCache(__dsFollowersCache, params.followersKey, { followersCount, capturedAt }, 45_000)
        pruneOldest(__dsFollowersCache, 200)

        if (followersCount !== null) {
          const dayStr = todayUtcDateString()

          if (__DEBUG_DAILY_SNAPSHOT__) {
            console.log("[daily-snapshot][followers_write]", {
              has_ssot: !!params.ssotId,
              ssotId: params.ssotId,
              ig_user_id: params.igId,
              day: dayStr,
              followersCount,
            })
          }

          // Always upsert keyed by ig_user_id,day — runs regardless of ssotId
          if (params.diag) params.diag.followers_write_attempted = true
          try {
            await params.authed
              .from("ig_daily_followers")
              .upsert(
                {
                  user_id: String(params.authedUserId),
                  ig_user_id: String(params.igId),
                  day: dayStr,
                  followers_count: Math.floor(followersCount),
                  captured_at: capturedAt,
                },
                { onConflict: "ig_user_id,day" }
              )
            if (params.diag) params.diag.followers_write_error = null
          } catch (e: any) {
            if (params.diag) params.diag.followers_write_error = e?.message ?? String(e)
            if (__DEBUG_DAILY_SNAPSHOT__) {
              console.log("[daily-snapshot] followers_upsert_ig_user_id_failed", { message: e?.message ?? String(e) })
            }
          }

          // Additionally upsert keyed by ig_account_id,day when ssotId is available
          if (params.ssotId && params.authedUserId) {
            try {
              const payload: any = {
                user_id: String(params.authedUserId),
                day: dayStr,
                followers_count: Math.floor(followersCount),
                captured_at: capturedAt,
                ig_user_id: String(params.igId),
                ig_account_id: String(params.ssotId),
              }
              await params.authed.from("ig_daily_followers").upsert(payload, { onConflict: "ig_account_id,day" })
            } catch (e: any) {
              if (__DEBUG_DAILY_SNAPSHOT__) {
                console.log("[daily-snapshot] followers_upsert_ssot_failed", { message: e?.message ?? String(e) })
              }
            }
          }
        }
      } catch (e: any) {
        if (__DEBUG_DAILY_SNAPSHOT__) {
          console.log("[daily-snapshot] followers_fetch_failed", { message: e?.message ?? String(e) })
        }
      }
    })()

    __dsFollowersInflight.set(params.followersKey, p)
    await p
  } finally {
    __dsFollowersInflight.delete(params.followersKey)
  }
}

// Force Graph v24.0 (avoid auto-upgrade drift)
const GRAPH_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

function todayUtcDateString() {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function utcDateStringFromOffset(daysAgo: number) {
  const now = new Date()
  const ms =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0) -
    daysAgo * 24 * 60 * 60 * 1000
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function utcDateRangeForDays(days: number) {
  const today = todayUtcDateString()
  const start = utcDateStringFromOffset(days - 1)
  return { today, start }
}

function buildPaddedPointsFromRows(rows: any[], days: number) {
  const byDate = new Map<
    string,
    { reach: number | null; impressions: number | null; interactions: number | null; engaged_accounts: number | null }
  >()
  for (const r of rows as any[]) {
    const dateStr = String(r?.day || "").trim()
    if (!dateStr) continue
    byDate.set(dateStr, {
      reach: toFiniteNonNegIntOrNull(r?.reach),
      impressions: toFiniteNonNegIntOrNull(r?.impressions),
      interactions: toFiniteNonNegIntOrNull(r?.total_interactions),
      engaged_accounts: toFiniteNonNegIntOrNull(r?.accounts_engaged),
    })
  }
  return buildPaddedPoints({ days, byDate })
}

async function readAccountDailySnapshots(params: {
  userScopeKey: string
  igId: string
  pageId: string
  start: string
  today: string
}) {
  try {
    const { data, error } = await supabaseServer
      .from("account_daily_snapshot")
      .select("day,reach,impressions,total_interactions,accounts_engaged,updated_at")
      .eq("user_id", params.userScopeKey)
      .eq("ig_user_id", Number(params.igId))
      .eq("page_id", Number(params.pageId))
      .gte("day", params.start)
      .lte("day", params.today)
      .order("day", { ascending: true })
    if (error) return { rows: [], error }
    return { rows: Array.isArray(data) ? data : [], error: null }
  } catch (e: any) {
    return { rows: [], error: e }
  }
}

async function upsertAccountDailySnapshots(params: {
  authed: any
  authedUserId: string
  igId: string
  pageId: string
  ssotId: string
  rows: Array<{
    day: string
    reach: number | null
    impressions?: number | null
    total_interactions?: number | null
    accounts_engaged?: number | null
    source_used?: string
    wrote_at?: string
  }>
}) {
  if (params.rows.length === 0) return { ok: true as const, error: null }
  try {
    for (const r of params.rows) {
      const day = r.day
      const reachRaw = r.reach
      const reach = r.reach
      console.log("SSOT SNAPSHOT WRITE", {
        ts: new Date().toISOString(),
        day,
        reachRaw,
        reachStored: reach,
        hasReachRaw: typeof reachRaw === "number",
        isFiniteReachRaw: typeof reachRaw === "number" && Number.isFinite(reachRaw),
      })
    }

    const result = await upsertDailySnapshot(
      params.authed,
      params.rows.map((r) => ({
        ig_account_id: params.ssotId,
        user_id: params.authedUserId,
        ig_user_id: Number(params.igId),
        page_id: Number(params.pageId),
        day: r.day,
        reach: r.reach,
        impressions: r.impressions ?? 0,
        total_interactions: r.total_interactions ?? 0,
        accounts_engaged: r.accounts_engaged ?? 0,
        source_used: r.source_used,
        wrote_at: r.wrote_at,
      }))
    )

    if (result.ok && !result.skipped) {
      for (const r of params.rows) {
        console.log("SSOT SNAPSHOT WRITE OK", { day: r.day, reachStored: r.reach })
      }
    }
    return result.ok
      ? { ok: true as const, error: null }
      : { ok: false as const, error: (result as any).error }
  } catch (err: any) {
    for (const r of params.rows) {
      console.error("SSOT SNAPSHOT WRITE FAIL", { day: r.day, err: String(err) })
    }
    return { ok: false, error: err }
  }
}

async function backfillMissingSnapshotsFromGraph(params: {
  authed: any
  authedUserId: string
  token: string
  envToken: string
  igId: string
  pageId: string
  ssotId: string
  start: string
  today: string
  maxDays: number
}) {
  const daysToBackfill = Math.min(params.maxDays, 120)
  const untilMs = Date.now()
  const sinceMs = untilMs - (daysToBackfill - 1) * 24 * 60 * 60 * 1000
  const since = Math.floor(sinceMs / 1000)
  const until = Math.floor(untilMs / 1000)

  let pageToken = await getPageAccessToken(params.token, params.pageId)
  let tokenSource: "cookie" | "env" = "cookie"
  if (!pageToken.ok && params.envToken) {
    tokenSource = "env"
    pageToken = await getPageAccessToken(params.envToken, params.pageId)
  }
  if (!pageToken.ok) {
    return { ok: false as const, error: "page_access_token_failed", tokenSource, rows: [] as any[] }
  }

  const series = await fetchInsightsTimeSeries({
    igId: params.igId,
    pageAccessToken: pageToken.pageAccessToken,
    days: daysToBackfill,
  })
  if (!series.ok) {
    return { ok: false as const, error: "graph_time_series_failed", tokenSource, rows: [] }
  }

  const points = buildPointsFromGraphInsightsTimeSeries(series.data, daysToBackfill)
  const rows = points
    .filter((p) => p?.date && p.date !== params.today)
    .map((p) => {
      const day = p.date
      const reachRaw = p.reach
      const reach = typeof reachRaw === "number" && Number.isFinite(reachRaw) ? reachRaw : null
      console.log("SSOT SNAPSHOT WRITE", {
        day,
        reachRaw,
        reachStored: reach,
      })

      const impVal = typeof p.impressions === "number" && Number.isFinite(p.impressions) ? Math.floor(p.impressions) : undefined
      const intVal = typeof p.interactions === "number" && Number.isFinite(p.interactions) ? Math.floor(p.interactions) : undefined
      const engVal = typeof p.engaged_accounts === "number" && Number.isFinite(p.engaged_accounts) ? Math.floor(p.engaged_accounts) : undefined
      return {
        day,
        reach,
        ...(impVal !== undefined ? { impressions: impVal } : {}),
        ...(intVal !== undefined ? { total_interactions: intVal } : {}),
        ...(engVal !== undefined ? { accounts_engaged: engVal } : {}),
        source_used: "graph_backfill",
        wrote_at: new Date().toISOString(),
      }
    })

  if (rows.length > 0) {
    const upsertRes = await upsertAccountDailySnapshots({
      authed: params.authed,
      authedUserId: params.authedUserId,
      igId: params.igId,
      pageId: params.pageId,
      ssotId: params.ssotId,
      rows,
    })
    if (!upsertRes.ok) {
      return { ok: false as const, error: "upsert_failed", tokenSource, rows: [] }
    }
  }

  return { ok: true as const, rows, tokenSource }
}

function toSafeInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

function toFiniteNonNegIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "string" && v.trim() === "") return null
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

// Sanitize: null/undefined/NaN/non-finite/negative -> 0 for all numeric metric fields.
// Ensures response never contains null for reach/impressions/interactions/engaged_accounts.
function sanitizePoints(points: DailySnapshotPoint[]): DailySnapshotPoint[] {
  return points.map((p) => ({
    ...p,
    reach: toSafeInt(p.reach),
    impressions: toSafeInt(p.impressions),
    interactions: toSafeInt(p.interactions),
    engaged_accounts: toSafeInt(p.engaged_accounts),
  }))
}

// Sanitize trend_points_v2: null -> 0 for metrics, recompute reach_ma7 on sanitized reach.
function sanitizeTrendPointsV2(pts: ReturnType<typeof buildTrendPointsV2>): ReturnType<typeof buildTrendPointsV2> {
  const sanitized = pts.map((p) => ({
    ...p,
    reach: toSafeInt(p.reach),
    impressions: toSafeInt(p.impressions),
    interactions: toSafeInt(p.interactions),
    engaged: toSafeInt(p.engaged),
  }))
  // Recompute reach_ma7 on sanitized reach values
  return sanitized.map((p, i) => {
    const start = Math.max(0, i - 6)
    let sum = 0
    let count = 0
    for (let j = start; j <= i; j++) {
      const v = sanitized[j].reach
      if (typeof v === "number" && Number.isFinite(v)) { sum += v; count++ }
    }
    const engagedVal = (p as any).engaged ?? (p as any).engaged_accounts ?? (p as any).accounts_engaged ?? 0
    return {
      ...p,
      reach_ma7: count > 0 ? Math.round(sum / count) : 0,
      engaged: engagedVal,
      engaged_accounts: engagedVal,
      accounts_engaged: engagedVal,
    }
  })
}

type DailySnapshotPoint = {
  date: string
  reach: number | null
  impressions: number | null // v24: keep for backward-compat; we set to null when missing
  interactions: number | null
  engaged_accounts: number | null // v24: keep for backward-compat; we set to null when missing
}

function buildPaddedPoints(params: {
  days: number
  byDate: Map<string, { reach: number | null; impressions: number | null; interactions: number | null; engaged_accounts: number | null }>
}) {
  const out: DailySnapshotPoint[] = []
  for (let i = params.days - 1; i >= 0; i--) {
    const date = utcDateStringFromOffset(i)
    const row = params.byDate.get(date)
    out.push({
      date,
      reach: row ? row.reach : null,
      impressions: row ? row.impressions : null,
      interactions: row ? row.interactions : null,
      engaged_accounts: row ? row.engaged_accounts : null,
    })
  }
  return out
}

function countCollectedDaysFromRows(rows: any[]): number {
  const set = new Set<string>()
  const list = Array.isArray(rows) ? rows : []
  for (const r of list as any[]) {
    const day = typeof r?.day === "string" ? String(r.day).trim() : ""
    if (!day) continue
    set.add(day)
  }
  return set.size
}

function buildPointsFromGraphInsightsTimeSeries(insightsDailySeries: any[], days: number) {
  const byDate = new Map<
    string,
    { reach: number | null; impressions: number; interactions: number; engaged_accounts: number }
  >()

  const list = Array.isArray(insightsDailySeries) ? insightsDailySeries : []
  for (const item of list) {
    const name = String(item?.name || "").trim()
    const values = Array.isArray(item?.values) ? item.values : []

    for (const v of values) {
      const endTime = typeof v?.end_time === "string" ? v.end_time : ""
      const ms = endTime ? Date.parse(endTime) : NaN
      if (!Number.isFinite(ms)) continue

      const d = new Date(ms)
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`

      const ex =
        byDate.get(dateStr) ?? {
          reach: null,
          impressions: 0,
          interactions: 0,
          engaged_accounts: 0,
        }

      // Support both response shapes:
      // - time-series: { end_time, value }
      // - total_value: { end_time, total_value: { value } }
      const rawValue = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
      const num = toSafeInt(rawValue)

      if (name === "reach") {
        const reach = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null
        ex.reach = reach
      } else if (name === "total_interactions") ex.interactions = num
      else if (name === "accounts_engaged") ex.engaged_accounts = num
      else if (name === "views" || name === "content_views") ex.impressions = num

      byDate.set(dateStr, ex)
    }
  }

  return buildPaddedPoints({ days, byDate })
}

function isUnsupportedMetricBody(body: unknown): boolean {
  const b = body as any
  const code = typeof b?.error?.code === "number" ? b.error.code : typeof b?.code === "number" ? b.code : undefined
  const msg =
    typeof b?.error?.message === "string"
      ? String(b.error.message).toLowerCase()
      : typeof b?.message === "string"
        ? String(b.message).toLowerCase()
        : ""
  return code === 100 || msg.includes("invalid") || msg.includes("unsupported") || msg.includes("metric")
}

function buildInsightsDailyTotals(params: {
  total_interactions: number | null
  accounts_engaged: number | null
  profile_views: number | null
  follower_change: number | null
  impressions_total: number | null
}) {
  const wrap = (name: string, value: number | null) => ({ name, total_value: { value } })
  return [
    wrap("total_interactions", params.total_interactions),
    wrap("accounts_engaged", params.accounts_engaged),
    wrap("profile_views", params.profile_views),
    wrap("follower_change", params.follower_change),
    wrap("impressions_total", params.impressions_total),
  ]
}

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function toFiniteNumOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function jsonError(message: string, extra?: any, status = 400) {
  const body = JSON.stringify({ ok: false, error: message, ...(extra ?? null) })
  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "x-debug-ds-version": DS_DEBUG_VERSION,
      "x-debug-ds-time": new Date().toISOString(),
      ...HANDLER_HEADERS,
    },
  })
}

function weakEtagFromParts(parts: Array<string | number | null | undefined>) {
  const raw = parts
    .map((p) => (p === null || p === undefined ? "" : String(p)))
    .join("|")
  try {
    const h = createHash("sha256").update(raw).digest("hex").slice(0, 24)
    return `W/"${h}"`
  } catch {
    return `W/"${raw.slice(0, 24)}"`
  }
}

function isIfNoneMatchHit(req: Request, etag: string) {
  const inm = req.headers.get("if-none-match")
  if (!inm || !etag) return false
  const v = inm.trim()
  if (!v) return false
  return v === etag
}

function respondWithEtag(params: {
  req: Request
  status: number
  body: any
  etag: string
  branch: string
  source: DsResponsePayload["source"]
  serverTiming?: string
}) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    ETag: params.etag,
    "Timing-Allow-Origin": "*",
    "x-debug-ds-version": DS_DEBUG_VERSION,
    "x-debug-ds-time": new Date().toISOString(),
    ...HANDLER_HEADERS,
  }

  if (params.serverTiming) {
    headers["Server-Timing"] = params.serverTiming
  }

  const etagHit = params.status === 200 && isIfNoneMatchHit(params.req, params.etag)
  if (__DEV__) {
    headers["X-DS-Branch"] = params.branch
    headers["X-DS-Source"] = String(params.source)
    if (etagHit) headers["X-DS-ETag"] = "304"
    console.debug("[daily-snapshot][etag]", { status: etagHit ? 304 : params.status, branch: params.branch, etagHit })
  }

  if (etagHit) {
    return new NextResponse(null, { status: 304, headers })
  }
  if (params.status === 304) {
    return new NextResponse(null, { status: 304, headers })
  }

  const raw = params.body === null || params.body === undefined ? null : JSON.stringify(params.body)
  if (raw !== null) {
    headers["Content-Type"] = "application/json; charset=utf-8"
  }
  return new NextResponse(raw, { status: params.status, headers })
}

function buildTrendPointsV2(points: DailySnapshotPoint[]) {
  const list = Array.isArray(points) ? points : []

  const toFiniteNumOrNull = (raw: unknown): number | null => {
    if (raw === null || raw === undefined) return null
    if (typeof raw === "string" && raw.trim() === "") return null
    const v = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(v) ? v : null
  }

  const fmtLabel = (ts: number) => {
    try {
      return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(ts))
    } catch {
      const d = new Date(ts)
      const m = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      return `${m}/${dd}`
    }
  }

  const reachByIndex: Array<number | null> = list.map((p) => {
    const raw = (p as any)?.reach
    if (raw === null || raw === undefined) return null
    if (typeof raw === "string" && raw.trim() === "") return null
    const v = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null
  })

  const reachMa7ByIndex = reachByIndex.map((_, i) => {
    const end = i
    const start = Math.max(0, i - 6)
    let sum = 0
    let count = 0
    for (let j = start; j <= end; j++) {
      const v = reachByIndex[j]
      if (typeof v !== "number" || !Number.isFinite(v)) return null
      sum += v
      count += 1
    }
    if (count < 1) return null
    return sum / count
  })

  return list
    .map((p, i) => {
      const date = String(p?.date || "").trim()
      const ts = date ? Date.parse(`${date}T00:00:00.000Z`) : NaN
      const tsOk = Number.isFinite(ts) ? (ts as number) : null
      return {
        date,
        ts: tsOk,
        t: tsOk !== null ? fmtLabel(tsOk) : date,
        reach: toFiniteNumOrNull((p as any)?.reach),
        impressions: toFiniteNumOrNull((p as any)?.impressions),
        interactions: toFiniteNumOrNull((p as any)?.interactions),
        engaged: toFiniteNumOrNull((p as any)?.engaged_accounts),
        reach_ma7: typeof reachMa7ByIndex[i] === "number" && Number.isFinite(reachMa7ByIndex[i] as number) ? (reachMa7ByIndex[i] as number) : null,
      }
    })
    .filter((p) => typeof p.ts === "number" && Number.isFinite(p.ts))
}

function getCookieValueFromHeader(cookie: string, key: string) {
  const re = new RegExp(`${key}=([^;]+)`)
  const m = cookie.match(re)
  if (!m?.[1]) return ""
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function clampDays(raw: string | null) {
  const allowed = new Set([90, 60, 30, 14, 7])
  const n = Number(raw)
  if (!Number.isFinite(n)) return 30
  const i = Math.floor(n)
  if (!allowed.has(i)) return 30
  return i
}

function toUnixSeconds(ms: number) {
  return Math.floor(ms / 1000)
}

async function getIdsIfMissing(token: string, pageId: string, igId: string) {
  if (pageId && igId) return { ok: true as const, pageId, igId }

  const accountsUrl = new URL(`${GRAPH_BASE}/me/accounts`)
  accountsUrl.searchParams.set("fields", "name,instagram_business_account")
  accountsUrl.searchParams.set("access_token", token)

  const r = await fetch(accountsUrl.toString(), { method: "GET", cache: "no-store" })
  const body = await safeJson(r)
  if (!r.ok) return { ok: false as const, status: r.status || 400, body }

  const list: any[] = Array.isArray(body?.data) ? body.data : []
  const picked = list.find((p) => p?.instagram_business_account?.id)
  const nextPageId = typeof picked?.id === "string" ? picked.id : ""
  const nextIgId =
    typeof picked?.instagram_business_account?.id === "string" ? picked.instagram_business_account.id : ""

  if (!nextPageId || !nextIgId) {
    return { ok: false as const, status: 403, body: { error: "no_instagram_business_account" } }
  }

  return { ok: true as const, pageId: nextPageId, igId: nextIgId }
}

async function getPageAccessToken(userToken: string, pageId: string) {
  const pageTokenUrl = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageId)}`)
  pageTokenUrl.searchParams.set("fields", "access_token")
  pageTokenUrl.searchParams.set("access_token", userToken)

  const r = await fetch(pageTokenUrl.toString(), { method: "GET", cache: "no-store" })
  const body = await safeJson(r)
  if (!r.ok || typeof body?.access_token !== "string" || !body.access_token.trim()) {
    return { ok: false as const, status: r.status || 400, body }
  }
  return { ok: true as const, pageAccessToken: body.access_token.trim() as string }
}

async function fetchInsightsTimeSeries(params: { igId: string; pageAccessToken: string; days: number }) {
  const DAY_MS = 24 * 60 * 60 * 1000
  const MAX_DAYS_PER_CALL = 30

  // Call A: time-series metrics (reach + views). These do NOT accept metric_type=total_value.
  // Call B (per chunk, best-effort): total_interactions + accounts_engaged with metric_type=total_value.
  //   If B fails, continue with zeros — do NOT fail the whole request.
  const metricListTimeSeries = ["reach", "views"]
  const metricListTimeFallback = ["reach"]
  const metricListTotalValue = ["total_interactions", "accounts_engaged"]

  let remainingDays = Math.max(1, params.days)
  let currentUntilMs = Date.now()

  const mergedData: any[] = []
  let lastStatus = 200
  let lastBody: any = null
  let lastUrl = ""

  while (remainingDays > 0) {
    const chunkDays = Math.min(MAX_DAYS_PER_CALL, remainingDays)

    const sinceMs = currentUntilMs - (chunkDays - 1) * DAY_MS
    const since = toUnixSeconds(sinceMs)
    const until = toUnixSeconds(currentUntilMs)

    // --- Call A: time-series (reach, views) ---
    const runTimeSeries = async (metricList: string[]) => {
      const u = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}/insights`)
      u.searchParams.set("metric", metricList.join(","))
      u.searchParams.set("period", "day")
      u.searchParams.set("since", String(since))
      u.searchParams.set("until", String(until))
      u.searchParams.set("access_token", params.pageAccessToken)
      lastUrl = u.toString()
      const r = await fetch(lastUrl, { method: "GET", cache: "no-store" })
      const body = await safeJson(r)
      return { r, body }
    }

    let r: Response
    let body: any
    ;({ r, body } = await runTimeSeries(metricListTimeSeries))
    if (!r.ok && isUnsupportedMetricBody(body)) {
      ;({ r, body } = await runTimeSeries(metricListTimeFallback))
    }

    lastStatus = r.status
    lastBody = body

    if (!r.ok) {
      return { ok: false, status: lastStatus, body: lastBody, data: [], url: lastUrl }
    }

    const tsData = Array.isArray(body?.data) ? body.data : []
    mergedData.push(...tsData)

    // --- Call B: total_value metrics (total_interactions, accounts_engaged) — best-effort ---
    try {
      const uTv = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}/insights`)
      uTv.searchParams.set("metric", metricListTotalValue.join(","))
      uTv.searchParams.set("period", "day")
      uTv.searchParams.set("metric_type", "total_value")
      uTv.searchParams.set("since", String(since))
      uTv.searchParams.set("until", String(until))
      uTv.searchParams.set("access_token", params.pageAccessToken)
      const tvRes = await fetch(uTv.toString(), { method: "GET", cache: "no-store" })
      if (tvRes.ok) {
        const tvBody = await safeJson(tvRes)
        const tvData = Array.isArray(tvBody?.data) ? tvBody.data : []
        mergedData.push(...tvData)
      } else {
        const tvErrBody = await safeJson(tvRes) as any
        console.warn("[account-daily-snapshot] fetchInsightsTimeSeries Call B non-ok", {
          status: tvRes.status,
          code: tvErrBody?.error?.code,
          message: tvErrBody?.error?.message,
          ig_user_id: params.igId,
          since,
          until,
        })
      }
    } catch (tvErr) {
      console.warn("[account-daily-snapshot] fetchInsightsTimeSeries Call B threw", { err: String(tvErr) })
    }

    remainingDays -= chunkDays
    currentUntilMs = sinceMs - DAY_MS
  }

  return {
    ok: true,
    status: 200,
    body: { data: mergedData },
    data: mergedData,
    url: lastUrl,
  }
}


async function fetchInsightsTotalValue(params: { igId: string; pageAccessToken: string; days: number }) {
  const untilMs = Date.now()
  const sinceMs = untilMs - (params.days - 1) * 24 * 60 * 60 * 1000
  const since = toUnixSeconds(sinceMs)
  const until = toUnixSeconds(untilMs)

  // v24 best-effort totals (some metrics may be unsupported)
  const metricListPrimary = ["total_interactions", "accounts_engaged", "profile_views"]
  const metricListFallback = ["accounts_engaged", "profile_views"]

  const run = async (metricList: string[]) => {
    const u = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.igId)}/insights`)
    u.searchParams.set("metric", metricList.join(","))
    u.searchParams.set("period", "day")
    u.searchParams.set("metric_type", "total_value")
    u.searchParams.set("since", String(since))
    u.searchParams.set("until", String(until))
    u.searchParams.set("access_token", params.pageAccessToken)
    const r = await fetch(u.toString(), { method: "GET", cache: "no-store" })
    const body = await safeJson(r)
    return { r, body, url: u.toString() }
  }

  let r: Response
  let body: any
  let url = ""
  ;({ r, body, url } = await run(metricListPrimary))
  if (!r.ok && isUnsupportedMetricBody(body)) {
    ;({ r, body, url } = await run(metricListFallback))
  }

  const data = Array.isArray(body?.data) ? body.data : []

  // Normalize to totals (null when missing)
  let total_interactions: number | null = null
  let profile_views: number | null = null
  let accounts_engaged: number | null = null
  for (const item of data) {
    const name = String(item?.name || "").trim()
    const valRaw = item?.total_value?.value
    const val = typeof valRaw === "number" ? valRaw : Number(valRaw)
    if (!Number.isFinite(val)) continue
    if (name === "profile_views") profile_views = Math.max(0, Math.floor(val))
    else if (name === "accounts_engaged") accounts_engaged = Math.max(0, Math.floor(val))
    else if (name === "total_interactions") total_interactions = Math.max(0, Math.floor(val))
  }

  return {
    ok: r.ok,
    status: r.status,
    body,
    data,
    totals: { total_interactions, profile_views, accounts_engaged },
    url,
  }
}

async function fetchTotalsBestEffort(params: {
  token: string
  envToken: string
  pageId: string
  igId: string
  days: number
}) {
  let pageToken = await getPageAccessToken(params.token, params.pageId)
  if (!pageToken.ok && params.envToken) pageToken = await getPageAccessToken(params.envToken, params.pageId)
  if (!pageToken.ok) {
    return { ok: false as const, insights_daily: buildInsightsDailyTotals({ total_interactions: null, accounts_engaged: null, profile_views: null, follower_change: null, impressions_total: null }) }
  }

  const totalsResp = await fetchInsightsTotalValue({
    igId: params.igId,
    pageAccessToken: pageToken.pageAccessToken,
    days: params.days,
  })

  const insights_daily = buildInsightsDailyTotals({
    total_interactions: totalsResp.ok ? totalsResp.totals.total_interactions : null,
    accounts_engaged: totalsResp.ok ? totalsResp.totals.accounts_engaged : null,
    profile_views: totalsResp.ok ? totalsResp.totals.profile_views : null,
    follower_change: null,
    impressions_total: null,
  })

  return { ok: totalsResp.ok as boolean, insights_daily }
}

async function handle(req: Request) {
  console.log("=== DAILY SNAPSHOT ROUTE HIT ===", {
    ts: new Date().toISOString(),
    url: req?.url ?? null,
    method: req?.method ?? null,
  })

  const t0 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
  const timingMarks: Array<{ name: string; dur: number }> = []
  const hasMark = (name: string) => timingMarks.some((m) => m.name === name)
  const mark = (name: string, start: number) => {
    const t = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
    const dur = Math.max(0, t - start)
    timingMarks.push({ name, dur })
    return t
  }
  const ensureTotalMark = () => {
    if (hasMark("total")) return
    const t = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
    timingMarks.push({ name: "total", dur: Math.max(0, t - t0) })
  }
  const serverTimingHeader = () => {
    ensureTotalMark()
    const list = timingMarks
      .map((m) => {
        const d = Number.isFinite(m.dur) ? Math.round(m.dur * 10) / 10 : 0
        return `${m.name};dur=${d}`
      })
      .join(", ")
    return list
  }

  const respondTimed = (p: Omit<Parameters<typeof respondWithEtag>[0], "serverTiming">) => {
    ensureTotalMark()
    return respondWithEtag({ ...p, serverTiming: serverTimingHeader() })
  }

  try {
    const url = new URL(req.url)
    const days = clampDays(url.searchParams.get("days"))
    const safeDays = Math.max(1, days)

    const tAuthStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()

    const h = req.headers.get("x-cron-secret")
    const cron = process.env.CRON_SECRET
    const cronMode = Boolean(h && cron && h === cron)
 
    let authed: Awaited<ReturnType<typeof createAuthedClient>> | null = null
    let userId: string = ""
    let authedUser: any = null

    if (!cronMode) {
      try {
        const supabase = await createAuthedClient()
        authed = supabase

        const userRes = await supabase.auth.getUser()
        const u = userRes?.data?.user ?? null
        authedUser = u
        userId = u?.id ? String(u.id) : ""
      } catch (e) {
        authed = null
        userId = ""
        authedUser = null
        console.warn("[daily-snapshot] failed to resolve user for active-account upsert", { cronMode: Boolean(cronMode) })
      }
    } else {
      authed = null
      userId = ""
      authedUser = null
    }
    
    if (__DEV__) {
      console.debug("[daily-snapshot][auth]", { 
        cronMode, 
        hasHeader: Boolean(h), 
        hasEnvCron: Boolean(cron),
        branchHint: cronMode ? "cron" : "cookie"
      })
    }

    let token = ""
    let pageId = ""
    let igId = ""

    let c: any = null
    if (cronMode) {
      const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()
      const envUserId = (process.env.IG_USER_ID ?? "").trim()
      if (!envToken) {
        const etag = weakEtagFromParts(["ds", "missing_env", "IG_ACCESS_TOKEN"])
        mark("auth", tAuthStart)
        return respondTimed({
          req,
          status: 401,
          body: { ok: false, error: "missing_env:IG_ACCESS_TOKEN" },
          etag,
          branch: "missing_env_token",
          source: "error",
        })
      }
      if (!envUserId) {
        const etag = weakEtagFromParts(["ds", "missing_env", "IG_USER_ID"])
        mark("auth", tAuthStart)
        return respondTimed({
          req,
          status: 401,
          body: { ok: false, error: "missing_env:IG_USER_ID" },
          etag,
          branch: "missing_env_user",
          source: "error",
        })
      }
      token = envToken
      igId = envUserId
    } else {
      try {
        c = await (cookies() as any)
      } catch {
        c = null
      }

      const rawCookieHeader = req.headers.get("cookie") || ""

      const tokenFromCookies = typeof c?.get === "function" ? (c.get("ig_access_token")?.value ?? "") : ""

      const tokenFromHeader = getCookieValueFromHeader(rawCookieHeader, "ig_access_token")

      token = (tokenFromCookies || tokenFromHeader).trim()

      if (!token) {
        const etag = weakEtagFromParts(["ds", "missing_cookie", "ig_access_token"])
        mark("auth", tAuthStart)
        return respondTimed({
          req,
          status: 401,
          body: { ok: false, error: "missing_cookie:ig_access_token" },
          etag,
          branch: "missing_cookie_token",
          source: "error",
        })
      }
    }

    mark("auth", tAuthStart)

    // Multi-user SaaS hardening:
    // Always resolve pageId/igId from the *current* token (do not trust ig_page_id / ig_ig_id cookies).
    const tIdsStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
    if (!cronMode) {
      const tokSigForIds = tokenSignature(token)
      const idsCacheKey = `ds_ids|tok:${tokSigForIds}`
      const cachedIds = readCache(__dsIdsCache, idsCacheKey)
      if (cachedIds?.pageId && cachedIds?.igId) {
        pageId = cachedIds.pageId
        igId = cachedIds.igId
        mark("ids", tIdsStart)
      } else {
        const ids = await getIdsIfMissing(token, "", "")
        mark("ids", tIdsStart)
        if (!ids.ok || !ids.pageId || !ids.igId) {
          const etag = weakEtagFromParts(["ds", "missing_ids_from_token"])
          return respondTimed({
            req,
            status: 403,
            body: { ok: false, error: "missing_ids_from_token" },
            etag,
            branch: "missing_ids_from_token",
            source: "error",
          })
        }

        pageId = ids.pageId
        igId = ids.igId
        try {
          writeCache(__dsIdsCache, idsCacheKey, { pageId, igId }, 60_000)
          pruneOldest(__dsIdsCache, 200)
        } catch {
          // ignore
        }

        try {
          if (typeof c?.set === "function") {
            c.set("ig_page_id", pageId, { httpOnly: true, sameSite: "lax", path: "/" })
            c.set("ig_ig_id", igId, { httpOnly: true, sameSite: "lax", path: "/" })
          }
        } catch {
          // ignore
        }
      }
    } else {
      mark("ids", tIdsStart)
    }

    // Resolve IDs: in cronMode, prefer environment variables over cookies
    const envPageId = (process.env.IG_PAGE_ID ?? "").trim()
    const envIgId = (process.env.IG_IG_ID ?? "").trim()
    const resolvedPageId = cronMode ? (pageId || envPageId) : pageId
    const resolvedIgId = cronMode ? (igId || envIgId) : igId

    if (!resolvedPageId) {
      const error = cronMode ? "missing_ids:page_id" : "missing_cookie:ig_page_id"
      const etag = weakEtagFromParts(["ds", error])
      return respondTimed({
        req,
        status: 401,
        body: { ok: false, error },
        etag,
        branch: "missing_page_id",
        source: "error",
      })
    }
    if (!resolvedIgId) {
      const error = cronMode ? "missing_ids:ig_ig_id" : "missing_cookie:ig_ig_id"
      const etag = weakEtagFromParts(["ds", error])
      return respondTimed({
        req,
        status: 401,
        body: { ok: false, error },
        etag,
        branch: "missing_ig_id",
        source: "error",
      })
    }

    // Ensure DB-backed active account SSOT record exists (best-effort; do not block API success)
    try {
      const igUserId = String(resolvedIgId).trim()

      if (!userId || !igUserId || !authed) {
        console.warn("[daily-snapshot] skip active user_instagram_accounts upsert", {
          cronMode: Boolean(cronMode),
          hasUser: Boolean(userId),
          hasIg: Boolean(igUserId),
          hasClient: Boolean(authed),
        })
      } else {
        await authed
          .from("user_instagram_accounts")
          .upsert(
            {
              user_id: userId,
              ig_user_id: igUserId,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,ig_user_id" },
          )

        await authed
          .from("user_instagram_accounts")
          .update({ is_active: false })
          .eq("user_id", userId)
          .neq("ig_user_id", igUserId)
      }
    } catch (e) {
      console.warn("[daily-snapshot] failed to upsert active user_instagram_accounts", {
        cronMode: Boolean(cronMode),
      })
    }

    let ssotAccountId = ""
    try {
      if (authed && userId) {
        const { data: activeRow } = await authed
          .from("user_instagram_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        ssotAccountId = activeRow?.id ? String(activeRow.id) : ""
      }
    } catch (e) {
      ssotAccountId = ""
    }

    if (!ssotAccountId) {
      console.warn("[daily-snapshot] missing ssotAccountId; continue without SSOT reach write", {
        cronMode: Boolean(cronMode),
      })
    }

    const tokSig = cronMode ? "cron" : tokenSignature(token)
    const userScopeKey = cronMode ? "cron" : tokSig
    const requestKey = `ds|${cronMode ? "cron" : "user"}|ig:${resolvedIgId}|pg:${resolvedPageId}|days:${safeDays}|tok:${tokSig}`
    const totalsKey = `ds_totals|${cronMode ? "cron" : "user"}|ig:${resolvedIgId}|pg:${resolvedPageId}|days:${safeDays}|tok:${tokSig}`
    const followersKey = `ds_followers|${cronMode ? "cron" : "user"}|ig:${resolvedIgId}|tok:${tokSig}`

    const { today, start } = utcDateRangeForDays(safeDays)
    const rangeStart = start
    const rangeEnd = today

    // SAFETY: Reach sync is controlled + per-user token only (no global IG_ACCESS_TOKEN fallback).
    // Run the sync gate before any cache/inflight early returns.
    try {
      const reachWriteSsotId = ssotAccountId

      const reachSyncKey = `reach_sync|u:${userScopeKey}|ig:${resolvedIgId}|pg:${resolvedPageId}`
      const lastSyncAt = __dsReachSyncAt.get(reachSyncKey) ?? 0
      const ttlMs = REACH_SYNC_TTL_HOURS * 60 * 60 * 1000
      const isStaleByTtl = !lastSyncAt || nowMs() - lastSyncAt > ttlMs

      const fetchDaysForThisRequest = Math.max(7, Math.min(MAX_REACH_BACKFILL_DAYS, safeDays))

      const dayMs = 24 * 60 * 60 * 1000
      const rangeEndMs = Date.parse(`${rangeEnd}T00:00:00.000Z`)
      const recentStartMs = rangeEndMs - (REACH_SYNC_RECENT_DAYS_SCAN - 1) * dayMs
      const recentStartDay = Number.isFinite(recentStartMs) ? new Date(recentStartMs).toISOString().slice(0, 10) : rangeStart

      const { data: recentRows, error: recentErr } = await supabaseServer
        .from("account_daily_snapshot")
        .select("day,reach")
        .eq("user_id", userScopeKey)
        .eq("ig_user_id", Number(resolvedIgId))
        .eq("page_id", Number(resolvedPageId))
        .gte("day", recentStartDay)
        .lte("day", rangeEnd)
        .order("day", { ascending: true })

      const list = Array.isArray(recentRows) ? (recentRows as any[]) : []
      const byDay = new Map<string, { reach: any }>()
      for (const r of list) {
        const day = typeof r?.day === "string" ? String(r.day).slice(0, 10) : ""
        if (!day) continue
        byDay.set(day, { reach: (r as any)?.reach })
      }

      const endDay = rangeEnd
      const prevDay = (() => {
        const prevMs = rangeEndMs - dayMs
        return Number.isFinite(prevMs) ? new Date(prevMs).toISOString().slice(0, 10) : ""
      })()

      const missingOrNull = (day: string) => {
        if (!day) return true
        if (!byDay.has(day)) return true
        const v = byDay.get(day)?.reach
        return v === null || v === undefined
      }

      const shouldSyncReach = isStaleByTtl || missingOrNull(endDay) || missingOrNull(prevDay)

      if (shouldSyncReach) {
        console.log("REACH SYNC START", {
          userScopeKey,
          igUserId: resolvedIgId,
          pageId: resolvedPageId,
          rangeStart,
          rangeEnd,
          fetchDaysForThisRequest,
          isStaleByTtl,
          recentErr: recentErr ? { message: (recentErr as any).message, code: (recentErr as any).code } : null,
        })

        // SSOT-only: do not write reach snapshots without a stable ssotId.
        if (!reachWriteSsotId) {
          console.log("REACH SYNC SKIP: NO SSOT ID")
        } else {

          const pageToken = await getPageAccessToken(token, resolvedPageId)
          if (!pageToken.ok) {
            console.log("REACH SYNC SKIP: NO PAGE TOKEN")
          } else {
            const accessToken = pageToken.pageAccessToken

          const fetchEndMs = rangeEndMs
          const fetchStartMs = fetchEndMs - (fetchDaysForThisRequest - 1) * dayMs
          const fetchStartDay = Number.isFinite(fetchStartMs)
            ? new Date(fetchStartMs).toISOString().slice(0, 10)
            : rangeStart

          const sinceDay = fetchStartDay < rangeStart ? rangeStart : fetchStartDay
          const untilDay = rangeEnd

          // Call A1: reach only (period=day, no metric_type)
          const reachResSync = await fetch(
            `${GRAPH_BASE}/${resolvedIgId}/insights` +
              `?metric=reach` +
              `&period=day` +
              `&since=${sinceDay}` +
              `&until=${untilDay}` +
              `&access_token=${accessToken}`
          )
          const reachJsonSync = await safeJson(reachResSync)

          if (!reachResSync.ok) {
            console.log("REACH SYNC DONE", { rows: 0, reason: "graph_not_ok", status: reachResSync.status })
          } else {
            const reachDataSync: any[] = Array.isArray((reachJsonSync as any)?.data) ? (reachJsonSync as any).data : []
            const reachSeries: any[] = reachDataSync.find((m: any) => m?.name === "reach")?.values ?? []

            // Call A2: views (period=day, metric_type=total_value) — best-effort
            let viewsSeries: any[] = []
            try {
              const viewsResSync = await fetch(
                `${GRAPH_BASE}/${resolvedIgId}/insights` +
                  `?metric=views` +
                  `&period=day` +
                  `&metric_type=total_value` +
                  `&since=${sinceDay}` +
                  `&until=${untilDay}` +
                  `&access_token=${accessToken}`
              )
              if (viewsResSync.ok) {
                const viewsJsonSync = await safeJson(viewsResSync) as any
                viewsSeries = (Array.isArray(viewsJsonSync?.data) ? viewsJsonSync.data : []).find((m: any) => m?.name === "views")?.values ?? []
              }
            } catch { /* best-effort; impressions will be 0 */ }

            // Call B: total_value metrics — best-effort, do NOT fail reach-sync if this fails
            let interactionsSeries: any[] = []
            let engagedSeries: any[] = []
            try {
              const tvRes = await fetch(
                `${GRAPH_BASE}/${resolvedIgId}/insights` +
                  `?metric=total_interactions,accounts_engaged` +
                  `&period=day` +
                  `&metric_type=total_value` +
                  `&since=${sinceDay}` +
                  `&until=${untilDay}` +
                  `&access_token=${accessToken}`
              )
              if (tvRes.ok) {
                const tvJson = await safeJson(tvRes)
                const tvData: any[] = Array.isArray(tvJson?.data) ? tvJson.data : []
                const extractTv = (name: string): any[] =>
                  tvData.find((m: any) => m?.name === name)?.values ?? []
                interactionsSeries = extractTv("total_interactions")
                engagedSeries = extractTv("accounts_engaged")
              } else {
                const tvErrBody = await safeJson(tvRes) as any
                console.warn("[account-daily-snapshot] reach-sync Call B non-ok", {
                  status: tvRes.status,
                  code: tvErrBody?.error?.code,
                  message: tvErrBody?.error?.message,
                  ig_user_id: resolvedIgId,
                })
              }
            } catch (tvErr) {
              console.warn("[account-daily-snapshot] reach-sync Call B threw", { err: String(tvErr) })
            }

            console.log("IG REACH SERIES PARSED", { count: reachSeries.length })

            if (!Array.isArray(reachSeries) || reachSeries.length === 0) {
              console.log("REACH SYNC DONE", { rows: 0, reason: "empty_series" })
            } else {
              // Build per-day map aligned across all series
              const syncByDay = new Map<string, {
                reach: number | null
                total_interactions: number | null
                accounts_engaged: number | null
                impressions: number | null
              }>()
              const ensureSync = (day: string) => {
                const ex = syncByDay.get(day)
                if (ex) return ex
                const init = { reach: null, total_interactions: null, accounts_engaged: null, impressions: null }
                syncByDay.set(day, init)
                return init
              }
              for (const v of reachSeries) {
                const day = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
                if (!day || day.length !== 10) continue
                const rec = ensureSync(day)
                const n = typeof v?.value === "number" && Number.isFinite(v.value) ? v.value : null
                rec.reach = n
              }
              for (const v of viewsSeries) {
                const day = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
                if (!day || day.length !== 10) continue
                const val = typeof v?.value === "number" && Number.isFinite(v.value) ? Math.floor(v.value) : null
                if (val !== null) ensureSync(day).impressions = val
              }
              for (const v of interactionsSeries) {
                const day = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
                if (!day || day.length !== 10) continue
                // total_value shape: { end_time, total_value: { value } } or { end_time, value }
                const raw = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
                const val = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : null
                if (val !== null) ensureSync(day).total_interactions = val
              }
              for (const v of engagedSeries) {
                const day = typeof v?.end_time === "string" ? v.end_time.slice(0, 10) : ""
                if (!day || day.length !== 10) continue
                const raw = v?.total_value?.value !== undefined ? v.total_value.value : v?.value
                const val = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : null
                if (val !== null) ensureSync(day).accounts_engaged = val
              }

              const reachSyncWroteAt = new Date().toISOString()
              const rows = Array.from(syncByDay.entries())
                .filter(([, rec]) => typeof rec.reach === "number" && Number.isFinite(rec.reach))
                .map(([day, rec]) => ({
                  ig_account_id: String(reachWriteSsotId),
                  user_id: String(userId),
                  user_id_text: String(userId),
                  ig_user_id: Number(resolvedIgId),
                  page_id: Number(resolvedPageId),
                  day,
                  reach: rec.reach,
                  impressions: typeof rec.impressions === "number" && Number.isFinite(rec.impressions) ? rec.impressions : 0,
                  total_interactions: typeof rec.total_interactions === "number" && Number.isFinite(rec.total_interactions) ? rec.total_interactions : 0,
                  accounts_engaged: typeof rec.accounts_engaged === "number" && Number.isFinite(rec.accounts_engaged) ? rec.accounts_engaged : 0,
                  source_used: "reach_sync",
                  wrote_at: reachSyncWroteAt,
                }))

              console.log("REACH SYNC UPSERT COUNT", { rows: rows.length })

              if (rows.length > 0) {
                if (!authed || !userId) {
                  console.warn("[daily-snapshot] skip account_daily_snapshot upsert (missing authed user)", { cronMode: Boolean(cronMode) })
                } else {
                  const reachSyncUpsertResult = await upsertDailySnapshot(authed, rows)
                  __dsReachSyncAt.set(reachSyncKey, nowMs())
                  const lastRow = rows[rows.length - 1]
                  console.log("REACH SYNC UPSERT RESULT", {
                    ok: reachSyncUpsertResult.ok,
                    rows: rows.length,
                    last_day: lastRow?.day,
                    last_impressions: lastRow?.impressions,
                    last_total_interactions: lastRow?.total_interactions,
                    last_accounts_engaged: lastRow?.accounts_engaged,
                  })
                }
              }

              console.log("REACH SYNC DONE", { rows: rows.length })
            }
          }
          }
        }
      }
    } catch (e: any) {
      console.error("REACH SYNC DONE", { rows: 0, err: String(e) })
    }

    const cachedResp = readCache(__dsCache, requestKey)
    if (cachedResp) {
      mark("total", t0)
      return respondTimed({
        req,
        status: cachedResp.status,
        body: cachedResp.body,
        etag: cachedResp.etag,
        branch: "cache_hit",
        source: cachedResp.source,
      })
    }

    const inflight = __dsInflight.get(requestKey)
    if (inflight) {
      const joined = (__dsInflightJoinCount.get(requestKey) ?? 0) + 1
      __dsInflightJoinCount.set(requestKey, joined)
      const out = await inflight
      mark("total", t0)
      return respondTimed({
        req,
        status: out.status,
        body: out.body,
        etag: out.etag,
        branch: "inflight_join",
        source: out.source,
      })
    }

    const run = (async (): Promise<DsResponsePayload> => {
      const ssotAccount = cronMode ? null : await resolveActiveIgAccountForRequest()

      let ssotId: string | null = ssotAccount?.id ?? null
      const ssotIgUserId = ssotAccount?.ig_user_id ?? null

      // FORCE SSOT resolve when missing — prefer candidate with most snapshot rows
      let ssotDiag: SsotResolution = { ig_account_id: null, strategy: "none", snapshot_rows: 0, candidate_count: 0 }
      if (!ssotId && resolvedIgId) {
        ssotDiag = await resolveSsotBySnapshotRows({
          sb: supabaseServer,
          igUserId: resolvedIgId,
          userId: userId || "",
        })
        if (ssotDiag.ig_account_id) {
          ssotId = ssotDiag.ig_account_id
        }
      } else if (ssotId && resolvedIgId) {
        // Already resolved from cookie/active — still count rows for diag
        ssotDiag = await resolveSsotBySnapshotRows({
          sb: supabaseServer,
          igUserId: resolvedIgId,
          userId: userId || "",
        })
        // Prefer the snapshot-rows winner over the cookie value
        if (ssotDiag.ig_account_id && ssotDiag.snapshot_rows > 0) {
          ssotId = ssotDiag.ig_account_id
        }
      }
      const followersIgId = resolvedIgId || ssotIgUserId || ""

      // Best-effort: write today's followers_count snapshot (do not affect API success)
      const followersDiag: Record<string, unknown> = { followers_write_attempted: false, followers_write_error: null }
      if (followersIgId) {
        void writeFollowersBestEffortCached({
          followersKey,
          token,
          igId: followersIgId,
          ssotId,
          authed,
          authedUserId: userId,
          diag: followersDiag,
        })
      }

      const availableDays: number | null = null

      let followersSeries: Array<{ day: string; followers_count: number }> = []
      let followersUsedSource: "ssot_db" | "legacy_fallback" = "legacy_fallback"
      let followersError: any = null

      try {
        let ssotIdForFollowersRead: string | null = ssotId ?? null

        if (!ssotIdForFollowersRead && resolvedIgId) {
          const { data: ssotAccountResolved } = await supabaseServer
            .from("user_instagram_accounts")
            .select("id")
            .eq("ig_user_id", resolvedIgId)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

          ssotIdForFollowersRead =
            ssotAccountResolved &&
            typeof (ssotAccountResolved as any).id === "string"
              ? String((ssotAccountResolved as any).id)
              : null
        }

        let followersQuery = supabaseServer
          .from("ig_daily_followers")
          .select("day, followers_count")
          .gte("day", rangeStart)
          .lte("day", rangeEnd)
          .order("day", { ascending: true })

        if (resolvedIgId) {
          followersQuery = followersQuery.eq("ig_user_id", String(resolvedIgId))
        } else if (ssotIgUserId) {
          followersQuery = followersQuery.eq("ig_user_id", String(ssotIgUserId))
        } else {
          // no identity available
          followersQuery = followersQuery.limit(0)
        }

        const { data: followerRows, error } = await followersQuery

        followersError = error

        if (error) {
          console.error("[daily-snapshot] followers query error", {
            message: error.message,
            code: (error as any).code,
            details: (error as any).details,
            hint: (error as any).hint,
            hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            ssotIdForFollowersRead,
            resolvedIgId,
            ssotIgUserId,
            rangeStart,
            rangeEnd,
          })
        }

        if (!error && Array.isArray(followerRows) && followerRows.length > 0) {
          followersSeries = followerRows
            .map((r: any) => {
              const day = String(r?.day ?? "").trim()
              const n = Number((r as any)?.followers_count)
              if (!day || !Number.isFinite(n)) return null
              return { day, followers_count: Math.floor(n) }
            })
            .filter((x: any): x is { day: string; followers_count: number } => x !== null)

          followersUsedSource = ssotIdForFollowersRead ? "ssot_db" : "legacy_fallback"
        }
      } catch {
        // fail-safe: do not break daily-snapshot if SSOT read fails
      }

      if (__DEBUG_DAILY_SNAPSHOT__) {
        console.log("[daily-snapshot] scope", { days: safeDays, start, today, userScopeKey, resolvedIgId, resolvedPageId })
      }

      // 1) Try pre-aggregated snapshots first (fast path)
      try {
        const tSnapStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
        const { rows: snapRows, error: snapError } = await readAccountDailySnapshots({
          userScopeKey,
          igId: resolvedIgId,
          pageId: resolvedPageId,
          start,
          today,
        })
        mark("snap", tSnapStart)

        if (!snapError && snapRows.length > 0) {
          if (__DEBUG_DAILY_SNAPSHOT__) {
            console.log("[daily-snapshot] snap_hit", { snap_rows: snapRows.length, source: "snap" })
          }
          const tBuildStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
          const pointsPadded = buildPaddedPointsFromRows(snapRows, safeDays)
          mark("build", tBuildStart)

          const availableDaysCount = countCollectedDaysFromRows(snapRows)

          const maxUpdatedAt = snapRows.reduce((max: string | null, r: any) => {
            const ua = typeof r?.updated_at === "string" ? String(r.updated_at).trim() : ""
            return ua && (!max || ua > max) ? ua : max
          }, null)

          const etag = weakEtagFromParts(["ds", "snap", resolvedIgId, resolvedPageId, safeDays, maxUpdatedAt ?? today])
          if (isIfNoneMatchHit(req, etag)) {
            return { status: 200, source: "db", body: null, etag }
          }

          const tTotalsStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
          const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()
          const totals = await getTotalsCached({ totalsKey, token, envToken, pageId: resolvedPageId, igId: resolvedIgId, days: safeDays })
          mark("totals", tTotalsStart)

          return {
            status: 200,
            source: "db",
            etag,
            body: {
              build_marker: BUILD_MARKER,
              ok: true,
              days: safeDays,
              rangeDays: safeDays,
              rangeStart: start,
              rangeEnd: today,
              available_days: availableDaysCount,
              followers_daily_rows: followersSeries,
              followers_available_days: followersSeries.length,
              followers_last_write_at: null,
              points: sanitizePoints(pointsPadded),
              points_ok: true,
              points_source: "snap",
              points_end_date: today,
              trend_points_v2: sanitizeTrendPointsV2(buildTrendPointsV2(pointsPadded)),
              insights_daily: totals.insights_daily,
              insights_daily_series: [],
              series_ok: true,
              __diag: {
                db_rows: followersSeries.length,
                used_source: followersUsedSource,
                start: rangeStart,
                end: rangeEnd,
                followers_error: followersError ? { message: followersError.message, code: (followersError as any).code } : null,
                resolved_ig_account_id: ssotDiag.ig_account_id,
                resolved_strategy: ssotDiag.strategy,
                resolved_snapshot_rows: ssotDiag.snapshot_rows,
                candidate_count: ssotDiag.candidate_count,
                resolved_ig_user_id: resolvedIgId || null,
                resolved_page_id: resolvedPageId || null,
                snapshot_write_diag: (() => {
                  const latest = snapRows.length > 0 ? snapRows[snapRows.length - 1] as any : null
                  if (!latest) return null
                  return {
                    day: latest.day ?? null,
                    reach: latest.reach ?? null,
                    impressions: latest.impressions ?? null,
                    total_interactions: latest.total_interactions ?? null,
                    accounts_engaged: latest.accounts_engaged ?? null,
                    impressions_non_null: latest.impressions !== null && latest.impressions !== undefined,
                    total_interactions_non_null: latest.total_interactions !== null && latest.total_interactions !== undefined,
                    accounts_engaged_non_null: latest.accounts_engaged !== null && latest.accounts_engaged !== undefined,
                  }
                })(),
                ...followersDiag,
              },
            },
          }
        }
      } catch {
        // ignore snapshot failures; fall back to legacy DB path
      }

      // 2) SSOT-first read: ig_daily_insights scoped by ig_account_id
      // Minimal READ-ONLY patch: do not write-back/upsert in this step.
      try {
        const tSsotStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
        // Use already-resolved ssotId (snapshot-rows-aware) from above
        const ssotIdForRead = ssotId

        if (ssotIdForRead) {
          const { data: ssotRows, error: ssotErr } = await supabaseServer
            .from("ig_daily_insights")
            .select("day,reach,impressions,total_interactions,accounts_engaged,captured_at")
            .eq("ig_account_id", ssotIdForRead)
            .gte("day", start)
            .lte("day", today)
            .order("day", { ascending: true })

          mark("db", tSsotStart)

          const list = Array.isArray(ssotRows) ? ssotRows : []
          if (!ssotErr && list.length > 0) {
            const pointsPadded = buildPaddedPointsFromRows(list, safeDays)

            const availableDaysCount = countCollectedDaysFromRows(list)
            const maxCapturedAt = list.reduce((max: string | null, r: any) => {
              const ca = typeof r?.captured_at === "string" ? String(r.captured_at).trim() : ""
              return ca && (!max || ca > max) ? ca : max
            }, null)

            const etag = weakEtagFromParts(["ds", "db", resolvedIgId, resolvedPageId, safeDays, maxCapturedAt ?? today])
            if (isIfNoneMatchHit(req, etag)) {
              return { status: 200, source: "db", body: null, etag }
            }

            const tTotalsStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
            const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()
            const totals = await getTotalsCached({ totalsKey, token, envToken, pageId: resolvedPageId, igId: resolvedIgId, days: safeDays })
            mark("totals", tTotalsStart)

            return {
              status: 200,
              source: "db",
              etag,
              body: {
                build_marker: BUILD_MARKER,
                ok: true,
                days: safeDays,
                rangeDays: safeDays,
                rangeStart: start,
                rangeEnd: today,
                available_days: availableDaysCount,
                followers_daily_rows: followersSeries,
                followers_available_days: followersSeries.length,
                followers_last_write_at: null,
                points: sanitizePoints(pointsPadded),
                points_ok: true,
                points_source: "legacy_db",
                points_end_date: today,
                trend_points_v2: sanitizeTrendPointsV2(buildTrendPointsV2(pointsPadded)),
                insights_daily: totals.insights_daily,
                insights_daily_series: [],
                series_ok: true,
                __diag: {
                  db_rows: followersSeries.length,
                  used_source: followersUsedSource,
                  start: rangeStart,
                  end: rangeEnd,
                  followers_error: followersError ? { message: followersError.message, code: (followersError as any).code } : null,
                  resolved_ig_account_id: ssotDiag.ig_account_id,
                  resolved_strategy: ssotDiag.strategy,
                  resolved_snapshot_rows: ssotDiag.snapshot_rows,
                  candidate_count: ssotDiag.candidate_count,
                  ...followersDiag,
                },
              },
            }
          }
        }
      } catch {
        // ignore SSOT read failures; continue with existing paths
      }

      // 2) Legacy ig_daily_insights (fallback)
      try {
        const tDbStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
        const { data: dbRows, error: dbError } = await supabaseServer
          .from("ig_daily_insights")
          .select("day,reach,impressions,total_interactions,accounts_engaged,updated_at")
          .eq("ig_user_id", Number(resolvedIgId))
          .eq("page_id", Number(resolvedPageId))
          .gte("day", start)
          .lte("day", today)
          .order("day", { ascending: true })

        mark("db", tDbStart)

        const list = Array.isArray(dbRows) ? dbRows : []
        if (__DEBUG_DAILY_SNAPSHOT__) {
          console.log("[daily-snapshot] legacy_db", {
            err: dbError
              ? { message: (dbError as any)?.message, code: (dbError as any)?.code, hint: (dbError as any)?.hint }
              : null,
            rows_len: list.length,
          })
        }

        if (!dbError && list.length > 0) {
          if (__DEBUG_DAILY_SNAPSHOT__) {
            console.log("[daily-snapshot] legacy_db_hit", { rows_len: list.length, source: "legacy_db" })
          }
          const tBuildStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
          const pointsPadded = buildPaddedPointsFromRows(list, safeDays)
          mark("build", tBuildStart)

          const availableDaysCount = countCollectedDaysFromRows(list)

          const maxUpdatedAt = list.reduce((max: string | null, r: any) => {
            const ua = typeof r?.updated_at === "string" ? String(r.updated_at).trim() : ""
            return ua && (!max || ua > max) ? ua : max
          }, null)

          const etag = weakEtagFromParts(["ds", "db", resolvedIgId, resolvedPageId, safeDays, maxUpdatedAt ?? today])
          if (isIfNoneMatchHit(req, etag)) {
            return { status: 200, source: "db", body: null, etag }
          }

          const tTotalsStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
          const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()
          const totals = await getTotalsCached({ totalsKey, token, envToken, pageId: resolvedPageId, igId: resolvedIgId, days: safeDays })
          mark("totals", tTotalsStart)

          return {
            status: 200,
            source: "db",
            etag,
            body: {
              build_marker: BUILD_MARKER,
              ok: true,
              days: safeDays,
              rangeDays: safeDays,
              rangeStart: start,
              rangeEnd: today,
              available_days: availableDaysCount,
              followers_daily_rows: followersSeries,
              followers_available_days: followersSeries.length,
              followers_last_write_at: null,
              points: sanitizePoints(pointsPadded),
              points_ok: true,
              points_source: "legacy_db",
              points_end_date: today,
              trend_points_v2: sanitizeTrendPointsV2(buildTrendPointsV2(pointsPadded)),
              insights_daily: totals.insights_daily,
              insights_daily_series: [],
              series_ok: true,
              __diag: {
                db_rows: followersSeries.length,
                used_source: followersUsedSource,
                start: rangeStart,
                end: rangeEnd,
                followers_error: followersError ? { message: followersError.message, code: (followersError as any).code } : null,
                resolved_ig_account_id: ssotDiag.ig_account_id,
                resolved_strategy: ssotDiag.strategy,
                resolved_snapshot_rows: ssotDiag.snapshot_rows,
                candidate_count: ssotDiag.candidate_count,
                ...followersDiag,
              },
            },
          }
        }
      } catch {
        // ignore legacy DB failures; fall back to Graph
      }

      if (__DEBUG_DAILY_SNAPSHOT__) {
        console.log("[daily-snapshot] no_data_fallback", { source: "empty", safeDays, start, today })
      }

      // 3) Seed from Graph (v24 rules) and backfill snapshots
      try {
        const tGraphStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
        const envToken = (process.env.IG_ACCESS_TOKEN ?? "").trim()

        // page access token via cookie token
        let pageToken = await getPageAccessToken(token, resolvedPageId)
        let tokenSource: "cookie" | "env" = "cookie"

        // optional env fallback
        if (!pageToken.ok && envToken) {
          tokenSource = "env"
          pageToken = await getPageAccessToken(envToken, resolvedPageId)
        }

        if (!pageToken.ok) {
          // hard fail with diag (don't silently treat as empty)
          const etag = weakEtagFromParts(["ds", "auth_err", resolvedIgId, resolvedPageId, safeDays, today])
          return {
            status: 401,
            source: "error",
            etag,
            body: {
              build_marker: BUILD_MARKER,
              ok: false,
              error: "page_access_token_failed",
              __diag: { token_source: tokenSource, pageTokenStatus: pageToken.status, pageTokenBody: pageToken.body },
            },
          }
        }

        const series = await fetchInsightsTimeSeries({
          igId: resolvedIgId,
          pageAccessToken: pageToken.pageAccessToken,
          days: safeDays,
        })

        mark("graph", tGraphStart)

        if (!series.ok) {
          const etag = weakEtagFromParts(["ds", "graph_err", resolvedIgId, resolvedPageId, safeDays, today, series.status])
          return {
            status: 502,
            source: "error",
            etag,
            body: {
              build_marker: BUILD_MARKER,
              ok: false,
              error: "graph_time_series_failed",
              __diag: {
                token_source: tokenSource,
                status: series.status,
                body: series.body,
                start,
                end: today,
              },
            },
          }
        }

        const points = buildPointsFromGraphInsightsTimeSeries(series.data, safeDays)
        const etag = weakEtagFromParts(["ds", "graph", resolvedIgId, resolvedPageId, safeDays, today, points.length])
        if (isIfNoneMatchHit(req, etag)) {
          return { status: 200, source: "graph", body: null, etag }
        }

        const hasAnyNonZero =
          Array.isArray(points) &&
          points.some((p) => toSafeInt(p?.reach) > 0 || toSafeInt(p?.interactions) > 0)

        // totals (best-effort)
        const tTotalsStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
        const totals = await getTotalsCached({ totalsKey, token, envToken, pageId: resolvedPageId, igId: resolvedIgId, days: safeDays })
        mark("totals", tTotalsStart)
        const insights_daily = totals.insights_daily

        // Backfill snapshots on-demand (last 120d) if we hit Graph path
        if (ssotAccountId && authed && userId) {
          try {
            const tBackfillStart = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
            const backfill = await backfillMissingSnapshotsFromGraph({
              authed,
              authedUserId: userId,
              token,
              envToken,
              igId: resolvedIgId,
              pageId: resolvedPageId,
              ssotId: ssotAccountId,
              start,
              today,
              maxDays: 120,
            })
            mark("backfill", tBackfillStart)
            if (__DEBUG_DAILY_SNAPSHOT__) {
              console.log("[daily-snapshot] backfill", { ok: backfill.ok, rows: backfill.rows.length, tokenSource: backfill.tokenSource, maxDays: 120 })
            }
          } catch {
            // ignore backfill failures; continue with Graph response
          }
        }

        if (!hasAnyNonZero) {
          return {
            status: 200,
            source: "graph",
            etag,
            body: {
              build_marker: BUILD_MARKER,
              ok: true,
              days: safeDays,
              rangeDays: safeDays,
              rangeStart: start,
              rangeEnd: today,
              available_days: availableDays,
              followers_daily_rows: followersSeries,
              followers_available_days: followersSeries.length,
              followers_last_write_at: null,
              points: [],
              points_ok: false,
              points_source: "empty",
              points_end_date: today,
              trend_points_v2: [],
              insights_daily,
              insights_daily_series: series.data,
              series_ok: true,
              __diag: {
                db_rows: followersSeries.length,
                used_source: followersUsedSource,
                start: rangeStart,
                end: rangeEnd,
                followers_error: followersError ? { message: followersError.message, code: (followersError as any).code } : null,
                ...followersDiag,
              },
            },
          }
        }

        // Write to legacy ig_daily_insights (skip today)
        try {
          const candidate = points
            .filter((p) => p?.date && p.date !== today)
            .map((p) => {
              const day = p.date
              const reachRaw = p.reach
              const reach = typeof reachRaw === "number" && Number.isFinite(reachRaw) ? reachRaw : null
              console.log("SSOT SNAPSHOT WRITE", {
                ts: new Date().toISOString(),
                day,
                reachRaw,
                reachStored: reach,
                hasReachRaw: typeof reachRaw === "number",
                isFiniteReachRaw: typeof reachRaw === "number" && Number.isFinite(reachRaw),
              })

              return {
                day,
                reach,
                impressions: 0,
                total_interactions: toSafeInt(p.interactions),
                accounts_engaged: 0,
              }
            })

          const skipDays = new Set<string>()
          try {
            const daysToCheck = candidate.map((r) => r.day).filter(Boolean)
            const { data: existing } = daysToCheck.length
              ? await supabaseServer
                  .from("ig_daily_insights")
                  .select("day,reach,impressions,total_interactions,accounts_engaged")
                  .eq("ig_user_id", Number(resolvedIgId))
                  .eq("page_id", Number(resolvedPageId))
                  .in("day", daysToCheck)
              : ({ data: [] } as any)

            for (const r of (Array.isArray(existing) ? existing : []) as any[]) {
              const d = String(r?.day || "").trim()
              if (!d) continue
              if (
                toSafeInt(r?.reach) > 0 ||
                toSafeInt(r?.impressions) > 0 ||
                toSafeInt(r?.total_interactions) > 0 ||
                toSafeInt(r?.accounts_engaged) > 0
              ) {
                skipDays.add(d)
              }
            }
          } catch {
            // ignore
          }

          const rowsToUpsert = candidate
            .filter((r) => !skipDays.has(r.day))
            .map((r) => ({
              ig_user_id: Number(resolvedIgId),
              page_id: Number(resolvedPageId),
              day: r.day,
              reach: r.reach,
              impressions: r.impressions,
              total_interactions: r.total_interactions,
              accounts_engaged: r.accounts_engaged,
              updated_at: new Date().toISOString(),
            }))

          if (rowsToUpsert.length >= 1) {
            try {
              await supabaseServer.from("ig_daily_insights").upsert(rowsToUpsert as any, {
                onConflict: "ig_user_id,page_id,day",
              })
              for (const r of rowsToUpsert as any[]) {
                console.log("SSOT SNAPSHOT WRITE OK", { day: r?.day, reachStored: r?.reach ?? null })
              }
            } catch (err: any) {
              for (const r of rowsToUpsert as any[]) {
                console.error("SSOT SNAPSHOT WRITE FAIL", { day: r?.day, err: String(err) })
              }
            }
          }
        } catch {
          // ignore db write failures
        }

        if (__DEBUG_DAILY_SNAPSHOT__) {
          console.log("[daily-snapshot] graph_response", { points_len: points.length, hasAnyNonZero, source: "graph" })
        }

        return {
          status: 200,
          source: "graph",
          etag,
          body: {
            build_marker: BUILD_MARKER,
            ok: true,
            days: safeDays,
            rangeDays: safeDays,
            rangeStart: start,
            rangeEnd: today,
            available_days: availableDays,
            followers_daily_rows: followersSeries,
            followers_available_days: followersSeries.length,
            followers_last_write_at: null,
            points: sanitizePoints(points),
            points_ok: true,
            points_source: "graph_series_v24",
            points_end_date: today,
            trend_points_v2: sanitizeTrendPointsV2(buildTrendPointsV2(points)),
            insights_daily,
            insights_daily_series: series.data,
            series_ok: true,
            __diag: {
              db_rows: followersSeries.length,
              used_source: followersUsedSource,
              start: rangeStart,
              end: rangeEnd,
              followers_error: followersError ? { message: followersError.message, code: (followersError as any).code } : null,
              resolved_ig_account_id: ssotDiag.ig_account_id,
              resolved_strategy: ssotDiag.strategy,
              resolved_snapshot_rows: ssotDiag.snapshot_rows,
              candidate_count: ssotDiag.candidate_count,
              ...followersDiag,
            },
          },
        }
      } catch (e: any) {
        if (__DEBUG_DAILY_SNAPSHOT__) {
          console.log("[daily-snapshot] graph_seed_failed", { error: e?.message ?? "graph_seed_failed", source: "error" })
        }
        const etag = weakEtagFromParts(["ds", "graph_seed_failed", resolvedIgId, resolvedPageId, safeDays])
        return {
          status: 502,
          source: "error",
          etag,
          body: {
            build_marker: BUILD_MARKER,
            ok: false,
            error: "graph_seed_failed",
            message: e?.message ?? String(e),
          },
        }
      }

    const etag = weakEtagFromParts(["ds", "no_data", resolvedIgId, resolvedPageId, safeDays])
    return {
      status: 200,
      source: "db",
      etag,
      body: {
        build_marker: BUILD_MARKER,
        ok: true,
        days: safeDays,
        rangeDays: safeDays,
        rangeStart: start,
        rangeEnd: today,
        available_days: availableDays,
        followers_daily_rows: followersSeries,
        followers_available_days: followersSeries.length,
        followers_last_write_at: null,
        points: [],
        points_ok: false,
        points_source: "empty",
        points_end_date: today,
        trend_points_v2: [],
        insights_daily: [],
        insights_daily_series: [],
        series_ok: true,
        __diag: {
          db_rows: followersSeries.length,
          used_source: followersUsedSource,
          start: rangeStart,
          end: rangeEnd,
          followers_error: followersError ? { message: followersError.message, code: (followersError as any).code } : null,
          resolved_ig_account_id: ssotDiag.ig_account_id,
          resolved_strategy: ssotDiag.strategy,
          resolved_snapshot_rows: ssotDiag.snapshot_rows,
          candidate_count: ssotDiag.candidate_count,
          ...followersDiag,
        },
      },
    }
  })()

  __dsInflight.set(requestKey, run)
  __dsInflightJoinCount.set(requestKey, 0)

  try {
    const out = await run

    // Cache only successful 200 responses.
    try {
      if (out.status === 200 && out.body !== null) {
        writeCache(__dsCache, requestKey, { body: out.body, status: out.status, source: out.source, etag: out.etag }, 12_000)
        pruneOldest(__dsCache, 200)
      }
    } catch {
      // ignore
    }

    mark("total", t0)
    return respondTimed({
      req,
      status: out.status,
      body: out.body,
      etag: out.etag,
      branch: "miss",
      source: out.source,
    })
  } catch (err: any) {
    const etag = weakEtagFromParts(["ds", "server_error", String(err?.message ?? "err")])
    mark("total", t0)
    return respondTimed({
      req,
      status: 500,
      body: { ok: false, error: "server_error", message: err?.message ?? String(err) },
      etag,
      branch: "server_error",
      source: "error",
    })
  } finally {
    __dsInflight.delete(requestKey)
    __dsInflightJoinCount.delete(requestKey)
  }
} catch (e: any) {
  const etag = weakEtagFromParts(["ds", "server_error", String(e?.message ?? "err")])
  mark("total", t0)
  return respondTimed({
    req,
    status: 500,
    body: { ok: false, error: "server_error", message: e?.message ?? String(e) },
    etag,
    branch: "server_error_outer",
    source: "error",
  })
}

}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
