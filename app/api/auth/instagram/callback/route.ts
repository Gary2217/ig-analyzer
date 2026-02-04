import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { headers } from "next/headers"

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

function normalizeNextPath(raw: string): string {
  const s = String(raw || "").trim()
  if (!s) return ""
  // Only allow relative redirects.
  if (!s.startsWith("/")) return ""
  if (s.startsWith("//")) return ""
  return s
}

function buildSafeRedirect(origin: string, pathOrUrl: string) {
  try {
    const u = pathOrUrl.startsWith("http") ? new URL(pathOrUrl) : new URL(pathOrUrl, origin)
    return u
  } catch {
    return new URL("/", origin)
  }
}

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const code = (sp.get("code") || "").trim()
  const state = (sp.get("state") || "").trim()
  const error = (sp.get("error") || "").trim()
  const errorDescription = (sp.get("error_description") || "").trim()

  const origin = getRequestOrigin(req)
  const isHttps = origin.startsWith("https://")

  const c = await cookies()
  const h = await headers()

  const locale = (c.get("ig_oauth_locale")?.value || "").trim() || "en"
  const nextFromCookie = normalizeNextPath(c.get("ig_oauth_next")?.value || "")

  const fallbackNext = locale === "zh-TW" ? "/zh-TW/creator-card" : "/en/creator-card"
  const nextPath = nextFromCookie || fallbackNext

  const redirectUriCookie = (c.get("ig_oauth_redirect_uri")?.value || "").trim()
  const redirectUri = redirectUriCookie || `${origin}/api/auth/instagram/callback`

  const baseCookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
  } as const

  const clearOauthCookies = (res: NextResponse) => {
    const keys = [
      "ig_oauth_state",
      "ig_oauth_locale",
      "ig_oauth_provider",
      "ig_oauth_next",
      "ig_oauth_redirect_uri",
    ]
    for (const k of keys) {
      try {
        res.cookies.set(k, "", { ...baseCookieOptions, maxAge: 0 })
      } catch {
        // swallow
      }
    }
  }

  const redirectWithError = (tag: string) => {
    const u = buildSafeRedirect(origin, nextPath)
    u.searchParams.set("authError", tag)
    const res = NextResponse.redirect(u)
    clearOauthCookies(res)
    return res
  }

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ig-oauth] callback error", {
        error,
        description: errorDescription || null,
        host: h.get("host"),
      })
    }
    return redirectWithError("oauth_error")
  }

  if (!code) {
    return redirectWithError("missing_code")
  }

  const expectedState = (c.get("ig_oauth_state")?.value || "").trim()
  if (!expectedState || !state || expectedState !== state) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ig-oauth] state mismatch", {
        hasExpected: Boolean(expectedState),
        hasGot: Boolean(state),
      })
    }
    return redirectWithError("state_mismatch")
  }

  const META_APP_ID =
    process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.META_CLIENT_ID || ""
  const META_APP_SECRET =
    process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || process.env.META_CLIENT_SECRET || ""

  if (!META_APP_ID || !META_APP_SECRET) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ig-oauth] missing env", {
        has_META_APP_ID: Boolean(META_APP_ID),
        has_META_APP_SECRET: Boolean(META_APP_SECRET),
      })
    }
    return redirectWithError("missing_env")
  }

  try {
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token")
    tokenUrl.searchParams.set("client_id", META_APP_ID)
    tokenUrl.searchParams.set("client_secret", META_APP_SECRET)
    tokenUrl.searchParams.set("redirect_uri", redirectUri)
    tokenUrl.searchParams.set("code", code)

    const tokenRes = await fetch(tokenUrl.toString(), { method: "GET", cache: "no-store" })
    const tokenJson: any = await safeJson(tokenRes)

    const accessToken = typeof tokenJson?.access_token === "string" ? tokenJson.access_token.trim() : ""

    if (!tokenRes.ok || !accessToken) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ig-oauth] token exchange failed", {
          status: tokenRes.status,
          hasToken: Boolean(accessToken),
          error: tokenJson?.error ? tokenJson.error : null,
        })
      }
      return redirectWithError("exchange_failed")
    }

    const dest = buildSafeRedirect(origin, nextPath)
    const res = NextResponse.redirect(dest)

    // Persist session in the same cookies used by existing /api/auth/instagram/me etc.
    res.cookies.set("ig_access_token", accessToken, {
      ...baseCookieOptions,
      // Keep a stable session across reloads; adjust safely without changing API contracts.
      maxAge: 60 * 60 * 24 * 60,
    })

    // UI-facing flag (used as a hint; /me does the authoritative check)
    try {
      res.cookies.set("ig_connected", "1", { ...baseCookieOptions, httpOnly: false, maxAge: 60 * 60 * 24 * 60 })
    } catch {
      // swallow
    }

    clearOauthCookies(res)
    return res
  } catch (e: unknown) {
    if (process.env.NODE_ENV !== "production") {
      const errObj = e as any
      console.error("[ig-oauth] callback unexpected error", {
        message: typeof errObj?.message === "string" ? errObj.message : "unknown",
      })
    }
    return redirectWithError("unexpected")
  }
}
