import type { GraphErrorBody } from "./types"

export type GraphApiError = {
  status: number
  message: string
  code?: number
  fbtrace_id?: string
  raw?: unknown
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function redactAccessToken(input: unknown): unknown {
  try {
    const raw = typeof input === "string" ? input : JSON.stringify(input)
    const redacted = raw.replace(/access_token=([^&\s]+)/gi, "access_token=***REDACTED***")
    return safeJsonParse(redacted) ?? redacted
  } catch {
    return null
  }
}

export async function graphGet<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const token = (process.env.IG_ACCESS_TOKEN ?? "").trim()
  const version = (process.env.GRAPH_API_VERSION ?? "v24.0").trim() || "v24.0"

  if (!path.startsWith("/")) {
    throw { status: 500, message: `invalid_graph_path:${path}` } satisfies GraphApiError
  }

  const base = `https://graph.facebook.com/${version}${path}`
  const url = new URL(base)

  const sp = url.searchParams
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue
      sp.set(k, String(v))
    }
  }
  sp.set("access_token", token)

  const timeoutMs = 15_000
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  const onAbort = () => {
    try {
      ac.abort()
    } catch {
      // ignore
    }
  }

  if (signal) {
    if (signal.aborted) onAbort()
    else signal.addEventListener("abort", onAbort, { once: true })
  }

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: ac.signal,
    })

    const text = await res.text()
    const json = safeJsonParse(text)

    if (!res.ok) {
      const body = (json ?? {}) as GraphErrorBody
      const message =
        (typeof body?.error?.message === "string" && body.error.message) ||
        (typeof body?.message === "string" && body.message) ||
        `graph_error_http_${res.status}`

      const err: GraphApiError = {
        status: res.status,
        message,
        code: typeof body?.error?.code === "number" ? body.error.code : typeof body?.code === "number" ? body.code : undefined,
        fbtrace_id:
          (typeof body?.error?.fbtrace_id === "string" ? body.error.fbtrace_id : undefined) ||
          (typeof body?.fbtrace_id === "string" ? body.fbtrace_id : undefined),
        raw: redactAccessToken(json ?? text),
      }

      throw err
    }

    return (json as T) ?? ({} as T)
  } catch (e: any) {
    if (e && typeof e === "object" && typeof e.status === "number" && typeof e.message === "string") {
      throw e
    }

    const err: GraphApiError = {
      status: 500,
      message: e?.name === "AbortError" ? "graph_request_timeout" : e?.message ? String(e.message) : String(e),
      raw: redactAccessToken(e),
    }
    throw err
  } finally {
    clearTimeout(timer)
    if (signal) {
      try {
        signal.removeEventListener("abort", onAbort)
      } catch {
        // ignore
      }
    }
  }
}
