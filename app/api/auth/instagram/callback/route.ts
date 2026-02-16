import { NextResponse, type NextRequest } from "next/server"
import { cookies } from "next/headers"
import { headers } from "next/headers"
import { createAuthedClient } from "@/lib/supabase/server"

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

async function fetchIgAccountsFromPages(accessToken: string): Promise<
  Array<{ page_id: string; ig_user_id: string; username: string | null; profile_picture_url: string | null }>
> {
  const token = String(accessToken || "").trim()
  if (!token) return []

  try {
    const graphUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
    graphUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username,profile_picture_url}")
    graphUrl.searchParams.set("limit", "50")
    graphUrl.searchParams.set("access_token", token)

    const r = await fetch(graphUrl.toString(), { method: "GET", cache: "no-store" })
    if (!r.ok) return []
    const body: any = await safeJson(r)
    const list: any[] = Array.isArray(body?.data) ? body.data : []

    const out: Array<{ page_id: string; ig_user_id: string; username: string | null; profile_picture_url: string | null }> = []

    for (const row of list) {
      const page_id = typeof row?.id === "string" ? row.id.trim() : ""
      const iba = row?.instagram_business_account
      const ig_user_id = typeof iba?.id === "string" ? iba.id.trim() : ""
      if (!page_id || !ig_user_id) continue

      out.push({
        page_id,
        ig_user_id,
        username: typeof iba?.username === "string" ? iba.username : null,
        profile_picture_url: typeof iba?.profile_picture_url === "string" ? iba.profile_picture_url : null,
      })
    }

    return out
  } catch {
    return []
  }
}

async function safeJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function tryFetchIgUserId(accessToken: string): Promise<string> {
  const token = String(accessToken || "").trim()
  if (!token) return ""

  try {
    const graphUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
    graphUrl.searchParams.set("fields", "name,instagram_business_account")
    graphUrl.searchParams.set("access_token", token)

    const r = await fetch(graphUrl.toString(), { method: "GET", cache: "no-store" })
    if (!r.ok) return ""
    const body: any = await safeJson(r)
    const list: any[] = Array.isArray(body?.data) ? body.data : []
    const picked = list.find((p) => p?.instagram_business_account?.id)
    const igId = typeof picked?.instagram_business_account?.id === "string" ? picked.instagram_business_account.id.trim() : ""
    return igId
  } catch {
    return ""
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
    const expiresInSec =
      typeof tokenJson?.expires_in === "number"
        ? tokenJson.expires_in
        : typeof tokenJson?.expires_in === "string"
          ? Number(tokenJson.expires_in)
          : NaN
    const expiresAt = Number.isFinite(expiresInSec) && expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null

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

    // SaaS prep (save-only): persist IG identity + token per authed app user.
    // IMPORTANT: must never block login; must not change redirects/cookies/response body.
    try {
      const authed = await createAuthedClient()
      const userRes = await authed.auth.getUser()
      const user = userRes?.data?.user ?? null

      if (!user) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ig-oauth] skip db persist (no supabase user)")
        }
      } else {
        const igUserId = await tryFetchIgUserId(accessToken)
        if (!igUserId) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[ig-oauth] skip db persist (missing ig_user_id)")
          }
        } else {
          let hasActive: boolean | null = null

          try {
            const { data: activeRow, error: activeErr } = await authed
              .from("user_instagram_accounts")
              .select("ig_user_id")
              .eq("user_id", user.id)
              .eq("is_active", true)
              .maybeSingle()

            hasActive = !activeErr && Boolean((activeRow as any)?.ig_user_id)
          } catch {
            hasActive = null
          }

          try {
            const accounts = await fetchIgAccountsFromPages(accessToken)
            if (accounts.length) {
              for (let i = 0; i < accounts.length; i++) {
                const a = accounts[i]

                try {
                  await authed
                    .from("user_ig_account_identities")
                    .upsert(
                      {
                        user_id: user.id,
                        provider: "instagram",
                        ig_user_id: a.ig_user_id,
                      },
                      { onConflict: "user_id,provider,ig_user_id" },
                    )
                } catch {
                  // swallow
                }

                const baseUpsert: any = {
                  user_id: user.id,
                  ig_user_id: a.ig_user_id,
                  page_id: a.page_id,
                  username: a.username,
                  profile_picture_url: a.profile_picture_url,
                  updated_at: new Date().toISOString(),
                }

                const allowSetActive = hasActive === false
                const payload = allowSetActive && i === 0 ? { ...baseUpsert, is_active: true } : baseUpsert

                await authed
                  .from("user_instagram_accounts")
                  .upsert(payload, { onConflict: "user_id,ig_user_id" })
              }

              // Multi-account succeeded; keep existing single-account logic below for tokens only.
            }
          } catch {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[ig-oauth] multi-account fetch/upsert failed")
            }
          }

          try {
            await authed
              .from("user_ig_account_identities")
              .upsert(
                {
                  user_id: user.id,
                  provider: "instagram",
                  ig_user_id: igUserId,
                },
                { onConflict: "user_id,provider,ig_user_id" },
              )
          } catch {
            // swallow
          }

          try {
            const baseUpsert: any = {
              user_id: user.id,
              ig_user_id: igUserId,
              updated_at: new Date().toISOString(),
            }

            const payload = hasActive === true ? baseUpsert : { ...baseUpsert, ...(hasActive === false ? { is_active: true } : null) }

            await authed
              .from("user_instagram_accounts")
              .upsert(payload, { onConflict: "user_id,ig_user_id" })
          } catch {
            // swallow
          }

          try {
            await authed
              .from("user_ig_account_tokens")
              .upsert(
                {
                  user_id: user.id,
                  provider: "instagram",
                  ig_user_id: igUserId,
                  access_token: accessToken,
                  expires_at: expiresAt,
                },
                { onConflict: "user_id,provider,ig_user_id" },
              )
          } catch {
            // swallow
          }
        }
      }
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
