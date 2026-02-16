// SAFE: Read-only SaaS IG accounts page. No auth, token, or DB logic modified.

"use client"

import { useEffect, useMemo, useState } from "react"
import { Instagram } from "lucide-react"
import { getCopy } from "@/app/i18n"

type ApiOk = {
  ok: true
  accounts: Array<{
    provider: "instagram"
    ig_user_id: string
    has_token: boolean
    token_expires_at: string | null
    identity_created_at: string | null
    identity_updated_at: string | null
  }>
}

type ApiDisabled = {
  ok: false
  disabled: true
  accounts: any[]
}

type ApiUnauthorized = {
  ok: false
  error: "unauthorized" | string
}

type ApiOther = {
  ok: false
  error?: string
  disabled?: boolean
  accounts?: any[]
}

type ApiResponse = ApiOk | ApiDisabled | ApiUnauthorized | ApiOther

function fmt(s: string | null | undefined) {
  const v = typeof s === "string" ? s.trim() : ""
  if (!v) return "-"
  try {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return v
    return d.toLocaleString()
  } catch {
    return v
  }
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return false
  return t <= Date.now()
}

export default function IgAccountsSettingsPage({ params }: { params: { locale: string } }) {
  const locale = params?.locale === "en" ? "en" : "zh-TW"
  const copy = useMemo(() => getCopy(locale), [locale])

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ApiResponse | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoading(true)
      try {
        const r = await fetch("/api/user/ig-accounts", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const j = (await r.json()) as ApiResponse
        if (!cancelled) setData(j)
      } catch {
        if (!cancelled) setData({ ok: false, error: "server_error" })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  const title = copy.settingsIgAccountsTitle

  const statusBlock = (() => {
    if (loading) {
      return <div className="text-sm text-white/60">...</div>
    }

    if (!data) {
      return null
    }

    if ((data as any).ok === false && (data as any).disabled === true) {
      return <div className="text-sm text-white/70">{copy.settingsIgAccountsDisabled}</div>
    }

    if ((data as any).ok === false && (data as any).error === "unauthorized") {
      return <div className="text-sm text-white/70">{copy.settingsIgAccountsUnauthorized}</div>
    }

    if ((data as any).ok === true) {
      const accounts = Array.isArray((data as any).accounts) ? ((data as any).accounts as any[]) : []
      if (!accounts.length) {
        return <div className="text-sm text-white/70">{copy.settingsIgAccountsEmpty}</div>
      }
      return null
    }

    return <div className="text-sm text-white/70">{copy.settingsIgAccountsEmpty}</div>
  })()

  const accounts = (data && (data as any).ok === true && Array.isArray((data as any).accounts)
    ? ((data as any).accounts as ApiOk["accounts"])
    : []) as ApiOk["accounts"]

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0b1220]">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-white truncate">{title}</h1>
            <div className="mt-2">{statusBlock}</div>
          </div>
        </div>

        {accounts.length ? (
          <div className="mt-6 grid grid-cols-1 gap-3">
            {accounts.map((a) => {
              const expired = a.has_token ? isExpired(a.token_expires_at) : false
              const statusLabel = a.has_token
                ? expired
                  ? copy.settingsIgAccountsExpired
                  : copy.settingsIgAccountsConnected
                : copy.settingsIgAccountsNoToken

              return (
                <div
                  key={`${a.provider}:${a.ig_user_id}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-10 w-10 rounded-xl border border-white/10 bg-black/20 grid place-items-center shrink-0">
                          <Instagram className="h-5 w-5 text-white/80" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white/90 truncate">{a.ig_user_id}</div>
                          <div className="text-xs text-white/50">Instagram</div>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`shrink-0 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${
                        a.has_token
                          ? expired
                            ? "border-amber-400/20 bg-amber-500/10 text-amber-100/80"
                            : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/80"
                          : "border-white/10 bg-white/5 text-white/65"
                      }`}
                    >
                      {statusLabel}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-w-0">
                      <div className="text-[11px] text-white/45">created_at</div>
                      <div className="mt-1 text-sm text-white/80 truncate">{fmt(a.identity_created_at)}</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 min-w-0">
                      <div className="text-[11px] text-white/45">expires_at</div>
                      <div className="mt-1 text-sm text-white/80 truncate">{fmt(a.token_expires_at)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </main>
  )
}
