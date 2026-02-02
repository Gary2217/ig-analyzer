"use client"

import React, { createContext, useContext, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import { useSiteSession } from "@/app/lib/useSiteSession"

type SiteSessionContextValue = {
  isSignedIn: boolean
  loading: boolean
  error: unknown
  me: any
  revalidate: () => Promise<any>
}

const SiteSessionContext = createContext<SiteSessionContextValue | null>(null)

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

export function SiteSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const isIgDependent = isIgDependentPathname(pathname)

  const q = useSiteSession({ enabled: true })
  const refetch = q.refetch
  const revalidate = q.revalidate

  const isSignedIn = useMemo(() => {
    const obj = q.data && typeof q.data === "object" ? (q.data as Record<string, unknown>) : null
    return obj?.ok === true
  }, [q.data])

  // One-shot cache bust after OAuth return (server sets a short-lived cookie).
  useEffect(() => {
    if (typeof document === "undefined") return
    if (!isIgDependent) return
    const raw = String(document.cookie || "")
    if (!raw.includes("site_oauth_return=1")) return

    try {
      document.cookie = "site_oauth_return=; Max-Age=0; path=/"
    } catch {
      // swallow
    }

    refetch?.()
  }, [isIgDependent, refetch])

  // Event-driven refresh on IG-dependent routes only.
  // - OAuth return => force refetch
  // - focus/visibility => stale-window respecting revalidate
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isIgDependent) return

    let eventTimer: number | null = null
    let didOauth = false
    let lastEventAt = 0

    const trigger = (reason: "oauth" | "focus" | "visibility") => {
      const now = Date.now()
      if (reason === "oauth") {
        if (didOauth) return
        didOauth = true
      } else {
        if (now - lastEventAt < 60_000) return
        lastEventAt = now
      }

      if (eventTimer != null) {
        window.clearTimeout(eventTimer)
        eventTimer = null
      }

      eventTimer = window.setTimeout(() => {
        eventTimer = null
        if (reason === "oauth") {
          refetch?.()
          return
        }
        revalidate?.()
      }, 0)
    }

    const params = new URLSearchParams(window.location.search || "")
    const likelyOAuthReturn =
      params.has("code") ||
      params.has("state") ||
      params.has("oauth") ||
      params.has("provider") ||
      params.has("from")

    if (likelyOAuthReturn) trigger("oauth")

    const onFocus = () => trigger("focus")
    const onVisibility = () => {
      if (document.visibilityState === "visible") trigger("visibility")
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
      if (eventTimer != null) {
        window.clearTimeout(eventTimer)
        eventTimer = null
      }
    }
  }, [isIgDependent, refetch, revalidate])

  const value = useMemo<SiteSessionContextValue>(
    () => ({
      isSignedIn,
      loading: q.loading,
      error: q.error,
      me: q.data,
      revalidate: async () => await q.refetch?.(),
    }),
    [isSignedIn, q.data, q.error, q.loading, q.refetch],
  )

  return <SiteSessionContext.Provider value={value}>{children}</SiteSessionContext.Provider>
}

export function useSiteSessionContext() {
  const ctx = useContext(SiteSessionContext)
  if (!ctx) throw new Error("useSiteSessionContext must be used within SiteSessionProvider")
  return ctx
}

export function useOptionalSiteSessionContext() {
  return useContext(SiteSessionContext)
}
