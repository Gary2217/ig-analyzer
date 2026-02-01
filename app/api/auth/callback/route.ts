import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalizeOrigin(v: string) {
  return v.replace(/\/$/, "")
}

function getRequestOrigin(req: NextRequest) {
  const canonicalRaw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "").trim()
  if (process.env.NODE_ENV === "production" && canonicalRaw) {
    return normalizeOrigin(canonicalRaw)
  }
  const xfProto = req.headers.get("x-forwarded-proto")?.toLowerCase()
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host
  const isLocalhost = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host)
  const proto = !isLocalhost && xfProto === "https" ? "https" : "http"
  return `${proto}://${host}`
}

function getSupabaseEnv() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const supabaseAnonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim()
  return { supabaseUrl, supabaseAnonKey }
}

function normalizeNextPath(raw: string) {
  const v = (raw ?? "").trim()
  if (!v) return "/"
  if (!v.startsWith("/")) return "/"
  if (v.startsWith("//")) return "/"
  if (v.toLowerCase().includes("http")) return "/"
  return v
}

type CookieToSet = { name: string; value: string; options: any }

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req)
  const url = new URL(req.url)

  const nextPath = normalizeNextPath(url.searchParams.get("next") || "/")
  const redirectTo = new URL(nextPath, origin)

  const code = url.searchParams.get("code")
  if (!code) {
    const res = NextResponse.redirect(redirectTo)
    res.headers.set("Cache-Control", "no-store")
    return res
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, code: "missing_supabase_env" }, { status: 500 })
  }

  const cookiesToSet: CookieToSet[] = []
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(nextCookies) {
        cookiesToSet.push(...(nextCookies as any))
      },
    },
  })

  await supabase.auth.exchangeCodeForSession(code)

  const res = NextResponse.redirect(redirectTo)
  res.headers.set("Cache-Control", "no-store")

  cookiesToSet.forEach(({ name, value, options }) => {
    res.cookies.set(name, value, options)
  })

  return res
}
