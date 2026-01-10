import { Suspense } from "react"
import DemoToolPanel from "./[locale]/components/demo-tool-panel"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DemoToolPanel activeLocale="en" isConnectedFromServer={false} checking={false} />
    </Suspense>
  )
}
