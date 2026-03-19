import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "./app.js";
import { createWsHandler } from "./ws/handler.js";

const app = createApp();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// WebSocket
const wsHandler = createWsHandler(upgradeWebSocket);
app.get("/api/ws", wsHandler);

const port = parseInt(process.env.API_PORT || "3001", 10);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on http://localhost:${port}`);
});

injectWebSocket(server);
