import { useEffect, useRef, useCallback } from "react";
import type { WsEvent } from "@twenty-twenty/shared";

const WS_URL = (import.meta.env.PUBLIC_API_URL || "http://localhost:3001").replace(/^http/, "ws");

export function useSessionWebSocket(
  sessionId: string | null,
  onEvent: (event: WsEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(`${WS_URL}/api/ws?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsEvent;
        onEventRef.current(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  return wsRef;
}
