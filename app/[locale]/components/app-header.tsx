"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, Eye } from "lucide-react"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"
import { BUTTON_BASE_CLASSES } from "@/app/components/TopRightActions"

export default function AppHeader({ locale }: { locale: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const isMatchmaking = pathname?.includes("/matchmaking")
  const isCreatorCard = pathname?.includes("/creator-card")
  const isPublicCard = pathname?.includes("/card/")
  const isVendorFacing = isMatchmaking || isPublicCard
  
  const isZh = locale === "zh-TW"
  const copy = isZh
    ? {
        back: "返回",
        opportunities: "名片展示區",
      }
    : {
        back: "Back",
        opportunities: "Card showcase",
      }

  const handleBackToResults = () => {
    if (typeof window === "undefined") return
    
    // Check if user just saved (sessionStorage flag set AFTER localStorage write)
    const hasSaved = sessionStorage.getItem("creatorCard:updated") === "1"
    
    if (hasSaved) {
      // Append ccUpdated flag to trigger immediate hydration
      router.push(`/${locale}/results?ccUpdated=1#creator-card`)
    } else {
      // Normal navigation without flag
      router.push(`/${locale}/results#creator-card`)
    }
  }

  const handleVendorBack = () => {
    if (typeof window === "undefined") return
    window.history.back()
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-1 sm:py-3 gap-3">
            {isVendorFacing ? (
              <button
                type="button"
                onClick={handleVendorBack}
                className={BUTTON_BASE_CLASSES}
                aria-label="返回上一頁 / Back"
                style={{ minWidth: "44px", minHeight: "44px" }}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <Link
                href={`/${locale}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md shrink-0"
              >
                <Logo size={28} className="text-white" />
                <span className="hidden sm:inline">Social Analytics</span>
              </Link>
            )}

            <div className="flex items-center justify-end gap-2 flex-wrap">
              {isMatchmaking ? null : null}
              {isCreatorCard && (
                <>
                  <button onClick={handleBackToResults} className={BUTTON_BASE_CLASSES}>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">{copy.back}</span>
                    <span className="sr-only sm:hidden">{copy.back}</span>
                  </button>
                  <Link
                    href={`/${locale}/matchmaking`}
                    className={BUTTON_BASE_CLASSES}
                    aria-label={copy.opportunities}
                  >
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">{copy.opportunities}</span>
                    <span className="sm:hidden text-[10px] text-white/75 max-w-[92px] truncate">
                      {copy.opportunities}
                    </span>
                  </Link>
                </>
              )}
              {isPublicCard ? null : null}
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
