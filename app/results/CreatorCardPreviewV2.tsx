"use client"

import { useState } from "react"
import { Card, CardContent } from "../../components/ui/card"
import { ChevronDown, ChevronUp } from "lucide-react"

interface CreatorCardPreviewV2Props {
  locale: string
  username?: string
  displayName?: string
  avatarUrl?: string
  bio?: string
  followers?: number
  following?: number
  posts?: number
  engagementRate?: number | string
  avgLikes?: number
  avgComments?: number
  contactEmail?: string
  contactPhone?: string
  location?: string
  nicheTags?: string[]
  platformTags?: string[]
  isPro?: boolean
  isConnected?: boolean
  profileUrl?: string
  t: (key: string) => string
}

export default function CreatorCardPreviewV2(props: CreatorCardPreviewV2Props) {
  const {
    username,
    displayName,
    avatarUrl,
    bio,
    followers,
    following,
    posts,
    engagementRate,
    contactEmail,
    contactPhone,
    location,
    nicheTags = [],
    platformTags = [],
    isPro,
    isConnected,
    profileUrl,
    t,
  } = props

  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  const formatNum = (n: number | undefined) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return "—"
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  const formatEngagement = (rate: number | string | undefined) => {
    if (typeof rate === "number" && Number.isFinite(rate)) {
      return `${rate.toFixed(2)}%`
    }
    if (typeof rate === "string" && rate.trim()) {
      return rate
    }
    return "—"
  }

  const getInitials = () => {
    if (displayName) {
      return displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    if (username) {
      return username.slice(0, 2).toUpperCase()
    }
    return "?"
  }

  const allTags = [...nicheTags, ...platformTags]
  const visibleTags = tagsExpanded ? allTags : allTags.slice(0, 6)
  const hiddenTagsCount = allTags.length - visibleTags.length

  return (
    <Card className="border-white/8 bg-white/5 backdrop-blur-sm">
      <CardContent className="p-4 sm:p-6">
        {/* Header Row: Avatar + Name + Badges */}
        <div className="flex items-start gap-4 mb-6">
          {/* Avatar */}
          <div className="shrink-0">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={displayName || username || "avatar"}
                className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-xl object-cover border border-white/10"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 flex items-center justify-center text-white/70 font-bold text-xl sm:text-2xl">
                {getInitials()}
              </div>
            )}
          </div>

          {/* Name + Handle + Badges */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-white truncate">
                  {displayName || username || "—"}
                </h3>
                {username && (
                  <p className="text-sm text-white/60 truncate">@{username}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {isPro && (
                  <span className="inline-flex items-center rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 px-2 py-0.5 text-[10px] font-semibold text-yellow-400 whitespace-nowrap">
                    {t("results.creatorCardPreview.badges.pro")}
                  </span>
                )}
                {isConnected && (
                  <span className="inline-flex items-center rounded-full bg-green-500/20 border border-green-500/30 px-2 py-0.5 text-[10px] font-semibold text-green-400 whitespace-nowrap">
                    {t("results.creatorCardPreview.badges.connected")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] text-white/50 uppercase tracking-wide mb-1">
              {t("results.creatorCardPreview.metrics.followers")}
            </div>
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">
              {formatNum(followers)}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] text-white/50 uppercase tracking-wide mb-1">
              {t("results.creatorCardPreview.metrics.following")}
            </div>
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">
              {formatNum(following)}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] text-white/50 uppercase tracking-wide mb-1">
              {t("results.creatorCardPreview.metrics.posts")}
            </div>
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">
              {formatNum(posts)}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/5 p-3">
            <div className="text-[10px] text-white/50 uppercase tracking-wide mb-1">
              {t("results.creatorCardPreview.metrics.engagement")}
            </div>
            <div className="text-lg sm:text-xl font-bold text-white tabular-nums">
              {formatEngagement(engagementRate)}
            </div>
          </div>
        </div>

        {/* Bio */}
        {bio && (
          <div className="mb-6">
            <h4 className="text-xs text-white/50 uppercase tracking-wide mb-2">
              {t("results.creatorCardPreview.sections.bio")}
            </h4>
            <p className="text-sm text-white/80 leading-relaxed line-clamp-3">
              {bio}
            </p>
          </div>
        )}

        {/* Contact Chips */}
        {(contactEmail || contactPhone || location) && (
          <div className="mb-6">
            <h4 className="text-xs text-white/50 uppercase tracking-wide mb-2">
              {t("results.creatorCardPreview.sections.contact")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition-colors max-w-full"
                  title={contactEmail}
                >
                  <span className="truncate">Email: {contactEmail}</span>
                </a>
              )}
              {contactPhone && (
                <a
                  href={`tel:${contactPhone}`}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 transition-colors max-w-full"
                  title={contactPhone}
                >
                  <span className="truncate">Phone: {contactPhone}</span>
                </a>
              )}
              {location && (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 max-w-full">
                  <span className="truncate">{location}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Category & Platform Tags */}
        {allTags.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs text-white/50 uppercase tracking-wide mb-2">
              {t("results.creatorCardPreview.sections.categories")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
                >
                  {tag}
                </span>
              ))}
              {hiddenTagsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setTagsExpanded(!tagsExpanded)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 hover:bg-white/10 transition-colors"
                >
                  {tagsExpanded ? (
                    <>
                      {t("results.creatorCardPreview.actions.showLess")}
                      <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      +{hiddenTagsCount}
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Profile Link */}
        {profileUrl && (
          <div className="pt-4 border-t border-white/8">
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors w-full sm:w-auto"
            >
              {t("results.creatorCardPreview.actions.viewProfile")}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
