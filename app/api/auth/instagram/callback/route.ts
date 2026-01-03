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

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const cookieState = req.cookies.get("ig_oauth_state")?.value
  const locale = req.cookies.get("ig_oauth_locale")?.value || "en"
  const cookieNext = req.cookies.get("ig_oauth_next")?.value || ""
  const cookieRedirectUri = req.cookies.get("ig_oauth_redirect_uri")?.value || ""

  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  const isHttps = xfProto === "https" || req.nextUrl.protocol === "https:"
  const secure = isHttps

  const baseCookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
  } as const

  const origin = getRequestOrigin(req)

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, origin))

  const debugLog = (...args: any[]) => {
    if (process.env.IG_OAUTH_DEBUG !== "1") return
    console.log("[IG_OAUTH_DEBUG]", ...args)
  }

  const logRedirectResponse = (res: NextResponse) => {
    if (process.env.IG_OAUTH_DEBUG !== "1") return
    const setCookie = res.headers.get("set-cookie") || ""
    const hasAccess = setCookie.includes("ig_access_token=")
    const hasConnected = setCookie.includes("ig_connected=")
    debugLog("callback response status=", res.status)
    debugLog("callback response Location=", res.headers.get("location"))
    debugLog("callback response cache-control=", res.headers.get("cache-control"))
    debugLog("callback response set-cookie has ig_access_token=", hasAccess)
    debugLog("callback response set-cookie has ig_connected=", hasConnected)
    debugLog("callback set-cookie options secure=", baseCookieOptions.secure)
    debugLog("callback set-cookie options sameSite=", baseCookieOptions.sameSite)
    debugLog("callback set-cookie options path=", baseCookieOptions.path)
    debugLog("callback set-cookie options domain=", "(not set)")
  }

  debugLog("callback req.url=", req.url)
  debugLog("callback headers host=", req.headers.get("host"))
  debugLog("callback headers x-forwarded-host=", req.headers.get("x-forwarded-host"))
  debugLog("callback headers x-forwarded-proto=", req.headers.get("x-forwarded-proto"))
  debugLog("callback req.nextUrl.protocol=", req.nextUrl.protocol)
  debugLog("callback origin=", origin)
  debugLog("callback cookie ig_oauth_redirect_uri present=", Boolean(cookieRedirectUri))
  debugLog(
    "callback cookie ig_oauth_redirect_uri head=",
    cookieRedirectUri ? cookieRedirectUri.slice(0, 60) : null,
  )
  debugLog("callback code present=", Boolean(code))
  debugLog("callback state present=", Boolean(state))
  debugLog("callback cookieState present=", Boolean(cookieState))
  debugLog("callback locale=", locale)

  const normalizeNextPath = (raw: string) => {
    const v = (raw ?? "").trim()
    if (!v) return `/${locale}/results`
    if (!v.startsWith("/")) return `/${locale}/results`
    if (v.startsWith("//")) return `/${locale}/results`
    if (v.toLowerCase().includes("http")) return `/${locale}/results`
    return v
  }

  const clearCookies = (res: NextResponse) => {
    res.cookies.delete("ig_oauth_state")
    res.cookies.delete("ig_oauth_locale")
    res.cookies.delete("ig_oauth_provider")
    res.cookies.delete("ig_oauth_next")
    res.cookies.delete("ig_oauth_redirect_uri")
    res.cookies.set("ig_oauth_state", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_locale", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_provider", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_next", "", { ...baseCookieOptions, maxAge: 0 })
    res.cookies.set("ig_oauth_redirect_uri", "", { ...baseCookieOptions, maxAge: 0 })
  }

  const stateCheckPass = Boolean(code && state && cookieState && state === cookieState)
  debugLog("callback state check=", stateCheckPass ? "pass" : "fail")

  if (!stateCheckPass) {
    const errPath = `/${locale}/results?ig_error=instagram_auth_failed`
    const res = redirectTo(errPath)
    res.headers.set("Cache-Control", "no-store")
    logRedirectResponse(res)
    clearCookies(res)
    return res
  }

  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL
  const appId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID || process.env.META_CLIENT_ID
  const appSecret =
    process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || process.env.META_CLIENT_SECRET

  if (!baseUrl || !appId || !appSecret) {
    const errPath = `/${locale}/results?ig_error=missing_env`
    const res = redirectTo(errPath)
    res.headers.set("Cache-Control", "no-store")
    logRedirectResponse(res)
    clearCookies(res)
    return res
  }

  try {
    const redirectUri =
      cookieRedirectUri && cookieRedirectUri.startsWith(origin)
        ? cookieRedirectUri
        : `${origin}/api/auth/instagram/callback`

    const codeStr = code as string

    debugLog("callback token exchange redirect_uri=", redirectUri)

    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token")
    tokenUrl.searchParams.set("client_id", appId)
    tokenUrl.searchParams.set("client_secret", appSecret)
    tokenUrl.searchParams.set("redirect_uri", redirectUri)
    tokenUrl.searchParams.set("code", codeStr)

    const tokenRes = await fetch(tokenUrl.toString(), { method: "GET", cache: "no-store" })
    debugLog("callback tokenRes.status=", tokenRes.status)
    if (!tokenRes.ok) {
      throw new Error(`token_exchange_failed:${tokenRes.status}`)
    }

    const tokenData = (await tokenRes.json()) as unknown

    if (!tokenData || typeof (tokenData as any).access_token !== "string") {
      debugLog("callback token response has access_token=", false)
      const errPath = `/${locale}/results?ig_error=invalid_token_response_from_graph`
      const res = redirectTo(errPath)
      res.headers.set("Cache-Control", "no-store")
      logRedirectResponse(res)
      clearCookies(res)
      return res
    }

    const accessToken = ((tokenData as any).access_token as string).trim()

    debugLog("callback token response has access_token=", true)
    debugLog("callback access_token length=", accessToken.length)

    if (accessToken.length < 20) {
      const errPath = `/${locale}/results?ig_error=access_token_too_short`
      const res = redirectTo(errPath)
      res.headers.set("Cache-Control", "no-store")
      logRedirectResponse(res)
      clearCookies(res)
      return res
    }

    const rawNext = url.searchParams.get("next") ?? cookieNext ?? ""
    const nextPath = normalizeNextPath(rawNext)
    const res = redirectTo(nextPath)
    res.headers.set("Cache-Control", "no-store")

    res.cookies.set("ig_connected", "1", { ...baseCookieOptions, httpOnly: false })
    res.cookies.set("ig_access_token", accessToken, baseCookieOptions)

    logRedirectResponse(res)

    clearCookies(res)
    return res
  } catch {
    debugLog("callback token exchange failed -> redirecting")
    const errPath = `/${locale}/results?ig_error=token_exchange_failed`
    const res = redirectTo(errPath)
    res.headers.set("Cache-Control", "no-store")
    logRedirectResponse(res)
    clearCookies(res)
    return res
  }
}
