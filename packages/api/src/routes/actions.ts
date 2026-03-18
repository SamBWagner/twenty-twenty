import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";

export const actionRoutes = new Hono();

// Get all actions for a session
actionRoutes.get("/sessions/:sid/actions", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return c.json({ error: "Not found" }, 404);

  const actions = await db.select().from(schema.actions).where(eq(schema.actions.sessionId, sid));
  return c.json(actions);
});

// Create action (action phase only)
actionRoutes.post("/sessions/:sid/actions", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "action") return c.json({ error: "Actions only during action phase" }, 400);

  const body = await c.req.json<{ description: string; bundleId?: string; assigneeId?: string }>();
  if (!body.description?.trim()) return c.json({ error: "Description is required" }, 400);

  const action = {
    id: newId(),
    sessionId: sid,
    bundleId: body.bundleId || null,
    description: body.description.trim(),
    assigneeId: body.assigneeId || null,
    createdAt: new Date(),
  };

  await db.insert(schema.actions).values(action);

  broadcast(sid, {
    type: "action:created",
    payload: {
      id: action.id,
      description: action.description,
      bundleId: action.bundleId,
      assigneeId: action.assigneeId,
    },
  }, user.id);

  return c.json(action, 201);
});

// Update action
actionRoutes.patch("/sessions/:sid/actions/:aid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const aid = c.req.param("aid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "action") return c.json({ error: "Actions only during action phase" }, 400);

  const action = await db.select().from(schema.actions).where(eq(schema.actions.id, aid)).get();
  if (!action || action.sessionId !== sid) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<{ description?: string; bundleId?: string; assigneeId?: string }>();
  const updates: Record<string, unknown> = {};
  if (body.description?.trim()) updates.description = body.description.trim();
  if (body.bundleId !== undefined) updates.bundleId = body.bundleId || null;
  if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId || null;

  await db.update(schema.actions).set(updates).where(eq(schema.actions.id, aid));
  const updated = await db.select().from(schema.actions).where(eq(schema.actions.id, aid)).get();

  broadcast(sid, {
    type: "action:updated",
    payload: {
      id: updated!.id,
      description: updated!.description,
      bundleId: updated!.bundleId,
      assigneeId: updated!.assigneeId,
    },
  }, user.id);

  return c.json(updated);
});

// Delete action
actionRoutes.delete("/sessions/:sid/actions/:aid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const aid = c.req.param("aid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "action") return c.json({ error: "Actions only during action phase" }, 400);

  await db.delete(schema.actions).where(eq(schema.actions.id, aid));
  broadcast(sid, { type: "action:deleted", payload: { id: aid } }, user.id);

  return c.json({ ok: true });
});
