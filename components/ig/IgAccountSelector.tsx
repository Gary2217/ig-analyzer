"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Check, Instagram, X } from "lucide-react"
import { BUTTON_BASE_CLASSES } from "@/app/components/TopRightActions"
import { getCopy } from "@/app/i18n"
import { Input } from "@/components/ui/input"

type IgAccountRow = {
  ig_user_id: string
  username: string | null
  profile_picture_url: string | null
  is_active: boolean
  updated_at: string | null
}

type IgSummary =
  | {
      ok: true
      linked_count: number
      display:
        | {
            ig_user_id: string
            ig_user_id_short: string
            updated_at: string | null
            username?: string | null
            profile_picture_url?: string | null
            is_active?: boolean | null
          }
        | null
      pending: boolean
    }
  | { ok: false; disabled?: boolean; pending?: boolean }

export default function IgAccountSelector({ locale }: { locale: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const dict = getCopy(locale === "en" ? "en" : "zh-TW")
  const isZh = locale === "zh-TW"

  const [igSummary, setIgSummary] = useState<IgSummary | null>(null)
  const lastFetchAtRef = useRef(0)

  const [igSelectorOpen, setIgSelectorOpen] = useState(false)
  const [igAccountsLoading, setIgAccountsLoading] = useState(false)
  const [igAccounts, setIgAccounts] = useState<IgAccountRow[]>([])
  const [igAccountsError, setIgAccountsError] = useState(false)
  const [igSwitchingId, setIgSwitchingId] = useState<string>("")
  const [igSwitchError, setIgSwitchError] = useState(false)
  const [igPickerHint, setIgPickerHint] = useState(false)
  const [query, setQuery] = useState("")

  const igSelectorRef = useRef<HTMLDivElement | null>(null)
  const routerRefreshInFlightRef = useRef(false)

  const requestRouterRefresh = () => {
    if (routerRefreshInFlightRef.current) return
    routerRefreshInFlightRef.current = true
    try {
      router.refresh()
    } finally {
      window.setTimeout(() => {
        routerRefreshInFlightRef.current = false
      }, 800)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      const now = Date.now()
      if (now - lastFetchAtRef.current < 45_000) return
      lastFetchAtRef.current = now

      try {
        const r = await fetch("/api/user/ig-accounts/summary", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const j = (await r.json()) as any
        if (!cancelled) setIgSummary(j)
      } catch {
        if (!cancelled) setIgSummary({ ok: false })
      }
    }

    load()
    const t = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!igSelectorOpen) return
      const el = igSelectorRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setIgSelectorOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!igSelectorOpen) return
      if (e.key === "Escape") setIgSelectorOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [igSelectorOpen])

  useEffect(() => {
    const v = searchParams?.get("ig_picker")
    if (v !== "1") return
    setIgSelectorOpen(true)
    setIgPickerHint(true)

    try {
      const p = new URLSearchParams(searchParams?.toString() || "")
      p.delete("ig_picker")
      const qs = p.toString()
      const nextUrl = `${pathname || ""}${qs ? `?${qs}` : ""}`
      router.replace(nextUrl, { scroll: false })
    } catch {
      // ignore
    }
  }, [searchParams, pathname, router])

  useEffect(() => {
    if (!igSelectorOpen) {
      setIgPickerHint(false)
      setQuery("")
    }
  }, [igSelectorOpen])

  const refreshIgSummary = async () => {
    try {
      const r = await fetch("/api/user/ig-accounts/summary", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
      const j = (await r.json()) as any
      setIgSummary(j)
    } catch {
      setIgSummary({ ok: false })
    }
  }

  const refreshIgList = async () => {
    try {
      const r = await fetch("/api/user/ig-accounts/list", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
      const j = (await r.json()) as any
      const rows: any[] = (j as any)?.ok === true && Array.isArray((j as any)?.accounts) ? (j as any).accounts : []
      const normalized = rows
        .map((row) => {
          const ig_user_id = typeof row?.ig_user_id === "string" ? row.ig_user_id.trim() : ""
          if (!ig_user_id) return null
          return {
            ig_user_id,
            username: typeof row?.username === "string" ? row.username : null,
            profile_picture_url: typeof row?.profile_picture_url === "string" ? row.profile_picture_url : null,
            is_active: typeof row?.is_active === "boolean" ? row.is_active : false,
            updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
          }
        })
        .filter(Boolean) as IgAccountRow[]
      setIgAccounts(normalized)
      setIgAccountsError(false)
    } catch {
      setIgAccounts([])
      setIgAccountsError(true)
    }
  }

  useEffect(() => {
    if (!igSelectorOpen) return
    let cancelled = false

    async function loadList() {
      setIgAccountsLoading(true)
      setIgAccountsError(false)
      setIgSwitchError(false)
      try {
        const r = await fetch("/api/user/ig-accounts/list", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })
        const j = (await r.json()) as any
        const rows: any[] = (j as any)?.ok === true && Array.isArray((j as any)?.accounts) ? (j as any).accounts : []
        const normalized = rows
          .map((row) => {
            const ig_user_id = typeof row?.ig_user_id === "string" ? row.ig_user_id.trim() : ""
            if (!ig_user_id) return null
            return {
              ig_user_id,
              username: typeof row?.username === "string" ? row.username : null,
              profile_picture_url: typeof row?.profile_picture_url === "string" ? row.profile_picture_url : null,
              is_active: typeof row?.is_active === "boolean" ? row.is_active : false,
              updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
            }
          })
          .filter(Boolean) as IgAccountRow[]

        if (!cancelled) setIgAccounts(normalized)
      } catch {
        if (!cancelled) {
          setIgAccounts([])
          setIgAccountsError(true)
        }
      } finally {
        if (!cancelled) setIgAccountsLoading(false)
      }
    }

    loadList()
    return () => {
      cancelled = true
    }
  }, [igSelectorOpen])

  const pending = Boolean((igSummary as any)?.pending)

  const linkedCount =
    igAccounts?.length && igAccounts.length > 0
      ? igAccounts.length
      : typeof (igSummary as any)?.linked_count === "number"
        ? Number((igSummary as any).linked_count)
        : 0

  const extraLinked = linkedCount > 1 ? linkedCount - 1 : 0

  const displayShort =
    typeof (igSummary as any)?.display?.ig_user_id_short === "string" ? String((igSummary as any).display.ig_user_id_short) : ""

  const displayUsername = typeof (igSummary as any)?.display?.username === "string" ? String((igSummary as any).display.username) : ""

  const igPillLabel = displayUsername ? `@${displayUsername.replace(/^@+/, "")}` : displayShort

  const pillText =
    igSummary === null
      ? `${dict.igHeaderLinkedPrefix} ${dict.igHeaderLoading}`
      : (igSummary as any)?.ok === true && linkedCount > 0
        ? `${dict.igHeaderLinkedPrefix} ${igPillLabel}${extraLinked > 0 ? ` (+${extraLinked})` : ""}`
        : `${dict.igHeaderLinkedPrefix} ${dict.igHeaderNotLinked}`

  const igSelectorCopy = useMemo(
    () => ({
      title: dict.igSelectorTitle,
      empty: dict.igSelectorEmpty,
      loading: dict.igSelectorLoading,
      close: dict.igSelectorClose,
      active: dict.igSelectorActive,
      switchFailed: dict.igSelectorSwitchFailed,
      pickerHint: dict.igSelectorMultiLinkedHint,
    }),
    [dict],
  )

  const reconnectLabel = isZh ? "重新連接 Instagram" : "Reconnect Instagram"

  const searchPlaceholder = isZh ? "搜尋 IG 帳號" : "Search IG accounts"

  const shortId = (raw: string) => {
    const s = String(raw || "").trim()
    if (!s) return ""
    if (s.length <= 10) return s
    return `${s.slice(0, 4)}…${s.slice(-3)}`
  }

  const oauthNext = encodeURIComponent(pathname || `/${locale}`)
  const oauthUrl = `/api/auth/instagram?locale=${encodeURIComponent(locale)}&next=${oauthNext}`

  const filteredAccounts = useMemo(() => {
    const q = String(query || "").trim().toLowerCase()
    if (!q) return igAccounts

    return igAccounts.filter((a) => {
      const uname = String(a.username || "").toLowerCase().replace(/^@+/, "")
      const id = String(a.ig_user_id || "").toLowerCase()
      return uname.includes(q.replace(/^@+/, "")) || id.includes(q)
    })
  }, [igAccounts, query])

  const switchActive = async (ig_user_id: string) => {
    const id = String(ig_user_id || "").trim()
    if (!id) return
    const current = igAccounts.find((a) => a.ig_user_id === id)
    if (current?.is_active) return
    if (igSwitchingId) return

    setIgSwitchingId(id)
    setIgSwitchError(false)
    try {
      const r = await fetch("/api/user/ig-accounts/set-active", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ig_user_id: id }),
      })
      const j = (await r.json()) as any
      if (!r.ok || (j as any)?.ok !== true) {
        setIgSwitchError(true)
        return
      }

      setIgAccounts((prev) =>
        prev.map((row) => ({
          ...row,
          is_active: row.ig_user_id === id,
        })),
      )

      setIgSummary((prev) => {
        if (!prev || (prev as any)?.ok !== true) return prev
        if (!current) return prev
        return {
          ...(prev as any),
          display: {
            ig_user_id: id,
            ig_user_id_short: shortId(id),
            updated_at: current.updated_at ?? null,
            username: current.username,
            profile_picture_url: current.profile_picture_url,
            is_active: true,
          },
        } as IgSummary
      })

      setIgSelectorOpen(false)
      setIgPickerHint(false)
      requestRouterRefresh()

      await Promise.all([refreshIgList(), refreshIgSummary()])
    } catch {
      setIgSwitchError(true)
    } finally {
      setIgSwitchingId("")
    }
  }

  const listItems = igAccountsLoading ? (
    <div className="p-3 text-sm text-white/60">{igSelectorCopy.loading}</div>
  ) : igAccountsError ? (
    <div className="p-3 text-sm text-white/60">{igSelectorCopy.empty}</div>
  ) : filteredAccounts.length ? (
    <>
      {igPickerHint ? <div className="px-3 pb-2 text-xs text-white/60">{igSelectorCopy.pickerHint}</div> : null}
      {igSwitchError ? <div className="px-3 pb-2 text-xs text-rose-200/80">{igSelectorCopy.switchFailed}</div> : null}
      {filteredAccounts.map((a) => {
        const label = a.username ? `@${a.username.replace(/^@+/, "")}` : `${dict.igHeaderLinkedPrefix} ${shortId(a.ig_user_id)}`
        const active = Boolean(a.is_active)
        const switching = igSwitchingId === a.ig_user_id
        return (
          <button
            key={a.ig_user_id}
            type="button"
            onClick={() => switchActive(a.ig_user_id)}
            disabled={switching || Boolean(igSwitchingId) || active}
            className={(active ? "bg-white/5" : "") + " w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left" + (switching ? " opacity-70" : "")}
          >
            <span className="h-9 w-9 rounded-full bg-white/5 border border-white/10 shrink-0 overflow-hidden">
              {a.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.profile_picture_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="h-full w-full inline-flex items-center justify-center text-xs text-white/40">IG</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white/90 min-w-0 truncate">{label}</span>
              {active ? <span className="block text-[11px] text-white/50">{igSelectorCopy.active}</span> : null}
            </span>
            <span className="shrink-0">
              {switching ? (
                <span className="h-4 w-4 inline-flex items-center justify-center text-[10px] text-white/60">…</span>
              ) : active ? (
                <Check className="h-4 w-4 text-emerald-200" />
              ) : (
                <span className="h-4 w-4" />
              )}
            </span>
          </button>
        )
      })}
    </>
  ) : (
    <div className="p-3 text-sm text-white/60">{igSelectorCopy.empty}</div>
  )

  return (
    <div ref={igSelectorRef} className="relative">
      <button
        type="button"
        onClick={() => setIgSelectorOpen((v) => !v)}
        className={
          BUTTON_BASE_CLASSES +
          " min-h-[44px] max-w-[70vw] sm:max-w-[360px]" +
          (igSelectorOpen ? " ring-2 ring-white/20" : "")
        }
        aria-label={pillText}
        title={displayUsername ? `@${displayUsername.replace(/^@+/, "")}` : displayShort}
        aria-haspopup="dialog"
        aria-expanded={igSelectorOpen}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Instagram className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline min-w-0 truncate">{pillText}</span>
        </span>
        <span className="sm:hidden relative shrink-0">
          {linkedCount > 0 ? (
            <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] leading-none border border-white/10 bg-white/10 text-white/80">
              {linkedCount}
            </span>
          ) : null}
        </span>
        {pending ? (
          <span className="hidden sm:inline ml-2 text-[10px] px-2 py-0.5 rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-100/80 whitespace-nowrap">
            {dict.igHeaderPendingBadge}
          </span>
        ) : null}
      </button>

      {igSelectorOpen && (
        <>
          <div className="hidden sm:block absolute right-0 mt-2 w-[360px] max-w-[92vw] rounded-xl border border-white/10 bg-[#0b1220]/90 backdrop-blur-md shadow-xl overflow-hidden z-[100]">
            <div className="h-12 px-3 flex items-center justify-between border-b border-white/10">
              <div className="text-sm font-semibold text-white/90 min-w-0 truncate">{igSelectorCopy.title}</div>
              <button
                type="button"
                onClick={() => setIgSelectorOpen(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
                aria-label={igSelectorCopy.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-2 border-b border-white/10">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <div className="p-1">
                <div className="p-2">
                  <Link
                    href={oauthUrl}
                    className="w-full inline-flex items-center justify-center h-10 rounded-lg border border-white/10 bg-white/5 text-sm text-white/85 hover:bg-white/10"
                  >
                    {reconnectLabel}
                  </Link>
                </div>
                {listItems}
              </div>
            </div>
          </div>

          <div className={`sm:hidden fixed inset-0 z-[120] ${igSelectorOpen ? "" : "pointer-events-none"}`}>
            <div
              className={`absolute inset-0 bg-black/60 transition-opacity ${igSelectorOpen ? "opacity-100" : "opacity-0"}`}
              onClick={() => setIgSelectorOpen(false)}
            />
            <div
              className={`absolute inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl bg-slate-950/95 border-t border-white/10 backdrop-blur transition-transform ${
                igSelectorOpen ? "translate-y-0" : "translate-y-full"
              }`}
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
                <div className="text-sm font-semibold text-white/90 min-w-0 truncate">{igSelectorCopy.title}</div>
                <button
                  type="button"
                  className="h-10 px-3 rounded-lg border border-white/10 bg-white/5 text-xs text-white/80 hover:bg-white/10"
                  onClick={() => setIgSelectorOpen(false)}
                >
                  {igSelectorCopy.close}
                </button>
              </div>

              <div className="p-2 overflow-auto" style={{ maxHeight: "calc(82vh - 56px)" }}>
                <div className="p-1">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="h-11 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                </div>

                {igAccountsLoading ? (
                  <div className="p-3 text-sm text-white/60">{igSelectorCopy.loading}</div>
                ) : igAccountsError ? (
                  <div className="p-3 text-sm text-white/60">{igSelectorCopy.empty}</div>
                ) : (
                  <div className="space-y-1">
                    <div className="p-1">
                      <Link
                        href={oauthUrl}
                        className="w-full inline-flex items-center justify-center h-11 rounded-xl border border-white/10 bg-white/5 text-sm text-white/85 hover:bg-white/10"
                      >
                        {reconnectLabel}
                      </Link>
                    </div>

                    {igPickerHint ? <div className="px-3 pb-1 text-xs text-white/60">{igSelectorCopy.pickerHint}</div> : null}
                    {igSwitchError ? <div className="px-3 pb-1 text-xs text-rose-200/80">{igSelectorCopy.switchFailed}</div> : null}

                    {(filteredAccounts.length ? filteredAccounts : []).map((a) => {
                      const label = a.username ? `@${a.username.replace(/^@+/, "")}` : `${dict.igHeaderLinkedPrefix} ${shortId(a.ig_user_id)}`
                      const active = Boolean(a.is_active)
                      const switching = igSwitchingId === a.ig_user_id
                      return (
                        <button
                          key={a.ig_user_id}
                          type="button"
                          onClick={() => switchActive(a.ig_user_id)}
                          disabled={switching || Boolean(igSwitchingId) || active}
                          className={
                            (active ? "bg-white/5" : "") +
                            " w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left min-h-[52px]" +
                            (switching ? " opacity-70" : "")
                          }
                        >
                          <span className="h-10 w-10 rounded-full bg-white/5 border border-white/10 shrink-0 overflow-hidden">
                            {a.profile_picture_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.profile_picture_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="h-full w-full inline-flex items-center justify-center text-xs text-white/40">IG</span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-white/90 min-w-0 truncate">{label}</span>
                            {active ? <span className="block text-[11px] text-white/50">{igSelectorCopy.active}</span> : null}
                          </span>
                          <span className="shrink-0">
                            {switching ? (
                              <span className="h-5 w-5 inline-flex items-center justify-center text-xs text-white/60">…</span>
                            ) : active ? (
                              <Check className="h-5 w-5 text-emerald-200" />
                            ) : (
                              <span className="h-5 w-5" />
                            )}
                          </span>
                        </button>
                      )
                    })}

                    {!filteredAccounts.length ? <div className="p-3 text-sm text-white/60">{igSelectorCopy.empty}</div> : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
