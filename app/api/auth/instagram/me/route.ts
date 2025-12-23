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
    const graphUrl = new URL("https://graph.facebook.com/v21.0/me/accounts")
    graphUrl.searchParams.set(
      "fields",
      "instagram_business_account{id,username,profile_picture_url,account_type,followers_count,media.limit(3){id,media_type,media_url,thumbnail_url,caption,timestamp}}"
    )
    graphUrl.searchParams.set("access_token", token)

    const r = await fetch(graphUrl.toString(), { method: "GET", cache: "no-store" })
    if (!r.ok) {
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
            status: r.status,
          },
        },
        { status: 400 },
      )
    }

    const data = (await r.json()) as {
      data?: Array<{ instagram_business_account?: { username?: string; profile_picture_url?: string; account_type?: string; followers_count?: number; media?: { data?: IgMediaItem[] } } }>
    }

    const pages = Array.isArray(data.data) ? data.data : []
    const ig = pages.map((p) => p.instagram_business_account).find(Boolean)

    if (!ig?.username) {
      const payload: IgMeResponse = {
        username: "",
        recent_media: [],
      }
      return NextResponse.json(payload)
    }

    const mediaItems = Array.isArray(ig.media?.data) ? ig.media?.data : []

    const recent_media = mediaItems.slice(0, 3).map((m) => {
      const safeCaption = typeof m.caption === "string" ? m.caption : ""
      const safeMediaUrl = typeof m.media_url === "string" ? m.media_url : typeof m.thumbnail_url === "string" ? m.thumbnail_url : ""

      return {
        id: String(m.id ?? ""),
        media_type: typeof m.media_type === "string" ? m.media_type : undefined,
        media_url: safeMediaUrl || undefined,
        caption: safeCaption || undefined,
        timestamp: typeof m.timestamp === "string" ? m.timestamp : undefined,
      }
    })

    const payload: IgMeResponse = {
      username: ig.username,
      profile_picture_url: typeof ig.profile_picture_url === "string" ? ig.profile_picture_url : undefined,
      account_type: typeof ig.account_type === "string" ? ig.account_type : undefined,
      followers_count: typeof ig.followers_count === "number" ? ig.followers_count : undefined,
      recent_media,
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
