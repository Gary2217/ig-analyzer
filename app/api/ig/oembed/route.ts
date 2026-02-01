import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const OEMBED_CACHE_TTL_MS = 12 * 60 * 60 * 1000

type CacheEntry = {
  value: OEmbedSuccessResponse
  expiresAtMs: number
}

const oembedCache = new Map<string, CacheEntry>()

type OEmbedSuccessResponse = {
  ok: true
  thumbnailUrl: string
  mediaType: "image" | "video" | "reel" | "unknown"
  title?: string
  html?: string
  authorName?: string
  providerName?: string
  mediaId?: string
  source: "oembed" | "og"
  data: {
    thumbnail_url: string
    thumbnail_width: number
    thumbnail_height: number
    author_name: string
    provider_name: string
    type?: string
    html?: string
    media_id?: string
  }
}

type OEmbedErrorResponse = {
  ok: false
  error: {
    status: number
    message: string
  }
}

type OEmbedResponse = OEmbedSuccessResponse | OEmbedErrorResponse

function isHtmlishBody(body: string): boolean {
  const s = body.trim().slice(0, 500).toLowerCase()
  return s.includes("<html") || s.includes("<!doctype") || s.includes("<head")
}

function extractMediaIdFromInstagramUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    const kind = parts[0]
    const code = parts[1]
    if (!code) return null
    if (kind !== "p" && kind !== "reel" && kind !== "tv") return null
    return code
  } catch {
    return null
  }
}

// Helper function to detect media type from URL and oEmbed data
function detectMediaType(url: string, oembedType?: string): "image" | "video" | "reel" | "unknown" {
  // Check URL path for /reel/
  if (url.includes("/reel/")) {
    return "reel"
  }
  
  // Check oEmbed type field
  if (oembedType === "video") {
    return "video"
  }
  
  // Default to image for /p/ posts
  if (url.includes("/p/")) {
    return "image"
  }
  
  return "unknown"
}

// Helper function to scrape og:image from Instagram post HTML
async function scrapeOgImage(url: string): Promise<{ thumbnailUrl: string; title?: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch Instagram page: ${response.status}`)
      return null
    }

    const html = await response.text()

    // Extract og:image
    const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/)
    const thumbnailUrl = ogImageMatch?.[1]

    // Extract og:title
    const ogTitleMatch = html.match(/property="og:title"\s+content="([^"]+)"/)
    const title = ogTitleMatch?.[1]

    if (!thumbnailUrl) {
      console.error("No og:image found in Instagram page HTML")
      return null
    }

    return { thumbnailUrl, title }
  } catch (error) {
    console.error("Failed to scrape og:image:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  // Validate URL parameter
  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          status: 400,
          message: "Missing 'url' query parameter",
        },
      } as OEmbedErrorResponse,
      { status: 400 }
    )
  }

  // Validate Instagram URL format
  const instagramUrlPattern = /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?(\?.*)?$/
  if (!instagramUrlPattern.test(url)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          status: 400,
          message: "Invalid Instagram URL format. Must be a post, reel, or TV URL.",
        },
      } as OEmbedErrorResponse,
      { status: 400 }
    )
  }

  const cacheKey = url.trim().replace(/\/$/, "")
  const now = Date.now()
  const cached = oembedCache.get(cacheKey)
  const hasFreshCache = Boolean(cached && cached.expiresAtMs > now)
  if (hasFreshCache && cached) {
    return NextResponse.json(cached.value, {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        "X-IG-OEMBED-CACHE": "hit",
      },
    })
  }

  try {
    // Fetch from Instagram oEmbed API server-side with timeout
    const oembedUrl = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
    
    const response = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; InstagramOEmbedBot/1.0)",
      },
    })
    
    clearTimeout(timeoutId)

    // Check content-type before attempting JSON parse
    const contentType = response.headers.get("content-type") || ""
    const isJson = contentType.includes("application/json")

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error(`Instagram oEmbed API error: ${response.status} - ${errorText}`)
      }
      
      // Try og:image fallback
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("Attempting og:image fallback...")
      }
      const ogData = await scrapeOgImage(url)
      if (ogData) {
        const fallbackMediaId = extractMediaIdFromInstagramUrl(url)
        const successResponse: OEmbedSuccessResponse = {
          ok: true,
          thumbnailUrl: ogData.thumbnailUrl,
          mediaType: detectMediaType(url),
          title: ogData.title,
          html: undefined,
          authorName: ogData.title,
          providerName: "Instagram",
          mediaId: fallbackMediaId ?? undefined,
          source: "og",
          data: {
            thumbnail_url: ogData.thumbnailUrl,
            thumbnail_width: 640,
            thumbnail_height: 640,
            author_name: ogData.title || "",
            provider_name: "Instagram",
            html: undefined,
            media_id: fallbackMediaId ?? undefined,
          },
        }

        oembedCache.set(cacheKey, { value: successResponse, expiresAtMs: now + OEMBED_CACHE_TTL_MS })
        return NextResponse.json(successResponse, {
          headers: {
            "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
            "X-IG-OEMBED-CACHE": "miss",
          },
        })
      }

      // stale-if-error: if we have any cached success (even expired), serve it on 429/5xx
      if (cached && (response.status === 429 || response.status >= 500)) {
        return NextResponse.json(cached.value, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-CACHE": "stale",
            "X-IG-OEMBED-UPSTREAM-STATUS": String(response.status),
          },
        })
      }
      
      // Determine user-friendly message based on status
      let userMessage = "The post may be private or unavailable."
      if (response.status === 401 || response.status === 403) {
        userMessage = "This post is private or restricted."
      } else if (response.status === 429) {
        userMessage = "Rate limit exceeded. Please try again later."
      } else if (response.status === 404) {
        userMessage = "Post not found. It may have been deleted."
      }
      
      return NextResponse.json(
        {
          ok: false,
          error: {
            status: response.status,
            message: userMessage,
          },
        } as OEmbedErrorResponse,
        {
          status: response.status,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          },
        }
      )
    }

    // If response is not JSON (e.g., HTML/login wall), try og:image fallback first;
    // if that fails, treat as rate-limited so the client can stop further requests.
    if (!isJson) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("Instagram oEmbed returned non-JSON response (likely HTML), attempting og:image fallback...")
      }
      const ogData = await scrapeOgImage(url)
      if (ogData) {
        const fallbackMediaId = extractMediaIdFromInstagramUrl(url)
        const successResponse: OEmbedSuccessResponse = {
          ok: true,
          thumbnailUrl: ogData.thumbnailUrl,
          mediaType: detectMediaType(url),
          title: ogData.title,
          html: undefined,
          authorName: ogData.title,
          providerName: "Instagram",
          mediaId: fallbackMediaId ?? undefined,
          source: "og",
          data: {
            thumbnail_url: ogData.thumbnailUrl,
            thumbnail_width: 640,
            thumbnail_height: 640,
            author_name: ogData.title || "",
            provider_name: "Instagram",
            html: undefined,
            media_id: fallbackMediaId ?? undefined,
          },
        }

        oembedCache.set(cacheKey, { value: successResponse, expiresAtMs: now + OEMBED_CACHE_TTL_MS })
        return NextResponse.json(successResponse, {
          headers: {
            "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
            "X-IG-OEMBED-CACHE": "miss",
          },
        })
      }

      // stale-if-error: if we have any cached success (even expired), serve it on 5xx
      if (cached) {
        return NextResponse.json(cached.value, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-CACHE": "stale",
            "X-IG-OEMBED-UPSTREAM-STATUS": "non_json",
          },
        })
      }

      return NextResponse.json(
        {
          ok: false,
          error: {
            status: 429,
            message: "Rate limit exceeded. Please try again later.",
          },
        } as OEmbedErrorResponse,
        {
          status: 429,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-UPSTREAM-STATUS": "non_json",
          },
        }
      )
    }

    const bodyText = await response.text()
    if (isHtmlishBody(bodyText)) {
      // stale-if-error: if we have any cached success (even expired), serve it on upstream blocks
      if (cached) {
        return NextResponse.json(cached.value, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-CACHE": "stale",
            "X-IG-OEMBED-UPSTREAM-STATUS": "html_body",
          },
        })
      }

      return NextResponse.json(
        {
          ok: false,
          error: {
            status: 429,
            message: "Rate limit exceeded. Please try again later.",
          },
        } as OEmbedErrorResponse,
        {
          status: 429,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-UPSTREAM-STATUS": "html_body",
          },
        }
      )
    }

    let data: any = null
    try {
      data = JSON.parse(bodyText)
    } catch {
      if (cached) {
        return NextResponse.json(cached.value, {
          status: 200,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-CACHE": "stale",
            "X-IG-OEMBED-UPSTREAM-STATUS": "json_parse_failed",
          },
        })
      }

      return NextResponse.json(
        {
          ok: false,
          error: {
            status: 429,
            message: "Rate limit exceeded. Please try again later.",
          },
        } as OEmbedErrorResponse,
        {
          status: 429,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            "X-IG-OEMBED-UPSTREAM-STATUS": "json_parse_failed",
          },
        }
      )
    }

    // Validate response data
    if (!data.thumbnail_url) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            status: 500,
            message: "Instagram API response missing thumbnail_url",
          },
        } as OEmbedErrorResponse,
        { status: 500 }
      )
    }

    // Return normalized response
    // Use URL shortcode as stable mediaId for deduplication (upstream media_id can be an internal numeric id)
    const mediaId = extractMediaIdFromInstagramUrl(url)

    const successResponse: OEmbedSuccessResponse = {
      ok: true,
      thumbnailUrl: data.thumbnail_url,
      mediaType: detectMediaType(url, data.type),
      title: data.author_name,
      html: typeof data.html === "string" ? data.html : undefined,
      authorName: typeof data.author_name === "string" ? data.author_name : undefined,
      providerName: typeof data.provider_name === "string" ? data.provider_name : "Instagram",
      mediaId: mediaId ?? undefined,
      source: "oembed",
      data: {
        thumbnail_url: data.thumbnail_url,
        thumbnail_width: data.thumbnail_width || 640,
        thumbnail_height: data.thumbnail_height || 640,
        author_name: data.author_name || "",
        provider_name: data.provider_name || "Instagram",
        type: data.type,
        html: typeof data.html === "string" ? data.html : undefined,
        media_id: typeof (data as any)?.media_id === "string" ? String((data as any).media_id) : (mediaId ?? undefined),
      },
    }

    oembedCache.set(cacheKey, { value: successResponse, expiresAtMs: now + OEMBED_CACHE_TTL_MS })

    return NextResponse.json(successResponse, {
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
        "X-IG-OEMBED-CACHE": "miss",
      },
    })
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("Failed to fetch Instagram oEmbed:", error)
    }
    
    // Handle timeout/abort errors
    const isTimeout = error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted"))
    const userMessage = isTimeout 
      ? "Request timed out. The post may be slow to load."
      : error instanceof Error ? error.message : "Failed to fetch Instagram data"

    if (cached) {
      return NextResponse.json(cached.value, {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          "X-IG-OEMBED-CACHE": "stale",
          "X-IG-OEMBED-UPSTREAM-STATUS": isTimeout ? "timeout" : "error",
        },
      })
    }
    
    return NextResponse.json(
      {
        ok: false,
        error: {
          status: isTimeout ? 504 : 500,
          message: userMessage,
        },
      } as OEmbedErrorResponse,
      { 
        status: isTimeout ? 504 : 500,
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
        },
      }
    )
  }
}
