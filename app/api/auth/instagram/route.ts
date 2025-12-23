import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

  const res = NextResponse.redirect(new URL("https://www.facebook.com/v21.0/dialog/oauth"))

  const secure = process.env.NODE_ENV === "production"

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

  const APP_BASE_URL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || ""
  const META_APP_ID =
    process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.META_CLIENT_ID || ""
  const META_APP_SECRET =
    process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || process.env.META_CLIENT_SECRET || ""

  const missing: Record<string, boolean> = {
    APP_BASE_URL: !APP_BASE_URL,
    META_APP_ID: !META_APP_ID,
    META_APP_SECRET: !META_APP_SECRET,
  }

  if (missing.APP_BASE_URL || missing.META_APP_ID || missing.META_APP_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        code: "missing_env",
        missing,
        seen: {
          has_APP_BASE_URL: !!APP_BASE_URL,
          has_META_APP_ID: !!META_APP_ID,
          has_META_APP_SECRET: !!META_APP_SECRET,
        },
      },
      { status: 500 },
    )
  }

  const baseUrl = APP_BASE_URL.replace(/\/$/, "")

  const redirectUri = `${baseUrl}/api/auth/instagram/callback`

  const oauthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth")
  oauthUrl.searchParams.set("client_id", META_APP_ID)
  oauthUrl.searchParams.set("redirect_uri", redirectUri)
  oauthUrl.searchParams.set("state", state)
  oauthUrl.searchParams.set("response_type", "code")
  oauthUrl.searchParams.set(
    "scope",
    "instagram_basic,instagram_manage_insights,instagram_manage_comments,pages_show_list",
  )

  return NextResponse.redirect(oauthUrl, {
    headers: res.headers,
  })
}
