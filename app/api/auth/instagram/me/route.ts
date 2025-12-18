import { NextResponse, type NextRequest } from "next/server"

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
  const token = req.cookies.get("ig_access_token")?.value
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
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
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 })
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
  } catch {
    return NextResponse.json({ error: "unexpected" }, { status: 500 })
  }
}
