"use client"

import { useEffect, useState } from "react"

const LS_KEY = "creator_card_avatar_buster"
const EVENT_NAME = "creator_card_avatar_buster"

function safeGet(): string {
  try {
    if (typeof window === "undefined") return ""
    return (window.localStorage.getItem(LS_KEY) || "").trim()
  } catch {
    return ""
  }
}

export function getAvatarBuster(): string {
  return safeGet()
}

export function bumpAvatarBuster(): string {
  const next = String(Date.now())
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, next)
  } catch {
    // swallow
  }
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_NAME))
  } catch {
    // swallow
  }
  return next
}

export function withAvatarBuster(url: string | null | undefined, buster?: string | null): string | null {
  const raw = String(url || "").trim()
  if (!raw) return null

  const v = (buster == null ? safeGet() : String(buster)).trim()
  if (!v) return raw

  try {
    if (raw.startsWith("data:")) return raw
    const u = raw.startsWith("http") ? new URL(raw) : new URL(raw, window.location.origin)
    u.searchParams.set("v", v)
    if (raw.startsWith("http")) return u.toString()
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    const sep = raw.includes("?") ? "&" : "?"
    return `${raw}${sep}v=${encodeURIComponent(v)}`
  }
}

export function subscribeAvatarBuster(cb: (v: string) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key !== LS_KEY) return
    cb(String(e.newValue || "").trim())
  }
  const localHandler = () => cb(safeGet())
  try {
    if (typeof window !== "undefined") window.addEventListener("storage", handler)
  } catch {
    // swallow
  }

  try {
    if (typeof window !== "undefined") window.addEventListener(EVENT_NAME, localHandler)
  } catch {
    // swallow
  }

  return () => {
    try {
      if (typeof window !== "undefined") window.removeEventListener("storage", handler)
    } catch {
      // swallow
    }
    try {
      if (typeof window !== "undefined") window.removeEventListener(EVENT_NAME, localHandler)
    } catch {
      // swallow
    }
  }
}

export function useAvatarBuster(): string {
  const [v, setV] = useState<string>(getAvatarBuster())

  useEffect(() => {
    setV(getAvatarBuster())
    return subscribeAvatarBuster((next) => setV(next))
  }, [])

  return v
}
