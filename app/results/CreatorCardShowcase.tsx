"use client"

import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { useCreatorCardPreviewData } from "../components/creator-card/useCreatorCardPreviewData"
import { CreatorCardPreviewShell } from "../components/creator-card/CreatorCardPreviewShell"

interface CreatorCardShowcaseProps {
  locale: string
  username: string
  displayName: string
  isConnected: boolean
  isLoading: boolean
  hasCard: boolean
  isCardPublic: boolean
  cardId?: string
  topPosts?: any[]
  latestPosts?: any[]
  t: (key: string) => string
}

export function CreatorCardShowcase({
  locale,
  username,
  displayName,
  isConnected,
  isLoading,
  hasCard,
  isCardPublic,
  cardId,
  topPosts = [],
  latestPosts = [],
  t,
}: CreatorCardShowcaseProps) {
  const data = useCreatorCardPreviewData({ enabled: isConnected })

  const editCardUrl = `/${locale}/creator-card`
  const publicCardUrl = cardId ? `/${locale}/creator/${cardId}` : null

  // Helper: Proxy URL through /api/ig/thumbnail if needed (avoid double-proxy)
  const ensureProxiedThumbnail = (url: string): string => {
    if (!url) return ""
    // Already proxied - return as-is
    if (url.startsWith("/api/ig/thumbnail?url=")) return url
    // HTTP(S) URL - proxy it
    if (url.startsWith("http")) {
      return `/api/ig/thumbnail?url=${encodeURIComponent(url)}`
    }
    // Relative or empty - return as-is
    return url
  }

  // Helper: Extract manual featured items from all possible field variations
  const getManualFeaturedItems = (creatorCard: any): any[] => {
    if (!creatorCard) return []
    
    // Try all possible field names and nested structures
    const candidates = [
      creatorCard.featuredItems,
      creatorCard.featured_items,
      creatorCard.featuredItems?.items,
      creatorCard.featured_items?.items,
      creatorCard.portfolio,
      creatorCard.portfolio?.items,
    ]
    
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        // Normalize each item to ensure it passes CreatorCardPreview filters
        return candidate.map((item: any, idx: number) => {
          const rawThumbUrl = item?.thumbnailUrl || item?.thumbnail_url || item?.media_url || item?.mediaUrl || ""
          const proxiedUrl = ensureProxiedThumbnail(rawThumbUrl)
          
          return {
            ...item,
            id: item?.id || `manual-${idx}`,
            type: item?.type === "ig" ? "ig" : (item?.type || "ig"),
            isAdded: item?.isAdded === true ? true : (item?.type === "ig" || item?.url ? true : false),
            thumbnailUrl: proxiedUrl,
            thumbnail_url: proxiedUrl,
          }
        }).filter((item: any) => item.type === "ig" && item.isAdded === true)
      }
    }
    
    // Dev-only debug: log what we found
    if (process.env.NODE_ENV !== "production" && creatorCard) {
      console.debug("[CreatorCardShowcase] Manual featured items check:", {
        keys: Object.keys(creatorCard),
        featuredItems: Array.isArray(creatorCard.featuredItems) ? creatorCard.featuredItems.length : "not array",
        featured_items: Array.isArray(creatorCard.featured_items) ? creatorCard.featured_items.length : "not array",
        portfolio: Array.isArray(creatorCard.portfolio) ? creatorCard.portfolio.length : (creatorCard.portfolio?.items ? `nested: ${creatorCard.portfolio.items.length}` : "not array"),
      })
    }
    
    return []
  }

  // Auto-fill featured items from posts if creator card has no manual items
  const manualItems = data.creatorCard ? getManualFeaturedItems(data.creatorCard) : []
  const isAutoFilled = manualItems.length === 0 && ((topPosts?.length ?? 0) > 0 || (latestPosts?.length ?? 0) > 0)
  
  const autoFilledData = {
    ...data,
    creatorCard: data.creatorCard ? {
      ...data.creatorCard,
      featuredItems: (() => {
        if (manualItems.length > 0) {
          if (process.env.NODE_ENV !== "production") {
            console.debug("[CreatorCardShowcase] Using manual items:", manualItems.length)
          }
          return manualItems
        }
        
        // Auto-fill from top posts first, then latest posts
        const allPosts = [...(topPosts || []), ...(latestPosts || [])]
        if (process.env.NODE_ENV !== "production") {
          console.debug("[CreatorCardShowcase] Auto-filling from posts:", allPosts.length)
        }
        return allPosts.slice(0, 6).map((post: any, idx: number) => {
          const mediaType = post?.media_type || post?.mediaType || "IMAGE"
          const isVideo = mediaType === "VIDEO" || mediaType === "REELS"
          
          // Extract thumbnail and media URLs
          const rawThumbUrl = post?.thumbnail_url || post?.thumbnailUrl || ""
          const rawMediaUrl = post?.media_url || post?.mediaUrl || ""
          
          // For videos, prefer thumbnail_url; for images, prefer media_url
          // Never use .mp4 URLs for <img> tags
          const isLikelyVideo = (u: string) => /\.mp4(\?|$)/i.test(u)
          let chosenUrl = ""
          if (isVideo) {
            chosenUrl = rawThumbUrl || (isLikelyVideo(rawMediaUrl) ? "" : rawMediaUrl)
          } else {
            chosenUrl = (isLikelyVideo(rawMediaUrl) ? rawThumbUrl : rawMediaUrl) || rawThumbUrl
          }
          
          const proxiedUrl = ensureProxiedThumbnail(chosenUrl)
          
          return {
            id: post?.id || `auto-${idx}`,
            url: post?.permalink || "",
            thumbnailUrl: proxiedUrl,
            thumbnail_url: proxiedUrl, // Field compatibility for snake_case consumers
            media_url: proxiedUrl, // Some renderers may check this
            type: "ig",
            isAdded: true, // Required for sortableIg filter in CreatorCardPreview
            mediaType: mediaType,
          }
        })
      })(),
    } : null,
  }

  return (
    <section id="creator-card" className="scroll-mt-24 sm:scroll-mt-28 max-w-6xl mx-auto px-4 md:px-6 mt-6">
      <Card className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
        <CardHeader className="border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-xl font-bold text-white min-w-0 truncate">
                {t("creatorCard.page.title")}
              </CardTitle>
              <p className="mt-0.5 text-[11px] sm:text-sm text-slate-400 leading-snug min-w-0 truncate">
                {t("creatorCard.page.subtitle")}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          <CreatorCardPreviewShell
            locale={locale}
            t={t}
            showHeaderButtons={true}
            editHref={editCardUrl}
            publicHref={publicCardUrl}
            isConnected={isConnected}
            data={autoFilledData}
            username={username}
            displayName={displayName}
            isAutoFilled={isAutoFilled}
          />
        </CardContent>
      </Card>
    </section>
  )
}
