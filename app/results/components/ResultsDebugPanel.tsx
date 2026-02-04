import React from "react"

type Props = {
  refreshDebug: unknown
  orchestratorDebug: unknown
}

export function ResultsDebugPanel({ refreshDebug, orchestratorDebug }: Props) {
  if (process.env.NODE_ENV !== "development") return null

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: "min(380px, calc(100vw - 24px))",
        maxHeight: "min(520px, calc(100vh - 24px))",
        overflow: "auto",
        background: "rgba(0,0,0,0.85)",
        color: "white",
        padding: 12,
        borderRadius: 12,
        fontSize: 12,
        zIndex: 99999,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Results Health / Debug</div>

      <div style={{ opacity: 0.9, marginBottom: 10 }}>
        <div style={{ fontWeight: 600 }}>Refresh Controller</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(refreshDebug, null, 2)}</pre>
      </div>

      <div style={{ opacity: 0.9 }}>
        <div style={{ fontWeight: 600 }}>Orchestrator</div>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(orchestratorDebug, null, 2)}</pre>
      </div>
    </div>
  )
}
