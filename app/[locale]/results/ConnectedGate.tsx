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
    const controller = new AbortController();
    let cancelled = false;

    fetch("/api/auth/instagram/me", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then((r) => {
        if (cancelled) return;
        setConnected(r.ok);
      })
      .catch(() => {
        if (cancelled) return;
        setConnected(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      try {
        setLoading(false);
      } catch {
        // ignore
      }
    };
  }, []);

  if (loading) return notConnectedUI;

  return connected ? connectedUI : notConnectedUI;
}
