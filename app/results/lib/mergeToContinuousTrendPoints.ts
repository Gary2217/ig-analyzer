type AccountTrendPoint = {
  t: string
  reach?: number
  impressions?: number
  interactions?: number
  engaged?: number
  followerDelta?: number
  ts?: number
}

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function coerceDailySnapshotPointsToArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (!isRecord(raw)) return []
  const series = raw.insights_daily_series
  if (Array.isArray(series)) return series
  return []
}

export function mergeToContinuousTrendPoints(params: {
  days: number
  baseDbRowsRaw: unknown
  overridePointsRaw: unknown
}): AccountTrendPoint[] {
  const days = Math.max(1, Math.floor(params.days || 90))

  const parseYmd = (ymd: string) => {
    const s = String(ymd || "").trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
    const ms = Date.parse(`${s}T00:00:00.000Z`)
    return Number.isFinite(ms) ? ms : null
  }

  const utcDateStringFromOffset = (daysAgo: number) => {
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

  const toSafeInt = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.floor(n))
  }

  const toByDayFromDbRows = (raw: unknown) => {
    const arr = Array.isArray(raw) ? raw : []
    const map = new Map<
      string,
      { reach: number; impressions: number; total_interactions: number; accounts_engaged: number }
    >()

    for (const it of Array.isArray(arr) ? arr : []) {
      if (!isRecord(it)) continue
      const ymd = typeof it.day === "string" ? String(it.day).trim() : ""
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue

      map.set(ymd, {
        reach: toSafeInt(it.reach),
        impressions: toSafeInt(it.impressions),
        total_interactions: toSafeInt(it.total_interactions),
        accounts_engaged: toSafeInt(it.accounts_engaged),
      })
    }

    return map
  }

  const toByDayFromIgPoints = (raw: unknown) => {
    const arr = coerceDailySnapshotPointsToArray(raw)
    const map = new Map<
      string,
      { reach: number; impressions: number; total_interactions: number; accounts_engaged: number }
    >()

    for (const it of Array.isArray(arr) ? arr : []) {
      if (!isRecord(it)) continue
      const ymd =
        (typeof it.date === "string" ? String(it.date).trim() : "") ||
        (typeof it.day === "string" ? String(it.day).trim() : "")
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue

      map.set(ymd, {
        reach: toSafeInt(it.reach),
        impressions: toSafeInt(it.impressions),
        total_interactions: toSafeInt(it.interactions ?? it.total_interactions),
        accounts_engaged: toSafeInt(it.engaged_accounts ?? it.accounts_engaged ?? it.engaged),
      })
    }

    return map
  }

  const baseByDay = toByDayFromDbRows(params.baseDbRowsRaw)
  const overrideByDay = toByDayFromIgPoints(params.overridePointsRaw)

  const mergedByDay = new Map(baseByDay)
  for (const [k, v] of overrideByDay.entries()) mergedByDay.set(k, v)

  const out: AccountTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const ymd = utcDateStringFromOffset(i)
    const row = mergedByDay.get(ymd)
    const ts = parseYmd(ymd)
    const safeTs = ts ?? Date.now() - i * 24 * 60 * 60 * 1000

    const p: AccountTrendPoint = {
      t: (() => {
        try {
          return new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" }).format(new Date(safeTs))
        } catch {
          const d = new Date(safeTs)
          const m = String(d.getMonth() + 1).padStart(2, "0")
          const dd = String(d.getDate()).padStart(2, "0")
          return `${m}/${dd}`
        }
      })(),
      ts: safeTs,
      reach: row?.reach,
      impressions: row?.impressions,
      interactions: row?.total_interactions,
      engaged: row?.accounts_engaged,
    }
    out.push(p)
  }

  return out
}
