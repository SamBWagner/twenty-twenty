import WebSocket from "ws";

interface WsHelper {
  ws: WebSocket;
  waitForEvent: (type: string, timeout?: number) => Promise<any>;
  close: () => void;
}

/**
 * Connect a raw WebSocket to the API for real-time event testing.
 * The WS handler authenticates via the session cookie.
 */
export function connectWs(
  sessionId: string,
  sessionToken: string,
): Promise<WsHelper> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://localhost:3001/api/ws?sessionId=${sessionId}`,
      {
        headers: {
          Cookie: `better-auth.session_token=${sessionToken}`,
        },
      },
    );

    const events: any[] = [];
    const listeners: Array<{
      type: string;
      resolve: (data: any) => void;
      reject: (err: Error) => void;
    }> = [];

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        events.push(data);

        // Check if any listener is waiting for this event type
        const idx = listeners.findIndex((l) => l.type === data.type);
        if (idx >= 0) {
          const listener = listeners.splice(idx, 1)[0];
          listener.resolve(data);
        }
      } catch {
        // ignore non-JSON messages
      }
    });

    ws.on("open", () => {
      resolve({
        ws,
        waitForEvent(type: string, timeout = 5000): Promise<any> {
          // Check if already received
          const idx = events.findIndex((e) => e.type === type);
          if (idx >= 0) {
            return Promise.resolve(events.splice(idx, 1)[0]);
          }

          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const listenerIdx = listeners.findIndex(
                (l) => l.resolve === res,
              );
              if (listenerIdx >= 0) listeners.splice(listenerIdx, 1);
              rej(new Error(`Timed out waiting for WS event: ${type}`));
            }, timeout);

            listeners.push({
              type,
              resolve: (data) => {
                clearTimeout(timer);
                res(data);
              },
              reject: rej,
            });
          });
        },
        close() {
          ws.close();
        },
      });
    });

    ws.on("error", reject);
  });
}
