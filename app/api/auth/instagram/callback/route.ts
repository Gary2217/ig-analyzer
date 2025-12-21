import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const cookieState = req.cookies.get("ig_oauth_state")?.value
  const locale = req.cookies.get("ig_oauth_locale")?.value || "en"

  const secure = process.env.NODE_ENV === "production"

  const baseCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
  }

  const clearCookies = (res: NextResponse) => {
    res.cookies.delete("ig_oauth_state")
    res.cookies.delete("ig_oauth_locale")
    res.cookies.set("ig_oauth_state", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_locale", "", { ...baseCookieOptions, maxAge: 0 })
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    const res = NextResponse.redirect(new URL(`/${locale}/results?error=instagram_auth_failed`, url.origin))
    clearCookies(res)
    return res
  }

  const baseUrl = process.env.APP_BASE_URL
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!baseUrl || !appId || !appSecret) {
    const res = NextResponse.redirect(new URL(`/${locale}/results?error=instagram_auth_failed`, url.origin))
    clearCookies(res)
    return res
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/instagram/callback`
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token")
    tokenUrl.searchParams.set("client_id", appId)
    tokenUrl.searchParams.set("client_secret", appSecret)
    tokenUrl.searchParams.set("redirect_uri", redirectUri)
    tokenUrl.searchParams.set("code", code)

    const tokenRes = await fetch(tokenUrl.toString(), { method: "GET", cache: "no-store" })
    if (!tokenRes.ok) {
      throw new Error(`token_exchange_failed:${tokenRes.status}`)
    }

    const data = (await tokenRes.json()) as { access_token?: string }
    const accessToken = data.access_token
    if (!accessToken) {
      throw new Error("missing_access_token")
    }

    const c = await cookies()
    c.set("ig_connected", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })

    const res = NextResponse.redirect(new URL(`/${locale}/results?connected=instagram`, url.origin))

    res.cookies.set("ig_access_token", accessToken, baseCookieOptions)

    clearCookies(res)
    return res
  } catch {
    const res = NextResponse.redirect(new URL(`/${locale}/results?error=instagram_auth_failed`, url.origin))
    clearCookies(res)
    return res
  }
}
