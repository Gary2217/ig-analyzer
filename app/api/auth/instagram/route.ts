import { NextResponse, type NextRequest } from "next/server"
import crypto from "crypto"

export async function GET(req: NextRequest) {
  const locale = req.nextUrl.searchParams.get("locale") || "en"

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

  const baseUrl = process.env.APP_BASE_URL
  const appId = process.env.META_APP_ID

  if (!baseUrl || !appId) {
    return NextResponse.json({ error: "missing_env" }, { status: 500 })
  }

  const redirectUri = `${baseUrl}/api/auth/instagram/callback`

  const oauthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth")
  oauthUrl.searchParams.set("client_id", appId)
  oauthUrl.searchParams.set("redirect_uri", redirectUri)
  oauthUrl.searchParams.set("state", state)
  oauthUrl.searchParams.set("response_type", "code")
  oauthUrl.searchParams.set("scope", "email,public_profile")

  return NextResponse.redirect(oauthUrl, {
    headers: res.headers,
  })
}
