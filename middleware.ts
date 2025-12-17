import { NextRequest, NextResponse } from "next/server"

const SUPPORTED = ["zh-TW", "en", "ja"] as const
type SupportedLocale = (typeof SUPPORTED)[number]

function isSupportedLocale(v: string): v is SupportedLocale {
  return (SUPPORTED as readonly string[]).includes(v)
}

function shouldSkip(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  )
}

function detectLocale(req: NextRequest): SupportedLocale {
  // 1) cookie
  const cookieLocale = req.cookies.get("locale")?.value
  if (cookieLocale && isSupportedLocale(cookieLocale)) return cookieLocale

  // 2) geo header (若平台有提供)
  const country =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    ""
  if (["TW", "HK", "MO"].includes(country)) return "zh-TW"
  if (country === "JP") return "ja"

  // 3) accept-language
  const al = (req.headers.get("accept-language") || "").toLowerCase()
  if (al.includes("zh-hant") || al.includes("zh-tw") || al.includes("zh-hk")) return "zh-TW"
  if (al.includes("ja")) return "ja"

  // 4) fallback（你的主市場）
  return "zh-TW"
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (shouldSkip(pathname)) return NextResponse.next()

  // 已經有 locale prefix → 直接放行（避免 /zh-TW/zh-TW/...）
  const firstSeg = pathname.split("/").filter(Boolean)[0] || ""
  if (isSupportedLocale(firstSeg)) {
    const res = NextResponse.next()
    // 同步 cookie（讓使用者手動切換後可被記住）
    const existing = req.cookies.get("locale")?.value
    if (existing !== firstSeg) {
      res.cookies.set("locale", firstSeg, { path: "/", maxAge: 60 * 60 * 24 * 365 })
    }
    return res
  }

  // 沒有 locale prefix → 導向 /{locale}{pathname}
  const locale = detectLocale(req)
  const url = req.nextUrl.clone()
  url.pathname = `/${locale}${pathname}`
  url.search = search
  const res = NextResponse.redirect(url)
  res.cookies.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 })
  return res
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)"],
}
