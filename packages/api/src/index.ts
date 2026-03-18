import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { auth } from "./auth/index.js";
import { projectRoutes } from "./routes/projects.js";
import { sessionRoutes } from "./routes/sessions.js";
import { itemRoutes } from "./routes/items.js";
import { bundleRoutes } from "./routes/bundles.js";
import { actionRoutes } from "./routes/actions.js";
import { reviewRoutes } from "./routes/reviews.js";
import { createWsHandler } from "./ws/handler.js";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// CORS for the web frontend
app.use(
  "/api/*",
  cors({
    origin: process.env.WEB_URL || "http://localhost:4321",
    credentials: true,
    allowHeaders: ["Content-Type"],
  }),
);

// Health check
app.get("/api/health", (c) => c.json({ ok: true }));

// Auth routes (better-auth handles /api/auth/*)
app.all("/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// API routes
app.route("/api", projectRoutes);
app.route("/api", sessionRoutes);
app.route("/api", itemRoutes);
app.route("/api", bundleRoutes);
app.route("/api", actionRoutes);
app.route("/api", reviewRoutes);

// WebSocket
const wsHandler = createWsHandler(upgradeWebSocket);
app.get("/api/ws", wsHandler);

const port = parseInt(process.env.API_PORT || "3001", 10);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on http://localhost:${port}`);
});

injectWebSocket(server);
