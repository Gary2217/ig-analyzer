import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type RefreshReason = "init" | "focus" | "visibility" | "manual" | "reconnect" | "interval"

type RefreshEvent = {
  seq: number
  at: number
  reason: RefreshReason
  throttled: boolean
}

type Options = {
  throttleMs?: number // e.g. 10_000
  enableFocus?: boolean
  enableVisibility?: boolean
}

export function useRefreshController(options: Options = {}) {
  const { throttleMs = 10_000, enableFocus = true, enableVisibility = true } = options

  const [seq, setSeq] = useState(0)
  const lastFireAtRef = useRef(0)
  const lastEventRef = useRef<RefreshEvent | null>(null)
  const throttledCountRef = useRef(0)

  const fire = useCallback(
    (reason: RefreshReason) => {
      const now = Date.now()
      const delta = now - lastFireAtRef.current

      if (delta < throttleMs) {
        throttledCountRef.current += 1
        lastEventRef.current = {
          seq,
          at: now,
          reason,
          throttled: true,
        }
        return
      }

      lastFireAtRef.current = now
      setSeq((s) => s + 1)
      lastEventRef.current = {
        seq: seq + 1,
        at: now,
        reason,
        throttled: false,
      }
    },
    [seq, throttleMs],
  )

  useEffect(() => {
    if (!enableFocus) return
    const onFocus = () => fire("focus")
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [enableFocus, fire])

  useEffect(() => {
    if (!enableVisibility) return
    const onVis = () => {
      if (document.visibilityState === "visible") fire("visibility")
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [enableVisibility, fire])

  const debug = useMemo(() => {
    return {
      lastEvent: lastEventRef.current,
      throttledCount: throttledCountRef.current,
      lastFireAt: lastFireAtRef.current,
      throttleMs,
    }
  }, [throttleMs, seq])

  return { refreshSeq: seq, fireRefresh: fire, refreshDebug: debug }
}
