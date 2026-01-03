import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getRequestOrigin(req: NextRequest) {
  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host
  const isLocalhost = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host)
  const proto = !isLocalhost && xfProto === "https" ? "https" : "http"
  return `${proto}://${host}`
}

function getIsHttps(req: NextRequest) {
  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  return xfProto === "https" || req.nextUrl.protocol === "https:"
}

export async function GET(req: NextRequest) {
  if (process.env.IG_OAUTH_DEBUG !== "1") {
    return new NextResponse(null, { status: 404 })
  }

  const origin = getRequestOrigin(req)

  console.log("[IG_OAUTH_DEBUG] debug headers host=", req.headers.get("host"))
  console.log("[IG_OAUTH_DEBUG] debug headers x-forwarded-host=", req.headers.get("x-forwarded-host"))
  console.log("[IG_OAUTH_DEBUG] debug headers x-forwarded-proto=", req.headers.get("x-forwarded-proto"))
  console.log("[IG_OAUTH_DEBUG] debug req.nextUrl.protocol=", req.nextUrl.protocol)
  console.log("[IG_OAUTH_DEBUG] debug origin=", origin)

  const isHttps = getIsHttps(req)

  const igAccessToken = req.cookies.get("ig_access_token")?.value ?? ""
  const igConnected = req.cookies.get("ig_connected")?.value ?? ""
  const igPageId = req.cookies.get("ig_page_id")?.value ?? ""
  const igIgId = req.cookies.get("ig_ig_id")?.value ?? ""

  const baseCookieAttrs = {
    path: "/",
    secure: isHttps,
    sameSite: "lax" as const,
    domain: null as null,
  }

  const { getMeState } = await import("../me/route")
  const me = await getMeState(req)

  return NextResponse.json(
    {
      origin,
      cookies: {
        ig_access_token: {
          present: Boolean(igAccessToken.trim()),
          ...baseCookieAttrs,
        },
        ig_connected: {
          present: Boolean(igConnected.trim()),
          ...baseCookieAttrs,
        },
        ig_page_id: {
          present: Boolean(igPageId.trim()),
        },
        ig_ig_id: {
          present: Boolean(igIgId.trim()),
        },
      },
      me,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
