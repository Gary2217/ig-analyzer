import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getRequestOrigin(req: NextRequest) {
  const canonicalRaw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim()
  if (process.env.NODE_ENV === "production" && canonicalRaw) {
    return canonicalRaw.replace(/\/$/, "")
  }
  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host
  const isLocalhost = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host)
  const proto = !isLocalhost && xfProto === "https" ? "https" : "http"
  return `${proto}://${host}`
}

function summarizeUrl(v: string) {
  try {
    const u = new URL(v)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return v
  }
}

 function mask(v?: string) {
   if (!v) return null
   if (v.length <= 4) return "***"
   return `${v.slice(0, 2)}...${v.slice(-2)}`
 }

export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get("locale") || "en"
  const provider = req.nextUrl.searchParams.get("provider") || "instagram"
  const next = req.nextUrl.searchParams.get("next") || ""

  const state = crypto.randomBytes(32).toString("hex")

  const res = NextResponse.redirect(new URL("https://www.facebook.com/v24.0/dialog/oauth"))

  const origin = getRequestOrigin(req)
  const redirectUri = `${origin}/api/auth/instagram/callback`

  const secure = origin.startsWith("https://")

  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  })

  res.cookies.set("ig_oauth_locale", locale, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  })

  res.cookies.set("ig_oauth_provider", provider, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  })

  if (next) {
    res.cookies.set("ig_oauth_next", next, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    })
  }

  res.cookies.set("ig_oauth_redirect_uri", redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  })

  const META_APP_ID =
    process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.META_CLIENT_ID || ""
  const META_APP_SECRET =
    process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || process.env.META_CLIENT_SECRET || ""

  const missing: Record<string, boolean> = {
    META_APP_ID: !META_APP_ID,
    META_APP_SECRET: !META_APP_SECRET,
  }

  if (missing.META_APP_ID || missing.META_APP_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        code: "missing_env",
        missing,
        seen: {
          has_META_APP_ID: !!META_APP_ID,
          has_META_APP_SECRET: !!META_APP_SECRET,
        },
      },
      { status: 500 },
    )
  }

  const oauthUrl = new URL("https://www.facebook.com/v24.0/dialog/oauth")
  oauthUrl.searchParams.set("client_id", META_APP_ID)
  oauthUrl.searchParams.set("redirect_uri", redirectUri)
  oauthUrl.searchParams.set("state", state)
  oauthUrl.searchParams.set("response_type", "code")
  oauthUrl.searchParams.set(
    "scope",
    "instagram_basic,instagram_manage_insights,instagram_manage_comments,pages_show_list",
  )

  if (process.env.IG_OAUTH_DEBUG === "1") {
    const xfProto = req.headers.get("x-forwarded-proto")
    const xfHost = req.headers.get("x-forwarded-host")
    const host = req.headers.get("host")

    console.log("[IG_OAUTH_DEBUG] auth req.nextUrl.href=", req.nextUrl.href)
    console.log("[IG_OAUTH_DEBUG] auth headers host=", host)
    console.log("[IG_OAUTH_DEBUG] auth headers x-forwarded-host=", xfHost)
    console.log("[IG_OAUTH_DEBUG] auth headers x-forwarded-proto=", xfProto)
    console.log("[IG_OAUTH_DEBUG] auth req.nextUrl.protocol=", req.nextUrl.protocol)
    console.log("[IG_OAUTH_DEBUG] auth origin=", origin)
    console.log("[IG_OAUTH_DEBUG] auth redirectUri=", redirectUri)
    console.log("[IG_OAUTH_DEBUG] auth next(query)=", next)
    console.log("[IG_OAUTH_DEBUG] auth state length=", state.length)
    console.log(
      "[IG_OAUTH_DEBUG] auth cookie ig_oauth_redirect_uri scheme+host=",
      (() => {
        try {
          const u = new URL(redirectUri)
          return `${u.protocol}//${u.host}`
        } catch {
          return null
        }
      })(),
    )
    console.log(
      "[IG_OAUTH_DEBUG] auth meta decoded redirect_uri=",
      oauthUrl.searchParams.get("redirect_uri") ? decodeURIComponent(oauthUrl.searchParams.get("redirect_uri")!) : null,
    )
    console.log("[IG_OAUTH_DEBUG] auth meta authUrl=", summarizeUrl(oauthUrl.toString()))
  }

  return NextResponse.redirect(oauthUrl, {
    headers: res.headers,
  })
}
