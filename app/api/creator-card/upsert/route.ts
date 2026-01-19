import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { supabaseServer } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function toSupabaseErrorResponse(err: unknown, where: string) {
  const errObj = asRecord(err)
  const rawMsg = typeof errObj?.message === "string" ? String(errObj.message) : "unknown"
  console.error("[creator-card/upsert] supabase error", { where, message: rawMsg, code: errObj?.code ?? null })
  if (rawMsg.includes("Invalid API key")) {
    return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
  }
  return NextResponse.json(
    { ok: false, error: "upsert_failed", message: rawMsg.slice(0, 400) },
    { status: 400 },
  )
}

function normalizeStringArray(value: unknown, maxLen: number) {
  const raw = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const s = item.trim()
    if (!s) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= maxLen) break
  }
  return out
}

function normalizeContactToText(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") {
    const s = v.trim()
    return s ? s : null
  }
  const obj = asRecord(v)
  if (!obj) return null
  try {
    return JSON.stringify(obj)
  } catch {
    return null
  }
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function computeCompletion(payload: unknown) {
  const p = asRecord(payload)
  const niche = String(p?.niche ?? "").trim()
  const audience = String(p?.audience ?? "").trim()
  const deliverables = Array.isArray(p?.deliverables) ? p.deliverables : []
  const contact = String(p?.contact ?? "").trim()
  const portfolio = Array.isArray(p?.portfolio) ? p.portfolio : []

  const checks = [
    niche.length > 0,
    audience.length > 0,
    deliverables.length > 0,
    contact.length > 0,
    (portfolio?.[0]?.title ?? "").trim().length > 0 || (portfolio?.[0]?.desc ?? "").trim().length > 0,
    (portfolio?.[1]?.title ?? "").trim().length > 0 || (portfolio?.[1]?.desc ?? "").trim().length > 0,
    (portfolio?.[2]?.title ?? "").trim().length > 0 || (portfolio?.[2]?.desc ?? "").trim().length > 0,
  ]
  const done = checks.reduce((a, b) => a + (b ? 1 : 0), 0)
  return Math.round((done / checks.length) * 100)
}

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
  return await res.json().catch(() => null)
}

export async function POST(req: Request) {
  try {
    const c = await cookies()
    const token = (c.get("ig_access_token")?.value ?? "").trim()
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", message: "missing_session" },
        { status: 401 },
      )
    }

    const cookieIgId = (c.get("ig_ig_id")?.value ?? "").trim()

    const me = await getIGMe(req)
    const igUserId = cookieIgId ? cookieIgId : null
    const igUsername = me?.username ? String(me.username) : null
    if (!igUserId) {
      return NextResponse.json(
        { ok: false, error: "not_connected", message: "ig_not_connected_or_expired" },
        { status: 403 },
      )
    }

    const bodyUnknown: unknown = await req.json().catch(() => null)
    const body = asRecord(bodyUnknown)
    if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 })

    const completionPct = computeCompletion(body)

    const proposed = String(body.handle ?? "").trim()
    let base = proposed ? slugify(proposed) : slugify(igUsername || "creator")
    if (!base) base = "creator"

    const existing = await supabaseServer
      .from("creator_cards")
      .select("id, handle")
      .eq("ig_user_id", igUserId)
      .limit(1)
      .maybeSingle()

    if (existing.error) {
      return toSupabaseErrorResponse(existing.error, "select existing")
    }

    const wantsNewHandle = Boolean(proposed) && slugify(proposed) !== (existing.data?.handle || "")
    let handle = wantsNewHandle ? base : existing.data?.handle || base

    if (!existing.data || wantsNewHandle) {
      let candidate = base
      for (let i = 0; i < 5; i++) {
        const check = await supabaseServer
          .from("creator_cards")
          .select("id")
          .eq("handle", candidate)
          .limit(1)
          .maybeSingle()

        if (check.error) {
          return toSupabaseErrorResponse(check.error, "check handle uniqueness")
        }

        if (!check.data || (existing.data && check.data.id === existing.data.id)) {
          handle = candidate
          break
        }

        candidate = `${base}-${Math.floor(1000 + Math.random() * 9000)}`
      }
    }

    const themeTypes = normalizeStringArray(body.themeTypes, 20)
    const audienceProfiles = normalizeStringArray(body.audienceProfiles, 20)

    const audience = String(body.audience ?? "").trim()

    const profileImageUrl = (() => {
      const raw = typeof body.profileImageUrl === "string" ? String(body.profileImageUrl) : ""
      const s = raw.trim()
      return s ? s : null
    })()

    // TEMP DEBUG: Log incoming profileImageUrl (safe, no full base64)
    console.log("[upsert] incoming profileImageUrl", {
      typeof: typeof body.profileImageUrl,
      prefix: typeof body.profileImageUrl === "string" ? body.profileImageUrl.slice(0, 30) : null,
      length: typeof body.profileImageUrl === "string" ? body.profileImageUrl.length : null,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) ?? "not_set",
    })

    const collaborationNiches = normalizeStringArray(body.collaborationNiches, 50)
    const deliverables = normalizeStringArray(body.deliverables, 50)
    const pastCollaborations = normalizeStringArray(body.pastCollaborations, 50)

    const contactText = normalizeContactToText(body.contact)

    const dbWrite: Record<string, unknown> = {
      ig_user_id: igUserId,
      ig_username: igUsername,
      handle,
      profile_image_url: profileImageUrl,
      niche: String(body.niche ?? "").trim() || null,
      audience: audience || null,
      contact: contactText,
      collaboration_niches: collaborationNiches,
      deliverables,
      past_collaborations: pastCollaborations,
      portfolio: Array.isArray(body.portfolio) ? body.portfolio : [],
      is_public: Boolean(body.isPublic),
      theme_types: themeTypes,
      audience_profiles: audienceProfiles,
      updated_at: new Date().toISOString(),
    }

    const query = supabaseServer.from("creator_cards")
    const runUpsert = async (p: Record<string, unknown>) => {
      return existing.data?.id
        ? await query.update(p).eq("id", existing.data.id).select("*").maybeSingle()
        : await query.insert(p).select("*").maybeSingle()
    }

    const { data, error } = await runUpsert(dbWrite)

    if (error) {
      return toSupabaseErrorResponse(error, "upsert")
    }

    // TEMP DEBUG: Log returned row's profile_image_url (safe, no full base64)
    const dataObj = data && typeof data === "object" ? data as Record<string, unknown> : null
    const returnedPiu = dataObj?.profile_image_url
    console.log("[upsert] returned row profile_image_url", {
      typeof: typeof returnedPiu,
      prefix: typeof returnedPiu === "string" ? returnedPiu.slice(0, 30) : null,
      length: typeof returnedPiu === "string" ? returnedPiu.length : null,
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) ?? "not_set",
    })

    return NextResponse.json({
      ok: true,
      card: data && typeof data === "object" ? { ...(data as Record<string, unknown>), completion_pct: completionPct } : data,
      completionPct,
    })
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    console.error("[creator-card/upsert] unexpected error", { message: msg })
    if (msg.includes("Invalid API key")) {
      return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: "unexpected_error", message: msg.slice(0, 400) }, { status: 500 })
  }
}
