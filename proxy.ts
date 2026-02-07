import { NextRequest, NextResponse } from "next/server"

const SUPPORTED = ["zh-TW", "en"] as const
type SupportedLocale = (typeof SUPPORTED)[number]

function isSupportedLocale(v: string): v is SupportedLocale {
  return (SUPPORTED as readonly string[]).includes(v)
}

function shouldSkip(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.[a-z0-9]+$/i.test(pathname)
  )
}

function getRequestId(req: NextRequest) {
  const existing = req.headers.get("x-request-id")
  return existing && existing.trim() ? existing.trim() : crypto.randomUUID()
}

function ensureRequestIdHeader(res: NextResponse, requestId: string) {
  res.headers.set("x-request-id", requestId)
  return res
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
  const requestId = getRequestId(req)
  if (shouldSkip(pathname)) {
    const base = NextResponse.next()
    return ensureRequestIdHeader(base, requestId)
  }

  // Do not redirect /api; just pass through while still attaching request id.
  if (pathname.startsWith("/api")) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set("x-request-id", requestId)

    const base0 = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
    return ensureRequestIdHeader(base0, requestId)
  }

  if (pathname === "/") {
    const locale = detectLocale(req)
    const url = req.nextUrl.clone()
    url.pathname = `/${locale}`
    const res0 = NextResponse.redirect(url)
    const res = ensureRequestIdHeader(res0, requestId)
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
    requestHeaders.set("x-request-id", requestId)
    
    const res0 = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
    const res = ensureRequestIdHeader(res0, requestId)
    
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
  const res0 = NextResponse.redirect(url)
  const res = ensureRequestIdHeader(res0, requestId)
  res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  res.cookies.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  return res
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)"],
}
