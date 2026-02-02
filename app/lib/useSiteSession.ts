"use client"

import { useCallback, useEffect, useRef, useState } from "react"

let sessionPromise: Promise<{ status: number; data: any }> | null = null
let sessionCache: { status: number; data: any } | null = null
let sessionCacheAt = 0

const DEFAULT_TTL_MS = 300_000

async function fetchSiteSessionOnce(): Promise<{ status: number; data: any }> {
  const now = Date.now()
  if (sessionCache && now - sessionCacheAt <= DEFAULT_TTL_MS) return sessionCache
  if (sessionPromise) return sessionPromise

  sessionPromise = (async () => {
    const res = await fetch("/api/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    })

    let data: any = null
    try {
      data = await res.json()
    } catch {
      data = null
    }

    const payload = { status: res.status, data }

    // Cache both signed-in and not-signed-in states to avoid request storms.
    sessionCache = payload
    sessionCacheAt = Date.now()

    return payload
  })()

  try {
    return await sessionPromise
  } finally {
    sessionPromise = null
  }
}

export function useSiteSession(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false

  const [loading, setLoading] = useState<boolean>(enabled)
  const [status, setStatus] = useState<number | null>(null)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<unknown>(null)

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)

    try {
      const r = await fetchSiteSessionOnce()
      if (!mountedRef.current) return
      setStatus(r.status)
      setData(r.data)
    } catch (e) {
      if (!mountedRef.current) return
      const anyErr = e as any
      if (anyErr?.name === "AbortError") return
      setError(e)
    } finally {
      if (!mountedRef.current) return
      setLoading(false)
    }
  }, [enabled])

  const revalidate = useCallback(async () => {
    return run()
  }, [run])

  const refetch = useCallback(async () => {
    sessionCache = null
    sessionCacheAt = 0
    return run()
  }, [run])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    run()
  }, [enabled, run])

  return { loading, status, data, error, revalidate, refetch }
}
