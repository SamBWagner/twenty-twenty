import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createItemBodySchema, retroItemSchema, voteItemBodySchema } from "@twenty-twenty/shared";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";
import { jsonError, parseJsonBody, toIsoString } from "../lib/http.js";

export const itemRoutes = new Hono();

// Get all items for a session
itemRoutes.get("/sessions/:sid/items", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");

  const items = await db.select().from(schema.items).where(eq(schema.items.sessionId, sid));

  // Get vote counts and user's own votes
  const result = await Promise.all(
    items.map(async (item) => {
      const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.itemId, item.id));
      const voteCount = voteRows.reduce((sum, v) => sum + v.value, 0);
      const userVote = voteRows.find((v) => v.userId === user.id)?.value || 0;

      return retroItemSchema.parse({
        id: item.id,
        sessionId: item.sessionId,
        type: item.type,
        content: item.content,
        createdAt: toIsoString(item.createdAt),
        voteCount,
        userVote,
        authorId: session.phase === "ideation" ? null : item.authorId,
        isOwn: item.authorId === user.id,
      });
    }),
  );

  return c.json(result);
});

// Create item (ideation phase only)
itemRoutes.post("/sessions/:sid/items", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "ideation") return jsonError(c, 400, "invalid_phase", "Items can only be added during ideation.");

  const parsed = await parseJsonBody(c, createItemBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const item = {
    id: newId(),
    sessionId: sid,
    authorId: user.id,
    type: parsed.data.type,
    content: parsed.data.content.trim(),
    createdAt: new Date(),
  };

  await db.insert(schema.items).values(item);

  broadcast(sid, {
    type: "item:created",
    payload: { id: item.id, type: item.type, content: item.content, voteCount: 0 },
  }, user.id);

  return c.json(retroItemSchema.parse({
    ...item,
    createdAt: toIsoString(item.createdAt),
    voteCount: 0,
    userVote: 0,
    isOwn: true,
  }), 201);
});

// Delete own item (ideation phase only)
itemRoutes.delete("/sessions/:sid/items/:iid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const iid = c.req.param("iid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "ideation") return jsonError(c, 400, "invalid_phase", "Items can only be deleted during ideation.");

  const item = await db.select().from(schema.items).where(eq(schema.items.id, iid)).get();
  if (!item || item.sessionId !== sid) return jsonError(c, 404, "not_found", "Item not found.");
  if (item.authorId !== user.id) return jsonError(c, 403, "forbidden", "You can only delete your own items.");

  await db.delete(schema.items).where(eq(schema.items.id, iid));
  broadcast(sid, { type: "item:deleted", payload: { id: iid } }, user.id);

  return c.json({ ok: true });
});

// Vote on item (ideation phase only)
itemRoutes.post("/sessions/:sid/items/:iid/vote", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const iid = c.req.param("iid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return jsonError(c, 404, "not_found", "Session not found.");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return jsonError(c, 404, "not_found", "Session not found.");
  if (session.phase !== "ideation") return jsonError(c, 400, "invalid_phase", "Voting is only available during ideation.");

  const parsed = await parseJsonBody(c, voteItemBodySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const existing = await db
    .select()
    .from(schema.votes)
    .where(and(eq(schema.votes.itemId, iid), eq(schema.votes.userId, user.id)))
    .get();

  if (existing) {
    if (existing.value === parsed.data.value) {
      // Same vote = remove it (toggle off)
      await db.delete(schema.votes).where(eq(schema.votes.id, existing.id));
    } else {
      // Different vote = update
      await db.update(schema.votes).set({ value: parsed.data.value }).where(eq(schema.votes.id, existing.id));
    }
  } else {
    await db.insert(schema.votes).values({
      id: newId(),
      itemId: iid,
      userId: user.id,
      value: parsed.data.value,
      createdAt: new Date(),
    });
  }

  // Get new vote count
  const allVotes = await db.select().from(schema.votes).where(eq(schema.votes.itemId, iid));
  const voteCount = allVotes.reduce((sum, v) => sum + v.value, 0);

  broadcast(sid, { type: "vote:updated", payload: { itemId: iid, voteCount } });

  const userVote = allVotes.find((v) => v.userId === user.id)?.value || 0;
  return c.json({ itemId: iid, voteCount, userVote });
});
