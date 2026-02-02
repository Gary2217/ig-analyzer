"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { useInstagramConnection } from "@/app/components/InstagramConnectionProvider"
import { Button } from "@/components/ui/button"

export default function GlobalReauthPrompt({ locale }: { locale: "en" | "zh-TW" }) {
  const { shouldNudge, status, dismiss } = useInstagramConnection()

  const pathname = usePathname()
  const searchParams = useSearchParams()

  const nextPath = useMemo(() => {
    const base = pathname || `/${locale}`
    const qs = searchParams?.toString() || ""
    return qs ? `${base}?${qs}` : base
  }, [locale, pathname, searchParams])

  const href = useMemo(() => {
    const url = `/api/auth/instagram?provider=instagram&locale=${encodeURIComponent(locale)}&next=${encodeURIComponent(nextPath)}`
    return url
  }, [locale, nextPath])

  if (!shouldNudge) return null
  if (status !== "needs_reauth") return null

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-6xl px-4">
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 min-w-0">
          <div className="font-semibold min-w-0 break-words [overflow-wrap:anywhere]">
            {locale === "zh-TW"
              ? "Instagram 驗證可能已過期，建議重新驗證以繼續同步資料。"
              : "Your Instagram authorization may have expired. Re-verify to keep syncing."}
          </div>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <Button asChild type="button" variant="primary" className="min-h-[44px] w-full sm:w-auto">
              <Link href={href}>{locale === "zh-TW" ? "重新驗證" : "Re-verify"}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto"
              onClick={() => dismiss()}
            >
              {locale === "zh-TW" ? "稍後再說" : "Later"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
