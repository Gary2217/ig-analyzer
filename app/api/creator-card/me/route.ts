import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase/server"

async function getIGMe(req: Request) {
  const cookie = req.headers.get("cookie") || ""
  const requestOrigin = new URL(req.url).origin
  const host = new URL(req.url).host
  const isTunnelHost = host.includes("trycloudflare.com") || host.includes("cloudflare.com")
  const internalOrigin =
    process.env.NODE_ENV !== "production" && isTunnelHost ? "http://localhost:3000" : requestOrigin

  const res = await fetch(`${internalOrigin}/api/auth/instagram/me`, {
    headers: { cookie },
    cache: "no-store",
  })

  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return data
}

export async function GET(req: Request) {
  try {
    const me = await getIGMe(req)
    const igUserId = me?.id ? String(me.id) : null
    const igUsername = me?.username ? String(me.username) : null

    if (!igUserId) {
      return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 })
    }

    const { data, error } = await supabaseServer
      .from("creator_cards")
      .select("*")
      .eq("ig_user_id", igUserId)
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const card =
      data && typeof data === "object"
        ? {
            ...(data as any),
            collaborationNiches: Array.isArray((data as any).collaboration_niches)
              ? (data as any).collaboration_niches
              : null,
            pastCollaborations: Array.isArray((data as any).past_collaborations)
              ? (data as any).past_collaborations
              : null,
          }
        : null

    return NextResponse.json({ ok: true, me: { igUserId, igUsername }, card })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 })
  }
}
