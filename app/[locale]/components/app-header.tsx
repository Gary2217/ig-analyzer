"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, User, FileText } from "lucide-react"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"
import { Button } from "@/components/ui/button"
import { useAuthNavigation } from "@/app/lib/useAuthNavigation"
import { TopRightActions } from "@/app/components/TopRightActions"

export default function AppHeader({ locale }: { locale: string }) {
  const pathname = usePathname()
  const isMatchmaking = pathname?.includes("/matchmaking")
  const { navigateToResults, navigateToPostAnalysis, loading: authLoading } = useAuthNavigation()
  
  const isZh = locale === "zh-TW"
  const copy = isZh
    ? {
        back: "返回",
        accountAnalysis: "帳號分析",
        postAnalysis: "貼文分析",
      }
    : {
        back: "Back",
        accountAnalysis: "Account",
        postAnalysis: "Post",
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

            <div className="flex items-center justify-end gap-2">
              {isMatchmaking && (
                <TopRightActions locale={locale as "zh-TW" | "en"} showBack={false} />
              )}
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
