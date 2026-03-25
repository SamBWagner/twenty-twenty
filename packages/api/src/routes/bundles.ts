import { Hono } from "hono";
import { jsonError } from "../lib/http.js";

export const bundleRoutes = new Hono();

// Bundles have been removed — actions are now linked directly to sessions.
bundleRoutes.all("/sessions/:sid/bundles", (c) =>
  jsonError(c, 410, "gone", "Action groups have been removed. Actions are now linked directly to sessions."),
);
bundleRoutes.all("/sessions/:sid/bundles/:bid", (c) =>
  jsonError(c, 410, "gone", "Action groups have been removed. Actions are now linked directly to sessions."),
);
