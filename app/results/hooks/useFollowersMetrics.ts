import { useMemo } from "react"

export function useFollowersMetrics(input: {
  focusedMetric: string
  followersDailyRows: Array<{ day: string; followers_count: number }>
  followersLastWriteAt: string | null
}): {
  isFollowersFocused: boolean
  seriesValues: number[]
  totalFollowers: number | null
  deltaYesterday: number | null
  growth7d: number | null
  growth30d: number | null
  deltasByIndex: Array<number | null>
  lastDataDay: string | null
  lastWriteAt: string | null
} {
  const { focusedMetric, followersDailyRows, followersLastWriteAt } = input

  return useMemo(() => {
    const isFollowersFocused = focusedMetric === "followers"
    if (!isFollowersFocused) {
      return {
        isFollowersFocused,
        seriesValues: [] as number[],
        totalFollowers: null,
        deltaYesterday: null,
        growth7d: null,
        growth30d: null,
        deltasByIndex: [] as Array<number | null>,
        lastDataDay: null,
        lastWriteAt: followersLastWriteAt,
      }
    }

    const list = Array.isArray(followersDailyRows) ? followersDailyRows : []
    const baseValues = list
      .map((r) => {
        const n = typeof r.followers_count === "number" ? r.followers_count : Number(r.followers_count)
        return Number.isFinite(n) ? Math.floor(n) : null
      })
      .filter((x): x is number => typeof x === "number")

    const seriesValues =
      baseValues.length === 1
        ? ([baseValues[0], baseValues[0]] as number[])
        : (baseValues as number[])

    const totalFollowers = seriesValues.length >= 1 ? seriesValues[seriesValues.length - 1] : null
    const deltaYesterday =
      seriesValues.length >= 2 ? seriesValues[seriesValues.length - 1] - seriesValues[seriesValues.length - 2] : null

    const growth7d = (() => {
      const n = seriesValues.length
      if (n < 8) return null
      const last = seriesValues[n - 1]
      const base = seriesValues[Math.max(0, n - 1 - 7)]
      if (typeof last !== "number" || !Number.isFinite(last)) return null
      if (typeof base !== "number" || !Number.isFinite(base)) return null
      return last - base
    })()

    const growth30d = (() => {
      const n = seriesValues.length
      if (n < 31) return null
      const last = seriesValues[n - 1]
      const base = seriesValues[Math.max(0, n - 1 - 30)]
      if (typeof last !== "number" || !Number.isFinite(last)) return null
      if (typeof base !== "number" || !Number.isFinite(base)) return null
      return last - base
    })()

    const deltasByIndex: Array<number | null> = (() => {
      if (seriesValues.length < 1) return []
      return seriesValues.map((v, i) => {
        if (i === 0) return null
        const prev = seriesValues[i - 1]
        if (typeof v !== "number" || !Number.isFinite(v)) return null
        if (typeof prev !== "number" || !Number.isFinite(prev)) return null
        return v - prev
      })
    })()

    const lastDataDay = (() => {
      const list = Array.isArray(followersDailyRows) ? followersDailyRows : []
      const raw = list.length >= 1 ? list[list.length - 1]?.day : null
      return typeof raw === "string" && raw.trim() ? raw.trim() : null
    })()

    return {
      isFollowersFocused,
      seriesValues,
      totalFollowers,
      deltaYesterday,
      growth7d,
      growth30d,
      deltasByIndex,
      lastDataDay,
      lastWriteAt: followersLastWriteAt,
    }
  }, [focusedMetric, followersDailyRows, followersLastWriteAt])
}
