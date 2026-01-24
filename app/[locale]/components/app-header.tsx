"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Eye } from "lucide-react"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"
import { TopRightActions, BUTTON_BASE_CLASSES } from "@/app/components/TopRightActions"

export default function AppHeader({ locale }: { locale: string }) {
  const pathname = usePathname()
  const isMatchmaking = pathname?.includes("/matchmaking")
  const isCreatorCard = pathname?.includes("/creator-card")
  
  const isZh = locale === "zh-TW"
  const copy = isZh
    ? {
        back: "返回",
        browseCreators: "瀏覽創作者名片",
      }
    : {
        back: "Back",
        browseCreators: "Browse Creator Cards",
      }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3 gap-3">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md shrink-0"
            >
              <Logo size={28} className="text-white" />
              <span className="hidden sm:inline">Social Analytics</span>
            </Link>

            <div className="flex items-center justify-end gap-2 flex-wrap">
              {isMatchmaking && (
                <TopRightActions locale={locale as "zh-TW" | "en"} showBack={false} />
              )}
              {isCreatorCard && (
                <>
                  <Link href={`/${locale}/results#creator-card-section`} className={BUTTON_BASE_CLASSES}>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">{copy.back}</span>
                    <span className="sr-only sm:hidden">{copy.back}</span>
                  </Link>
                  <Link href={`/${locale}/matchmaking`} className={BUTTON_BASE_CLASSES}>
                    <Eye className="w-4 h-4" />
                    <span className="hidden sm:inline">{copy.browseCreators}</span>
                    <span className="sr-only sm:hidden">{copy.browseCreators}</span>
                  </Link>
                </>
              )}
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
