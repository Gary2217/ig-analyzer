import { Suspense } from "react"
import PostAnalysisClient from "./PostAnalysisClient"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PostAnalysisClient />
    </Suspense>
  )
}
