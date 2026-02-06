import { cookies, headers } from "next/headers"
import ResultsClient from "../../results/ResultsClient"

async function getBaseUrl() {
  const h = (await headers()) as unknown as { get: (key: string) => string | null }
  const proto = h.get("x-forwarded-proto") ?? "https"
  const host = h.get("x-forwarded-host") ?? h.get("host")
  return `${proto}://${host}`
}

export default async function ResultsPage() {
  // SSR preheat default range (90) so first paint has chart data.
  // We forward cookies so the API resolves the correct tenant/user.
  const cookieHeader = (await cookies()).toString()
  const url = `${await getBaseUrl()}/api/instagram/daily-snapshot?days=90`

  let initialDailySnapshot: any = null
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
      },
    })
    const ct = (res.headers.get("content-type") ?? "").toLowerCase()
    if (res.ok && ct.includes("application/json")) {
      const json = await res.json().catch(() => null)
      if (json && json.ok === true) initialDailySnapshot = json
    }
  } catch {
    // SSR preheat is best-effort; client will fetch normally if this fails.
  }

  return <ResultsClient initialDailySnapshot={initialDailySnapshot} />
}
