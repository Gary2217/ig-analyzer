"use client"

import { useEffect } from "react"

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

  const isZh = typeof window !== "undefined" && window.location.pathname.startsWith("/en") ? false : true

  const title = isZh ? "頁面載入失敗" : "Something went wrong"
  const body = isZh ? "請重新整理或稍後再試。" : "Please refresh the page or try again later."
  const cta = isZh ? "重試" : "Retry"

  return (
    <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-6 py-10">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="text-base sm:text-lg font-semibold text-white/90 break-words">{title}</div>
        <div className="mt-2 text-sm text-white/60 leading-relaxed break-words">{body}</div>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => reset()}
            className="h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-sm text-white/85 hover:bg-white/10"
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  )
}
