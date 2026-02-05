"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useInstagramMe } from "../../lib/useInstagramMe";

type Props = {
  connectedUI: React.ReactNode;
  notConnectedUI: React.ReactNode;
};

export default function ConnectedGate({ connectedUI, notConnectedUI }: Props) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const me = useInstagramMe({ enabled: true })

  useEffect(() => {
    setLoading(Boolean(me.loading))
    setConnected(Boolean((me.data as any)?.connected === true))
  }, [me.data, me.loading]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="text-sm font-semibold text-white/90 min-w-0 break-words [overflow-wrap:anywhere]">
            載入中… / Loading…
          </div>
          <div className="mt-2 text-[13px] sm:text-sm text-white/70 min-w-0 break-words [overflow-wrap:anywhere] leading-snug">
            正在確認 Instagram 連結狀態，請稍候。 / Checking your Instagram connection status.
          </div>
          <div className="mt-4">
            <div className="h-10 w-full rounded-xl bg-white/10 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return connected ? connectedUI : notConnectedUI;
}
