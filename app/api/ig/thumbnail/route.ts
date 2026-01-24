import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Whitelist of allowed Instagram/Facebook CDN hostnames (image CDNs only)
const ALLOWED_HOSTNAMES = [
  "cdninstagram.com",
  "fbcdn.net",
]

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    
    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      return false
    }
    
    // Check if hostname matches any allowed pattern
    const hostname = parsed.hostname.toLowerCase()
    return ALLOWED_HOSTNAMES.some(allowed => 
      hostname === allowed || hostname.endsWith(`.${allowed}`)
    )
  } catch {
    return false
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
    
    try {
      const imageResponse = await fetch(thumbnailUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; InstagramThumbnailProxy/1.0)",
          "Referer": "https://www.instagram.com/",
        },
        cache: "no-store",
        signal: abortController.signal,
      })
      
      clearTimeout(timeoutId)
      
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
