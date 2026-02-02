"use client"

import React, { createContext, useContext, useMemo } from "react"
import { usePathname } from "next/navigation"
import { useInstagramConnectionStatus, type InstagramConnectionStatus } from "@/app/hooks/useInstagramConnectionStatus"

type InstagramConnectionContextValue = {
  isConnected: boolean
  status: InstagramConnectionStatus
  shouldNudge: boolean
  shouldBlockIgFeatures: boolean
  igMe: any
  loading: boolean
  error: unknown
  revalidate: () => Promise<any>
  dismiss: () => void
}

const InstagramConnectionContext = createContext<InstagramConnectionContextValue | null>(null)

function isIgDependentPathname(pathname: string): boolean {
  const p = String(pathname || "")
  // Note: pathname includes locale prefix (e.g. /en/creator-card)
  return (
    /\/(creator-card)(\/|$)/i.test(p) ||
    /\/(post-analysis)(\/|$)/i.test(p) ||
    /\/(results)(\/|$)/i.test(p) ||
    /\/(matchmaking)(\/|$)/i.test(p)
  )
}

export function InstagramConnectionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const shouldRevalidateOnEvents = isIgDependentPathname(pathname)

  const v = useInstagramConnectionStatus({ enabled: true, igDependent: false, revalidateOnEvents: shouldRevalidateOnEvents })

  const value = useMemo<InstagramConnectionContextValue>(
    () => ({
      isConnected: v.isConnected,
      status: v.status,
      shouldNudge: v.shouldNudge,
      shouldBlockIgFeatures: v.shouldBlockIgFeatures,
      igMe: v.igMe,
      loading: v.loading,
      error: v.error,
      revalidate: v.revalidate,
      dismiss: v.dismiss,
    }),
    [v.dismiss, v.error, v.igMe, v.isConnected, v.loading, v.revalidate, v.shouldBlockIgFeatures, v.shouldNudge, v.status]
  )

  return <InstagramConnectionContext.Provider value={value}>{children}</InstagramConnectionContext.Provider>
}

export function useInstagramConnection() {
  const ctx = useContext(InstagramConnectionContext)
  if (!ctx) {
    throw new Error("useInstagramConnection must be used within InstagramConnectionProvider")
  }
  return ctx
}

export function useOptionalInstagramConnection() {
  return useContext(InstagramConnectionContext)
}
