import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type CreatorCardAuditRow = {
  id: string
  ig_user_id: string | null
  user_id: string | null
  handle: string | null
  updated_at: string | null
  created_at: string | null
}

function asString(v: unknown) {
  return typeof v === "string" ? v : null
}

function requireAdmin(req: Request) {
  const secret = (process.env.ADMIN_SECRET || process.env.CREATOR_CARDS_ADMIN_SECRET || "").trim()
  if (!secret) {
    return { ok: false as const, status: 500, error: "missing_env", message: "ADMIN_SECRET_not_configured" }
  }
  const header = (req.headers.get("x-admin-secret") ?? "").trim()
  if (!header || header !== secret) {
    return { ok: false as const, status: 401, error: "unauthorized", message: "unauthorized" }
  }
  return { ok: true as const }
}

function sortKey(row: Pick<CreatorCardAuditRow, "updated_at" | "created_at" | "id">) {
  const u = row.updated_at ? Date.parse(row.updated_at) : Number.NEGATIVE_INFINITY
  const c = row.created_at ? Date.parse(row.created_at) : Number.NEGATIVE_INFINITY
  return { u, c, id: row.id }
}

function compareNewestFirst(a: CreatorCardAuditRow, b: CreatorCardAuditRow) {
  const ka = sortKey(a)
  const kb = sortKey(b)
  if (ka.u !== kb.u) return kb.u - ka.u
  if (ka.c !== kb.c) return kb.c - ka.c
  return ka.id.localeCompare(kb.id)
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv(report: ReturnType<typeof buildAuditReport>) {
  const lines: string[] = []
  lines.push(
    [
      "type",
      "ig_user_id",
      "group_total",
      "action",
      "row_id",
      "user_id",
      "handle",
      "updated_at",
      "created_at",
    ].map(csvEscape).join(","),
  )

  for (const g of report.duplicates.groups) {
    const ig = g.ig_user_id
    const total = g.total
    lines.push(
      [
        "duplicate_ig_user_id",
        ig,
        total,
        "keep",
        g.keep.id,
        g.keep.user_id ?? "",
        g.keep.handle ?? "",
        g.keep.updated_at ?? "",
        g.keep.created_at ?? "",
      ].map(csvEscape).join(","),
    )
    for (const r of g.remove) {
      lines.push(
        [
          "duplicate_ig_user_id",
          ig,
          total,
          "remove",
          r.id,
          r.user_id ?? "",
          r.handle ?? "",
          r.updated_at ?? "",
          r.created_at ?? "",
        ].map(csvEscape).join(","),
      )
    }
  }

  for (const x of report.anomalies.empty_or_null_ig_user_id) {
    lines.push(
      [
        "empty_or_null_ig_user_id",
        "",
        "",
        "manual_review",
        x.id,
        x.user_id ?? "",
        x.handle ?? "",
        x.updated_at ?? "",
        x.created_at ?? "",
      ].map(csvEscape).join(","),
    )
  }

  for (const x of report.anomalies.user_id_set_but_ig_user_id_empty) {
    lines.push(
      [
        "user_id_set_but_ig_user_id_empty",
        "",
        "",
        "manual_review",
        x.id,
        x.user_id ?? "",
        x.handle ?? "",
        x.updated_at ?? "",
        x.created_at ?? "",
      ].map(csvEscape).join(","),
    )
  }

  return lines.join("\n")
}

function toLog(report: ReturnType<typeof buildAuditReport>) {
  const lines: string[] = []
  const safe = (v: unknown) => (v == null ? "" : String(v).replace(/[\r\n|]/g, " "))

  for (const g of report.duplicates.groups) {
    const ig = g.ig_user_id
    const total = g.total
    lines.push(
      [
        "duplicate_ig_user_id",
        safe(ig),
        "keep",
        safe(g.keep.id),
        safe(g.keep.user_id ?? ""),
        safe(g.keep.handle ?? ""),
        safe(g.keep.updated_at ?? ""),
        safe(g.keep.created_at ?? ""),
        safe(total),
      ].join("|"),
    )
    for (const r of g.remove) {
      lines.push(
        [
          "duplicate_ig_user_id",
          safe(ig),
          "remove",
          safe(r.id),
          safe(r.user_id ?? ""),
          safe(r.handle ?? ""),
          safe(r.updated_at ?? ""),
          safe(r.created_at ?? ""),
          safe(total),
        ].join("|"),
      )
    }
  }

  for (const x of report.anomalies.empty_or_null_ig_user_id) {
    lines.push(
      [
        "empty_or_null_ig_user_id",
        "",
        "manual_review",
        safe(x.id),
        safe(x.user_id ?? ""),
        safe(x.handle ?? ""),
        safe(x.updated_at ?? ""),
        safe(x.created_at ?? ""),
        "",
      ].join("|"),
    )
  }

  for (const x of report.anomalies.user_id_set_but_ig_user_id_empty) {
    lines.push(
      [
        "user_id_set_but_ig_user_id_empty",
        "",
        "manual_review",
        safe(x.id),
        safe(x.user_id ?? ""),
        safe(x.handle ?? ""),
        safe(x.updated_at ?? ""),
        safe(x.created_at ?? ""),
        "",
      ].join("|"),
    )
  }

  return lines.join("\n")
}

async function loadAllCreatorCards(service: ReturnType<typeof createServiceClient>) {
  const res = await service
    .from("creator_cards")
    .select("id, ig_user_id, user_id, handle, updated_at, created_at")
    .order("ig_user_id", { ascending: true })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })

  if (res.error) throw res.error

  const rows = Array.isArray(res.data) ? (res.data as any[]) : []
  return rows.map(
    (r): CreatorCardAuditRow => ({
      id: String(r.id),
      ig_user_id: asString(r.ig_user_id),
      user_id: asString(r.user_id),
      handle: asString(r.handle),
      updated_at: asString(r.updated_at),
      created_at: asString(r.created_at),
    }),
  )
}

function buildAuditReport(rows: CreatorCardAuditRow[]) {
  const nonEmptyIg = rows.filter((r) => (r.ig_user_id ?? "").trim() !== "")
  const invalidIgUserIdRows = rows.filter((r) => (r.ig_user_id ?? "").trim() === "")
  const ownershipAnomalies = invalidIgUserIdRows.filter((r) => (r.user_id ?? "").trim() !== "")

  const groups: Record<string, CreatorCardAuditRow[]> = {}
  for (const r of nonEmptyIg) {
    const key = (r.ig_user_id ?? "").trim()
    if (!key) continue
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  }

  const duplicates = Object.entries(groups)
    .filter(([, list]) => list.length > 1)
    .map(([ig_user_id, list]) => {
      const sorted = [...list].sort(compareNewestFirst)
      const keep = sorted[0]
      const remove = sorted.slice(1)
      return {
        ig_user_id,
        total: sorted.length,
        rows: sorted.map((x) => ({
          id: x.id,
          user_id: x.user_id,
          handle: x.handle,
          updated_at: x.updated_at,
          created_at: x.created_at,
        })),
        keep: {
          id: keep.id,
          user_id: keep.user_id,
          handle: keep.handle,
          updated_at: keep.updated_at,
          created_at: keep.created_at,
        },
        remove: remove.map((x) => ({
          id: x.id,
          user_id: x.user_id,
          handle: x.handle,
          updated_at: x.updated_at,
          created_at: x.created_at,
        })),
      }
    })

  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    rules: {
      unique_ig_user_id: "non-empty ig_user_id must have at most one row",
      dedupe_order: "updated_at desc, created_at desc, id",
    },
    duplicates: {
      groups: duplicates,
      duplicates_found: duplicates.length,
      rows_to_remove: duplicates.reduce((acc, g) => acc + g.remove.length, 0),
    },
    anomalies: {
      empty_or_null_ig_user_id: invalidIgUserIdRows.map((x) => ({
        id: x.id,
        user_id: x.user_id,
        handle: x.handle,
        updated_at: x.updated_at,
        created_at: x.created_at,
        needs_manual_review: true,
      })),
      user_id_set_but_ig_user_id_empty: ownershipAnomalies.map((x) => ({
        id: x.id,
        user_id: x.user_id,
        handle: x.handle,
        updated_at: x.updated_at,
        created_at: x.created_at,
        needs_manual_review: true,
      })),
    },
  }

  return report
}

async function trySoftDelete(service: ReturnType<typeof createServiceClient>, ids: string[]) {
  const now = new Date().toISOString()
  const r = await service.from("creator_cards").update({ deleted_at: now, ig_user_id: "" }).in("id", ids)
  if (r.error) return { ok: false as const, error: r.error }
  return { ok: true as const }
}

async function hardDelete(service: ReturnType<typeof createServiceClient>, ids: string[]) {
  const r = await service.from("creator_cards").delete().in("id", ids)
  if (r.error) throw r.error
}

export async function GET(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, message: auth.message }, { status: auth.status })
  }

  const url = new URL(req.url)
  const dryRun = (url.searchParams.get("dryRun") ?? "").trim() === "1"
  const format = (url.searchParams.get("format") ?? "").trim().toLowerCase()
  if (!dryRun) {
    return NextResponse.json({ ok: false, error: "bad_request", message: "dryRun_required" }, { status: 400 })
  }

  try {
    const service = createServiceClient()
    const rows = await loadAllCreatorCards(service)
    const report = buildAuditReport(rows)

    if (format === "csv") {
      return new Response(toCsv(report), {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
      })
    }

    if (format === "log") {
      return new Response(toLog(report), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      })
    }

    return NextResponse.json({ ...report, dryRun: true })
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : String(e)
    const code = typeof e?.code === "string" ? e.code : null
    return NextResponse.json({ ok: false, error: "audit_failed", message: message.slice(0, 400), code }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, message: auth.message }, { status: auth.status })
  }

  try {
    const service = createServiceClient()
    const rows = await loadAllCreatorCards(service)
    const report = buildAuditReport(rows)

    const idsToRemove: string[] = []
    for (const g of report.duplicates.groups) {
      for (const r of g.remove) idsToRemove.push(r.id)
    }

    let deleteMode: "soft" | "hard" | "none" = "none"

    if (idsToRemove.length > 0) {
      const batches = chunk(idsToRemove, 100)
      let softPossible = true
      for (const b of batches) {
        const soft = await trySoftDelete(service, b)
        if (!soft.ok) {
          const msg = typeof (soft.error as any)?.message === "string" ? String((soft.error as any).message) : ""
          const code = typeof (soft.error as any)?.code === "string" ? String((soft.error as any).code) : ""
          const missingColumn = code === "42703" || (msg.toLowerCase().includes("deleted_at") && msg.toLowerCase().includes("column"))
          if (missingColumn) {
            softPossible = false
            break
          }
          throw soft.error
        }
      }

      if (softPossible) {
        deleteMode = "soft"
      } else {
        for (const b of batches) {
          await hardDelete(service, b)
        }
        deleteMode = "hard"
      }
    }

    const keptIds = report.duplicates.groups.map((g) => g.keep.id)

    return NextResponse.json({
      ok: true,
      applied: true,
      delete_mode: deleteMode,
      summary: {
        duplicates_found: report.duplicates.duplicates_found,
        rows_deleted: idsToRemove.length,
        rows_kept: keptIds.length,
        rows_flagged_for_manual_review: report.anomalies.empty_or_null_ig_user_id.length,
      },
      report: {
        duplicates: report.duplicates,
        anomalies: report.anomalies,
      },
    })
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : String(e)
    const code = typeof e?.code === "string" ? e.code : null
    return NextResponse.json({ ok: false, error: "repair_failed", message: message.slice(0, 400), code }, { status: 500 })
  }
}
