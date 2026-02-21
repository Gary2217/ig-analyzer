import ResultsClient from "../../results/ResultsClient"

export default function ResultsPage() {
  // Removed blocking SSR fetch to /api/instagram/daily-snapshot.
  // That fetch called IG Graph API synchronously, blocking first paint by several seconds.
  // ResultsClient fetches client-side on mount when initialDailySnapshot is null.
  return <ResultsClient initialDailySnapshot={null} />
}
