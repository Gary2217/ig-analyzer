import { useEffect, useMemo, useRef, useState } from "react"

type FetchStatus = "idle" | "running" | "success" | "error"

type ResourceState = {
  status: FetchStatus
  lastStartAt?: number
  lastSuccessAt?: number
  lastErrorAt?: number
  error?: unknown
  requestKey?: string
  runCount: number
  dedupedCount: number
}

type OrchestratorDebug = {
  media: ResourceState
  trend: ResourceState
  snapshot: ResourceState
}

type Deps = {
  isConnectedInstagram: boolean
  refreshSeq: number

  // provide stable functions (memoized) or wrap them here
  fetchMedia: () => Promise<void>
  fetchTrend: () => Promise<void>
  fetchSnapshot: () => Promise<void>

  // optional: feature flags
  enableMedia?: boolean
  enableTrend?: boolean
  enableSnapshot?: boolean

  // request key builders (so same params won't refetch)
  mediaKey?: string
  trendKey?: string
  snapshotKey?: string
}

function initState(): ResourceState {
  return { status: "idle", runCount: 0, dedupedCount: 0 }
}

export function useResultsOrchestrator(deps: Deps) {
  const {
    isConnectedInstagram,
    refreshSeq,
    fetchMedia,
    fetchTrend,
    fetchSnapshot,
    enableMedia = true,
    enableTrend = true,
    enableSnapshot = true,
    mediaKey = "media",
    trendKey = "trend",
    snapshotKey = "snapshot",
  } = deps

  const [media, setMedia] = useState<ResourceState>(initState)
  const [trend, setTrend] = useState<ResourceState>(initState)
  const [snapshot, setSnapshot] = useState<ResourceState>(initState)

  const inFlightRef = useRef<Record<string, boolean>>({})
  const lastKeyRef = useRef<Record<string, string | undefined>>({})

  const run = async (
    name: "media" | "trend" | "snapshot",
    key: string,
    enabled: boolean,
    fn: () => Promise<void>,
    setState: (updater: (s: ResourceState) => ResourceState) => void,
  ) => {
    if (!enabled) return
    if (!isConnectedInstagram) return

    const prevKey = lastKeyRef.current[name]
    const isSameKey = prevKey === key
    void isSameKey

    if (inFlightRef.current[name]) {
      setState((s) => ({ ...s, dedupedCount: s.dedupedCount + 1 }))
      return
    }

    lastKeyRef.current[name] = key

    inFlightRef.current[name] = true
    const now = Date.now()
    setState((s) => ({
      ...s,
      status: "running",
      lastStartAt: now,
      requestKey: key,
      runCount: s.runCount + 1,
      error: undefined,
    }))

    try {
      await fn()
      setState((s) => ({
        ...s,
        status: "success",
        lastSuccessAt: Date.now(),
      }))
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        lastErrorAt: Date.now(),
        error: err,
      }))
    } finally {
      inFlightRef.current[name] = false
    }
  }

  const debug: OrchestratorDebug = useMemo(() => ({ media, trend, snapshot }), [media, trend, snapshot])

  useEffect(() => {
    // Do not change init behavior: only run orchestration on explicit refresh.
    if (refreshSeq <= 0) return

    void run("snapshot", snapshotKey, enableSnapshot, fetchSnapshot, setSnapshot)
    void run("trend", trendKey, enableTrend, fetchTrend, setTrend)
    void run("media", mediaKey, enableMedia, fetchMedia, setMedia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnectedInstagram, refreshSeq, enableSnapshot, enableTrend, enableMedia, snapshotKey, trendKey, mediaKey])

  return { orchestratorDebug: debug }
}
