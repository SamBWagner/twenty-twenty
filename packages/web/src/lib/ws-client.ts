import { useEffect, useRef } from "react";
import type { WsEvent } from "@twenty-twenty/shared";
import { getPublicWebSocketBaseUrl } from "./runtime-urls";

export function useSessionWebSocket(
  sessionId: string | null,
  onEvent: (event: WsEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(`${getPublicWebSocketBaseUrl()}/api/v1/ws?sessionId=${sessionId}`);
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
