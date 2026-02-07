import { NextRequest, NextResponse } from "next/server"

const SUPPORTED = ["zh-TW", "en"] as const
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
    pathname === "/sitemap.xml" ||
    /\.[a-z0-9]+$/i.test(pathname)
  )
}

function detectLocale(req: NextRequest): SupportedLocale {
  const cookieNext = req.cookies.get("NEXT_LOCALE")?.value
  if (cookieNext && isSupportedLocale(cookieNext)) return cookieNext

  const cookieLocale = req.cookies.get("locale")?.value
  if (cookieLocale && isSupportedLocale(cookieLocale)) return cookieLocale

  return "zh-TW"
}

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (shouldSkip(pathname)) return NextResponse.next()

  if (pathname === "/") {
    const locale = detectLocale(req)
    const url = req.nextUrl.clone()
    url.pathname = `/${locale}`
    const res = NextResponse.redirect(url)
    res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
    res.cookies.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
    return res
  }

  // 已經有 locale prefix → 直接放行（避免 /zh-TW/zh-TW/...）
  const firstSeg = pathname.split("/").filter(Boolean)[0] || ""
  if (firstSeg === "en" || firstSeg === "zh-TW") {
    // Set x-locale header for immediate locale detection in layout
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-locale', firstSeg)
    
    const res = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
    
    const currentNext = req.cookies.get("NEXT_LOCALE")?.value
    if (currentNext !== firstSeg) {
      res.cookies.set("NEXT_LOCALE", firstSeg, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
    }
    const currentLocale = req.cookies.get("locale")?.value
    if (currentLocale !== firstSeg) {
      res.cookies.set("locale", firstSeg, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
    }
    return res
  }

  // 沒有 locale prefix → 導向 /{locale}{pathname}
  const locale = detectLocale(req)
  const url = req.nextUrl.clone()
  url.pathname = `/${locale}${pathname}`
  url.search = search
  const res = NextResponse.redirect(url)
  res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  res.cookies.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  return res
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)"],
}
