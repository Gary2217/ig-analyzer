"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Percent, Users } from "lucide-react"
import { CreatorCard as CreatorCardType } from "../types"

interface CreatorCardProps {
  card: CreatorCardType
  locale: "zh-TW" | "en"
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

function formatCompactNumber(n: number, locale: "zh-TW" | "en"): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0
  if (v >= 1_000_000) {
    const x = (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)
    return locale === "zh-TW" ? `${x}M` : `${x}M`
  }
  if (v >= 1_000) {
    const x = (v / 1_000).toFixed(v >= 10_000 ? 0 : 1)
    return locale === "zh-TW" ? `${x}K` : `${x}K`
  }
  return String(Math.round(v))
}

function formatErPct(value: number) {
  // max 2 decimals, trim trailing .0 / .00
  const rounded = Math.round(value * 100) / 100
  const s = rounded.toFixed(2)
  return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
}

export function CreatorCard({ card, locale }: CreatorCardProps) {
  const router = useRouter()
  const profileHref = useMemo(() => card.profileUrl, [card.profileUrl])

  const copy = {
    viewCard: locale === "zh-TW" ? "查看名片" : "View Card",
    verified: locale === "zh-TW" ? "已驗證" : "Verified",
    demo: locale === "zh-TW" ? "示意" : "Demo",
    followersShort: locale === "zh-TW" ? "追蹤" : "Followers",
    erShort: locale === "zh-TW" ? "互動率" : "ER",
    viewDisabled: locale === "zh-TW" ? "示意卡" : "Demo card",
  }

  const translatedCategory = translateCategory(card.category, locale)

  const followersText = formatCompactNumber(card.followerCount, locale)
  const erText =
    typeof card.engagementRate === "number" && Number.isFinite(card.engagementRate)
      ? `${formatErPct(card.engagementRate)}%`
      : null

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

        {card.isDemo ? (
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white/80 backdrop-blur">
              {copy.demo}
            </span>
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 min-w-0">
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
        <div className="grid grid-cols-2 gap-2 text-[11px] text-white/70 tabular-nums min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
            <span className="text-white/55 min-w-0 truncate">{copy.followersShort}</span>
            <span className="ml-auto text-white/85 whitespace-nowrap shrink-0">{followersText}</span>
          </div>
          {erText ? (
            <div className="flex items-center gap-2 min-w-0">
              <Percent className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
              <span className="text-white/55 min-w-0 truncate">{copy.erShort}</span>
              <span className="ml-auto text-white/85 whitespace-nowrap shrink-0">{erText}</span>
            </div>
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>
      </div>
    </>
  )

  const handleCardClick = () => {
    if (card.isDemo) return
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
        {card.isDemo ? (
          <div
            className="w-full inline-flex items-center justify-center rounded-xl bg-white/5 px-4 py-2.5 text-sm font-medium text-white/45 border border-white/10"
            aria-label={copy.viewDisabled}
            style={{ minHeight: "44px" }}
          >
            {copy.viewDisabled}
          </div>
        ) : (
          <Link
            href={profileHref}
            className="w-full inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white/90 hover:bg-white/15 transition-colors border border-white/10 hover:border-white/20"
            onClick={(e) => e.stopPropagation()}
            style={{ minHeight: "44px" }}
          >
            {copy.viewCard}
          </Link>
        )}
      </div>
    </div>
  )
}
