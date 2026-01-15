import { Suspense } from "react"
import DemoToolPanel from "./[locale]/components/demo-tool-panel"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <div className="min-h-[calc(100dvh-220px)] flex items-center justify-center">
        <div className="w-full max-w-5xl mx-auto">
          <DemoToolPanel activeLocale="en" isConnectedFromServer={false} checking={false} />
        </div>
      </div>
    </Suspense>
  )
}
