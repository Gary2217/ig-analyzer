"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

type Options = {
  enabled: boolean
  throttleMs?: number
}

export function useRefetchTick(options: Options) {
  const { enabled, throttleMs = 900 } = options
  const pathname = usePathname() || ""
  const [tick, setTick] = useState(0)
  const lastTickAtRef = useRef(0)

  const bump = () => {
    const now = Date.now()
    if (now - lastTickAtRef.current < throttleMs) return
    lastTickAtRef.current = now
    setTick((x) => x + 1)
  }

  useEffect(() => {
    if (!enabled) return
    bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathname])

  useEffect(() => {
    if (!enabled) return

    const onFocus = () => bump()
    const onVis = () => {
      if (document.visibilityState !== "visible") return
      bump()
    }
    const onResize = () => bump()

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, throttleMs])

  return tick
}
