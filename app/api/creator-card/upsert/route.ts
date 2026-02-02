import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function shouldDebug() {
  return process.env.NODE_ENV !== "production" || process.env.CREATOR_CARD_DEBUG === "1"
}

function isCcDebugEnabled(req: Request) {
  return (req.headers.get("x-cc-debug") ?? "").trim() === "1"
}

function ccDebugSource(req: Request) {
  const s = (req.headers.get("x-cc-debug-source") ?? "").trim()
  return s ? s.slice(0, 40) : null
}

function normalizeMinPriceToIntOrNull(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null
    return Math.max(0, Math.floor(v))
  }
  if (typeof v === "string") {
    const digits = v.replace(/[^0-9]/g, "").trim()
    if (!digits) return null
    const n = Number(digits)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.floor(n))
  }
  return null
}

function toSupabaseErrorResponse(err: unknown, where: string) {
  const errObj = asRecord(err)
  const message = typeof errObj?.message === "string" ? String(errObj.message) : "unknown"
  const code = typeof errObj?.code === "string" ? String(errObj.code) : null
  const details = typeof errObj?.details === "string" ? String(errObj.details) : null
  const hint = typeof errObj?.hint === "string" ? String(errObj.hint) : null

  console.error("[creator-card/upsert] supabase error", {
    where,
    message,
    code,
    details,
    hint,
  })
  if (message.includes("Invalid API key")) {
    return NextResponse.json({ ok: false, error: "supabase_invalid_key" }, { status: 500 })
  }

  const status = (() => {
    if (code === "42501" || message.toLowerCase().includes("permission denied")) return 403
    return 500
  })()

  return NextResponse.json(
    {
      ok: false,
      error: "upsert_failed",
      message: message.slice(0, 400),
      code,
      details: details ? details.slice(0, 400) : null,
      hint: hint ? hint.slice(0, 400) : null,
    },
    { status },
  )
}

async function checkMinPriceColumnBestEffort(igUserId: string) {
  try {
    const res = await supabaseServer.from("creator_cards").select("min_price").eq("ig_user_id", igUserId).limit(1)
    if (!res.error) return { ok: true as const }

    const msg = typeof (res.error as any)?.message === "string" ? String((res.error as any).message) : ""
    const code = typeof (res.error as any)?.code === "string" ? String((res.error as any).code) : ""

    const isMissingColumn = code === "42703" || (msg.toLowerCase().includes("min_price") && msg.toLowerCase().includes("column"))
    if (isMissingColumn) {
      return {
        ok: false as const,
        missing: true as const,
        message:
          "Database schema missing column min_price; run migration 20260131000100_add_creator_card_min_price.sql in production.",
      }
    }
  } catch {
    // Best-effort guard: ignore and rely on main upsert error details.
  }

  return { ok: true as const }
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
    const ccDebug = isCcDebugEnabled(req)
    const ccDebugSrc = ccDebugSource(req)

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", message: "not_logged_in" },
        { status: 401 },
      )
    }

    const c = await cookies()
    const token = (c.get("ig_access_token")?.value ?? "").trim()
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthenticated", message: "missing_session" },
        { status: 401 },
      )
    }

    const cookieIgUserId = (
      (c.get("ig_user_id")?.value ?? "").trim() ||
      (c.get("igUserId")?.value ?? "").trim() ||
      (c.get("ig_ig_id")?.value ?? "").trim()
    )

    const me = await getIGMe(req)
    const meObj = me && typeof me === "object" ? (me as Record<string, unknown>) : null
    const meOk = meObj?.ok === true
    const meIgUserId = typeof meObj?.igUserId === "string" ? String(meObj.igUserId) : null
    const igUserId = (cookieIgUserId || meIgUserId || "").trim() || null
    const igUsername = meObj?.username ? String(meObj.username) : null
    const igUserIdStr = typeof igUserId === "string" ? igUserId.trim() : ""
    if (!igUserIdStr) {
      return NextResponse.json(
        { ok: false, error: "not_connected", message: "ig_not_connected_or_expired" },
        { status: 403 },
      )
    }

    if (shouldDebug()) {
      console.log("[creator-card/upsert] request", {
        at: new Date().toISOString(),
        userId: user.id,
        igUserId: igUserIdStr,
      })
    }

    // If the IG /me endpoint does not confirm ok, treat as not connected.
    // This prevents treating stale cookies as authenticated.
    if (!meOk) {
      return NextResponse.json(
        { ok: false, error: "not_connected", message: "ig_not_connected_or_expired" },
        { status: 403 },
      )
    }

    // Atomic legacy claim (server-side) to avoid races. This only claims rows with user_id IS NULL.
    // Only available when the caller has an app session (Supabase user).
    try {
      const claim = await authed
        .rpc("claim_creator_card_legacy", { p_ig_user_id: igUserIdStr, p_user_id: user.id })
        .maybeSingle()

      if (!(claim as any)?.error && (claim as any)?.data) {
        if (shouldDebug()) {
          const claimedId =
            typeof ((claim as any)?.data as any)?.id === "string" ? String(((claim as any).data as any).id) : null
          console.log("[creator-card/upsert] legacy card claimed", { id: claimedId })
        }
      } else {
        const claimErr = (claim as any)?.error
        if (claimErr && shouldDebug()) {
          console.log("[creator-card/upsert] legacy claim rpc skipped/failed", {
            message: typeof claimErr?.message === "string" ? claimErr.message : "unknown",
            code: typeof claimErr?.code === "string" ? claimErr.code : null,
          })
        }
      }
    } catch (e0: unknown) {
      if (shouldDebug()) {
        const errObj0 = asRecord(e0)
        console.log("[creator-card/upsert] legacy claim unexpected error", {
          message: typeof errObj0?.message === "string" ? errObj0.message : "unknown",
        })
      }
    }

    // Best-effort schema guard: do not fail if query permissions are limited.
    const schemaGuard = await checkMinPriceColumnBestEffort(igUserIdStr)
    if (!schemaGuard.ok && schemaGuard.missing) {
      console.error("[creator-card/upsert] schema guard", { message: schemaGuard.message })
      return NextResponse.json(
        {
          ok: false,
          error: "upsert_failed",
          message: schemaGuard.message,
          code: "schema_missing_min_price",
          details: null,
          hint: null,
        },
        { status: 500 },
      )
    }

    const bodyUnknown: unknown = await req.json().catch(() => null)
    const body = asRecord(bodyUnknown)
    if (!body) return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 })

    const completionPct = computeCompletion(body)

    const proposed = String(body.handle ?? "").trim()
    let base = proposed ? slugify(proposed) : slugify(igUsername || "creator")
    if (!base) base = "creator"

    let existing = await supabaseServer
      .from("creator_cards")
      .select("id, handle, user_id, ig_user_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (existing.error) {
      return toSupabaseErrorResponse(existing.error, "select existing by user_id")
    }

    if (!existing.data) {
      const byIg = await supabaseServer
        .from("creator_cards")
        .select("id, handle, user_id, ig_user_id, ig_username, updated_at")
        .eq("ig_user_id", igUserIdStr)
        .order("updated_at", { ascending: false })
        .limit(10)

      if (byIg.error) {
        if (ccDebug) {
          console.error("[creator-card/upsert] debug query error", {
            at: new Date().toISOString(),
            source: ccDebugSrc,
            where: "select by ig_user_id",
            userId: user.id,
            igUserId: igUserIdStr,
            message: typeof (byIg.error as any)?.message === "string" ? String((byIg.error as any).message).slice(0, 300) : "unknown",
            code: typeof (byIg.error as any)?.code === "string" ? String((byIg.error as any).code) : null,
          })
          return NextResponse.json(
            { ok: false, error: "upsert_failed", message: "debug_select_by_ig_failed" },
            { status: 500 },
          )
        }
        return toSupabaseErrorResponse(byIg.error, "select by ig_user_id")
      }

      const rows = Array.isArray(byIg.data) ? byIg.data : []
      if (rows.length > 0) {
        const usable = rows.find((r: any) => {
          const uid = typeof r?.user_id === "string" ? String(r.user_id) : null
          return uid == null || uid === user.id
        })

        if (usable) {
          existing = { data: usable, error: null } as any
        } else {
          const totalMatchesByIg = rows.length
          const usableMatches = 0
          const ownedByOtherMatches = rows.length
          const newest = rows[0] as any
          const newestUserId = typeof newest?.user_id === "string" ? String(newest.user_id) : null
          const newestOwnerKind = newestUserId == null ? "null" : newestUserId === user.id ? "self" : "other"

          const newestId = typeof newest?.id === "string" ? newest.id : null
          const newestIgUsername = typeof newest?.ig_username === "string" ? String(newest.ig_username) : null

          const canReclaim = (() => {
            // IG /me already confirmed ok for this ig_user_id earlier (meOk). Only allow reclaim with a confirmed IG session.
            if (!meOk) return false
            if (!newestId) return false
            if (typeof igUsername === "string" && igUsername.trim() && typeof newestIgUsername === "string" && newestIgUsername.trim()) {
              return newestIgUsername.trim().toLowerCase() === igUsername.trim().toLowerCase()
            }
            // If DB row has no ig_username (or request has none), fall back to ig_user_id proof.
            return true
          })()

          if (canReclaim && newestId) {
            const reclaimRes = await supabaseServer
              .from("creator_cards")
              .update({ user_id: user.id, updated_at: new Date().toISOString() })
              .eq("id", newestId)
              .eq("ig_user_id", igUserIdStr)
              .select("id, handle, user_id, ig_user_id")
              .maybeSingle()

            if (reclaimRes.error) {
              if (ccDebug) {
                console.error("[creator-card/upsert] reclaim failed", {
                  at: new Date().toISOString(),
                  source: ccDebugSrc,
                  userId: user.id,
                  igUserId: igUserIdStr,
                  targetId: newestId,
                  message:
                    typeof (reclaimRes.error as any)?.message === "string"
                      ? String((reclaimRes.error as any).message).slice(0, 300)
                      : "unknown",
                  code: typeof (reclaimRes.error as any)?.code === "string" ? String((reclaimRes.error as any).code) : null,
                })
              }
              return NextResponse.json(
                { ok: false, error: "upsert_failed", message: "reclaim_failed" },
                { status: 500 },
              )
            }

            if (reclaimRes.data) {
              existing = reclaimRes as any
            } else {
              return NextResponse.json(
                { ok: false, error: "upsert_failed", message: "reclaim_no_row" },
                { status: 500 },
              )
            }
          } else {
            if (ccDebug) {
              console.log("[creator-card/upsert] not_owner", {
                at: new Date().toISOString(),
                source: ccDebugSrc,
                userId: user.id,
                igUserId: igUserIdStr,
                totalMatchesByIg,
                usableMatches,
                ownedByOtherMatches,
                newestMatch: {
                  id: newestId,
                  user_id: newestUserId ?? "null",
                  updated_at: typeof newest?.updated_at === "string" ? newest.updated_at : null,
                },
              })
            }

            return NextResponse.json(
              {
                ok: false,
                error: "forbidden",
                message: "not_owner",
                ...(ccDebug
                  ? {
                      debug: {
                        igUserId: igUserIdStr,
                        totalMatchesByIg,
                        usableMatches,
                        newestOwnerKind,
                      },
                    }
                  : null),
              },
              { status: 403 },
            )
          }

        }
      }
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
    if (shouldDebug()) {
      console.log("[upsert] incoming profileImageUrl", {
        typeof: typeof body.profileImageUrl,
        prefix: typeof body.profileImageUrl === "string" ? body.profileImageUrl.slice(0, 30) : null,
        length: typeof body.profileImageUrl === "string" ? body.profileImageUrl.length : null,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) ?? "not_set",
      })
    }

    const collaborationNiches = normalizeStringArray(body.collaborationNiches, 50)
    const deliverables = normalizeStringArray(body.deliverables, 50)
    const pastCollaborations = normalizeStringArray(body.pastCollaborations, 50)

    const contactText = normalizeContactToText(body.contact)

    const minPrice = normalizeMinPriceToIntOrNull((body as any).minPrice)
    
    // DEV-ONLY: Log featuredItems in request
    if (shouldDebug()) {
      const featuredItemsArray = Array.isArray(body.featuredItems) ? body.featuredItems : []
      console.log("[upsert] REQUEST featuredItems count:", featuredItemsArray.length)
      if (featuredItemsArray.length > 0) {
        console.log("[upsert] REQUEST featuredItems sample:", JSON.stringify(featuredItemsArray[0]))
      }
    }

    const dbWrite: Record<string, unknown> = {
      user_id: user.id,
      ig_user_id: igUserIdStr,
      ig_username: igUsername,
      handle,
      profile_image_url: profileImageUrl,
      niche: String(body.niche ?? "").trim() || null,
      audience: audience || null,
      min_price: minPrice,
      contact: contactText,
      collaboration_niches: collaborationNiches,
      deliverables,
      past_collaborations: pastCollaborations,
      portfolio: Array.isArray(body.portfolio) ? body.portfolio : [],
      featured_items: Array.isArray(body.featuredItems) ? body.featuredItems : [],
      is_public: Boolean(body.isPublic),
      theme_types: themeTypes,
      audience_profiles: audienceProfiles,
      updated_at: new Date().toISOString(),
    }
    if (!existing.data?.id) {
      const finalByIg = await supabaseServer
        .from("creator_cards")
        .select("id, user_id")
        .eq("ig_user_id", igUserIdStr)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (finalByIg.error) {
        return toSupabaseErrorResponse(finalByIg.error, "final idempotency check by ig_user_id")
      }

      const finalUserId = typeof (finalByIg.data as any)?.user_id === "string" ? String((finalByIg.data as any).user_id) : null
      const finalId = typeof (finalByIg.data as any)?.id === "string" ? String((finalByIg.data as any).id) : null

      if (finalId && finalUserId && finalUserId !== user.id) {
        if (shouldDebug()) {
          console.log("[creator-card/upsert] idempotency short-circuit (insert race)", {
            at: new Date().toISOString(),
            igUserId: igUserIdStr,
            userId: user.id,
            existingOwner: finalUserId,
            existingId: finalId,
          })
        }
        return NextResponse.json({ ok: true })
      }
    }

    const query = supabaseServer.from("creator_cards")
    const runUpsert = async (p: Record<string, unknown>) => {
      return existing.data?.id
        ? await query
            .update(p)
            .eq("id", existing.data.id)
            .or(`user_id.is.null,user_id.eq.${user.id}`)
            .select("*")
            .maybeSingle()
        : await query.insert(p).select("*").maybeSingle()
    }

    const { data, error } = await runUpsert(dbWrite)

    if (error) {
      return toSupabaseErrorResponse(error, "upsert")
    }

    // TEMP DEBUG: Log returned row's profile_image_url (safe, no full base64)
    const dataObj = data && typeof data === "object" ? data as Record<string, unknown> : null
    const returnedPiu = dataObj?.profile_image_url
    if (shouldDebug()) {
      console.log("[upsert] returned row profile_image_url", {
        typeof: typeof returnedPiu,
        prefix: typeof returnedPiu === "string" ? returnedPiu.slice(0, 30) : null,
        length: typeof returnedPiu === "string" ? returnedPiu.length : null,
        supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) ?? "not_set",
      })
    }
    
    // DEV-ONLY: Log featuredItems in response
    if (shouldDebug()) {
      const returnedFeaturedItems = Array.isArray(dataObj?.featured_items) ? dataObj.featured_items : []
      console.log("[upsert] RESPONSE featuredItems count:", returnedFeaturedItems.length)
      if (returnedFeaturedItems.length > 0) {
        console.log("[upsert] RESPONSE featuredItems sample:", JSON.stringify(returnedFeaturedItems[0]))
      }
    }
    
    // Map snake_case DB column to camelCase for client
    const featuredItems = Array.isArray(dataObj?.featured_items) ? dataObj.featured_items : []

    return NextResponse.json({
      ok: true,
      card: data && typeof data === "object" ? { 
        ...(data as Record<string, unknown>), 
        featuredItems,  // Add camelCase alias for client
        completion_pct: completionPct 
      } : data,
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
