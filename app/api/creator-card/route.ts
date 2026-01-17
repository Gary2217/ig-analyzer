import { NextResponse } from "next/server"

import { sanitizeCreatorCardProfilePayload, type CreatorCardProfilePayload } from "@/lib/creatorCardProfile"

function getInternalOrigin(req: Request) {
  const requestUrl = new URL(req.url)
  const requestOrigin = requestUrl.origin
  const host = requestUrl.host
  const isTunnelHost = host.includes("trycloudflare.com") || host.includes("cloudflare.com")
  return process.env.NODE_ENV !== "production" && isTunnelHost ? "http://localhost:3000" : requestOrigin
}

function derivePayloadFromCard(card: any): CreatorCardProfilePayload {
  const selfIntro = typeof card?.audience === "string" ? card.audience : ""
  const themeTypes = Array.isArray(card?.themeTypes)
    ? card.themeTypes
    : Array.isArray(card?.theme_types)
      ? card.theme_types
      : []
  const audienceProfile = Array.isArray(card?.audienceProfiles)
    ? card.audienceProfiles
    : Array.isArray(card?.audience_profiles)
      ? card.audience_profiles
      : []

  const rawPortfolio = Array.isArray(card?.portfolio) ? (card.portfolio as any[]) : []
  const featuredItems: any[] = []

  for (let i = 0; i < rawPortfolio.length && i < 30; i++) {
    const it = rawPortfolio[i]
    if (!it || typeof it !== "object") continue
    const id = typeof (it as any).id === "string" ? String((it as any).id).trim() : `${i}`
    const brand = typeof (it as any).brand === "string" ? String((it as any).brand) : ""
    const collabType = typeof (it as any).collabType === "string" ? String((it as any).collabType) : ""
    featuredItems.push({ id: id || `${i}`, brand, collabType })
  }

  return sanitizeCreatorCardProfilePayload({
    selfIntro,
    themeTypes,
    audienceProfile,
    featuredItems,
  })
}

function toUpsertBody(existingCard: any, payload: CreatorCardProfilePayload) {
  const card = existingCard && typeof existingCard === "object" ? existingCard : null

  const themeTypes = Array.isArray(payload.themeTypes)
    ? payload.themeTypes
    : Array.isArray(card?.themeTypes)
      ? card.themeTypes
      : Array.isArray(card?.theme_types)
        ? card.theme_types
        : []

  const audienceProfiles = Array.isArray(payload.audienceProfile)
    ? payload.audienceProfile
    : Array.isArray(card?.audienceProfiles)
      ? card.audienceProfiles
      : Array.isArray(card?.audience_profiles)
        ? card.audience_profiles
        : []

  const portfolio = Array.isArray(payload.featuredItems)
    ? payload.featuredItems.map((x, idx) => ({
        id: x.id,
        brand: typeof x.brand === "string" ? x.brand : "",
        collabType: typeof x.collabType === "string" ? x.collabType : "",
        order: idx,
      }))
    : Array.isArray(card?.portfolio)
      ? card.portfolio
      : []

  return {
    handle: typeof card?.handle === "string" ? card.handle : undefined,
    displayName:
      typeof card?.displayName === "string"
        ? card.displayName
        : typeof card?.display_name === "string"
          ? card.display_name
          : undefined,
    niche: typeof card?.niche === "string" ? card.niche : undefined,
    audience: payload.selfIntro,
    themeTypes,
    audienceProfiles,
    deliverables: Array.isArray(card?.deliverables) ? card.deliverables : undefined,
    contact: typeof card?.contact === "string" ? card.contact : undefined,
    portfolio,
    isPublic: typeof card?.isPublic === "boolean" ? card.isPublic : typeof card?.is_public === "boolean" ? card.is_public : undefined,
    collaborationNiches: Array.isArray(card?.collaborationNiches)
      ? card.collaborationNiches
      : Array.isArray(card?.collaboration_niches)
        ? card.collaboration_niches
        : undefined,
    pastCollaborations: Array.isArray(card?.pastCollaborations)
      ? card.pastCollaborations
      : Array.isArray(card?.past_collaborations)
        ? card.past_collaborations
        : undefined,
  }
}

export async function GET(req: Request) {
  try {
    const internalOrigin = getInternalOrigin(req)
    const cookie = req.headers.get("cookie") || ""

    const res = await fetch(`${internalOrigin}/api/creator-card/me`, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
    })

    const json: any = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return NextResponse.json(json ?? { ok: false, error: "upstream_error" }, { status: res.status })
    }

    const payload = derivePayloadFromCard(json?.card)
    return NextResponse.json({ ok: true, data: payload })
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "unknown"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const internalOrigin = getInternalOrigin(req)
    const cookie = req.headers.get("cookie") || ""

    const raw = await req.json().catch(() => null)
    const payload = sanitizeCreatorCardProfilePayload(raw)

    const meRes = await fetch(`${internalOrigin}/api/creator-card/me`, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
    })
    const meJson: any = await meRes.json().catch(() => null)
    if (!meRes.ok || !meJson?.ok) {
      return NextResponse.json(meJson ?? { ok: false, error: "not_connected" }, { status: meRes.status })
    }

    const upsertBody = toUpsertBody(meJson?.card, payload)

    const saveRes = await fetch(`${internalOrigin}/api/creator-card/upsert`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(upsertBody),
    })

    const saveJson: any = await saveRes.json().catch(() => null)
    if (!saveRes.ok || !saveJson?.ok) {
      return NextResponse.json(saveJson ?? { ok: false, error: "save_failed" }, { status: saveRes.status })
    }

    const nextPayload = derivePayloadFromCard(saveJson?.card)
    return NextResponse.json({ ok: true, data: nextPayload })
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "unknown"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
