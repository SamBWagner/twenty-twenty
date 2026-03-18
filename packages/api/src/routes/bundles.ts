import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";

export const bundleRoutes = new Hono();

// Get all bundles for a session
bundleRoutes.get("/sessions/:sid/bundles", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return c.json({ error: "Not found" }, 404);

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);

  const bundles = await db.select().from(schema.bundles).where(eq(schema.bundles.sessionId, sid));
  const result = await Promise.all(
    bundles.map(async (bundle) => {
      const items = await db
        .select({ itemId: schema.bundleItems.itemId })
        .from(schema.bundleItems)
        .where(eq(schema.bundleItems.bundleId, bundle.id));
      return { ...bundle, itemIds: items.map((i) => i.itemId) };
    }),
  );

  return c.json(result);
});

// Create bundle (action phase only)
bundleRoutes.post("/sessions/:sid/bundles", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "action") return c.json({ error: "Bundles only during action phase" }, 400);

  const body = await c.req.json<{ label?: string; itemIds?: string[] }>();

  const bundle = {
    id: newId(),
    sessionId: sid,
    label: body.label?.trim() || null,
    createdAt: new Date(),
  };

  await db.insert(schema.bundles).values(bundle);

  if (body.itemIds?.length) {
    await db.insert(schema.bundleItems).values(
      body.itemIds.map((itemId) => ({ bundleId: bundle.id, itemId })),
    );
  }

  const itemIds = body.itemIds || [];
  broadcast(sid, {
    type: "bundle:created",
    payload: { id: bundle.id, label: bundle.label, itemIds },
  }, user.id);

  return c.json({ ...bundle, itemIds }, 201);
});

// Update bundle
bundleRoutes.patch("/sessions/:sid/bundles/:bid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const bid = c.req.param("bid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "action") return c.json({ error: "Bundles only during action phase" }, 400);

  const bundle = await db.select().from(schema.bundles).where(eq(schema.bundles.id, bid)).get();
  if (!bundle || bundle.sessionId !== sid) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{ label?: string; itemIds?: string[] }>();

  if (body.label !== undefined) {
    await db.update(schema.bundles).set({ label: body.label?.trim() || null }).where(eq(schema.bundles.id, bid));
  }

  if (body.itemIds !== undefined) {
    // Replace all items
    await db.delete(schema.bundleItems).where(eq(schema.bundleItems.bundleId, bid));
    if (body.itemIds.length) {
      await db.insert(schema.bundleItems).values(
        body.itemIds.map((itemId) => ({ bundleId: bid, itemId })),
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
    payload: { id: bid, label: body.label?.trim() || bundle.label, itemIds },
  }, user.id);

  return c.json({ id: bid, label: body.label?.trim() || bundle.label, itemIds });
});

// Delete bundle
bundleRoutes.delete("/sessions/:sid/bundles/:bid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const bid = c.req.param("bid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "action") return c.json({ error: "Bundles only during action phase" }, 400);

  await db.delete(schema.bundles).where(eq(schema.bundles.id, bid));
  broadcast(sid, { type: "bundle:deleted", payload: { id: bid } }, user.id);

  return c.json({ ok: true });
});
