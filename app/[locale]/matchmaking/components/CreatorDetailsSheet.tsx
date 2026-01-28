"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { X, CheckCircle2, ExternalLink, Mail, Heart, Copy, Check, Globe, Instagram } from "lucide-react"
import { CreatorCard } from "../types"
import { Button } from "@/components/ui/button"

interface CreatorDetailsSheetProps {
  card: CreatorCard
  locale: "zh-TW" | "en"
  isOpen: boolean
  onClose: () => void
}

// CTA A/B test variant
// NOTE: Switch CTA to "查看合作資訊 / View Collaboration Info" (variant "INFO")
// when brand collaboration features are launched and profile page has real data.
type PrimaryCtaVariant = "CARD" | "INFO"
const PRIMARY_CTA_VARIANT: PrimaryCtaVariant = "CARD" // Change to "INFO" to test variant B

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
  const router = useRouter()
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  
  // Save (favorite) state
  const [isSaved, setIsSaved] = useState(false)
  const [showContactInfo, setShowContactInfo] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  
  // Contact data fetching
  const [contactData, setContactData] = useState<{ email?: string; instagram?: string; website?: string } | null>(null)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactFetched, setContactFetched] = useState(false)

  // Check if creator is saved on mount
  useEffect(() => {
    if (!isOpen) return
    try {
      const saved = localStorage.getItem("matchmaking_saved_creators_v1")
      if (saved) {
        const savedIds = JSON.parse(saved) as string[]
        setIsSaved(savedIds.includes(card.id))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [isOpen, card.id])

  // Toggle save state
  // NOTE: When user authentication is enabled, sync local favorites to backend on login.
  // Current implementation uses localStorage only for unauthenticated users.
  const handleToggleSave = () => {
    try {
      const saved = localStorage.getItem("matchmaking_saved_creators_v1")
      let savedIds: string[] = saved ? JSON.parse(saved) : []
      
      if (isSaved) {
        savedIds = savedIds.filter(id => id !== card.id)
      } else {
        savedIds.push(card.id)
      }
      
      localStorage.setItem("matchmaking_saved_creators_v1", JSON.stringify(savedIds))
      setIsSaved(!isSaved)
      
      // TODO: When auth is ready, also POST to /api/favorites/toggle
    } catch {
      // Ignore localStorage errors
    }
  }

  // Fetch contact data when user opens contact section
  const fetchContactData = async () => {
    if (contactFetched) return // Already fetched
    
    setContactLoading(true)
    try {
      const creatorSlug = card.profileUrl.split("/").pop() || card.id
      const res = await fetch(`/api/creator/${creatorSlug}/profile`)
      
      if (res.ok) {
        const data = await res.json()
        setContactData(data.contact || {})
      }
    } catch (error) {
      console.error("Failed to fetch contact data:", error)
      setContactData({})
    } finally {
      setContactLoading(false)
      setContactFetched(true)
    }
  }

  // Toggle contact section and fetch data if needed
  const handleToggleContact = () => {
    const newState = !showContactInfo
    setShowContactInfo(newState)
    if (newState && !contactFetched) {
      fetchContactData()
    }
  }

  // Copy to clipboard
  const handleCopy = async (text: string, field: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback: create temp input and select
        const input = document.createElement("input")
        input.value = text
        document.body.appendChild(input)
        input.select()
        document.execCommand("copy")
        document.body.removeChild(input)
      }
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      // Ignore copy errors
    }
  }

  // Compute primary CTA label based on variant
  const primaryCtaLabel = PRIMARY_CTA_VARIANT === "CARD"
    ? (locale === "zh-TW" ? "查看合作名片" : "View Creator Card")
    : (locale === "zh-TW" ? "查看合作資訊" : "View Collaboration Info")

  const copy = {
    close: locale === "zh-TW" ? "關閉" : "Close",
    verified: locale === "zh-TW" ? "已驗證" : "Verified",
    viewFullProfile: primaryCtaLabel,
    about: locale === "zh-TW" ? "關於" : "About",
    comingSoon: locale === "zh-TW" ? "即將推出完整個人檔案功能" : "Full profile coming soon",
    backToList: locale === "zh-TW" ? "返回列表" : "Back to list",
    contact: locale === "zh-TW" ? "聯絡" : "Contact",
    save: locale === "zh-TW" ? "收藏" : "Save",
    saved: locale === "zh-TW" ? "已收藏" : "Saved",
    contactInfo: locale === "zh-TW" ? "聯絡資訊" : "Contact Info",
    contactComingSoon: locale === "zh-TW" ? "聯絡資訊即將推出" : "Contact info coming soon",
    instagram: locale === "zh-TW" ? "Instagram" : "Instagram",
    email: locale === "zh-TW" ? "電子郵件" : "Email",
    copy: locale === "zh-TW" ? "複製" : "Copy",
    copied: locale === "zh-TW" ? "已複製" : "Copied",
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

            {/* Weak CTAs: Contact + Save */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={handleToggleContact}
                className="flex-1 h-11 border-white/10 text-white/80 hover:bg-white/5 hover:text-white"
                aria-label={copy.contact}
              >
                <Mail className="w-4 h-4 mr-2" />
                {copy.contact}
              </Button>
              <Button
                variant={isSaved ? "default" : "outline"}
                size="default"
                onClick={handleToggleSave}
                className={`flex-1 h-11 ${
                  isSaved
                    ? "bg-pink-500/20 border-pink-500/30 text-pink-300 hover:bg-pink-500/30"
                    : "border-white/10 text-white/80 hover:bg-white/5 hover:text-white"
                }`}
                aria-label={isSaved ? copy.saved : copy.save}
              >
                <Heart className={`w-4 h-4 mr-2 ${isSaved ? "fill-current" : ""}`} />
                {isSaved ? copy.saved : copy.save}
              </Button>
            </div>

            {/* Contact Info Section (expandable) */}
            {showContactInfo && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <h4 className="text-sm font-semibold text-white">{copy.contactInfo}</h4>
                
                {contactLoading && (
                  <div className="space-y-2">
                    <div className="h-4 bg-white/10 rounded animate-pulse" />
                    <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
                  </div>
                )}
                
                {!contactLoading && contactData && (
                  <div className="space-y-2">
                    {contactData.instagram && (
                      <a
                        href={`https://instagram.com/${contactData.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/90 hover:text-white"
                      >
                        <Instagram className="w-4 h-4 text-white/60" />
                        <span className="break-words">@{contactData.instagram}</span>
                      </a>
                    )}
                    {contactData.email && (
                      <a
                        href={`mailto:${contactData.email}`}
                        className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/90 hover:text-white"
                      >
                        <Mail className="w-4 h-4 text-white/60" />
                        <span className="break-all">{contactData.email}</span>
                      </a>
                    )}
                    {contactData.website && (
                      <a
                        href={contactData.website.startsWith("http") ? contactData.website : `https://${contactData.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/90 hover:text-white"
                      >
                        <Globe className="w-4 h-4 text-white/60" />
                        <span className="break-all">{contactData.website}</span>
                      </a>
                    )}
                    {!contactData.instagram && !contactData.email && !contactData.website && (
                      <p className="text-sm text-white/60 leading-relaxed">{copy.contactComingSoon}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Primary CTA Button */}
            <Button
              variant="default"
              size="lg"
              className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-semibold"
              onClick={() => {
                // Store context in sessionStorage for seamless transition
                try {
                  const creatorSlug = card.profileUrl.split("/").pop() || card.id
                  sessionStorage.setItem(
                    "last_viewed_creator_v1",
                    JSON.stringify({
                      id: card.id,
                      displayName: card.displayName,
                      avatarUrl: card.avatarUrl,
                      category: card.category,
                      followerCount: card.followerCount,
                      engagementRate: card.engagementRate,
                      isVerified: card.isVerified,
                      profileUrl: card.profileUrl,
                      creatorSlug: creatorSlug,
                      ts: Date.now(),
                    })
                  )
                } catch {
                  // Ignore sessionStorage errors
                }
                // Navigate to full profile (profileUrl already includes locale prefix)
                router.push(card.profileUrl)
              }}
            >
              {copy.viewFullProfile}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
