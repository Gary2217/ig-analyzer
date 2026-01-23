"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { X, CheckCircle2, ExternalLink } from "lucide-react"
import { CreatorCard } from "../types"
import { Button } from "@/components/ui/button"

interface CreatorDetailsSheetProps {
  card: CreatorCard
  locale: "zh-TW" | "en"
  isOpen: boolean
  onClose: () => void
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

export function CreatorDetailsSheet({ card, locale, isOpen, onClose }: CreatorDetailsSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const copy = {
    close: locale === "zh-TW" ? "關閉" : "Close",
    verified: locale === "zh-TW" ? "已驗證" : "Verified",
    viewFullProfile: locale === "zh-TW" ? "查看合作名片" : "View Creator Card",
    about: locale === "zh-TW" ? "關於" : "About",
    comingSoon: locale === "zh-TW" ? "即將推出完整個人檔案功能" : "Full profile coming soon",
    backToList: locale === "zh-TW" ? "返回列表" : "Back to list",
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

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEsc)
    return () => document.removeEventListener("keydown", handleEsc)
  }, [isOpen, onClose])

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY
      document.body.style.position = "fixed"
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = "100%"

      return () => {
        document.body.style.position = ""
        document.body.style.top = ""
        document.body.style.width = ""
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  // Focus trap
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return

    const focusableElements = sheetRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    document.addEventListener("keydown", handleTab)
    firstElement?.focus()

    return () => document.removeEventListener("keydown", handleTab)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Container */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="fixed z-50 bg-[#0b1220] border-white/10 shadow-2xl transition-transform
                   md:right-0 md:top-0 md:bottom-0 md:w-[480px] md:max-w-[90vw] md:border-l
                   max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-3xl max-md:border-t max-md:max-h-[85vh]"
      >
        {/* Header - Desktop */}
        <div className="hidden md:flex sticky top-0 z-10 items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0b1220]/95 backdrop-blur-sm">
          <h2 id="sheet-title" className="text-lg font-semibold text-white">
            {card.displayName}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 p-0 text-white/60 hover:text-white hover:bg-white/10"
            aria-label={copy.close}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Header - Mobile (compact with avatar) */}
        <div className="md:hidden sticky top-0 z-10 bg-[#0b1220]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0">
                <Image
                  src={card.avatarUrl}
                  alt={card.displayName}
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="sheet-title" className="text-base font-semibold text-white truncate">
                  {card.displayName}
                </h2>
                <p className="text-xs text-white/50">{copy.backToList}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-9 w-9 p-0 text-white/60 hover:text-white hover:bg-white/10 shrink-0"
              aria-label={copy.close}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-80px)] md:max-h-[calc(100vh-80px)]">
          <div className="p-4 sm:p-6 space-y-5">
            {/* Avatar - Larger and less top padding */}
            <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-white/10 shadow-lg">
              <Image
                src={card.avatarUrl}
                alt={card.displayName}
                fill
                className="object-cover"
                sizes="320px"
              />
            </div>

            {/* Name + Verified - Expanded card feel */}
            <div className="text-center space-y-2 -mt-2">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-2xl sm:text-3xl font-bold text-white">{card.displayName}</h3>
                {card.isVerified && (
                  <CheckCircle2 className="w-6 h-6 text-sky-400" aria-label={copy.verified} />
                )}
              </div>
              <p className="text-base text-white/60">{translatedCategory}</p>
            </div>

            {/* Subtle divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <div className="text-2xl font-bold text-white tabular-nums">
                  {formatFollowerCount(card.followerCount, locale).split(" ")[0]}
                </div>
                <div className="text-sm text-white/60 mt-1">
                  {locale === "zh-TW" ? "追蹤者" : "Followers"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <div className="text-2xl font-bold text-white tabular-nums">
                  {card.engagementRate !== null ? `${card.engagementRate}%` : "N/A"}
                </div>
                <div className="text-sm text-white/60 mt-1">
                  {locale === "zh-TW" ? "互動率" : "Engagement"}
                </div>
              </div>
            </div>

            {/* About Section (placeholder) */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h4 className="text-sm font-semibold text-white mb-2">{copy.about}</h4>
              <p className="text-sm text-white/60 leading-relaxed">{copy.comingSoon}</p>
            </div>

            {/* CTA Button */}
            <Button
              variant="default"
              size="lg"
              className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-semibold"
              onClick={() => {
                // Navigate to full profile
                window.location.href = `${card.profileUrl}`
              }}
            >
              {copy.viewFullProfile}
              <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
