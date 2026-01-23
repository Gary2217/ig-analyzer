"use client"

import { useRouter, usePathname } from "next/navigation"
import { useInstagramMe } from "./useInstagramMe"

export function useAuthNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const { status, loading } = useInstagramMe()

  const locale = pathname?.startsWith("/zh-TW") ? "zh-TW" : "en"
  const isAuthenticated = status === 200

  const navigateToProtected = (targetPath: string) => {
    if (isAuthenticated) {
      router.push(targetPath)
    } else {
      const provider = "instagram"
      const oauthUrl = `/api/auth/instagram?provider=${provider}&next=${encodeURIComponent(targetPath)}`
      window.location.href = oauthUrl
    }
  }

  const navigateToResults = () => {
    navigateToProtected(`/${locale}/results`)
  }

  const navigateToPostAnalysis = () => {
    navigateToProtected(`/${locale}/post-analysis`)
  }

  return {
    locale,
    isAuthenticated,
    loading,
    navigateToProtected,
    navigateToResults,
    navigateToPostAnalysis,
  }
}
