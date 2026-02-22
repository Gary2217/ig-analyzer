export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient, supabaseServer, createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { createHash } from "crypto"
import { upsertDailySnapshot } from "@/app/api/_lib/upsertDailySnapshot"

// ---------------------------------------------------------------------------
// POST /api/prewarm
// Best-effort session prewarm: today's snapshot + cards payload + thumbnails.
// Auth required. Per-user per-account token only — no global env fallback.
// Returns quickly (~800ms); all heavy work is fire-and-forget.
// ---------------------------------------------------------------------------

const GRAPH_BASE = "https://graph.facebook.com/v24.0"
const THROTTLE_COOKIE_FULL = "prewarm_at"
const THROTTLE_COOKIE_THUMBS = "prewarm_thumbs_at"
const THROTTLE_MS_FULL = 60_000 // 60s
const THROTTLE_MS_THUMBS = 20_000 // 20s

type PrewarmMode = "full" | "thumbs" | "snapshots"
type PrewarmReason = "login" | "account_switch" | "new_posts" | "manual"

function nowIso() {
  return new Date().toISOString()
}

function todayUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

// ---------------------------------------------------------------------------
// T1: Ensure today's account_daily_snapshot row exists (upsert if missing)
// ---------------------------------------------------------------------------
async function t1EnsureTodaySnapshot(params: {
  igAccountId: string
  igUserId: string
  pageId: string
  userId: string
  token: string
}): Promise<{ did: boolean; reason?: string }> {
  const { igAccountId, igUserId, pageId, userId, token } = params
  const today = todayUtc()

  // Check if today already has a non-null reach row
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

  // Fetch today's insights from Graph (yesterday + today window)
  const yesterday = (() => {
    const ms = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86400_000
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  })()

  // Call A: time-series reach (period=day, no metric_type)
  const insightsRes = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
      `?metric=reach,views&period=day&since=${yesterday}&until=${today}&access_token=${pageToken}`,
    { cache: "no-store" }
  )
  if (!insightsRes.ok) return { did: false, reason: `graph_${insightsRes.status}` }

  const insightsJson = await safeJson(insightsRes) as any
  const reachValues: any[] = insightsJson?.data?.find((m: any) => m?.name === "reach")?.values ?? []
  const viewsValues: any[] = insightsJson?.data?.find((m: any) => m?.name === "views")?.values ?? []

  // Call B: total_value metrics (total_interactions, accounts_engaged) — best-effort
  let intValues: any[] = []
  let engagedValues: any[] = []
  try {
    const tvRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
        `?metric=total_interactions,accounts_engaged&period=day&metric_type=total_value&since=${yesterday}&until=${today}&access_token=${pageToken}`,
      { cache: "no-store" }
    )
    if (tvRes.ok) {
      const tvJson = await safeJson(tvRes) as any
      intValues = tvJson?.data?.find((m: any) => m?.name === "total_interactions")?.values ?? []
      engagedValues = tvJson?.data?.find((m: any) => m?.name === "accounts_engaged")?.values ?? []
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

  const todayData = byDay.get(today)
  if (!todayData) return { did: false, reason: "no_graph_data_for_today" }

  await upsertDailySnapshot(supabaseServer, {
    ig_account_id: igAccountId,
    user_id: userId,
    ig_user_id: Number(igUserId),
    page_id: pageId ? Number(pageId) : 0,
    day: today,
    reach: todayData.reach,
    impressions: todayData.impressions,
    total_interactions: todayData.total_interactions,
    accounts_engaged: todayData.accounts_engaged,
    source_used: "prewarm",
    wrote_at: nowIso(),
  })

  return { did: true }
}

// ---------------------------------------------------------------------------
// T2: Warm creator cards payload (DB read only)
// ---------------------------------------------------------------------------
async function t2WarmCards(params: { userId: string }): Promise<{ did: boolean }> {
  await supabaseServer
    .from("creator_cards")
    .select("id, avatar_url, is_owner_card, updated_at")
    .eq("user_id", params.userId)
    .order("is_owner_card", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(5)
  return { did: true }
}

// ---------------------------------------------------------------------------
// T3: Warm thumbnails — fire-and-forget fetch to /api/ig/thumbnail for recent posts
// ---------------------------------------------------------------------------
async function t3WarmThumbnails(params: {
  userId: string
  baseUrl: string
}): Promise<{ did: boolean; count: number }> {
  // Get the user's card_id first
  const { data: cardRow } = await supabaseServer
    .from("creator_cards")
    .select("id")
    .eq("user_id", params.userId)
    .order("is_owner_card", { ascending: false })
    .limit(1)
    .maybeSingle()

  const cardId = cardRow && typeof (cardRow as any).id === "string" ? String((cardRow as any).id) : null
  if (!cardId) return { did: false, count: 0 }

  const { data: postsRow } = await supabaseServer
    .from("creator_card_ig_posts")
    .select("posts")
    .eq("user_id", params.userId)
    .eq("card_id", cardId)
    .limit(1)
    .maybeSingle()

  const posts: unknown[] = Array.isArray((postsRow as any)?.posts) ? (postsRow as any).posts : []
  if (posts.length === 0) return { did: false, count: 0 }

  // Extract up to 16 thumbnail URLs
  const thumbUrls: string[] = []
  for (const p of posts.slice(0, 24)) {
    if (!p || typeof p !== "object") continue
    const pr = p as Record<string, unknown>
    const candidates = [
      pr.thumbnail_url, (pr as any).thumbnailUrl,
      pr.media_url, (pr as any).mediaUrl,
      pr.image_url, (pr as any).imageUrl,
    ]
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() && !/\.mp4(\?|$)/i.test(c)) {
        thumbUrls.push(c.trim())
        break
      }
    }
    if (thumbUrls.length >= 16) break
  }

  if (thumbUrls.length === 0) return { did: false, count: 0 }

  // Check which hashes are already in DB cache (skip those)
  const hashes = thumbUrls.map(urlHash)
  const { data: cachedRows } = await supabaseServer
    .from("ig_thumbnail_cache")
    .select("url_hash")
    .in("url_hash", hashes)
    .gt("hard_expires_at", nowIso())

  const cachedSet = new Set<string>(
    (Array.isArray(cachedRows) ? cachedRows : []).map((r: any) => String(r?.url_hash ?? ""))
  )

  const toFetch = thumbUrls.filter((u) => !cachedSet.has(urlHash(u)))
  if (toFetch.length === 0) return { did: true, count: 0 }

  // Fire-and-forget with concurrency=4, no await
  const CONCURRENCY = 4
  void (async () => {
    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map((u) =>
          fetch(`${params.baseUrl}/api/ig/thumbnail?url=${encodeURIComponent(u)}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
          }).catch(() => null)
        )
      )
    }
  })()

  return { did: true, count: toFetch.length }
}

// ---------------------------------------------------------------------------
// Best-effort event logging (service role, never blocks response)
// ---------------------------------------------------------------------------
async function logPrewarmEvent(params: {
  userId: string
  igAccountId: string | null
  mode: PrewarmMode
  reason: PrewarmReason
  ok: boolean
  skipped: string | null
  tookMs: number
}): Promise<void> {
  try {
    const svc = createServiceClient()
    await svc.from("user_prewarm_events").insert({
      user_id: params.userId,
      ig_account_id: params.igAccountId,
      mode: params.mode,
      reason: params.reason,
      ok: params.ok,
      skipped: params.skipped,
      took_ms: params.tookMs,
    })
  } catch {
    // best-effort — ignore all errors
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const t0 = Date.now()

  try {
    // --- Parse body first (needed for mode before throttle check) ---
    let body: Record<string, unknown> = {}
    try { body = (await req.json()) ?? {} } catch { /* empty body ok */ }
    const requestedAccountId = typeof body.ig_account_id === "string" ? body.ig_account_id.trim() : ""
    const debugMode = body.debug === true
    const mode: PrewarmMode =
      body.mode === "thumbs" ? "thumbs" :
      body.mode === "snapshots" ? "snapshots" :
      "full"
    const _reason: PrewarmReason =
      body.reason === "login" ? "login" :
      body.reason === "account_switch" ? "account_switch" :
      body.reason === "new_posts" ? "new_posts" :
      "manual"

    // --- Cookie-based throttle (per-mode) ---
    const cookieStore = await cookies()
    const throttleCookie = mode === "thumbs" ? THROTTLE_COOKIE_THUMBS : THROTTLE_COOKIE_FULL
    const throttleMs = mode === "thumbs" ? THROTTLE_MS_THUMBS : THROTTLE_MS_FULL
    const lastAt = Number(cookieStore.get(throttleCookie)?.value ?? "0")
    if (lastAt && Date.now() - lastAt < throttleMs) {
      // Log throttled event best-effort (auth needed; skip if not yet resolved)
      return NextResponse.json({ ok: true, skipped: "throttled", mode, took_ms: Date.now() - t0 })
    }

    // --- Auth ---
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 })
    }

    // --- Resolve ig_account (SSOT, per-user) ---
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
      // Try cookie hint first (same pattern as ssot-trend route)
      let cookieAccountId = ""
      try {
        cookieAccountId =
          cookieStore.get("ig_account_id")?.value?.trim() ||
          cookieStore.get("ig_active_account_id")?.value?.trim() ||
          ""
      } catch { /* ignore */ }

      if (cookieAccountId) {
        const { data: acct } = await authed
          .from("user_ig_accounts")
          .select("id, ig_user_id, page_id")
          .eq("id", cookieAccountId)
          .eq("user_id", user.id)
          .eq("provider", "instagram")
          .limit(1)
          .maybeSingle()
        igAccountId = acct && typeof (acct as any).id === "string" ? String((acct as any).id) : ""
        igUserId = acct && (acct as any).ig_user_id != null ? String((acct as any).ig_user_id) : ""
        pageId = acct && (acct as any).page_id != null ? String((acct as any).page_id) : ""
      }
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

    if (!igAccountId) {
      void logPrewarmEvent({ userId: user.id, igAccountId: null, mode, reason: _reason, ok: true, skipped: "no_ig_account", tookMs: Date.now() - t0 })
      return NextResponse.json({ ok: true, skipped: "no_ig_account", took_ms: Date.now() - t0 })
    }

    // --- Resolve per-account token (no global fallback) ---
    const { data: tokenRow } = await supabaseServer
      .from("user_ig_account_tokens")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "instagram")
      .eq("ig_user_id", igUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const token = tokenRow && typeof (tokenRow as any).access_token === "string"
      ? String((tokenRow as any).access_token).trim()
      : ""

    // --- Resolve base URL for internal thumbnail fetch ---
    const baseUrl = (() => {
      const appBase = (process.env.NEXT_PUBLIC_APP_BASE_URL ?? "").trim()
      if (appBase) return appBase.replace(/\/$/, "")
      const host = req.headers.get("host") ?? "localhost:3000"
      const proto = req.headers.get("x-forwarded-proto") ?? "https"
      return `${proto}://${host}`
    })()

    // --- Run tasks in parallel, gated by mode ---
    const TASK_TIMEOUT = 700

    const runT1 = mode === "full" || mode === "snapshots"
    const runT2 = mode === "full"
    const runT3 = mode === "full" || mode === "thumbs"

    const [t1Result, t2Result, t3Result] = await Promise.allSettled([
      // T1: snapshots or full, only if we have a token
      runT1
        ? (token
            ? withTimeout(
                t1EnsureTodaySnapshot({ igAccountId, igUserId, pageId, userId: user.id, token }),
                TASK_TIMEOUT
              )
            : Promise.resolve({ did: false, reason: "no_token" }))
        : Promise.resolve(null),

      // T2: full only (DB read, warms connection pool)
      runT2
        ? withTimeout(t2WarmCards({ userId: user.id }), TASK_TIMEOUT)
        : Promise.resolve(null),

      // T3: full or thumbs (fire-and-forget inside, resolves quickly)
      runT3
        ? withTimeout(t3WarmThumbnails({ userId: user.id, baseUrl }), TASK_TIMEOUT)
        : Promise.resolve(null),
    ])

    const took_ms = Date.now() - t0

    const did = {
      snapshot: t1Result.status === "fulfilled" ? t1Result.value : null,
      cards: t2Result.status === "fulfilled" ? t2Result.value : null,
      thumbnails: t3Result.status === "fulfilled" ? t3Result.value : null,
    }

    const res = NextResponse.json({
      ok: true,
      mode,
      did,
      took_ms,
      ...(debugMode ? {
        debug: {
          igAccountId,
          igUserId,
          pageId,
          hasToken: Boolean(token),
          baseUrl,
        },
      } : {}),
    })

    // Set per-mode throttle cookie on the response
    res.cookies.set(throttleCookie, String(Date.now()), {
      httpOnly: true,
      path: "/",
      maxAge: Math.ceil(throttleMs / 1000),
      sameSite: "lax",
    })

    // Log event best-effort (fire-and-forget, never blocks response)
    void logPrewarmEvent({ userId: user.id, igAccountId, mode, reason: _reason, ok: true, skipped: null, tookMs: took_ms })

    return res
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: "unexpected_error", message: msg.slice(0, 400) }, { status: 500 })
  }
}
