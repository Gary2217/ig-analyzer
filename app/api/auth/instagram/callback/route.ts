import { NextResponse, type NextRequest } from "next/server"
import { cookies, headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getPublicBaseUrl() {
  const h = await headers()

  const xfProto = h.get("x-forwarded-proto")
  const xfHost = h.get("x-forwarded-host")
  if (xfProto && xfHost) return `${xfProto}://${xfHost}`

  const envBase = process.env.APP_BASE_URL
  if (envBase) return envBase

  const host = h.get("host")
  return host ? `http://${host}` : "http://localhost:3000"
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const cookieState = req.cookies.get("ig_oauth_state")?.value
  const locale = req.cookies.get("ig_oauth_locale")?.value || "en"
  const provider = req.cookies.get("ig_oauth_provider")?.value || "instagram"
  const next = req.cookies.get("ig_oauth_next")?.value || ""

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
    res.cookies.delete("ig_oauth_provider")
    res.cookies.delete("ig_oauth_next")
    res.cookies.set("ig_oauth_state", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_locale", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_provider", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_next", "", { ...baseCookieOptions, maxAge: 0 })
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    const res = NextResponse.redirect(
      new URL(`/${locale}/results?error=instagram_auth_failed`, await getPublicBaseUrl()),
    )
    clearCookies(res)
    return res
  }

  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL
  const appId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.META_CLIENT_ID
  const appSecret =
    process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || process.env.META_CLIENT_SECRET

  if (!baseUrl || !appId || !appSecret) {
    const res = NextResponse.redirect(
      new URL(`/${locale}/results?error=instagram_auth_failed`, await getPublicBaseUrl()),
    )
    clearCookies(res)
    return res
  }

  try {
    const redirectUri = `${baseUrl.replace(/\/$/, "")}/api/auth/instagram/callback`
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token")
    tokenUrl.searchParams.set("client_id", appId)
    tokenUrl.searchParams.set("client_secret", appSecret)
    tokenUrl.searchParams.set("redirect_uri", redirectUri)
    tokenUrl.searchParams.set("code", code)

    const tokenRes = await fetch(tokenUrl.toString(), { method: "GET", cache: "no-store" })
    if (!tokenRes.ok) {
      throw new Error(`token_exchange_failed:${tokenRes.status}`)
    }

    const tokenData = (await tokenRes.json()) as unknown

    if (!tokenData || typeof (tokenData as any).access_token !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_token_response_from_graph",
          debug: {
            tokenDataKeys: tokenData && typeof tokenData === "object" ? Object.keys(tokenData as any) : null,
          },
        },
        { status: 500 },
      )
    }

    const accessToken = ((tokenData as any).access_token as string).trim()

    if (accessToken.length < 20) {
      return NextResponse.json(
        {
          ok: false,
          error: "access_token_too_short",
          debug: {
            tokenLen: accessToken.length,
          },
        },
        { status: 500 },
      )
    }

    const c = await cookies()
    c.set("ig_connected", "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })

    const fallback = `/${locale}/results?connected=${provider}`
    const target = next || fallback
    const res = NextResponse.redirect(new URL(target, await getPublicBaseUrl()))

    res.cookies.set("ig_access_token", accessToken, baseCookieOptions)

    clearCookies(res)
    return res
  } catch {
    const res = NextResponse.redirect(
      new URL(`/${locale}/results?error=instagram_auth_failed`, await getPublicBaseUrl()),
    )
    clearCookies(res)
    return res
  }
}
