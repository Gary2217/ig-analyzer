import { NextResponse, type NextRequest } from "next/server"
import { cookies, headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type IgMediaItem = {
  id: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  caption?: string
  timestamp?: string
}

type IgMeResponse = {
  username: string
  profile_picture_url?: string
  account_type?: string
  followers_count?: number
  recent_media: Array<{
    id: string
    media_type?: string
    media_url?: string
    caption?: string
    timestamp?: string
  }>
}

export async function GET(req: NextRequest) {
  const c = await cookies()
  const h = await headers()

  const cookieToken = c.get("ig_access_token")?.value ?? ""
  const auth = h.get("authorization") ?? ""
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""

  const token = (cookieToken || bearer || "").trim()

  const mask = (v: string) =>
    v && v.length >= 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : v ? `${v.slice(0, 2)}...` : ""

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_token",
        debug: {
          cookieKeysPresent: c.getAll().map((x) => x.name),
          hasAuthorizationHeader: !!auth,
          note:
            "若剛做完 OAuth 卻沒有 cookie token，請檢查 callback 設 cookie 是否在 localhost 被 secure 擋下，或 cookie key 名稱是否為 ig_access_token。",
        },
      },
      { status: 400 },
    )
  }

  const appId = process.env.META_APP_ID || ""
  const appSecret = process.env.META_APP_SECRET || ""
  let tokenDebug: unknown = null

  if (appId && appSecret) {
    try {
      const debugUrl = new URL("https://graph.facebook.com/debug_token")
      debugUrl.searchParams.set("input_token", token)
      debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`)
      const dbgRes = await fetch(debugUrl.toString(), { cache: "no-store" })
      tokenDebug = await dbgRes.json()
    } catch {
      tokenDebug = { error: "debug_token_fetch_failed" }
    }
  }

  try {
    // 1) Business Manager flow: User token -> businesses -> owned_pages (page token + ig business id)
    const businessesUrl = new URL("https://graph.facebook.com/v24.0/me/businesses")
    businessesUrl.searchParams.set("access_token", token)

    const businessesRes = await fetch(businessesUrl.toString(), { method: "GET", cache: "no-store" })
    const businessesJson = (await businessesRes.json().catch(() => null)) as any

    if (!businessesRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "upstream_fetch_failed",
          debug: {
            step: "me_businesses",
            status: businessesRes.status,
            meta: businessesJson,
            tokenLen: token.length,
            tokenMasked: mask(token),
            tokenSource: cookieToken ? "cookie" : bearer ? "bearer" : "none",
            cookieKeysPresent: c.getAll().map((x) => x.name),
            hasAuthorizationHeader: !!auth,
            tokenDebug,
          },
        },
        { status: 400 },
      )
    }

    const businesses = Array.isArray(businessesJson?.data) ? businessesJson.data : []
    const businessId = businesses[0]?.id

    if (!businessId) {
      const payload: IgMeResponse = { username: "", recent_media: [] }
      return NextResponse.json(payload)
    }

    const ownedPagesUrl = new URL(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(String(businessId))}/owned_pages`,
    )
    ownedPagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id}",
    )
    ownedPagesUrl.searchParams.set("access_token", token)

    const ownedPagesRes = await fetch(ownedPagesUrl.toString(), { method: "GET", cache: "no-store" })
    const ownedPagesJson = (await ownedPagesRes.json().catch(() => null)) as any

    if (!ownedPagesRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "upstream_fetch_failed",
          debug: {
            step: "owned_pages",
            status: ownedPagesRes.status,
            meta: ownedPagesJson,
            tokenLen: token.length,
            tokenMasked: mask(token),
            tokenSource: cookieToken ? "cookie" : bearer ? "bearer" : "none",
            cookieKeysPresent: c.getAll().map((x) => x.name),
            hasAuthorizationHeader: !!auth,
            tokenDebug,
          },
        },
        { status: 400 },
      )
    }

    const ownedPages = Array.isArray(ownedPagesJson?.data) ? ownedPagesJson.data : []
    const pageWithIg = ownedPages.find((p: any) => p?.instagram_business_account?.id)
    const pageId = pageWithIg?.id
    const igId = pageWithIg?.instagram_business_account?.id

    if (!pageId || !igId) {
      const payload: IgMeResponse = { username: "", recent_media: [] }
      return NextResponse.json(payload)
    }

    // owned_pages may or may not return access_token; if missing, fetch page access token via page node.
    let pageAccessToken: string | null =
      typeof pageWithIg?.access_token === "string" && pageWithIg.access_token ? pageWithIg.access_token : null

    if (!pageAccessToken) {
      const pageTokenUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(String(pageId))}`)
      pageTokenUrl.searchParams.set("fields", "access_token")
      pageTokenUrl.searchParams.set("access_token", token)

      const pageTokenRes = await fetch(pageTokenUrl.toString(), { method: "GET", cache: "no-store" })
      const pageTokenJson = (await pageTokenRes.json().catch(() => null)) as any

      if (!pageTokenRes.ok || typeof pageTokenJson?.access_token !== "string") {
        const payload: IgMeResponse = { username: "", recent_media: [] }
        return NextResponse.json(payload)
      }

      pageAccessToken = pageTokenJson.access_token
    }

    // 3) Use Page Access Token to fetch IG business profile fields.
    const igUrl = new URL(`https://graph.facebook.com/v24.0/${encodeURIComponent(String(igId))}`)
    igUrl.searchParams.set(
      "fields",
      "username,profile_picture_url,account_type,followers_count,media_count",
    )
    igUrl.searchParams.set("access_token", String(pageAccessToken))

    const igRes = await fetch(igUrl.toString(), { method: "GET", cache: "no-store" })
    const igJson = (await igRes.json().catch(() => null)) as any

    if (!igRes.ok || typeof igJson?.username !== "string" || !igJson.username.trim()) {
      const payload: IgMeResponse = { username: "", recent_media: [] }
      return NextResponse.json(payload)
    }

    const payload: IgMeResponse = {
      username: igJson.username,
      profile_picture_url: typeof igJson.profile_picture_url === "string" ? igJson.profile_picture_url : undefined,
      account_type: typeof igJson.account_type === "string" ? igJson.account_type : undefined,
      followers_count: typeof igJson.followers_count === "number" ? igJson.followers_count : undefined,
      recent_media: [],
    }

    return NextResponse.json(payload)
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "upstream_fetch_failed",
        debug: {
          tokenLen: token.length,
          tokenMasked: mask(token),
          tokenSource: cookieToken ? "cookie" : bearer ? "bearer" : "none",
          cookieKeysPresent: c.getAll().map((x) => x.name),
          hasAuthorizationHeader: !!auth,
          tokenDebug,
          message: e?.message || String(e),
        },
      },
      { status: 400 },
    )
  }
}
