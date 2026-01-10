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

  if (loading) return notConnectedUI;

  return connected ? connectedUI : notConnectedUI;
}
