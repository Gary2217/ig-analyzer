"use client"

import { useEffect } from "react"

// ---------------------------------------------------------------------------
// usePredictivePrewarm
// Fires POST /api/prewarm once per session after login.
// - Fetches active ig_account_id server-side (avoids HttpOnly cookie parsing).
// - Uses sessionStorage key "prewarm_login_done" with 30-min TTL.
// - Marks done only after res.ok — retries on next mount if it fails.
// - Never blocks rendering (fire-and-forget async IIFE).
// ---------------------------------------------------------------------------

const LOGIN_TTL_MS = 30 * 60 * 1000 // 30 minutes
const LOGIN_SS_KEY = "prewarm_login_done"

export function usePredictivePrewarm() {
  useEffect(() => {
    if (typeof window === "undefined") return
    void (async () => {
      try {
        const storedAt = Number(sessionStorage.getItem(LOGIN_SS_KEY) ?? "0")
        if (storedAt && Date.now() - storedAt < LOGIN_TTL_MS) return

        const acctRes = await fetch("/api/ig/active-account", { cache: "no-store" }).catch(() => null)
        const acctJson = acctRes?.ok ? await acctRes.json().catch(() => null) : null
        const igAccountId: string | null =
          acctJson && typeof acctJson.ig_account_id === "string" ? acctJson.ig_account_id : null

        const res = await fetch("/api/prewarm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(igAccountId ? { ig_account_id: igAccountId } : {}),
            mode: "full",
            reason: "login",
          }),
        }).catch(() => null)

        if (res?.ok) {
          try { sessionStorage.setItem(LOGIN_SS_KEY, String(Date.now())) } catch { /* ignore */ }
        }
      } catch {
        // best-effort; never block rendering
      }
    })()
  }, [])
}
