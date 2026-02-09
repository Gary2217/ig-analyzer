import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const __thumbInflight = new Map<string, Promise<Response>>()

const __thumbDebugLogSet = new Set<string>()
const __THUMB_DEBUG_LOG_MAX = 50

// Whitelist of allowed CDN hostnames (for final redirect validation)
// Includes all Instagram/Facebook CDN patterns commonly used in production
const ALLOWED_CDN_HOSTNAMES = [
  "cdninstagram.com",
  "igcdn.com",
  "fbcdn.net",
  "fna.fbcdn.net",
  "fbsbx.com",
  "akamaihd.net",
]

function isPrivateOrLocalHostname(hostnameRaw: string): boolean {
  const h = String(hostnameRaw || "").toLowerCase().replace(/\.$/, "")
  if (!h) return true
  if (h === "localhost" || h.endsWith(".localhost")) return true
  if (h === "0.0.0.0") return true
  if (h === "::1") return true

  // Block obvious private IPv4 ranges.
  // Note: we intentionally do NOT do DNS resolution here.
  const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)
  if (!ipv4) return false

  const parts = h.split(".").map((x) => Number(x))
  if (parts.length !== 4) return true
  if (parts.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return true

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

// Regex for Instagram media path: /(p|reel|tv)/{shortcode}/media/
const INSTAGRAM_MEDIA_PATH_REGEX = /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/media\/$/

function stripUrlQueryAndHash(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    u.search = ""
    u.hash = ""
    return u.toString()
  } catch {
    return ""
  }
}

function isInstagramHostname(hostnameRaw: string): boolean {
  const h = String(hostnameRaw || "").toLowerCase().replace(/\.$/, "")
  return h === "instagram.com" || h.endsWith(".instagram.com") || h === "instagr.am"
}

function logThumbDebugOnce(enabled: boolean, key: string, payload: Record<string, unknown>) {
  if (!enabled) return
  if (__thumbDebugLogSet.size >= __THUMB_DEBUG_LOG_MAX) return
  if (__thumbDebugLogSet.has(key)) return
  __thumbDebugLogSet.add(key)
  // eslint-disable-next-line no-console
  console.debug("[ig-thumb:debug]", payload)
}

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    
    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      return false
    }
    
    const hostname = parsed.hostname.toLowerCase()

    if (isPrivateOrLocalHostname(hostname)) return false
    
    // Allow CDN domains (cdninstagram.com, fbcdn.net and subdomains)
    const isCDN = ALLOWED_CDN_HOSTNAMES.some(allowed => 
      hostname === allowed || hostname.endsWith(`.${allowed}`)
    )
    
    if (isCDN) {
      return true
    }
    
    // Allow instagram.com domain variants ONLY for /media/ paths
    if (isInstagramHostname(hostname)) {
      const pathname = parsed.pathname
      return INSTAGRAM_MEDIA_PATH_REGEX.test(pathname)
    }
    
    return false
  } catch {
    return false
  }
}

function isCDNHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, "") // strip trailing dot
  if (isPrivateOrLocalHostname(lower)) return false
  return ALLOWED_CDN_HOSTNAMES.some(allowed => 
    lower === allowed || lower.endsWith(`.${allowed}`)
  )
}

function withDevThumbCacheHeader(resp: Response, value: "miss" | "inflight") {
  if (process.env.NODE_ENV === "production") return resp
  try {
    const h = new Headers(resp.headers)
    h.set("X-IG-THUMB-CACHE", value)
    return new NextResponse(resp.body, { status: resp.status, headers: h })
  } catch {
    return resp
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const thumbnailUrl = searchParams.get("url")
    const debugThumbEnabled = searchParams.get("debugThumb") === "1"
    
    if (!thumbnailUrl) {
      return NextResponse.json(
        { error: "Missing url parameter" },
        { status: 400 }
      )
    }

    let initialUrlObj: URL
    try {
      initialUrlObj = new URL(thumbnailUrl)
    } catch {
      return NextResponse.json(
        { error: "Invalid url parameter" },
        { status: 400 }
      )
    }
    
    // Validate URL is from allowed Instagram/FB CDN
    if (!isAllowedImageUrl(thumbnailUrl)) {
      logThumbDebugOnce(debugThumbEnabled, `blocked:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}`, {
        kind: "blocked",
        inputUrlHost: initialUrlObj.hostname,
        inputUrlPath: initialUrlObj.pathname,
      })
      const errorPayload: Record<string, unknown> = {
        error: "URL not from allowed Instagram CDN",
      }
      const headers: Record<string, string> = {}
      if (process.env.NODE_ENV !== "production") {
        errorPayload.errorReason = "not_https_or_hostname_blocked"
        errorPayload.initialHostname = initialUrlObj.hostname
        headers["X-IG-THUMB-DEBUG"] = JSON.stringify({
          errorReason: "not_https_or_hostname_blocked",
          initialHostname: initialUrlObj.hostname,
        })
      }
      return NextResponse.json(errorPayload, { status: 403, headers })
    }

    const normalizedUrlKey = initialUrlObj.toString()
    const existing = __thumbInflight.get(normalizedUrlKey)
    if (existing) {
      const shared = await existing
      const cloned = shared.clone()
      // Do NOT modify error JSON responses (keep identical).
      if (cloned.status === 200) return withDevThumbCacheHeader(cloned, "inflight")
      return cloned
    }
    
    // Fetch the image from Instagram CDN with timeout
    const run = (async () => {
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), 8000)
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[ig-thumb] start", {
          inputUrlHost: initialUrlObj.hostname,
          inputUrlPath: initialUrlObj.pathname,
        })
      }

      try {
        const imageResponse = await fetch(thumbnailUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.instagram.com/",
            "Origin": "https://www.instagram.com",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
          },
          cache: "no-store",
          signal: abortController.signal,
        })

        clearTimeout(timeoutId)

        // Verify final response URL (after redirects)
        const finalUrl = imageResponse.url
        let finalHostname = ""
        let finalPathname = ""
        try {
          const finalParsed = new URL(finalUrl)
          finalHostname = finalParsed.hostname.toLowerCase()
          finalPathname = finalParsed.pathname || ""
        } catch {
          console.error("Failed to parse final response URL")
          const errorPayload: Record<string, unknown> = {
            error: "Invalid final response URL",
          }
          const headers: Record<string, string> = {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          }
          if (process.env.NODE_ENV !== "production") {
            errorPayload.errorReason = "invalid_final_url"
            errorPayload.initialHostname = initialUrlObj.hostname
            headers["X-IG-THUMB-DEBUG"] = JSON.stringify({
              errorReason: "invalid_final_url",
              initialHostname: initialUrlObj.hostname,
            })
          }
          return NextResponse.json(
            errorPayload,
            {
              status: 502,
              headers,
            },
          )
        }

        const contentType = imageResponse.headers.get("content-type") || ""
        const isFinalInstagramMediaImage =
          isInstagramHostname(finalHostname) &&
          INSTAGRAM_MEDIA_PATH_REGEX.test(finalPathname) &&
          contentType.startsWith("image/")

        // Final URL must be from CDN domains (not arbitrary instagram.com pages)
        if (!isCDNHostname(finalHostname) && !isFinalInstagramMediaImage) {
          console.error(`Final URL not from allowed CDN: ${finalHostname}`)

          logThumbDebugOnce(
            debugThumbEnabled,
            `final_host_blocked:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${finalHostname}`,
            {
              kind: "final_hostname_blocked",
              inputUrlHost: initialUrlObj.hostname,
              inputUrlPath: initialUrlObj.pathname,
              finalHostname,
              finalUrl: stripUrlQueryAndHash(finalUrl) || null,
              upstreamStatus: imageResponse.status,
              upstreamContentType: contentType,
            }
          )

          const errorPayload: Record<string, unknown> = {
            error: "Final redirect URL not from allowed CDN",
          }

          const headers: Record<string, string> = {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          }

          // Add DEV-only diagnostics
          if (process.env.NODE_ENV !== "production") {
            errorPayload.errorReason = "final_hostname_blocked"
            errorPayload.initialHostname = initialUrlObj.hostname
            errorPayload.finalHostname = finalHostname
            errorPayload.finalUrl = finalUrl
            errorPayload.allowedList = ALLOWED_CDN_HOSTNAMES
            headers["X-IG-THUMB-DEBUG"] = JSON.stringify({
              errorReason: "final_hostname_blocked",
              initialHostname: initialUrlObj.hostname,
              finalHostname: finalHostname,
            })
          }

          return NextResponse.json(
            errorPayload,
            {
              status: 502,
              headers,
            },
          )
        }

        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.debug("[ig-thumb] final", {
            finalHostname,
            status: imageResponse.status,
            contentType,
          })
        }

        if (!imageResponse.ok) {
          console.error(`Failed to fetch thumbnail: ${imageResponse.status} ${imageResponse.statusText}`)

          logThumbDebugOnce(
            debugThumbEnabled,
            `upstream_error:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${imageResponse.status}`,
            {
              kind: "upstream_error",
              inputUrlHost: initialUrlObj.hostname,
              inputUrlPath: initialUrlObj.pathname,
              finalHostname,
              finalUrl: stripUrlQueryAndHash(finalUrl) || null,
              upstreamStatus: imageResponse.status,
              upstreamContentType: contentType,
            }
          )

          const errorPayload: Record<string, unknown> = {
            error: "Failed to fetch thumbnail from Instagram",
          }
          const headers: Record<string, string> = {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          }
          if (process.env.NODE_ENV !== "production") {
            errorPayload.errorReason = "upstream_error"
            errorPayload.finalStatus = imageResponse.status
            errorPayload.finalHostname = finalHostname
            headers["X-IG-THUMB-DEBUG"] = JSON.stringify({
              errorReason: "upstream_error",
              initialHostname: initialUrlObj.hostname,
              finalHostname: finalHostname,
            })
          }
          return NextResponse.json(
            errorPayload,
            {
              status: 502,
              headers,
            },
          )
        }

        // Validate Content-Type is an image
        if (!contentType.startsWith("image/")) {
          console.error(`Invalid content type: ${contentType}`)

          logThumbDebugOnce(
            debugThumbEnabled,
            `non_image:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${contentType.slice(0, 64)}`,
            {
              kind: "non_image",
              inputUrlHost: initialUrlObj.hostname,
              inputUrlPath: initialUrlObj.pathname,
              finalHostname,
              finalUrl: stripUrlQueryAndHash(finalUrl) || null,
              upstreamStatus: imageResponse.status,
              upstreamContentType: contentType,
            }
          )

          const errorPayload: Record<string, unknown> = {
            error: "Resource is not an image",
            code: "NON_IMAGE_UPSTREAM",
          }
          const headers: Record<string, string> = {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          }
          if (process.env.NODE_ENV !== "production") {
            errorPayload.errorReason = "non_image_content_type"
            errorPayload.finalContentType = contentType
            errorPayload.finalHostname = finalHostname
            headers["X-IG-THUMB-DEBUG"] = JSON.stringify({
              errorReason: "non_image_content_type",
              initialHostname: initialUrlObj.hostname,
              finalHostname: finalHostname,
              finalContentType: contentType,
            })
          }
          return NextResponse.json(
            errorPayload,
            {
              status: 415,
              headers,
            },
          )
        }

        // Stream the image bytes
        const imageBuffer = await imageResponse.arrayBuffer()

        const headers: Record<string, string> = {
          "Content-Type": contentType,
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        }
        const contentLength = imageResponse.headers.get("content-length")
        if (contentLength) headers["Content-Length"] = contentLength

        return new NextResponse(imageBuffer, {
          status: 200,
          headers,
        })
      } catch (fetchError) {
        clearTimeout(timeoutId)

        let errorMsg = "Failed to fetch thumbnail"
        let errorReason = "upstream_error"
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          errorMsg = "Request timeout"
          errorReason = "timeout"
        }

        console.error(`Thumbnail fetch error: ${errorMsg}`, fetchError)

        logThumbDebugOnce(
          debugThumbEnabled,
          `fetch_error:${String(initialUrlObj.hostname)}:${String(initialUrlObj.pathname)}:${errorReason}`,
          {
            kind: "fetch_error",
            inputUrlHost: initialUrlObj.hostname,
            inputUrlPath: initialUrlObj.pathname,
            errorReason,
          }
        )
        const errorPayload: Record<string, unknown> = {
          error: errorMsg,
        }
        const headers: Record<string, string> = {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
        }
        if (process.env.NODE_ENV !== "production") {
          errorPayload.errorReason = errorReason
          errorPayload.initialHostname = initialUrlObj.hostname
          headers["X-IG-THUMB-DEBUG"] = JSON.stringify({
            errorReason: errorReason,
            initialHostname: initialUrlObj.hostname,
          })
        }
        return NextResponse.json(
          errorPayload,
          {
            status: 502,
            headers,
          },
        )
      }
    })()

    __thumbInflight.set(normalizedUrlKey, run)
    try {
      const resp = await run
      if (resp.status === 200) return withDevThumbCacheHeader(resp, "miss")
      return resp
    } finally {
      __thumbInflight.delete(normalizedUrlKey)
    }
  } catch (error) {
    console.error("Thumbnail proxy error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { 
        status: 500,
        headers: {
          "Cache-Control": "no-cache",
        },
      }
    )
  }
}
