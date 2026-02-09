"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { CreatorCardPreview } from "../CreatorCardPreview"

function Skeleton({ className }: { className?: string }) {
  return <div className={"animate-pulse rounded-md bg-white/10 " + (className || "")} />
}

type CreatorCardPreviewShellProps = {
  locale: string
  t: (key: string) => string
  showHeaderButtons?: boolean
  editHref: string
  publicHref?: string | null
  isConnected: boolean
  data: {
    isLoading: boolean
    hasCard: boolean
    cardId: string | null
    creatorId: string | null
    creatorCard: any
    igProfile: any
    stats: any
    followers?: number
    following?: number
    posts?: number
    engagementRate?: number
  }
  username?: string
  displayName?: string
  isAutoFilled?: boolean
}

export function CreatorCardPreviewShell({
  locale,
  t,
  showHeaderButtons = true,
  editHref,
  publicHref,
  isConnected,
  data,
  username,
  displayName,
  isAutoFilled = false,
}: CreatorCardPreviewShellProps) {
  const { isLoading, hasCard, creatorCard, followers, following, posts, engagementRate } = data

  // State 1: Not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8 px-4 text-center">
        <div className="rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-4">
          <svg className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-base sm:text-lg font-semibold text-white">
            {locale === "zh-TW" ? "連結 Instagram 以建立創作者名片" : "Connect Instagram to Create Your Creator Card"}
          </h3>
          <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
            {locale === "zh-TW"
              ? "連結你的 Instagram 帳號，即可建立專屬的創作者名片，展示你的創作風格、合作案例和聯絡方式。"
              : "Connect your Instagram account to create a personalized creator card showcasing your style, collaborations, and contact info."}
          </p>
        </div>
        <Link
          href={`/api/auth/instagram?provider=instagram&next=${encodeURIComponent(`/${locale}/results#creator-card`)}`}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 hover:brightness-110 px-6 py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-purple-500/25"
          style={{ minHeight: "44px" }}
        >
          {locale === "zh-TW" ? "連結 Instagram" : "Connect Instagram"}
        </Link>
      </div>
    )
  }

  // State 2: Loading
  if (isLoading) {
    return (
      <div className="min-w-0">
        {showHeaderButtons ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="min-w-0">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex items-center gap-2 justify-end shrink-0">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-white/10 bg-transparent">
          <div className="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-40 max-w-full" />
                <div className="mt-2">
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            </div>
          </div>
          <div className="p-3 sm:p-4 lg:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
            <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="aspect-square rounded-xl hidden sm:block" />
              <Skeleton className="aspect-square rounded-xl hidden sm:block" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // State 3: No card
  if (!hasCard || !creatorCard) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8 px-4 text-center">
        <div className="rounded-full bg-white/5 p-4">
          <svg className="h-8 w-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </div>
        <div className="space-y-2 max-w-md">
          <h3 className="text-base sm:text-lg font-semibold text-white">
            {locale === "zh-TW" ? "建立你的創作者名片" : "Create Your Creator Card"}
          </h3>
          <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
            {locale === "zh-TW"
              ? "展示你的創作風格、合作案例和聯絡方式，讓品牌更容易找到你。"
              : "Showcase your creative style, past collaborations, and contact info to help brands discover you."}
          </p>
        </div>
        <Link
          href={editHref}
          className="inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 border border-white/20 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
          style={{ minHeight: "44px" }}
        >
          {locale === "zh-TW" ? "建立名片" : "Create Card"}
        </Link>
      </div>
    )
  }

  // State 4: Has card - render full preview
  return (
    <div className="min-w-0">
      {showHeaderButtons && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white/90 min-w-0 truncate">
              {locale === "zh-TW" ? "名片預覽" : "Card Preview"}
            </h3>
          </div>
          <div className="flex items-center gap-2 justify-end shrink-0">
            <Link
              href={editHref}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:brightness-110 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-all shadow-lg shadow-purple-500/20 whitespace-nowrap"
              style={{ minHeight: "44px" }}
            >
              {locale === "zh-TW" ? "編輯創作者名片" : "Edit Creator Card"}
            </Link>

            {publicHref ? (
              <Link
                href={publicHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap"
                style={{ minHeight: "44px" }}
              >
                <span>{locale === "zh-TW" ? "查看公開名片" : "View Public Card"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/3 px-4 py-2 text-xs sm:text-sm font-semibold text-white/40 cursor-not-allowed whitespace-nowrap"
                style={{ minHeight: "44px" }}
                title={locale === "zh-TW" ? "名片尚未公開" : "Card not public yet"}
              >
                <span>{locale === "zh-TW" ? "查看公開名片" : "View Public Card"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {isAutoFilled && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-white/60 leading-snug min-w-0">
            {locale === "zh-TW" 
              ? "尚未選擇精選貼文，系統暫時自動顯示近期表現較佳的貼文。" 
              : "No featured posts selected yet — showing top recent posts for now."}
          </p>
        </div>
      )}

      <CreatorCardPreview
        t={t}
        locale={locale}
        className="border-white/10 bg-transparent"
        headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
        profileImageUrl={(typeof creatorCard.profileImageUrl === "string" ? creatorCard.profileImageUrl : null) ?? null}
        displayName={(typeof creatorCard.displayName === "string" ? creatorCard.displayName : null) ?? displayName ?? null}
        username={(typeof creatorCard.username === "string" ? creatorCard.username : null) ?? username ?? null}
        aboutText={(typeof creatorCard.aboutText === "string" ? creatorCard.aboutText : null) ?? null}
        primaryNiche={(typeof creatorCard.primaryNiche === "string" ? creatorCard.primaryNiche : null) ?? null}
        minPrice={typeof creatorCard?.minPrice === "number" ? creatorCard.minPrice : null}
        contact={creatorCard.contact}
        featuredItems={Array.isArray(creatorCard.featuredItems) ? creatorCard.featuredItems : []}
        themeTypes={Array.isArray(creatorCard.themeTypes) ? creatorCard.themeTypes : null}
        audienceProfiles={Array.isArray(creatorCard.audienceProfiles) ? creatorCard.audienceProfiles : null}
        collaborationNiches={Array.isArray(creatorCard.collaborationNiches) ? creatorCard.collaborationNiches : null}
        deliverables={Array.isArray(creatorCard.deliverables) ? creatorCard.deliverables : null}
        pastCollaborations={Array.isArray(creatorCard.pastCollaborations) ? creatorCard.pastCollaborations : null}
        followers={followers}
        following={following}
        posts={posts}
        engagementRate={engagementRate}
      />
    </div>
  )
}
