"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInstagramMe } from "@/app/lib/useInstagramMe"

const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000
const EVENT_THROTTLE_MS = 60 * 1000

const KEY_LAST_VERIFIED_AT = "ig_last_verified_at"
const KEY_REAUTH_DISMISSED_AT = "ig_reauth_dismissed_at"

function readNumberFromStorage(key: string): number {
  if (typeof window === "undefined") return 0
  try {
    const raw = window.localStorage.getItem(key)
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function writeNumberToStorage(key: string, value: number) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // ignore
  }
}

export type InstagramConnectionStatus = "connected" | "needs_reauth" | "unknown"

export function useInstagramConnectionStatus(options?: {
  enabled?: boolean
  igDependent?: boolean
  revalidateOnEvents?: boolean
}) {
  const enabled = options?.enabled !== false
  const igDependent = options?.igDependent === true
  const revalidateOnEvents = options?.revalidateOnEvents !== false

  const meQuery = useInstagramMe({ enabled })

  const isConnected = useMemo(() => {
    const raw = meQuery.data as unknown
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
    if (!obj) return false

    const ok = obj.ok === true
    const connected = obj.connected === true
    const hasToken = obj.hasToken === true || obj.has_token === true
    return ok && (connected || hasToken)
  }, [meQuery.data])

  const status: InstagramConnectionStatus = useMemo(() => {
    if (!enabled) return "unknown"
    if (meQuery.loading) return "unknown"
    if (isConnected) return "connected"
    if (meQuery.data == null && meQuery.error) return "unknown"
    if (meQuery.data == null) return "unknown"
    return "needs_reauth"
  }, [enabled, isConnected, meQuery.data, meQuery.error, meQuery.loading])

  const [lastVerifiedAt, setLastVerifiedAt] = useState(0)
  const [dismissedAt, setDismissedAt] = useState(0)

  useEffect(() => {
    setLastVerifiedAt(readNumberFromStorage(KEY_LAST_VERIFIED_AT))
    setDismissedAt(readNumberFromStorage(KEY_REAUTH_DISMISSED_AT))
  }, [])

  useEffect(() => {
    if (!isConnected) return
    const now = Date.now()
    writeNumberToStorage(KEY_LAST_VERIFIED_AT, now)
    setLastVerifiedAt(now)
  }, [isConnected])

  const shouldBlockIgFeatures = useMemo(() => {
    return igDependent && status === "needs_reauth" && !isConnected
  }, [igDependent, isConnected, status])

  const shouldNudge = useMemo(() => {
    if (igDependent) return false
    if (status !== "needs_reauth") return false

    const now = Date.now()
    const withinVerifiedGrace = lastVerifiedAt > 0 && now - lastVerifiedAt < VERIFIED_TTL_MS
    if (withinVerifiedGrace) return false

    const withinDismiss = dismissedAt > 0 && now - dismissedAt < DISMISS_TTL_MS
    if (withinDismiss) return false

    return true
  }, [dismissedAt, igDependent, lastVerifiedAt, status])

  const dismiss = useCallback(() => {
    const now = Date.now()
    writeNumberToStorage(KEY_REAUTH_DISMISSED_AT, now)
    setDismissedAt(now)
  }, [])

  const meRevalidateRef = useRef<null | (() => Promise<any>)>(null)
  const meRefetchRef = useRef<null | (() => Promise<any>)>(null)
  useEffect(() => {
    meRevalidateRef.current = typeof (meQuery as any).revalidate === "function" ? (meQuery as any).revalidate : null
    meRefetchRef.current = typeof meQuery.refetch === "function" ? meQuery.refetch : null
  }, [meQuery.refetch, (meQuery as any).revalidate])

  const didOAuthRevalidateRef = useRef(false)
  const lastEventRevalidateAtRef = useRef(0)
  const eventTimerRef = useRef<number | null>(null)

  const revalidate = useCallback(async () => {
    // Explicit caller intent: bypass the 5-min stale window.
    return await meRefetchRef.current?.()
  }, [])

  const triggerRevalidateOnce = useCallback(
    (reason: "oauth" | "focus" | "visibility") => {
      if (typeof window === "undefined") return
      if (!enabled) return

      if (reason === "oauth") {
        if (didOAuthRevalidateRef.current) return
        didOAuthRevalidateRef.current = true
      }

      const now = Date.now()
      if (reason !== "oauth") {
        if (now - lastEventRevalidateAtRef.current < EVENT_THROTTLE_MS) return
        lastEventRevalidateAtRef.current = now
      }

      if (eventTimerRef.current != null) {
        window.clearTimeout(eventTimerRef.current)
        eventTimerRef.current = null
      }

      eventTimerRef.current = window.setTimeout(() => {
        eventTimerRef.current = null
        if (reason === "oauth") {
          // OAuth return should reflect the new auth state immediately.
          meRefetchRef.current?.()
          return
        }
        // focus/visibility should respect the stale window to avoid unnecessary calls.
        meRevalidateRef.current?.()
      }, 0)
    },
    [enabled]
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!enabled) return

    const search = window.location.search || ""
    const params = new URLSearchParams(search)
    const likelyOAuthReturn =
      params.has("code") ||
      params.has("state") ||
      params.has("oauth") ||
      params.has("provider") ||
      params.has("from")

    if (likelyOAuthReturn) triggerRevalidateOnce("oauth")

    const onFocus = () => {
      if (!revalidateOnEvents) return
      triggerRevalidateOnce("focus")
    }
    const onVisibility = () => {
      if (!revalidateOnEvents) return
      if (document.visibilityState === "visible") triggerRevalidateOnce("visibility")
    }

    if (revalidateOnEvents) {
      window.addEventListener("focus", onFocus)
      document.addEventListener("visibilitychange", onVisibility)
    }

    return () => {
      if (revalidateOnEvents) {
        window.removeEventListener("focus", onFocus)
        document.removeEventListener("visibilitychange", onVisibility)
      }
      if (eventTimerRef.current != null) {
        window.clearTimeout(eventTimerRef.current)
        eventTimerRef.current = null
      }
    }
  }, [enabled, revalidateOnEvents, triggerRevalidateOnce])

  return {
    isConnected,
    status,
    shouldNudge,
    shouldBlockIgFeatures,
    igMe: meQuery.data,
    loading: meQuery.loading,
    error: meQuery.error,
    revalidate,
    dismiss,
    lastVerifiedAt,
    dismissedAt,
  }
}
