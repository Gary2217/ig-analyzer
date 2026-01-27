import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

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
    
    // Validate URL is from allowed Instagram/FB CDN
    if (!isAllowedImageUrl(thumbnailUrl)) {
      return NextResponse.json(
        { error: "URL not from allowed Instagram CDN" },
        { status: 403 }
      )
    }
    
    // Fetch the image from Instagram CDN with timeout
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 8000)
    
    const initialUrlObj = new URL(thumbnailUrl)
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[ig-thumb] start", { 
        inputUrlHost: initialUrlObj.hostname, 
        inputUrlPath: initialUrlObj.pathname 
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
        return NextResponse.json(
          { error: "Invalid final response URL" },
          { 
            status: 502,
            headers: {
              "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            },
          }
        )
      }
      
      // Final URL must be from CDN domains (not arbitrary instagram.com pages)
      if (!isCDNHostname(finalHostname)) {
        console.error(`Final URL not from allowed CDN: ${finalHostname}`)
        
        const errorPayload: Record<string, unknown> = {
          error: "Final redirect URL not from allowed CDN",
        }
        
        // Add DEV-only diagnostics
        if (process.env.NODE_ENV !== "production") {
          errorPayload.initialHostname = initialUrlObj.hostname
          errorPayload.finalHostname = finalHostname
          errorPayload.finalUrl = finalUrl
          errorPayload.allowedList = ALLOWED_CDN_HOSTNAMES
        }
        
        return NextResponse.json(
          errorPayload,
          { 
            status: 502,
            headers: {
              "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            },
          }
        )
      }
      
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[ig-thumb] final", { 
          finalHostname,
          status: imageResponse.status,
          contentType: imageResponse.headers.get("content-type") 
        })
      }
      
      if (!imageResponse.ok) {
        console.error(`Failed to fetch thumbnail: ${imageResponse.status} ${imageResponse.statusText}`)
        return NextResponse.json(
          { error: "Failed to fetch thumbnail from Instagram" },
          { 
            status: 502,
            headers: {
              "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            },
          }
        )
      }
      
      // Validate Content-Type is an image
      const contentType = imageResponse.headers.get("content-type") || ""
      if (!contentType.startsWith("image/")) {
        console.error(`Invalid content type: ${contentType}`)
        return NextResponse.json(
          { error: "Resource is not an image" },
          { 
            status: 502,
            headers: {
              "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
            },
          }
        )
      }
      
      // Stream the image bytes
      const imageBuffer = await imageResponse.arrayBuffer()
      
      return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      let errorMsg = "Failed to fetch thumbnail"
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        errorMsg = "Request timeout"
      }
      
      console.error(`Thumbnail fetch error: ${errorMsg}`, fetchError)
      return NextResponse.json(
        { error: errorMsg },
        { 
          status: 502,
          headers: {
            "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          },
        }
      )
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
