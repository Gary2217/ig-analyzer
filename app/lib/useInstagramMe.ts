"use client"

import { useCallback, useEffect, useRef, useState } from "react"

let mePromise: Promise<{ status: number; data: any }> | null = null
let meCache: { status: number; data: any } | null = null
let meCacheAt = 0

const DEFAULT_TTL_MS = 60_000

async function fetchInstagramMeOnce(): Promise<{ status: number; data: any }> {
  const now = Date.now()
  if (meCache && now - meCacheAt <= DEFAULT_TTL_MS) return meCache
  if (mePromise) return mePromise

  mePromise = (async () => {
    const res = await fetch("/api/auth/instagram/me", {
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

    // Cache only successful responses; do not cache auth failures.
    if (res.ok) {
      meCache = payload
      meCacheAt = Date.now()
    }

    return payload
  })()

  try {
    return await mePromise
  } finally {
    mePromise = null
  }
}

export function useInstagramMe(options?: { enabled?: boolean }) {
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
      const r = await fetchInstagramMeOnce()
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

  const refetch = useCallback(async () => {
    meCache = null
    meCacheAt = 0
    return run()
  }, [run])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    run()
  }, [enabled, run])

  return { loading, status, data, error, refetch }
}
