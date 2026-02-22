export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { createAuthedClient, supabaseServer, createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { createHash } from "crypto"
import { upsertDailySnapshot } from "@/app/api/_lib/upsertDailySnapshot"

// ---------------------------------------------------------------------------
// POST /api/repair
// Auth required. Per-user safe repairs only. Rate-limited per action (60s).
// Actions: unlock_thumbs | snapshot_today | fix_owner_card
// ---------------------------------------------------------------------------

type RepairAction = "unlock_thumbs" | "snapshot_today" | "fix_owner_card"

const GRAPH_BASE = "https://graph.facebook.com/v24.0"
const REPAIR_THROTTLE_MS = 60_000 // 60s per action

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}

function nowIso(): string {
  return new Date().toISOString()
}

function todayUtc(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

// ---------------------------------------------------------------------------
// Rate limit: check user_repairs for recent row of same action
// ---------------------------------------------------------------------------
async function isThrottled(userId: string, action: RepairAction): Promise<boolean> {
  try {
    const since = new Date(Date.now() - REPAIR_THROTTLE_MS).toISOString()
    const { data } = await supabaseServer
      .from("user_repairs")
      .select("id")
      .eq("user_id", userId)
      .eq("action", action)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle()
    return data != null
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Best-effort repair log (service role)
// ---------------------------------------------------------------------------
async function logRepair(params: {
  userId: string
  action: RepairAction
  ok: boolean
  details: Record<string, unknown>
}): Promise<void> {
  try {
    const svc = createServiceClient()
    await svc.from("user_repairs").insert({
      user_id: params.userId,
      action: params.action,
      ok: params.ok,
      details: params.details,
    })
  } catch {
    // best-effort — ignore
  }
}

// ---------------------------------------------------------------------------
// Resolve active ig_account_id (cookie hint → fallback latest)
// ---------------------------------------------------------------------------
async function resolveActiveAccount(
  authed: Awaited<ReturnType<typeof createAuthedClient>>,
  userId: string,
  hintFromBody: string
): Promise<{ igAccountId: string; igUserId: string; pageId: string }> {
  const empty = { igAccountId: "", igUserId: "", pageId: "" }

  // Prefer body hint (already validated by caller)
  if (hintFromBody) {
    const { data } = await authed
      .from("user_ig_accounts")
      .select("id, ig_user_id, page_id")
      .eq("id", hintFromBody)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()
    if (data) {
      return {
        igAccountId: String((data as any).id ?? ""),
        igUserId: String((data as any).ig_user_id ?? ""),
        pageId: String((data as any).page_id ?? ""),
      }
    }
  }

  // Cookie hint
  try {
    const cookieStore = await cookies()
    const hint =
      cookieStore.get("ig_account_id")?.value?.trim() ||
      cookieStore.get("ig_active_account_id")?.value?.trim() ||
      ""
    if (hint) {
      const { data } = await authed
        .from("user_ig_accounts")
        .select("id, ig_user_id, page_id")
        .eq("id", hint)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
      if (data) {
        return {
          igAccountId: String((data as any).id ?? ""),
          igUserId: String((data as any).ig_user_id ?? ""),
          pageId: String((data as any).page_id ?? ""),
        }
      }
    }
  } catch { /* ignore */ }

  // Fallback: latest connected
  const { data: latest } = await authed
    .from("user_ig_accounts")
    .select("id, ig_user_id, page_id")
    .eq("user_id", userId)
    .eq("provider", "instagram")
    .is("revoked_at", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return empty
  return {
    igAccountId: String((latest as any).id ?? ""),
    igUserId: String((latest as any).ig_user_id ?? ""),
    pageId: String((latest as any).page_id ?? ""),
  }
}

// ---------------------------------------------------------------------------
// R1: unlock_thumbs
// Releases refreshing=true locks stuck > 10 min, scoped to this user's posts.
// ---------------------------------------------------------------------------
async function repairUnlockThumbs(params: {
  userId: string
  dryRun: boolean
}): Promise<{ candidates: number; unlocked: number; skipped_no_posts: boolean }> {
  const { userId, dryRun } = params

  // Get user's card
  const { data: cardRow } = await supabaseServer
    .from("creator_cards")
    .select("id")
    .eq("user_id", userId)
    .order("is_owner_card", { ascending: false })
    .limit(1)
    .maybeSingle()

  const cardId = cardRow && typeof (cardRow as any).id === "string" ? String((cardRow as any).id) : null
  if (!cardId) return { candidates: 0, unlocked: 0, skipped_no_posts: true }

  // Get posts
  const { data: postsRow } = await supabaseServer
    .from("creator_card_ig_posts")
    .select("posts")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .limit(1)
    .maybeSingle()

  const posts: unknown[] = Array.isArray((postsRow as any)?.posts) ? (postsRow as any).posts : []
  if (posts.length === 0) return { candidates: 0, unlocked: 0, skipped_no_posts: true }

  // Extract thumb URLs (same logic as T3)
  const thumbUrls: string[] = []
  for (const p of posts.slice(0, 200)) {
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
  }

  if (thumbUrls.length === 0) return { candidates: 0, unlocked: 0, skipped_no_posts: false }

  const hashes = thumbUrls.map(urlHash)
  const stuckBefore = new Date(Date.now() - 10 * 60_000).toISOString()

  // Count candidates
  const { count: candidateCount } = await supabaseServer
    .from("ig_thumbnail_cache")
    .select("url_hash", { count: "exact", head: true })
    .in("url_hash", hashes)
    .eq("refreshing", true)
    .lt("updated_at", stuckBefore)

  const candidates = candidateCount ?? 0

  if (dryRun || candidates === 0) {
    return { candidates, unlocked: 0, skipped_no_posts: false }
  }

  const svc = createServiceClient()
  const { count: unlockedCount } = await svc
    .from("ig_thumbnail_cache")
    .update({ refreshing: false })
    .in("url_hash", hashes)
    .eq("refreshing", true)
    .lt("updated_at", stuckBefore)

  return { candidates, unlocked: unlockedCount ?? candidates, skipped_no_posts: false }
}

// ---------------------------------------------------------------------------
// R2: snapshot_today
// Reuses same logic as T1 in prewarm — ensures today's snapshot row exists.
// ---------------------------------------------------------------------------
async function repairSnapshotToday(params: {
  userId: string
  igAccountId: string
  igUserId: string
  pageId: string
  token: string
}): Promise<{ did: boolean; reason?: string }> {
  const { igAccountId, igUserId, pageId, userId, token } = params
  const today = todayUtc()

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

  // Resolve page token
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
  const reachRes = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
      `?metric=reach&period=day&since=${yesterday}&until=${today}&access_token=${pageToken}`,
    { cache: "no-store" }
  )
  if (!reachRes.ok) return { did: false, reason: `graph_a1_${reachRes.status}` }
  const reachJson = await safeJson(reachRes) as any
  const reachValues: any[] = reachJson?.data?.find((m: any) => m?.name === "reach")?.values ?? []

  // Call A2: views (period=day, metric_type=total_value) — best-effort
  let viewsValues: any[] = []
  try {
    const viewsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/insights` +
        `?metric=views&period=day&metric_type=total_value&since=${yesterday}&until=${today}&access_token=${pageToken}`,
      { cache: "no-store" }
    )
    if (viewsRes.ok) {
      const viewsJson = await safeJson(viewsRes) as any
      viewsValues = viewsJson?.data?.find((m: any) => m?.name === "views")?.values ?? []
    }
  } catch { /* best-effort; impressions will be 0 */ }

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
    source_used: "repair",
    wrote_at: nowIso(),
  })

  return { did: true }
}

// ---------------------------------------------------------------------------
// R3: fix_owner_card
// Ensures exactly one is_owner_card=true per user. Two-step update to avoid
// violating the partial unique index.
// ---------------------------------------------------------------------------
async function repairFixOwnerCard(params: {
  userId: string
  dryRun: boolean
}): Promise<{ skipped?: string; fixed?: boolean; chosen_id?: string; owner_count_before: number }> {
  const { userId, dryRun } = params
  const svc = createServiceClient()

  const { data: cards } = await svc
    .from("creator_cards")
    .select("id, is_owner_card, updated_at, created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  const cardList: any[] = Array.isArray(cards) ? cards : []
  if (cardList.length === 0) return { skipped: "no_cards", owner_count_before: 0 }

  const ownerCards = cardList.filter((c) => c?.is_owner_card === true)
  const ownerCountBefore = ownerCards.length

  if (ownerCountBefore === 1) {
    return { skipped: "already_ok", owner_count_before: ownerCountBefore }
  }

  // Choose newest card as owner (updated_at > created_at > id)
  const chosen = cardList.reduce((best, cur) => {
    const bestTs = best?.updated_at ?? best?.created_at ?? ""
    const curTs = cur?.updated_at ?? cur?.created_at ?? ""
    if (curTs > bestTs) return cur
    if (curTs === bestTs && String(cur?.id ?? "") > String(best?.id ?? "")) return cur
    return best
  }, cardList[0])

  const chosenId = String(chosen?.id ?? "")
  if (!chosenId) return { skipped: "no_chosen_id", owner_count_before: ownerCountBefore }

  if (dryRun) {
    return { fixed: false, chosen_id: chosenId, owner_count_before: ownerCountBefore }
  }

  // Step 1: clear all owner flags for this user
  await svc
    .from("creator_cards")
    .update({ is_owner_card: false })
    .eq("user_id", userId)

  // Step 2: set chosen card as owner
  await svc
    .from("creator_cards")
    .update({ is_owner_card: true })
    .eq("id", chosenId)
    .eq("user_id", userId)

  return { fixed: true, chosen_id: chosenId, owner_count_before: ownerCountBefore }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const t0 = Date.now()

  try {
    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 })
    }

    let body: Record<string, unknown> = {}
    try { body = (await req.json()) ?? {} } catch { /* empty body ok */ }

    const action = body.action as RepairAction | undefined
    if (!action || !["unlock_thumbs", "snapshot_today", "fix_owner_card"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "invalid_action", valid: ["unlock_thumbs", "snapshot_today", "fix_owner_card"] },
        { status: 400 }
      )
    }

    const dryRun = body.dry_run === true
    const requestedAccountId =
      typeof body.ig_account_id === "string" ? body.ig_account_id.trim() : ""

    // Rate limit
    if (!dryRun && await isThrottled(user.id, action)) {
      return NextResponse.json({ ok: true, skipped: "throttled", action, took_ms: Date.now() - t0 })
    }

    // -----------------------------------------------------------------------
    // R1: unlock_thumbs
    // -----------------------------------------------------------------------
    if (action === "unlock_thumbs") {
      const result = await repairUnlockThumbs({ userId: user.id, dryRun })
      void logRepair({ userId: user.id, action, ok: true, details: { ...result, dry_run: dryRun } })
      return NextResponse.json({ ok: true, action, dry_run: dryRun, ...result, took_ms: Date.now() - t0 })
    }

    // -----------------------------------------------------------------------
    // R2: snapshot_today
    // -----------------------------------------------------------------------
    if (action === "snapshot_today") {
      const { igAccountId, igUserId, pageId } = await resolveActiveAccount(authed, user.id, requestedAccountId)
      if (!igAccountId) {
        return NextResponse.json({ ok: false, error: "no_ig_account", took_ms: Date.now() - t0 })
      }

      // Resolve per-account token (no global fallback)
      const { data: tokenRow } = await supabaseServer
        .from("user_ig_account_tokens")
        .select("access_token")
        .eq("ig_account_id", igAccountId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const token = tokenRow && typeof (tokenRow as any).access_token === "string"
        ? String((tokenRow as any).access_token).trim()
        : ""

      if (!token) {
        return NextResponse.json({ ok: false, error: "missing_token", took_ms: Date.now() - t0 })
      }

      if (dryRun) {
        return NextResponse.json({ ok: true, action, dry_run: true, ig_account_id: igAccountId, took_ms: Date.now() - t0 })
      }

      const result = await repairSnapshotToday({ userId: user.id, igAccountId, igUserId, pageId, token })
      void logRepair({ userId: user.id, action, ok: true, details: { ...result, ig_account_id: igAccountId } })
      return NextResponse.json({ ok: true, action, ig_account_id: igAccountId, ...result, took_ms: Date.now() - t0 })
    }

    // -----------------------------------------------------------------------
    // R3: fix_owner_card
    // -----------------------------------------------------------------------
    if (action === "fix_owner_card") {
      const result = await repairFixOwnerCard({ userId: user.id, dryRun })
      void logRepair({ userId: user.id, action, ok: true, details: { ...result, dry_run: dryRun } })
      return NextResponse.json({ ok: true, action, dry_run: dryRun, ...result, took_ms: Date.now() - t0 })
    }

    return NextResponse.json({ ok: false, error: "unhandled_action" }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: msg.slice(0, 400) },
      { status: 500 }
    )
  }
}
