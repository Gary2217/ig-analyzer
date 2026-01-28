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

  // Auto-fill featured items from posts if creator card has no manual items
  const autoFilledData = {
    ...data,
    creatorCard: data.creatorCard ? {
      ...data.creatorCard,
      featuredItems: (() => {
        const manualItems = data.creatorCard?.featuredItems || []
        if (manualItems.length > 0) return manualItems
        
        // Auto-fill from top posts first, then latest posts
        const allPosts = [...(topPosts || []), ...(latestPosts || [])]
        return allPosts.slice(0, 6).map((post: any, idx: number) => {
          const thumbnailUrl = post?.thumbnail_url || post?.thumbnailUrl || post?.media_url || post?.mediaUrl || ""
          const proxiedUrl = thumbnailUrl && thumbnailUrl.startsWith("http") 
            ? `/api/ig/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`
            : thumbnailUrl
          
          return {
            id: post?.id || `auto-${idx}`,
            url: post?.permalink || "",
            thumbnailUrl: proxiedUrl,
            type: "ig_post",
            mediaType: post?.media_type || post?.mediaType || "IMAGE",
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
          />
        </CardContent>
      </Card>
    </section>
  )
}
