"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BarChart3, FileText, Edit3 } from "lucide-react"

interface TopRightActionsProps {
  locale: "zh-TW" | "en"
  creatorId?: string
  showBack?: boolean
  backHref?: string
}

const BUTTON_BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 px-3 py-2 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold bg-gradient-to-r from-white/15 via-white/10 to-white/5 border border-white/15 hover:from-white/25 hover:via-white/15 hover:to-white/10 text-white/90 backdrop-blur transition-all whitespace-nowrap"

export function TopRightActions({
  locale,
  creatorId,
  showBack = true,
  backHref,
}: TopRightActionsProps) {
  const router = useRouter()
  const isZh = locale === "zh-TW"

  const copy = {
    back: isZh ? "返回" : "Back",
    accountAnalytics: isZh ? "帳號分析" : "Account Analytics",
    postAnalytics: isZh ? "貼文分析" : "Post Analytics",
    editCard: isZh ? "編輯名片" : "Edit Card",
  }

  const accountAnalyticsHref = `/${locale}/results` 
  const postAnalyticsHref = `/${locale}/post-analysis` 
  const creatorCardHref = `/${locale}/creator-card` 

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Back (optional) */}
      {showBack ? (
        backHref ? (
          <Link href={backHref} className={BUTTON_BASE_CLASSES}>
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{copy.back}</span>
            <span className="sr-only sm:hidden">{copy.back}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            className={BUTTON_BASE_CLASSES}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{copy.back}</span>
            <span className="sr-only sm:hidden">{copy.back}</span>
          </button>
        )
      ) : null}

      {/* Account Analytics */}
      <Link href={accountAnalyticsHref} className={BUTTON_BASE_CLASSES}>
        <BarChart3 className="w-4 h-4" />
        <span className="hidden sm:inline">{copy.accountAnalytics}</span>
        <span className="sr-only sm:hidden">{copy.accountAnalytics}</span>
      </Link>

      {/* Post Analytics */}
      <Link href={postAnalyticsHref} className={BUTTON_BASE_CLASSES}>
        <FileText className="w-4 h-4" />
        <span className="hidden sm:inline">{copy.postAnalytics}</span>
        <span className="sr-only sm:hidden">{copy.postAnalytics}</span>
      </Link>

      {/* Edit Creator Card */}
      <Link href={creatorCardHref} className={BUTTON_BASE_CLASSES}>
        <Edit3 className="w-4 h-4" />
        <span className="hidden sm:inline">{copy.editCard}</span>
        <span className="sr-only sm:hidden">{copy.editCard}</span>
      </Link>
    </div>
  )
}
