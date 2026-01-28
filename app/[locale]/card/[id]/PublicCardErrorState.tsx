"use client"

import Link from "next/link"

interface PublicCardErrorStateProps {
  locale: "zh-TW" | "en"
  errorType: "not_found" | "service_error" | "env_missing"
}

export function PublicCardErrorState({ locale, errorType }: PublicCardErrorStateProps) {
  const copy = {
    "zh-TW": {
      not_found: {
        title: "找不到名片",
        description: "此創作者名片不存在或尚未公開。",
        primaryAction: "瀏覽其他創作者",
        secondaryAction: "返回首頁",
      },
      service_error: {
        title: "載入失敗",
        description: "無法載入名片資料，請稍後再試。",
        primaryAction: "重新整理",
        secondaryAction: "返回首頁",
      },
      env_missing: {
        title: "服務暫時無法使用",
        description: "系統設定問題，請聯繫管理員。",
        primaryAction: "返回首頁",
        secondaryAction: "重新整理",
      },
    },
    en: {
      not_found: {
        title: "Card Not Found",
        description: "This creator card does not exist or is not public.",
        primaryAction: "Browse Other Creators",
        secondaryAction: "Go Home",
      },
      service_error: {
        title: "Failed to Load",
        description: "Unable to load card data. Please try again later.",
        primaryAction: "Reload",
        secondaryAction: "Go Home",
      },
      env_missing: {
        title: "Service Temporarily Unavailable",
        description: "System configuration issue. Please contact administrator.",
        primaryAction: "Go Home",
        secondaryAction: "Reload",
      },
    },
  }

  const messages = copy[locale][errorType]
  const homeUrl = `/${locale}`
  const matchmakingUrl = `/${locale}/matchmaking`

  const handleReload = () => {
    window.location.reload()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-6 sm:py-10">
      <div className="max-w-md w-full min-w-0">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8 space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white/60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white break-words">
              {messages.title}
            </h1>
            <p className="text-sm sm:text-base text-white/60 break-words leading-relaxed">
              {messages.description}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {errorType === "service_error" || errorType === "env_missing" ? (
              <button
                onClick={handleReload}
                className="w-full h-11 sm:h-12 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors min-h-[44px]"
              >
                {messages.primaryAction}
              </button>
            ) : (
              <Link
                href={matchmakingUrl}
                className="block w-full h-11 sm:h-12 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors flex items-center justify-center min-h-[44px]"
              >
                {messages.primaryAction}
              </Link>
            )}

            <Link
              href={homeUrl}
              className="block w-full h-11 sm:h-12 px-4 rounded-lg border border-white/10 hover:border-white/20 text-white/80 hover:text-white font-medium transition-colors flex items-center justify-center min-h-[44px]"
            >
              {messages.secondaryAction}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
