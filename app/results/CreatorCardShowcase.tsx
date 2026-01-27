"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { CreatorCardPreview } from "../components/CreatorCardPreview"

interface CreatorCardShowcaseProps {
  locale: string
  username: string
  displayName: string
  isConnected: boolean
  isLoading: boolean
  hasCard: boolean
  isCardPublic: boolean
  cardId?: string
  t: (key: string) => string
}

type IgProfile = {
  followers_count?: number
  follows_count?: number
  media_count?: number
  profile_picture_url?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function finiteNumOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
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
  t,
}: CreatorCardShowcaseProps) {
  const [creatorCard, setCreatorCard] = useState<unknown>(null)
  const [igProfile, setIgProfile] = useState<IgProfile | null>(null)
  const [isCardLoading, setIsCardLoading] = useState(false)

  // Fetch creator card and IG profile data in parallel
  useEffect(() => {
    if (!hasCard || !isConnected || isLoading) return
    if (creatorCard) return

    const controller = new AbortController()
    let cancelled = false

    const fetchData = async () => {
      try {
        setIsCardLoading(true)

        const [cardRes, igRes] = await Promise.all([
          fetch("/api/creator-card/me", { signal: controller.signal }),
          fetch("/api/auth/instagram/me", { signal: controller.signal }),
        ])

        if (cancelled) return

        let cardData = null
        let igData = null

        if (cardRes.ok) {
          try {
            cardData = await cardRes.json()
          } catch {}
        }

        if (igRes.ok) {
          try {
            const json = await igRes.json()
            const profile = isRecord(json) && isRecord(json.profile) ? json.profile : isRecord(json) ? json : null
            if (profile) {
              const followersCount = finiteNumOrNull(profile.followers_count)
              const followsCount = finiteNumOrNull(profile.follows_count)
              const mediaCount = finiteNumOrNull(profile.media_count)
              igData = {
                followers_count: followersCount ?? undefined,
                follows_count: followsCount ?? undefined,
                media_count: mediaCount ?? undefined,
                profile_picture_url: typeof profile.profile_picture_url === "string" ? profile.profile_picture_url : undefined,
              }
            }
          } catch {}
        }

        if (!cancelled) {
          setCreatorCard(cardData)
          setIgProfile(igData)
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error("Failed to fetch creator card data", err)
        }
      } finally {
        if (!cancelled) {
          setIsCardLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hasCard, isConnected, isLoading, creatorCard])

  const editCardUrl = `/${locale}/creator-card`
  const publicCardUrl = cardId ? `/${locale}/creator/${cardId}` : null

  const showLoading = isLoading || isCardLoading

  // Compute stats from IG profile
  const followers = igProfile?.followers_count ?? null
  const following = igProfile?.follows_count ?? null
  const posts = igProfile?.media_count ?? null
  const engagementRate = null // Not available in Results context

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

            {/* Action buttons - only Edit and View Public */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={editCardUrl}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:brightness-110 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-all shadow-lg shadow-purple-500/20 whitespace-nowrap"
                style={{ minHeight: "44px" }}
              >
                {locale === "zh-TW" ? "編輯創作者名片" : "Edit Creator Card"}
              </Link>

              {publicCardUrl ? (
                <Link
                  href={publicCardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
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
        </CardHeader>

        <CardContent className="p-0">
          {!isConnected ? (
            // State 1: Not connected
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
          ) : showLoading ? (
            // State 2: Loading
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
              <p className="text-sm text-white/60">{locale === "zh-TW" ? "載入名片中..." : "Loading creator card..."}</p>
            </div>
          ) : !hasCard || !isCardPublic ? (
            // State 3: No card or not public
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
                href={editCardUrl}
                className="inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 border border-white/20 px-6 py-2.5 text-sm font-semibold text-white transition-colors"
                style={{ minHeight: "44px" }}
              >
                {locale === "zh-TW" ? "建立名片" : "Create Card"}
              </Link>
            </div>
          ) : creatorCard && isRecord(creatorCard) ? (
            // State 4: Has public card - show full preview using shared component
            <CreatorCardPreview
              t={t}
              className="border-white/10 bg-transparent"
              headerClassName="px-3 py-2 sm:px-4 sm:py-2 lg:px-6 lg:py-3 border-b border-white/10"
              profileImageUrl={typeof creatorCard.profileImageUrl === "string" ? creatorCard.profileImageUrl : typeof creatorCard.profile_image_url === "string" ? creatorCard.profile_image_url : null}
              displayName={typeof creatorCard.displayName === "string" ? creatorCard.displayName : typeof creatorCard.display_name === "string" ? creatorCard.display_name : displayName}
              username={typeof creatorCard.handle === "string" ? creatorCard.handle : username}
              aboutText={typeof creatorCard.audience === "string" ? creatorCard.audience : null}
              primaryNiche={typeof creatorCard.niche === "string" ? creatorCard.niche : null}
              contact={creatorCard.contact}
              featuredItems={Array.isArray(creatorCard.featuredItems) ? creatorCard.featuredItems : Array.isArray(creatorCard.featured_items) ? creatorCard.featured_items : []}
              themeTypes={Array.isArray(creatorCard.themeTypes) ? creatorCard.themeTypes : Array.isArray(creatorCard.theme_types) ? creatorCard.theme_types : null}
              audienceProfiles={Array.isArray(creatorCard.audienceProfiles) ? creatorCard.audienceProfiles : Array.isArray(creatorCard.audience_profiles) ? creatorCard.audience_profiles : null}
              collaborationNiches={Array.isArray(creatorCard.collaborationNiches) ? creatorCard.collaborationNiches : Array.isArray(creatorCard.collaboration_niches) ? creatorCard.collaboration_niches : null}
              deliverables={Array.isArray(creatorCard.deliverables) ? creatorCard.deliverables : null}
              pastCollaborations={Array.isArray(creatorCard.pastCollaborations) ? creatorCard.pastCollaborations : Array.isArray(creatorCard.past_collaborations) ? creatorCard.past_collaborations : null}
              followers={followers ?? undefined}
              following={following ?? undefined}
              posts={posts ?? undefined}
              engagementRate={engagementRate ?? undefined}
            />
          ) : (
            // Fallback: Card fetch failed
            <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
              <p className="text-sm text-white/60">{locale === "zh-TW" ? "無法載入名片資料" : "Failed to load card data"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
