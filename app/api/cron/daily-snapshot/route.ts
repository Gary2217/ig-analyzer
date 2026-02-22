import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Required env vars:
//   CRON_SECRET          — shared secret; must match x-cron-secret header
//   CRON_IG_USER_ID      — ig_user_id to snapshot (used by daily-snapshot cronMode)
//   NEXT_PUBLIC_SITE_URL — base URL for internal fetch (e.g. https://ig-analyzer-psl.vercel.app)

const BUILD_MARKER = "cron-daily-snapshot-v1"
const baseHeaders = { "Cache-Control": "no-store", "x-build-marker": BUILD_MARKER } as const

function isVercelCron(req: Request) {
  return req.headers.has("x-vercel-cron")
}

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

  const cronIgUserId = (process.env.CRON_IG_USER_ID ?? "").trim()
  if (!cronIgUserId) {
    return NextResponse.json(
      { ok: false, error: "missing_env:CRON_IG_USER_ID", build_marker: BUILD_MARKER },
      { status: 400, headers: baseHeaders }
    )
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "")
  if (!siteUrl) {
    return NextResponse.json(
      { ok: false, error: "missing_env:NEXT_PUBLIC_SITE_URL", build_marker: BUILD_MARKER },
      { status: 400, headers: baseHeaders }
    )
  }

  const targetUrl = `${siteUrl}/api/instagram/daily-snapshot`

  console.log("[cron/daily-snapshot] invoking", { targetUrl, cronIgUserId })

  let downstreamStatus = 0

  // Safe fields to extract from downstream JSON (never include tokens/secrets)
  const SAFE_FIELDS = [
    "build_marker", "ok", "days", "rangeStart", "rangeEnd", "available_days",
    "__diag", "snapshot_write_diag", "diag_metrics", "requested_metrics",
    "returned_metric_names", "points_source", "points_ok",
  ] as const

  function extractSafeDiag(parsed: unknown): Record<string, unknown> | null {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const out: Record<string, unknown> = {}
    for (const key of SAFE_FIELDS) {
      if (key in (parsed as Record<string, unknown>)) {
        out[key] = (parsed as Record<string, unknown>)[key]
      }
    }
    return out
  }

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "x-cron-secret": cronSecret,
        "Content-Type": "application/json",
      },
      // cronMode in daily-snapshot reads IG_ACCESS_TOKEN + IG_USER_ID from env
      // no body needed; the route uses env vars in cronMode
    })

    downstreamStatus = res.status
    const text = await res.text().catch(() => "")
    const bodyLen = text.length
    const bodyTruncated = bodyLen > 0 && !text.trimEnd().endsWith("}")

    let downstreamJsonDiag: Record<string, unknown> | null = null
    let parseError: string | null = null
    try {
      const parsed = JSON.parse(text)
      downstreamJsonDiag = extractSafeDiag(parsed)
    } catch (pe: any) {
      parseError = pe?.message ? String(pe.message).slice(0, 120) : "json_parse_failed"
    }

    console.log("[cron/daily-snapshot] done", {
      downstreamStatus,
      bodyLen,
      bodyTruncated,
      parseOk: downstreamJsonDiag !== null,
    })

    return NextResponse.json(
      {
        ok: res.ok,
        build_marker: BUILD_MARKER,
        downstream_status: downstreamStatus,
        downstream_body_len: bodyLen,
        downstream_body_truncated: bodyTruncated,
        downstream_json_diag: downstreamJsonDiag,
        ...(parseError !== null ? { downstream_parse_error: parseError } : {}),
      },
      { status: res.ok ? 200 : 502, headers: baseHeaders }
    )
  } catch (e: any) {
    console.error("[cron/daily-snapshot] fetch failed", { message: e?.message ?? String(e) })
    return NextResponse.json(
      {
        ok: false,
        error: "downstream_fetch_failed",
        message: e?.message ?? String(e),
        build_marker: BUILD_MARKER,
        downstream_status: downstreamStatus,
      },
      { status: 502, headers: baseHeaders }
    )
  }
}

export async function GET(req: Request) {
  return runCron(req)
}

export async function POST(req: Request) {
  return runCron(req)
}
