/**
 * Shared safe upsert helper for public.account_daily_snapshot.
 * All writes to this table MUST go through this function.
 *
 * Guards:
 * - ig_account_id must be a valid UUID (FK safety)
 * - user_id_text is ALWAYS written (= user_id)
 * - impressions / total_interactions / accounts_engaged are ALWAYS written (default 0)
 * - No String(null) coercion for ig_account_id
 */

export type DailySnapshotRow = {
  ig_account_id: string
  user_id: string
  ig_user_id: number
  page_id: number
  day: string
  reach: number | null
  impressions?: number | null
  total_interactions?: number | null
  accounts_engaged?: number | null
  source_used?: string
  wrote_at?: string
}

export type UpsertDailySnapshotResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped?: false; error: null; __diag?: Record<string, unknown> }
  | { ok: false; error: unknown }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v)
}

/** Coerce to a non-negative integer; fall back to 0 when null/undefined/NaN. */
function toNonNegInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/**
 * Safely upserts one or more rows into account_daily_snapshot.
 *
 * @param client  - Supabase client (authed or service role) — caller provides
 * @param rows    - One or more rows to upsert
 * @returns       - Result object; never throws
 */
export async function upsertDailySnapshot(
  client: { from: (table: string) => any },
  rows: DailySnapshotRow | DailySnapshotRow[]
): Promise<UpsertDailySnapshotResult> {
  const rowArr = Array.isArray(rows) ? rows : [rows]
  if (rowArr.length === 0) return { ok: true, skipped: false, error: null }

  // Validate ig_account_id on every row before touching DB
  for (const r of rowArr) {
    if (!isValidUuid(r.ig_account_id)) {
      console.warn("[account-daily-snapshot] skip upsert — invalid ig_account_id", {
        ig_account_id: r.ig_account_id,
        user_id: r.user_id,
        ig_user_id: r.ig_user_id,
        page_id: r.page_id,
        day: r.day,
      })
      return { ok: true, skipped: true, reason: "invalid_ig_account_id" }
    }
  }

  try {
    const payload = rowArr.map((r) => ({
      ig_account_id: r.ig_account_id,
      user_id: r.user_id,
      user_id_text: String(r.user_id),   // always written
      ig_user_id: r.ig_user_id,
      page_id: r.page_id,
      day: r.day,
      reach: r.reach,
      impressions: toNonNegInt(r.impressions),           // always written, default 0
      total_interactions: toNonNegInt(r.total_interactions), // always written, default 0
      accounts_engaged: toNonNegInt(r.accounts_engaged),     // always written, default 0
      ...(r.source_used !== undefined ? { source_used: r.source_used } : {}),
      ...(r.wrote_at !== undefined ? { wrote_at: r.wrote_at } : {}),
    }))

    const __diag = {
      rows: payload.length,
      days: payload.map((p) => p.day),
      sample: payload.length > 0 ? {
        day: payload[0].day,
        reach: payload[0].reach,
        impressions: payload[0].impressions,
        total_interactions: payload[0].total_interactions,
        accounts_engaged: payload[0].accounts_engaged,
        has_user_id_text: Boolean(payload[0].user_id_text),
      } : null,
    }

    const { error } = await client
      .from("account_daily_snapshot")
      .upsert(payload, { onConflict: "user_id_text,ig_user_id,page_id,day" })

    if (error) {
      console.warn("[account-daily-snapshot] upsert error", {
        message: error.message,
        days: rowArr.map((r) => r.day),
      })
      return { ok: false, error }
    }

    return { ok: true, skipped: false, error: null, __diag }
  } catch (err: unknown) {
    console.warn("[account-daily-snapshot] upsert threw", {
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: err }
  }
}
