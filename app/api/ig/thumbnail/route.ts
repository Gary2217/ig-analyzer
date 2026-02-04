import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const __thumbInflight = new Map<string, Promise<Response>>()

// Whitelist of allowed CDN hostnames (for final redirect validation)
// Includes all Instagram/Facebook CDN patterns commonly used in production
const ALLOWED_CDN_HOSTNAMES = [
  "cdninstagram.com",
  "fbcdn.net",
  "fna.fbcdn.net",
  "fbsbx.com",
  "akamaihd.net",
]

// Regex for Instagram media path: /(p|reel|tv)/{shortcode}/media/
const INSTAGRAM_MEDIA_PATH_REGEX = /^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/media\/$/

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    
    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      return false
    }
    
    const hostname = parsed.hostname.toLowerCase()
    
    // Allow CDN domains (cdninstagram.com, fbcdn.net and subdomains)
    const isCDN = ALLOWED_CDN_HOSTNAMES.some(allowed => 
      hostname === allowed || hostname.endsWith(`.${allowed}`)
    )
    
    if (isCDN) {
      return true
    }
    
    // Allow www.instagram.com ONLY for /media/ paths
    if (hostname === "www.instagram.com") {
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
    
    if (!thumbnailUrl) {
      return NextResponse.json(
        { error: "Missing url parameter" },
        { status: 400 }
      )
    }
    
    const initialUrlObj = new URL(thumbnailUrl)
    
    // Validate URL is from allowed Instagram/FB CDN
    if (!isAllowedImageUrl(thumbnailUrl)) {
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

        // Verify final response URL (after redirects) is from allowed CDN
        const finalUrl = imageResponse.url
        let finalHostname = ""
        try {
          const finalParsed = new URL(finalUrl)
          finalHostname = finalParsed.hostname.toLowerCase()
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

        // Final URL must be from CDN domains (not arbitrary instagram.com pages)
        if (!isCDNHostname(finalHostname)) {
          console.error(`Final URL not from allowed CDN: ${finalHostname}`)

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
            contentType: imageResponse.headers.get("content-type"),
          })
        }

        if (!imageResponse.ok) {
          console.error(`Failed to fetch thumbnail: ${imageResponse.status} ${imageResponse.statusText}`)
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
        const contentType = imageResponse.headers.get("content-type") || ""
        if (!contentType.startsWith("image/")) {
          console.error(`Invalid content type: ${contentType}`)
          const errorPayload: Record<string, unknown> = {
            error: "Resource is not an image",
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
              status: 502,
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
