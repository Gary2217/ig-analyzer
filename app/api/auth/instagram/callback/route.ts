import { NextResponse, type NextRequest } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeOrigin(v: string) {
  return v.replace(/\/$/, "")
}

function getAllowedOrigins() {
  const list = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_BASE_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    // 若有用 LAN 測試可打開
    // "http://10.5.0.2:3000",
  ]
    .filter(Boolean)
    .map((s) => normalizeOrigin(String(s)))

  return Array.from(new Set(list))
}

function isAllowedRedirectUri(redirectUri: string, origin: string | null) {
  const allowed = getAllowedOrigins()

  // redirectUri 只要符合 allowlist 任一 base 即可
  if (allowed.some((base) => redirectUri.startsWith(base))) return true

  // 保底：避免反代 / port 變化
  if (origin && redirectUri.startsWith(normalizeOrigin(origin))) return true

  return false
}

function getRequestOrigin(req: NextRequest) {
  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host
  const isLocalhost = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host)
  const proto = !isLocalhost && xfProto === "https" ? "https" : "http"
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  console.log("[IG CALLBACK] HIT", new Date().toISOString())
  try {
    const reqUrl = new URL(req.url)
    const supabaseUrlRaw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
    let supabaseHost: string | null = null
    try {
      supabaseHost = supabaseUrlRaw ? new URL(supabaseUrlRaw).hostname : null
    } catch {
      supabaseHost = null
    }
    console.log(
      JSON.stringify({
        tag: "IG_CALLBACK_ENTRY",
        ts: new Date().toISOString(),
        reqHost: reqUrl.host,
        reqPath: reqUrl.pathname,
        supabaseHost,
        hasServiceRoleKey: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()),
        hasAnonKey: Boolean((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()),
      }),
    )
  } catch {
    // swallow
  }
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

  const GRAPH_BASE = "https://graph.facebook.com"
  const GRAPH_VERSION = "v21.0"

  const safeJson = async (res: Response) => {
    try {
      return await res.json()
    } catch {
      return null
    }
  }

  if (!baseUrl || !appId || !appSecret) {
    const errPath = `/${locale}/results?ig_error=missing_env`
    const res = redirectTo(errPath)
    res.headers.set("Cache-Control", "no-store")
    logRedirectResponse(res)
    clearCookies(res)
    return res
  }

  try {
    if (cookieRedirectUri && !isAllowedRedirectUri(cookieRedirectUri, origin)) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "redirect_uri_not_allowed",
          cookieRedirectUri,
          origin,
          allowed: getAllowedOrigins(),
        }),
        { status: 403 },
      )
    }

    const redirectUri = cookieRedirectUri || `${origin}/api/auth/instagram/callback`

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

    // Exchange to long-lived user token (server-side)
    let longLivedToken = accessToken
    let tokenExpiresAt: string | null = null
    try {
      const llUrl = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token`)
      llUrl.searchParams.set("grant_type", "fb_exchange_token")
      llUrl.searchParams.set("client_id", appId)
      llUrl.searchParams.set("client_secret", appSecret)
      llUrl.searchParams.set("fb_exchange_token", accessToken)

      const llRes = await fetch(llUrl.toString(), { method: "GET", cache: "no-store" })
      const llBody = await safeJson(llRes)
      if (llRes.ok && llBody?.access_token && typeof llBody.access_token === "string") {
        longLivedToken = String(llBody.access_token).trim()
        const expiresIn =
          typeof llBody?.expires_in === "number"
            ? llBody.expires_in
            : typeof llBody?.expires_in === "string"
              ? Number(llBody.expires_in)
              : typeof (llBody as any)?.expiresIn === "number"
                ? (llBody as any).expiresIn
                : typeof (llBody as any)?.expiresIn === "string"
                  ? Number((llBody as any).expiresIn)
                  : null

        tokenExpiresAt =
          typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null
      }
    } catch {
      // swallow; fallback to short-lived
    }

    if (tokenExpiresAt == null) {
      const expiresIn =
        typeof (tokenData as any)?.expires_in === "number"
          ? (tokenData as any).expires_in
          : typeof (tokenData as any)?.expires_in === "string"
            ? Number((tokenData as any).expires_in)
            : typeof (tokenData as any)?.expiresIn === "number"
              ? (tokenData as any).expiresIn
              : typeof (tokenData as any)?.expiresIn === "string"
                ? Number((tokenData as any).expiresIn)
                : null

      tokenExpiresAt =
        typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null
    }

    if (tokenExpiresAt == null) {
      tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }

    // Determine page_id + ig_ig_id (IG business account id)
    let pageId = ""
    let igId = ""
    try {
      const accountsUrl = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/me/accounts`)
      accountsUrl.searchParams.set("fields", "name,instagram_business_account")
      accountsUrl.searchParams.set("access_token", longLivedToken)

      const r = await fetch(accountsUrl.toString(), { method: "GET", cache: "no-store" })
      const data = await safeJson(r)
      const list: any[] = Array.isArray(data?.data) ? data.data : []
      const picked = list.find((p) => p?.instagram_business_account?.id)
      const nextPageId = typeof picked?.id === "string" ? picked.id : ""
      const nextIgId = typeof picked?.instagram_business_account?.id === "string" ? picked.instagram_business_account.id : ""
      if (nextPageId && nextIgId) {
        pageId = nextPageId
        igId = nextIgId
      }
    } catch {
      // swallow
    }

    console.log("[IG CALLBACK] igId =", igId ?? null)

    try {
      const nowIso = new Date().toISOString()

      if (igId) {
        try {
          console.log(
            JSON.stringify({
              tag: "IG_CALLBACK_UPSERT_ATTEMPT",
              ts: new Date().toISOString(),
              table: "ig_auth_state",
              igId,
              pageId: pageId || null,
            }),
          )
        } catch {
          // swallow
        }

        try {
          const { data, error } = await supabaseServer
            .from("ig_auth_state")
            .upsert(
              { ig_user_id: igId, state: "connected", last_verified_at: nowIso },
              { onConflict: "ig_user_id" },
            )

          if (error) {
            console.log(
              JSON.stringify({
                tag: "IG_CALLBACK_UPSERT_FAIL",
                ts: new Date().toISOString(),
                table: "ig_auth_state",
                igId,
                message: error.message,
                code: (error as any)?.code ?? null,
                hint: (error as any)?.hint ?? null,
              }),
            )
          } else {
            const d: any = data as any
            const len = Array.isArray(d) ? d.length : d ? 1 : 0
            console.log(
              JSON.stringify({
                tag: "IG_CALLBACK_UPSERT_OK",
                ts: new Date().toISOString(),
                table: "ig_auth_state",
                igId,
                dataLen: len,
              }),
            )
          }
        } catch (e: any) {
          console.log(
            JSON.stringify({
              tag: "IG_CALLBACK_UPSERT_THROW",
              ts: new Date().toISOString(),
              table: "ig_auth_state",
              igId,
              message: e?.message ?? String(e),
            }),
          )
        }
      }

      if (igId && pageId) {
        try {
          console.log(
            JSON.stringify({
              tag: "IG_CALLBACK_UPSERT_ATTEMPT",
              ts: new Date().toISOString(),
              table: "ig_credentials",
              igId,
              pageId,
            }),
          )
        } catch {
          // swallow
        }

        try {
          const { data, error } = await supabaseServer
            .from("ig_credentials")
            .upsert(
              {
                ig_user_id: igId,
                page_id: pageId,
                access_token: longLivedToken,
                expires_at: tokenExpiresAt,
              },
              { onConflict: "ig_user_id" },
            )

          if (error) {
            console.log(
              JSON.stringify({
                tag: "IG_CALLBACK_UPSERT_FAIL",
                ts: new Date().toISOString(),
                table: "ig_credentials",
                igId,
                pageId,
                message: error.message,
                code: (error as any)?.code ?? null,
                hint: (error as any)?.hint ?? null,
              }),
            )
          } else {
            const d: any = data as any
            const len = Array.isArray(d) ? d.length : d ? 1 : 0
            console.log(
              JSON.stringify({
                tag: "IG_CALLBACK_UPSERT_OK",
                ts: new Date().toISOString(),
                table: "ig_credentials",
                igId,
                pageId,
                dataLen: len,
              }),
            )
          }
        } catch (e: any) {
          console.log(
            JSON.stringify({
              tag: "IG_CALLBACK_UPSERT_THROW",
              ts: new Date().toISOString(),
              table: "ig_credentials",
              igId,
              pageId,
              message: e?.message ?? String(e),
            }),
          )
        }
      }
    } catch {
      // swallow
    }

    const rawNext = url.searchParams.get("next") ?? cookieNext ?? ""
    const nextPath = normalizeNextPath(rawNext)
    const res = redirectTo(nextPath)
    res.headers.set("Cache-Control", "no-store")

    res.cookies.set("ig_connected", "1", { ...baseCookieOptions, httpOnly: false })
    res.cookies.set("ig_access_token", longLivedToken, baseCookieOptions)
    if (pageId && igId) {
      res.cookies.set("ig_page_id", pageId, baseCookieOptions)
      res.cookies.set("ig_ig_id", igId, baseCookieOptions)
    }

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
