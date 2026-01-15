import { useMemo } from "react"

export function FollowersStatChips(props: {
  totalFollowers: number | null
  deltaYesterday: number | null
  growth7d: number | null
  growth30d: number | null
  lastDataDay: string | null
}) {
  const { totalFollowers, deltaYesterday, growth7d, growth30d, lastDataDay } = props

  const totalText = useMemo(() => {
    return typeof totalFollowers === "number" && Number.isFinite(totalFollowers) ? Math.round(totalFollowers).toLocaleString() : "—"
  }, [totalFollowers])

  const deltaText = useMemo(() => {
    return typeof deltaYesterday === "number" && Number.isFinite(deltaYesterday)
      ? `${deltaYesterday >= 0 ? "+" : ""}${Math.round(deltaYesterday).toLocaleString()}`
      : "—"
  }, [deltaYesterday])

  const growth7dText = useMemo(() => {
    return typeof growth7d === "number" && Number.isFinite(growth7d)
      ? `${growth7d >= 0 ? "+" : ""}${Math.round(growth7d).toLocaleString()}`
      : "—"
  }, [growth7d])

  const growth30dText = useMemo(() => {
    return typeof growth30d === "number" && Number.isFinite(growth30d)
      ? `${growth30d >= 0 ? "+" : ""}${Math.round(growth30d).toLocaleString()}`
      : "—"
  }, [growth30d])

  const lastUpdated = useMemo(() => {
    const day = typeof lastDataDay === "string" && lastDataDay.trim() ? lastDataDay.trim() : "—"
    return { zh: `最後更新：${day}`, en: `Last updated: ${day}` }
  }, [lastDataDay])

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <div className="text-[10px] leading-tight text-white/60 min-w-0 max-w-full overflow-hidden">
        <div className="truncate min-w-0">{lastUpdated.zh}</div>
        <div className="truncate min-w-0">{lastUpdated.en}</div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 min-w-0 max-w-full overflow-hidden">
        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[120px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Followers 粉絲總數</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{totalText}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[120px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Δ Yesterday 昨日增加</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{deltaText}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[120px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Last 7 days 近 7 天增長</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{growth7dText}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[120px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Last 30 days 近 30 天增長</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{growth30dText}</div>
        </div>
      </div>
    </div>
  )
}
