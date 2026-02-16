"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Eye, Instagram } from "lucide-react"
import Logo from "../../../components/Logo"
import LocaleSwitcher from "../../components/locale-switcher"
import { BUTTON_BASE_CLASSES } from "@/app/components/TopRightActions"
import { getCopy } from "@/app/i18n"

export default function AppHeader({ locale }: { locale: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isCreatorCard = pathname?.includes("/creator-card")
  const isCreatorCardView = Boolean(pathname && /\/creator-card\/view(\/|$)/i.test(pathname))
  const dict = getCopy(locale === "en" ? "en" : "zh-TW")
  
  const isZh = locale === "zh-TW"
  const copy = isZh
    ? {
        back: "返回",
        opportunities: "名片展示區",
        homeAria: "回到首頁",
        settingsIgAccounts: "IG 帳號",
      }
    : {
        back: "Back",
        opportunities: "Card showcase",
        homeAria: "Go to homepage",
        settingsIgAccounts: "IG Accounts",
      }

  const [igSummary, setIgSummary] = useState<
    | {
        ok: true
        linked_count: number
        display: { ig_user_id_short: string; updated_at: string | null } | null
        pending: boolean
      }
    | { ok: false; disabled?: boolean; pending?: boolean }
    | null
  >(null)
  const lastFetchAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const now = Date.now()
      if (now - lastFetchAtRef.current < 45_000) return
      lastFetchAtRef.current = now

      try {
        const r = await fetch("/api/user/ig-accounts/summary", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const j = (await r.json()) as any
        if (!cancelled) setIgSummary(j)
      } catch {
        if (!cancelled) setIgSummary({ ok: false })
      }
    }

    load()
    const t = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  const pending = Boolean((igSummary as any)?.pending)
  const linkedCount = typeof (igSummary as any)?.linked_count === "number" ? Number((igSummary as any).linked_count) : 0
  const displayShort =
    typeof (igSummary as any)?.display?.ig_user_id_short === "string" ? String((igSummary as any).display.ig_user_id_short) : ""

  const pillText =
    igSummary === null
      ? `${dict.igHeaderLinkedPrefix} ${dict.igHeaderLoading}`
      : (igSummary as any)?.ok === true && linkedCount > 0
        ? `${dict.igHeaderLinkedPrefix} ${displayShort}${linkedCount > 1 ? " " + dict.igHeaderMultipleSuffix.replace("{n}", String(linkedCount - 1)) : ""}`
        : `${dict.igHeaderLinkedPrefix} ${dict.igHeaderNotLinked}`

  const handleBackToResults = () => {
    if (typeof window === "undefined") return
    
    // Check if user just saved (sessionStorage flag set AFTER localStorage write)
    const hasSaved = sessionStorage.getItem("creatorCard:updated") === "1"
    
    if (hasSaved) {
      sessionStorage.removeItem("creatorCard:updated")
      // Append ccUpdated flag to trigger immediate hydration
      router.push(`/${locale}/results?ccUpdated=1#creator-card`)
    } else {
      // Normal navigation without flag
      router.push(`/${locale}/results`)
    }
  }

  const handleBack = () => {
    if (typeof window === "undefined") return

    // On /creator-card/view we must return to the originating list page (usually matchmaking).
    // We do NOT use router.back() because it is unstable across entry points / redirects.
    if (isCreatorCardView) {
      const fromRaw = searchParams?.get("from")
      if (fromRaw && fromRaw.trim()) {
        try {
          const decoded = decodeURIComponent(fromRaw)
          // Only allow same-site relative navigation.
          if (decoded.startsWith("/")) {
            router.push(decoded)
            return
          }
        } catch {
          // ignore and fall back
        }
      }

      router.push(`/${locale}/matchmaking`)
      return
    }

    handleBackToResults()
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0b1220]/85 backdrop-blur-md">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-1 sm:py-3 gap-3">
            <Link
              href={`/${locale}`}
              aria-label={copy.homeAria}
              className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md shrink-0"
            >
              <Logo size={28} className="text-white" />
              <span className="hidden sm:inline">Social Analytics</span>
            </Link>

            <div className="flex items-center justify-end gap-2 flex-wrap">
              {isCreatorCard && (
                <>
                  <button onClick={handleBack} className={BUTTON_BASE_CLASSES + " min-h-[44px]"}>
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">{copy.back}</span>
                    <span className="sr-only sm:hidden">{copy.back}</span>
                  </button>
                  <Link
                    href={`/${locale}/matchmaking`}
                    className={BUTTON_BASE_CLASSES + " min-h-[44px]"}
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
              <Link
                href={`/${locale}/settings/ig-accounts`}
                className={BUTTON_BASE_CLASSES + " min-h-[44px] max-w-[220px] sm:max-w-[320px]"}
                aria-label={pillText}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Instagram className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline min-w-0 truncate">{pillText}</span>
                </span>
                <span className="sm:hidden relative shrink-0">
                  {linkedCount > 0 ? (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] leading-none border border-white/10 bg-white/10 text-white/80">
                      {linkedCount}
                    </span>
                  ) : null}
                </span>
                {pending ? (
                  <span className="hidden sm:inline ml-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-100/80 whitespace-nowrap">
                    {dict.igHeaderPendingBadge}
                  </span>
                ) : null}
              </Link>
              <LocaleSwitcher />
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
