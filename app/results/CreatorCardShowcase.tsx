"use client"

import Link from "next/link"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"

interface CreatorCardShowcaseProps {
  locale: string
  username: string
  displayName: string
  avatarUrl?: string
  followers?: number
  following?: number
  posts?: number
  engagementRate?: string
  isConnected: boolean
  isLoading: boolean
  hasCard: boolean
  isCardPublic: boolean
  cardId?: string
  t: (key: string) => string
}

export function CreatorCardShowcase({
  locale,
  username,
  displayName,
  avatarUrl,
  followers,
  following,
  posts,
  engagementRate,
  isConnected,
  isLoading,
  hasCard,
  isCardPublic,
  cardId,
  t,
}: CreatorCardShowcaseProps) {
  const formatNum = (n?: number) => (n !== undefined ? n.toLocaleString() : "—")

  // Generate initials for avatar fallback
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : username
      ? username.slice(0, 2).toUpperCase()
      : "?"

  const editCardUrl = `/${locale}/creator-card`
  const publicCardUrl = cardId ? `/${locale}/creator/${cardId}` : null

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

            {/* Action buttons - wrap on mobile */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${locale}/results`}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[11px] sm:text-xs font-semibold text-white/85 hover:border-white/20 hover:bg-white/7 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="hidden sm:inline">{t("creatorCard.page.backToResults")}</span>
                <span className="sm:hidden">Back</span>
              </Link>

              <Link
                href={`/${locale}/post-analysis`}
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[11px] sm:text-xs font-semibold text-white/85 hover:border-white/20 hover:bg-white/7 transition-colors whitespace-nowrap"
              >
                Post Analysis
              </Link>

              <Link
                href={editCardUrl}
                className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-3 py-2 text-[11px] sm:text-xs font-semibold text-white/85 hover:border-white/20 hover:bg-white/7 transition-colors whitespace-nowrap"
              >
                Edit Card
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {!isConnected ? (
            // State 1: Not connected
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
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
          ) : isLoading ? (
            // State 2: Loading
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              <p className="text-sm text-white/60">{locale === "zh-TW" ? "載入名片中..." : "Loading creator card..."}</p>
            </div>
          ) : !hasCard || !isCardPublic ? (
            // State 3: No card or not public
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
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
                href={editCardUrl}
                className="inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 border border-white/20 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                style={{ minHeight: "44px" }}
              >
                {locale === "zh-TW" ? "建立名片" : "Create Card"}
              </Link>
            </div>
          ) : (
            // State 4: Has public card - show preview
            <div className="space-y-4">
              {/* Avatar + Name + Handle */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white/10"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 border-2 border-white/10 flex items-center justify-center">
                      <span className="text-lg sm:text-xl font-bold text-white/90">{initials}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-white min-w-0 truncate">{displayName}</h3>
                  <p className="text-sm text-white/60 min-w-0 truncate">@{username}</p>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 min-w-0">
                  <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                    {locale === "zh-TW" ? "追蹤者" : "Followers"}
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-white tabular-nums whitespace-nowrap">
                    {formatNum(followers)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 min-w-0">
                  <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                    {locale === "zh-TW" ? "追蹤中" : "Following"}
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-white tabular-nums whitespace-nowrap">
                    {formatNum(following)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 min-w-0">
                  <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                    {locale === "zh-TW" ? "貼文" : "Posts"}
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-white tabular-nums whitespace-nowrap">
                    {formatNum(posts)}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 min-w-0">
                  <div className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
                    {locale === "zh-TW" ? "互動率" : "Engagement"}
                  </div>
                  <div className="mt-1 text-base sm:text-lg font-bold text-white tabular-nums whitespace-nowrap">
                    {engagementRate || "—"}
                  </div>
                </div>
              </div>

              {/* Footer CTAs */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Link
                  href={editCardUrl}
                  className="flex-1 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:brightness-110 px-4 py-3 text-sm font-semibold text-white transition-all shadow-lg shadow-purple-500/20"
                  style={{ minHeight: "44px" }}
                >
                  {locale === "zh-TW" ? "編輯創作者名片" : "Edit Creator Card"}
                </Link>

                {publicCardUrl ? (
                  <Link
                    href={publicCardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-3 text-sm font-semibold text-white transition-colors"
                    style={{ minHeight: "44px" }}
                  >
                    <span>{locale === "zh-TW" ? "查看公開名片" : "View Public Card"}</span>
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-white/40 cursor-not-allowed"
                    style={{ minHeight: "44px" }}
                    title={locale === "zh-TW" ? "名片尚未公開" : "Card not public yet"}
                  >
                    {locale === "zh-TW" ? "查看公開名片" : "View Public Card"}
                  </button>
                )}
              </div>

              {!publicCardUrl && (
                <p className="text-xs text-white/50 text-center">
                  {locale === "zh-TW"
                    ? "提示：在編輯頁面將名片設為公開後，即可分享給品牌查看。"
                    : "Tip: Make your card public in the editor to share it with brands."}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
