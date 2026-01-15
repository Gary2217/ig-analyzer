import { useMemo } from "react"

export function FollowersStatChips(props: {
  totalFollowers: number | null
  deltaYesterday: number | null
  growth7d: number | null
}) {
  const { totalFollowers, deltaYesterday, growth7d } = props

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

  return (
    <div className="w-full sm:w-auto min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full overflow-hidden">
        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[110px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Followers 粉絲總數</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{totalText}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[110px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Δ Yesterday 昨日增加</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{deltaText}</div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 min-w-0 min-w-[110px] max-w-full">
          <div className="text-[10px] leading-tight text-white/60 min-w-0 truncate">Net 7d 近 7 天</div>
          <div className="text-xs font-semibold text-white tabular-nums leading-tight whitespace-nowrap">{growth7dText}</div>
        </div>
      </div>
    </div>
  )
}
