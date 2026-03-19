import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { bundleSchema, updateBundleBodySchema } from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { jsonError, parseJsonBody, toIsoString } from "../lib/http.js";

export const bundleRoutes = new Hono();

// Get all bundles for a session
bundleRoutes.get("/sessions/:sid/bundles", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");

  const bundles = await db.select().from(schema.bundles).where(eq(schema.bundles.sessionId, sid));
  const result = await Promise.all(
    bundles.map(async (bundle) => {
      const items = await db
        .select({ itemId: schema.bundleItems.itemId })
        .from(schema.bundleItems)
        .where(eq(schema.bundleItems.bundleId, bundle.id));
      return bundleSchema.parse({
        id: bundle.id,
        sessionId: bundle.sessionId,
        label: bundle.label,
        createdAt: toIsoString(bundle.createdAt),
        itemIds: items.map((i) => i.itemId),
      });
    }),
  );

  return c.json(result);
});

// Create bundle (action phase only)
bundleRoutes.post("/sessions/:sid/bundles", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "action") return jsonError(c, 400, "invalid_phase", "Bundles are only available during the action phase.");

  const parsed = await parseJsonBody(c, updateBundleBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const bundle = {
    id: newId(),
    sessionId: sid,
    label: parsed.data.label?.trim() || null,
    createdAt: new Date(),
  };

  await db.insert(schema.bundles).values(bundle);

  if (parsed.data.itemIds?.length) {
    await db.insert(schema.bundleItems).values(
      parsed.data.itemIds.map((itemId) => ({ bundleId: bundle.id, itemId })),
    );
  }

  const itemIds = parsed.data.itemIds || [];
  broadcast(sid, {
    type: "bundle:created",
    payload: { id: bundle.id, label: bundle.label, itemIds },
  }, user.id);

  return c.json(bundleSchema.parse({
    id: bundle.id,
    sessionId: bundle.sessionId,
    label: bundle.label,
    createdAt: toIsoString(bundle.createdAt),
    itemIds,
  }), 201);
});

// Update bundle
bundleRoutes.patch("/sessions/:sid/bundles/:bid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const bid = c.req.param("bid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "action") return jsonError(c, 400, "invalid_phase", "Bundles are only available during the action phase.");

  const bundle = await db.select().from(schema.bundles).where(eq(schema.bundles.id, bid)).get();
  if (!bundle || bundle.sessionId !== sid) return jsonError(c, 404, "not_found", "Bundle not found.");

  const parsed = await parseJsonBody(c, updateBundleBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  if (parsed.data.label !== undefined) {
    await db.update(schema.bundles).set({ label: parsed.data.label?.trim() || null }).where(eq(schema.bundles.id, bid));
  }

  if (parsed.data.itemIds !== undefined) {
    // Replace all items
    await db.delete(schema.bundleItems).where(eq(schema.bundleItems.bundleId, bid));
    if (parsed.data.itemIds.length) {
      await db.insert(schema.bundleItems).values(
        parsed.data.itemIds.map((itemId) => ({ bundleId: bid, itemId })),
      );
    }
  }

  const items = await db
    .select({ itemId: schema.bundleItems.itemId })
    .from(schema.bundleItems)
    .where(eq(schema.bundleItems.bundleId, bid));

  const itemIds = items.map((i) => i.itemId);
  broadcast(sid, {
    type: "bundle:updated",
    payload: { id: bid, label: parsed.data.label?.trim() || bundle.label, itemIds },
  }, user.id);

  return c.json(bundleSchema.parse({
    id: bid,
    sessionId: sid,
    label: parsed.data.label?.trim() || bundle.label,
    createdAt: toIsoString(bundle.createdAt),
    itemIds,
  }));
});

// Delete bundle
bundleRoutes.delete("/sessions/:sid/bundles/:bid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const bid = c.req.param("bid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "action") return jsonError(c, 400, "invalid_phase", "Bundles are only available during the action phase.");

  await db.delete(schema.bundles).where(eq(schema.bundles.id, bid));
  broadcast(sid, { type: "bundle:deleted", payload: { id: bid } }, user.id);

  return c.json({ ok: true });
});
