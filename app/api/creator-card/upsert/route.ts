import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAuthedClient, supabaseServer } from "@/lib/supabase/server"
import { getMeState } from "@/app/lib/server/instagramMeResolver"

const upsertRateBuckets = new Map<string, { resetAt: number; count: number }>()

function makeRequestId() {
  try {
    const g = globalThis as any
    const maybeCrypto = g?.crypto
    if (maybeCrypto && typeof maybeCrypto.randomUUID === "function") {
      return String(maybeCrypto.randomUUID())
    }
  } catch {
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreateRequestId(req: Request) {
  const existing = (req.headers.get("x-request-id") ?? "").trim()
  return existing ? existing : makeRequestId()
}

function withRequestId(res: NextResponse, requestId: string) {
  try {
    res.headers.set("x-request-id", requestId)
  } catch {
  }
  return res
}

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function jsonWithRequestId(payload: any, init: { status?: number; headers?: HeadersInit } | undefined, requestId: string) {
  const res = NextResponse.json(payload, { status: init?.status, headers: init?.headers })
  return withRequestId(res, requestId)
}

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

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  try {
    const t0 = Date.now()
    const ccDebug = isCcDebugEnabled(req)
    const ccDebugSrc = ccDebugSource(req)

    const authed = await createAuthedClient()
    const userRes = await authed.auth.getUser()
    const user = userRes?.data?.user ?? null
    if (!user) {
      return jsonWithRequestId(
        { ok: false, error: "unauthenticated", message: "not_logged_in" },
        { status: 401 },
        requestId,
      )
    }

    const c = await cookies()
    const token = (c.get("ig_access_token")?.value ?? "").trim()
    if (!token) {
      return jsonWithRequestId(
        { ok: false, error: "unauthenticated", message: "missing_session" },
        { status: 401 },
        requestId,
      )
    }

    const explicitSaveHeader = (req.headers.get("x-explicit-save") ?? "").trim()
    if (explicitSaveHeader !== "1") {
      return jsonWithRequestId(
        { ok: false, error: "bad_request", message: "explicit_save_required" },
        { status: 400 },
        requestId,
      )
    }

    const cookieIgUserId = (
      (c.get("ig_user_id")?.value ?? "").trim() ||
      (c.get("igUserId")?.value ?? "").trim() ||
      (c.get("ig_ig_id")?.value ?? "").trim()
    )

    const tMeStart = Date.now()
    const meState = await getMeState(req)
    const tMeMs = Date.now() - tMeStart

    const meOk = Boolean((meState as any)?.connected)
    const meIgUserId = typeof (meState as any)?.igUserId === "string" ? String((meState as any).igUserId) : null
    const igUserId = (cookieIgUserId || meIgUserId || "").trim() || null
    const igUsername = (meState as any)?.username ? String((meState as any).username) : null
    const igUserIdStr = typeof igUserId === "string" ? igUserId.trim() : ""
    if (!igUserIdStr) {
      const durationMs = Date.now() - t0
      return jsonWithRequestId(
        { ok: false, error: "not_connected", message: "ig_not_connected_or_expired" },
        { status: 403, headers: { "Server-Timing": `creator_card_upsert;dur=${durationMs}, ig_me_resolve;dur=${tMeMs}` } },
        requestId,
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
      const durationMs = Date.now() - t0
      return jsonWithRequestId(
        { ok: false, error: "not_connected", message: "ig_not_connected_or_expired" },
        { status: 403, headers: { "Server-Timing": `creator_card_upsert;dur=${durationMs}, ig_me_resolve;dur=${tMeMs}` } },
        requestId,
      )
    }

    if (process.env.NODE_ENV === "production" && ccDebugSrc === "user-save") {
      const key = `${user.id}:${igUserIdStr}`
      const now = Date.now()
      const windowMs = 60_000
      const limit = 30
      const bucket = upsertRateBuckets.get(key)
      if (!bucket || bucket.resetAt <= now) {
        upsertRateBuckets.set(key, { resetAt: now + windowMs, count: 1 })
      } else {
        bucket.count += 1
        if (bucket.count > limit) {
          return jsonWithRequestId(
            { ok: false, error: "rate_limited", message: "too_many_requests" },
            { status: 429 },
            requestId,
          )
        }
      }
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
      const durationMs = Date.now() - t0
      console.error("[creator-card/upsert] schema guard", { message: schemaGuard.message })
      return jsonWithRequestId(
        {
          ok: false,
          error: "upsert_failed",
          message: schemaGuard.message,
          code: "schema_missing_min_price",
          details: null,
          hint: null,
        },
        { status: 500, headers: { "Server-Timing": `creator_card_upsert;dur=${durationMs}, ig_me_resolve;dur=${tMeMs}` } },
        requestId,
      )
    }

    const bodyUnknown: unknown = await req.json().catch(() => null)
    const body = asRecord(bodyUnknown)
    if (!body) {
      const durationMs = Date.now() - t0
      return jsonWithRequestId({ ok: false, error: "bad_json" }, { status: 400, headers: { "Server-Timing": `creator_card_upsert;dur=${durationMs}, ig_me_resolve;dur=${tMeMs}` } }, requestId)
    }

    const hasHandleKey = hasOwn(body, "handle")
    const handleRaw = hasHandleKey && typeof body.handle === "string" ? body.handle.trim().slice(0, 64) : ""
    const audienceRaw = (typeof body.audience === "string" ? body.audience.trim() : "").slice(0, 2000)
    const nicheRaw = (typeof body.niche === "string" ? body.niche.trim() : "").slice(0, 128)
    const featuredItemsRaw = (Array.isArray(body.featuredItems) ? body.featuredItems : []).slice(0, 50)
    const portfolioRaw = (Array.isArray(body.portfolio) ? body.portfolio : []).slice(0, 50)

    const featuredItemsSanitized = featuredItemsRaw.map((it) => {
      const obj = asRecord(it)
      if (!obj) return it
      const url = typeof obj.url === "string" ? obj.url.trim().slice(0, 2048) : obj.url
      const thumb = typeof obj.thumbnailUrl === "string" ? obj.thumbnailUrl.trim().slice(0, 2048) : obj.thumbnailUrl
      return {
        ...obj,
        ...(url !== undefined ? { url } : null),
        ...(thumb !== undefined ? { thumbnailUrl: thumb } : null),
      }
    })

    const completionPct = computeCompletion(body)

    const existingByIg = await supabaseServer
      .from("creator_cards")
      .select("*")
      .eq("ig_user_id", igUserIdStr)
      .limit(1)
      .maybeSingle()

    if (existingByIg.error) {
      return withRequestId(toSupabaseErrorResponse(existingByIg.error, "select existing by ig_user_id"), requestId)
    }

    const existingRow = existingByIg.data && typeof existingByIg.data === "object" ? (existingByIg.data as any) : null
    const existingId = typeof existingRow?.id === "string" ? String(existingRow.id) : null
    const existingHandle = typeof existingRow?.handle === "string" ? String(existingRow.handle) : ""
    const existingUserId = typeof existingRow?.user_id === "string" ? String(existingRow.user_id) : null

    const proposed = hasHandleKey ? handleRaw : ""
    let base = proposed ? slugify(proposed) : slugify(igUsername || "creator")
    if (!base) base = "creator"

    const wantsNewHandle = Boolean(proposed) && slugify(proposed) !== (existingHandle || "")

    // IMPORTANT: Do not overwrite handle unless the client explicitly provided it.
    // - If row exists and handle key is missing => preserve existing handle.
    // - If inserting a new row => generate a handle (required).
    let handle = existingRow ? existingHandle : base
    if (!existingRow && !handle) handle = base
    if (hasHandleKey) {
      handle = wantsNewHandle ? base : (existingHandle || base)
    }

    if (!existingId || (hasHandleKey && wantsNewHandle)) {
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

        if (!check.data || (existingId && check.data.id === existingId)) {
          handle = candidate
          break
        }

        candidate = `${base}-${Math.floor(1000 + Math.random() * 9000)}`
      }
    }

    const themeTypes = normalizeStringArray(body.themeTypes, 20)
    const audienceProfiles = normalizeStringArray(body.audienceProfiles, 20)

    const audience = audienceRaw

    const clearProfileImageUrl = Boolean((body as any).clearProfileImageUrl)
    const clearAvatarUrl = Boolean((body as any).clearAvatarUrl)

    const incomingProfileImageUrl = (() => {
      if (!hasOwn(body, "profileImageUrl")) return undefined
      const v = (body as any).profileImageUrl
      if (v === null) return null
      if (typeof v === "string") {
        const s = v.trim()
        return s ? s : ""
      }
      return ""
    })()

    const incomingAvatarUrl = (() => {
      if (!hasOwn(body, "avatarUrl")) return undefined
      const v = (body as any).avatarUrl
      if (v === null) return null
      if (typeof v === "string") {
        const s = v.trim()
        return s ? s : ""
      }
      return ""
    })()

    const existingProfileImageUrl = typeof existingRow?.profile_image_url === "string" ? existingRow.profile_image_url : null
    const existingAvatarUrl = typeof existingRow?.avatar_url === "string" ? existingRow.avatar_url : null

    const profileImageUrl = (() => {
      if (incomingProfileImageUrl === undefined) return existingProfileImageUrl
      if (incomingProfileImageUrl === null) return clearProfileImageUrl ? null : existingProfileImageUrl
      if (incomingProfileImageUrl === "") return clearProfileImageUrl ? null : existingProfileImageUrl
      return incomingProfileImageUrl
    })()

    const avatarUrl = (() => {
      if (incomingAvatarUrl === undefined) return existingAvatarUrl
      if (incomingAvatarUrl === null) return clearAvatarUrl ? null : existingAvatarUrl
      if (incomingAvatarUrl === "") return clearAvatarUrl ? null : existingAvatarUrl
      return incomingAvatarUrl
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

    const nullableDbKeys = new Set([
      "niche",
      "audience",
      "min_price",
      "contact",
      "collaboration_niches",
      "deliverables",
      "past_collaborations",
      "portfolio",
      "featured_items",
      "theme_types",
      "audience_profiles",
    ])

    const dbWrite: Record<string, unknown> = {
      user_id: user.id,
      ig_user_id: igUserIdStr,
      ig_username: igUsername,
      updated_at: new Date().toISOString(),
    }

    const setIfPresent = (key: string, value: unknown, opts?: { allowNull?: boolean }) => {
      if (value === undefined) return
      if (value === null) {
        if (opts?.allowNull) {
          dbWrite[key] = null
        }
        return
      }
      dbWrite[key] = value
    }

    if (!existingRow || hasHandleKey) {
      setIfPresent("handle", handle, { allowNull: false })
    }
    setIfPresent("profile_image_url", profileImageUrl, { allowNull: true })
    setIfPresent("avatar_url", avatarUrl, { allowNull: true })

    if (hasOwn(body, "niche")) setIfPresent("niche", nicheRaw || null, { allowNull: true })
    if (hasOwn(body, "audience")) setIfPresent("audience", audience || null, { allowNull: true })
    if (hasOwn(body as any, "minPrice")) setIfPresent("min_price", minPrice, { allowNull: true })
    if (hasOwn(body, "contact")) setIfPresent("contact", contactText, { allowNull: true })
    if (hasOwn(body, "collaborationNiches")) setIfPresent("collaboration_niches", collaborationNiches, { allowNull: true })
    if (hasOwn(body, "deliverables")) setIfPresent("deliverables", deliverables, { allowNull: true })
    if (hasOwn(body, "pastCollaborations")) setIfPresent("past_collaborations", pastCollaborations, { allowNull: true })
    if (hasOwn(body, "portfolio")) setIfPresent("portfolio", portfolioRaw, { allowNull: true })
    if (hasOwn(body, "featuredItems")) setIfPresent("featured_items", featuredItemsSanitized, { allowNull: true })
    if (hasOwn(body, "themeTypes")) setIfPresent("theme_types", themeTypes, { allowNull: true })
    if (hasOwn(body, "audienceProfiles")) setIfPresent("audience_profiles", audienceProfiles, { allowNull: true })
    if (hasOwn(body, "isPublic")) setIfPresent("is_public", Boolean(body.isPublic), { allowNull: false })

    if (existingRow) {
      for (const k of Object.keys(dbWrite)) {
        if (k === "updated_at") continue
        const a = (dbWrite as any)[k]
        const b = (existingRow as any)[k]
        if (a === b) {
          delete (dbWrite as any)[k]
          continue
        }
        if (Array.isArray(a) || typeof a === "object") {
          try {
            if (JSON.stringify(a) === JSON.stringify(b)) {
              delete (dbWrite as any)[k]
            }
          } catch {
          }
        }
        if (a === null && !nullableDbKeys.has(k)) {
          delete (dbWrite as any)[k]
        }
      }
    }

    const isUniqueViolation = (err: unknown) => {
      const e = asRecord(err)
      const code = typeof e?.code === "string" ? String(e.code) : null
      const message = typeof e?.message === "string" ? String(e.message) : ""
      return code === "23505" || message.toLowerCase().includes("duplicate key")
    }

    const authorizeExisting = (ownerUserId: string | null) => {
      if (ownerUserId == null || ownerUserId === user.id) {
        return { ok: true as const, reclaim: false as const }
      }
      if (meOk) {
        return { ok: true as const, reclaim: true as const }
      }
      return { ok: false as const, reclaim: false as const }
    }

    const reclaimViaRpc = async (id: string, source: string | null) => {
      try {
        const res = await supabaseServer
          .rpc("reclaim_creator_card", {
            p_creator_card_id: id,
            p_ig_user_id: igUserIdStr,
            p_new_user_id: user.id,
            p_source: source,
          })
          .maybeSingle()

        if ((res as any)?.error) {
          return { ok: false as const, error: (res as any).error }
        }
        if (!(res as any)?.data) {
          return { ok: false as const, error: { message: "reclaim_no_row" } }
        }
        return { ok: true as const }
      } catch (e: unknown) {
        return { ok: false as const, error: e }
      }
    }

    const updateById = async (id: string, opts: { reclaim: boolean }) => {
      const payload = opts.reclaim ? { ...dbWrite, user_id: user.id } : dbWrite
      return await supabaseServer.from("creator_cards").update(payload).eq("id", id).select("*").maybeSingle()
    }

    let data: any = null
    let error: any = null

    if (existingId) {
      const authz = authorizeExisting(existingUserId)
      if (!authz.ok) {
        if (ccDebug && shouldDebug()) {
          console.log("[creator-card/upsert] not_owner", {
            at: new Date().toISOString(),
            source: ccDebugSrc,
            userId: user.id,
            igUserId: igUserIdStr,
            existingId,
            ownerKind: "other",
            meOk,
          })
        }
        return jsonWithRequestId(
          {
            ok: false,
            error: "forbidden",
            message: "not_owner",
            ...(ccDebug
              ? {
                  debug: {
                    igUserId: igUserIdStr,
                    ownerKind: "other",
                    meOk,
                  },
                }
              : null),
          },
          { status: 403 },
          requestId,
        )
      }

      if (authz.reclaim && ccDebug && shouldDebug()) {
        console.log("[creator-card/upsert] reclaim", {
          at: new Date().toISOString(),
          source: ccDebugSrc,
          userId: user.id,
          igUserId: igUserIdStr,
          existingId,
          ownerKind: "other",
          meOk,
        })
      }

      if (authz.reclaim) {
        const reclaim = await reclaimViaRpc(existingId, ccDebugSrc ?? null)
        if (!reclaim.ok) {
          const msg = typeof (reclaim as any)?.error?.message === "string" ? String((reclaim as any).error.message) : ""
          return jsonWithRequestId(
            { ok: false, error: "upsert_failed", message: msg === "reclaim_no_row" ? "reclaim_no_row" : "reclaim_failed" },
            { status: 500 },
            requestId,
          )
        }
      }

      const res = await updateById(existingId, { reclaim: false })
      data = (res as any).data
      error = (res as any).error
    } else {
      const insertRes = await supabaseServer.from("creator_cards").insert(dbWrite).select("*").maybeSingle()
      if (!(insertRes as any).error) {
        data = (insertRes as any).data
      } else if (isUniqueViolation((insertRes as any).error)) {
        const after = await supabaseServer
          .from("creator_cards")
          .select("id, handle, user_id, ig_user_id, updated_at")
          .eq("ig_user_id", igUserIdStr)
          .limit(1)
          .maybeSingle()

        if (after.error) {
          return withRequestId(toSupabaseErrorResponse(after.error, "reselect existing by ig_user_id after unique violation"), requestId)
        }

        const afterId = typeof (after.data as any)?.id === "string" ? String((after.data as any).id) : null
        const afterOwner = typeof (after.data as any)?.user_id === "string" ? String((after.data as any).user_id) : null
        if (!afterId) {
          return jsonWithRequestId(
            { ok: false, error: "upsert_failed", message: "insert_race_no_row" },
            { status: 500 },
            requestId,
          )
        }

        const authz = authorizeExisting(afterOwner)
        if (!authz.ok) {
          if (ccDebug && shouldDebug()) {
            console.log("[creator-card/upsert] not_owner", {
              at: new Date().toISOString(),
              source: ccDebugSrc,
              userId: user.id,
              igUserId: igUserIdStr,
              existingId: afterId,
              ownerKind: "other",
              meOk,
              raced: true,
            })
          }
          return jsonWithRequestId(
            {
              ok: false,
              error: "forbidden",
              message: "not_owner",
              ...(ccDebug
                ? {
                    debug: {
                      igUserId: igUserIdStr,
                      ownerKind: "other",
                      meOk,
                      raced: true,
                    },
                  }
                : null),
            },
            { status: 403 },
            requestId,
          )
        }

        if (authz.reclaim && ccDebug && shouldDebug()) {
          console.log("[creator-card/upsert] reclaim", {
            at: new Date().toISOString(),
            source: ccDebugSrc,
            userId: user.id,
            igUserId: igUserIdStr,
            existingId: afterId,
            ownerKind: "other",
            meOk,
            raced: true,
          })
        }

        if (authz.reclaim) {
          const reclaim = await reclaimViaRpc(afterId, ccDebugSrc ?? null)
          if (!reclaim.ok) {
            const msg = typeof (reclaim as any)?.error?.message === "string" ? String((reclaim as any).error.message) : ""
            return jsonWithRequestId(
              { ok: false, error: "upsert_failed", message: msg === "reclaim_no_row" ? "reclaim_no_row" : "reclaim_failed" },
              { status: 500 },
              requestId,
            )
          }
        }

        const res = await updateById(afterId, { reclaim: false })
        data = (res as any).data
        error = (res as any).error
      } else {
        error = (insertRes as any).error
      }
    }

    if (error) {
      const durationMs = Date.now() - t0
      const res = withRequestId(toSupabaseErrorResponse(error, "upsert"), requestId)
      try {
        res.headers.set("Server-Timing", `creator_card_upsert;dur=${durationMs}, ig_me_resolve;dur=${tMeMs}`)
      } catch {
        // best-effort
      }
      return res
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

    const durationMs = Date.now() - t0

    return jsonWithRequestId(
      {
        ok: true,
        card: data ? { ...data, featuredItems } : { featuredItems },
        completionPct,
      },
      { status: 200, headers: { "Server-Timing": `creator_card_upsert;dur=${durationMs}, ig_me_resolve;dur=${tMeMs}` } },
      requestId,
    )
  } catch (e: unknown) {
    const errObj = asRecord(e)
    const msg = typeof errObj?.message === "string" ? errObj.message : "unknown"
    console.error("[creator-card/upsert] unexpected error", { requestId, message: msg })
    if (msg.includes("Invalid API key")) {
      return jsonWithRequestId({ ok: false, error: "supabase_invalid_key" }, { status: 500 }, requestId)
    }
    return jsonWithRequestId(
      { ok: false, error: "unexpected_error", message: msg.slice(0, 400) },
      { status: 500 },
      requestId,
    )
  }
}
