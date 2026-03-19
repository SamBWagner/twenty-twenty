import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { actionSchema, createActionBodySchema, updateActionBodySchema } from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { jsonError, parseJsonBody, toIsoString } from "../lib/http.js";

export const actionRoutes = new Hono();

// Get all actions for a session
actionRoutes.get("/sessions/:sid/actions", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const actions = await db.select().from(schema.actions).where(eq(schema.actions.sessionId, sid));
  return c.json(actions.map((action) => actionSchema.parse({
    id: action.id,
    sessionId: action.sessionId,
    bundleId: action.bundleId,
    description: action.description,
    assigneeId: action.assigneeId,
    createdAt: toIsoString(action.createdAt),
  })));
});

// Create action (action phase only)
actionRoutes.post("/sessions/:sid/actions", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "action") return jsonError(c, 400, "invalid_phase", "Actions are only available during the action phase.");

  const parsed = await parseJsonBody(c, createActionBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const action = {
    id: newId(),
    sessionId: sid,
    bundleId: parsed.data.bundleId || null,
    description: parsed.data.description.trim(),
    assigneeId: parsed.data.assigneeId || null,
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

  return c.json(actionSchema.parse({
    ...action,
    createdAt: toIsoString(action.createdAt),
  }), 201);
});

// Update action
actionRoutes.patch("/sessions/:sid/actions/:aid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const aid = c.req.param("aid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "action") return jsonError(c, 400, "invalid_phase", "Actions are only available during the action phase.");

  const action = await db.select().from(schema.actions).where(eq(schema.actions.id, aid)).get();
  if (!action || action.sessionId !== sid) return jsonError(c, 404, "not_found", "Action not found.");

  const parsed = await parseJsonBody(c, updateActionBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.description?.trim()) updates.description = parsed.data.description.trim();
  if (parsed.data.bundleId !== undefined) updates.bundleId = parsed.data.bundleId || null;
  if (parsed.data.assigneeId !== undefined) updates.assigneeId = parsed.data.assigneeId || null;

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

  return c.json(actionSchema.parse({
    id: updated!.id,
    sessionId: updated!.sessionId,
    bundleId: updated!.bundleId,
    description: updated!.description,
    assigneeId: updated!.assigneeId,
    createdAt: toIsoString(updated!.createdAt),
  }));
});

// Delete action
actionRoutes.delete("/sessions/:sid/actions/:aid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const aid = c.req.param("aid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "action") return jsonError(c, 400, "invalid_phase", "Actions are only available during the action phase.");

  await db.delete(schema.actions).where(eq(schema.actions.id, aid));
  broadcast(sid, { type: "action:deleted", payload: { id: aid } }, user.id);

  return c.json({ ok: true });
});
