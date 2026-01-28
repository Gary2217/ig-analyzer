"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"
import { CreatorCard as CreatorCardType } from "../types"
import { CardClickBehavior } from "../cardClickConfig"

interface CreatorCardProps {
  card: CreatorCardType
  locale: "zh-TW" | "en"
  behavior: CardClickBehavior
  onClick?: (id: string) => void
}

const categoryTranslations: Record<string, { "zh-TW": string; en: string }> = {
  "Beauty & Fashion": { "zh-TW": "美妝時尚", en: "Beauty & Fashion" },
  "Tech & Gadgets": { "zh-TW": "科技數碼", en: "Tech & Gadgets" },
  "Travel & Lifestyle": { "zh-TW": "旅遊生活", en: "Travel & Lifestyle" },
  "Fitness & Health": { "zh-TW": "健身健康", en: "Fitness & Health" },
  "Food & Cooking": { "zh-TW": "美食料理", en: "Food & Cooking" },
  Photography: { "zh-TW": "攝影", en: "Photography" },
  "Art & Design": { "zh-TW": "藝術設計", en: "Art & Design" },
  "Business & Finance": { "zh-TW": "商業金融", en: "Business & Finance" },
}

function translateCategory(category: string, locale: "zh-TW" | "en"): string {
  return categoryTranslations[category]?.[locale] || category
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

export function CreatorCard({ card, locale, behavior, onClick }: CreatorCardProps) {
  const router = useRouter()
  const profileHref = useMemo(() => card.profileUrl, [card.profileUrl])

  const copy = {
    viewCard: locale === "zh-TW" ? "查看名片" : "View Card",
    verified: locale === "zh-TW" ? "已驗證" : "Verified",
  }

  const translatedCategory = translateCategory(card.category, locale)
  const engagementText =
    card.engagementRate !== null
      ? locale === "zh-TW"
        ? `互動率 ${card.engagementRate}%`
        : `${card.engagementRate}% engagement`
      : locale === "zh-TW"
      ? "互動率未提供"
      : "Engagement N/A"

  const cardContent = (
    <>
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
            <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" aria-label={copy.verified} />
          )}
        </div>

        {/* Category */}
        <p className="text-sm text-white/60 truncate">{translatedCategory}</p>

        {/* Metrics */}
        <div className="flex items-center gap-3 text-xs text-white/50 tabular-nums">
          <span className="truncate">{formatFollowerCount(card.followerCount, locale)}</span>
          <span className="text-white/30">•</span>
          <span className="truncate">{engagementText}</span>
        </div>
      </div>
    </>
  )

  const handleCardClick = () => {
    router.push(profileHref)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleCardClick()
      }}
      className="group relative rounded-2xl border border-white/10 bg-white/5 overflow-hidden transition-all hover:border-white/20 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-white/20 cursor-pointer"
    >
      {cardContent}

      {/* Single CTA button */}
      <div className="px-4 pb-4">
        <Link
          href={profileHref}
          className="w-full inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/15 transition-colors border border-white/10 hover:border-white/20"
          onClick={(e) => e.stopPropagation()}
        >
          {copy.viewCard}
        </Link>
      </div>
    </div>
  )
}
