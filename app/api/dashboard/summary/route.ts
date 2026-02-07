import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "crypto"
import { getMeState } from "@/app/lib/server/instagramMeResolver"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HANDLER_FILE = "app/api/dashboard/summary/route.ts"
const HANDLER_VERSION = "dash-summary-v1"

function tokenSig(raw: string) {
  const t = String(raw || "").trim()
  if (!t) return ""
  try {
    return createHash("sha256").update(t).digest("hex").slice(0, 16)
  } catch {
    return `${t.slice(0, 2)}_${t.slice(-2)}`
  }
}

function getRequestId(req: NextRequest) {
  const existing = req.headers.get("x-request-id")
  if (existing && existing.trim()) return existing.trim()
  return crypto.randomUUID()
}

function jsonResponse(req: NextRequest, body: any, status: number, headers?: HeadersInit) {
  const h = new Headers(headers)
  h.set("x-request-id", getRequestId(req))
  h.set("Cache-Control", "no-store")
  h.set("X-Handler-File", HANDLER_FILE)
  h.set("X-Handler-Version", HANDLER_VERSION)
  return NextResponse.json(body, { status, headers: h })
}

export async function GET(req: NextRequest) {
  const start = Date.now()
  const requestId = getRequestId(req)

  try {
    const state = await getMeState(req)

    const profile = state && typeof (state as any).profile === "object" && (state as any).profile ? (state as any).profile : null

    const payload = {
      ok: true,
      connected: Boolean((state as any)?.connected),
      hasToken: Boolean((state as any)?.hasToken),
      hasIds: Boolean((state as any)?.hasIds),
      profile: {
        username: typeof profile?.username === "string" ? profile.username : null,
        profile_picture_url: typeof profile?.profile_picture_url === "string" ? profile.profile_picture_url : null,
      },
      kpis: {
        followers_count:
          typeof profile?.followers_count === "number" || typeof profile?.followers_count === "string" ? profile.followers_count : null,
        follows_count:
          typeof profile?.follows_count === "number" || typeof profile?.follows_count === "string" ? profile.follows_count : null,
        media_count:
          typeof profile?.media_count === "number" || typeof profile?.media_count === "string" ? profile.media_count : null,
      },
    }

    const cookieSig = tokenSig((req.cookies.get("ig_access_token")?.value ?? "").trim())
    const etagBase = JSON.stringify({
      v: HANDLER_VERSION,
      ig: (state as any)?.igUserId ?? null,
      pg: (state as any)?.pageId ?? null,
      t: payload.connected,
      u: payload.profile.username,
      k: payload.kpis,
      tok: cookieSig,
    })
    const etag = `W/"${createHash("sha256").update(etagBase).digest("hex").slice(0, 32)}"`

    const ifNoneMatch = req.headers.get("if-none-match")
    const durationMs = Date.now() - start

    if (ifNoneMatch && ifNoneMatch === etag) {
      const h = new Headers()
      h.set("x-request-id", requestId)
      h.set("ETag", etag)
      h.set("Cache-Control", "no-store")
      h.set("Server-Timing", `dash_summary;dur=${durationMs}`)
      h.set("X-Handler-File", HANDLER_FILE)
      h.set("X-Handler-Version", HANDLER_VERSION)
      return new NextResponse(null, { status: 304, headers: h })
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[dash-summary] ok", {
        reqId: requestId ? String(requestId).slice(0, 80) : null,
        connected: payload.connected,
        hasIds: payload.hasIds,
        durationMs,
      })
    }

    return jsonResponse(req, payload, 200, {
      ETag: etag,
      "Server-Timing": `dash_summary;dur=${durationMs}`,
    })
  } catch (e: any) {
    const durationMs = Date.now() - start
    const msg = typeof e?.message === "string" ? e.message : "unknown"

    console.error("[dash-summary] error", {
      reqId: requestId ?? null,
      durationMs,
      message: msg,
    })

    return jsonResponse(
      req,
      {
        ok: false,
        error: "internal_error",
      },
      500,
      {
        "Server-Timing": `dash_summary;dur=${durationMs}`,
      },
    )
  }
}
