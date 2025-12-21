"use client";

import type React from "react";
import { useEffect, useState } from "react";

type Props = {
  connectedUI: React.ReactNode;
  notConnectedUI: React.ReactNode;
};

export default function ConnectedGate({ connectedUI, notConnectedUI }: Props) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setConnected(Boolean(data?.instagramConnected));
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return notConnectedUI;

  return connected ? connectedUI : notConnectedUI;
}
