"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Eye, Handshake } from "lucide-react"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"
import { TopRightActions, BUTTON_BASE_CLASSES } from "@/app/components/TopRightActions"

export default function AppHeader({ locale }: { locale: string }) {
  const pathname = usePathname()
  const isMatchmaking = pathname?.includes("/matchmaking")
  const isCreatorCard = pathname?.includes("/creator-card")
  const [creatorCardId, setCreatorCardId] = useState<string | null>(null)
  
  useEffect(() => {
    if (isCreatorCard) {
      const id = localStorage.getItem("creatorCardId")
      setCreatorCardId(id)
    }
  }, [isCreatorCard, pathname])
  
  const isZh = locale === "zh-TW"
  const copy = isZh
    ? {
        viewProfile: "瀏覽創作者名片",
        matchmaking: "合作機會",
      }
    : {
        viewProfile: "View Creator Profile",
        matchmaking: "Matchmaking",
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
                  {creatorCardId && (
                    <Link href={`/${locale}/creator/${creatorCardId}`} className={BUTTON_BASE_CLASSES}>
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">{copy.viewProfile}</span>
                      <span className="sr-only sm:hidden">{copy.viewProfile}</span>
                    </Link>
                  )}
                  <Link href={`/${locale}/matchmaking`} className={BUTTON_BASE_CLASSES}>
                    <Handshake className="w-4 h-4" />
                    <span className="hidden sm:inline">{copy.matchmaking}</span>
                    <span className="sr-only sm:hidden">{copy.matchmaking}</span>
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
