"use client"

import { useEffect } from "react"
import { getCopy, type Locale } from "@/app/i18n"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // no-op: keep minimal to avoid noisy logs in prod
    void error
  }, [error])

  const locale: Locale = typeof window !== "undefined" && window.location.pathname.startsWith("/en") ? "en" : "zh-TW"
  const mm = getCopy(locale).matchmaking

  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 py-10">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="text-base sm:text-lg font-semibold text-white/90 break-words">{mm.pageErrorTitle}</div>
        <div className="mt-2 text-sm text-white/60 leading-relaxed break-words">{mm.pageErrorBody}</div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => reset()}
            className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/85 hover:bg-white/10"
          >
            {mm.pageErrorRetry}
          </button>
        </div>
      </div>
    </div>
  )
}
