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
  deltasByIndex: Array<number | null>
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
        deltasByIndex: [] as Array<number | null>,
        lastWriteAt: followersLastWriteAt,
      }
    }

    const list = Array.isArray(followersDailyRows) ? followersDailyRows : []
    const baseValues = list
      .map((r) => {
        const n = typeof r?.followers_count === "number" ? r.followers_count : Number((r as any)?.followers_count)
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

    return {
      isFollowersFocused,
      seriesValues,
      totalFollowers,
      deltaYesterday,
      deltasByIndex,
      lastWriteAt: followersLastWriteAt,
    }
  }, [focusedMetric, followersDailyRows, followersLastWriteAt])
}
