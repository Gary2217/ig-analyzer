"use client"

import Image from "next/image"
import { CheckCircle2 } from "lucide-react"
import { CreatorCard as CreatorCardType } from "../types"

interface CreatorCardProps {
  card: CreatorCardType
  locale: "zh-TW" | "en"
  onViewProfile: (id: string) => void
}

function formatFollowerCount(count: number, locale: "zh-TW" | "en"): string {
  if (count >= 1000000) {
    const millions = (count / 1000000).toFixed(1)
    return locale === "zh-TW" ? `${millions}M 追蹤者` : `${millions}M followers`
  }
  if (count >= 1000) {
    const thousands = (count / 1000).toFixed(1)
    return locale === "zh-TW" ? `${thousands}K 追蹤者` : `${thousands}K followers`
  }
  return locale === "zh-TW" ? `${count} 追蹤者` : `${count} followers`
}

export function CreatorCard({ card, locale, onViewProfile }: CreatorCardProps) {
  const ctaText = locale === "zh-TW" ? "查看創作者名片" : "View Creator Profile"
  const engagementText =
    card.engagementRate !== null
      ? locale === "zh-TW"
        ? `互動率 ${card.engagementRate}%`
        : `${card.engagementRate}% engagement`
      : locale === "zh-TW"
      ? "互動率未提供"
      : "Engagement N/A"

  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/5 overflow-hidden transition-all hover:border-white/20 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20">
      {/* Avatar */}
      <div className="relative aspect-square w-full overflow-hidden bg-white/10">
        <Image
          src={card.avatarUrl}
          alt={card.displayName}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Name + Verified Badge */}
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-base font-semibold text-white truncate flex-1 min-w-0">
            {card.displayName}
          </h3>
          {card.isVerified && (
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" aria-label="Verified" />
          )}
        </div>

        {/* Category */}
        <p className="text-sm text-white/60 truncate">{card.category}</p>

        {/* Metrics */}
        <div className="flex items-center gap-3 text-xs text-white/50 tabular-nums">
          <span className="truncate">{formatFollowerCount(card.followerCount, locale)}</span>
          <span className="text-white/30">•</span>
          <span className="truncate">{engagementText}</span>
        </div>

        {/* CTA Button */}
        <button
          type="button"
          onClick={() => onViewProfile(card.id)}
          className="w-full mt-2 px-4 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors border border-white/10 hover:border-white/20"
        >
          {ctaText}
        </button>
      </div>
    </div>
  )
}
