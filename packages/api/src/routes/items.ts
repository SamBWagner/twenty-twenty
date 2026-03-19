import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../auth/middleware.js";
import { newId } from "../lib/id.js";
import { broadcast } from "../ws/rooms.js";
import { canAccessSession } from "../lib/session-access.js";

export const itemRoutes = new Hono();

// Get all items for a session
itemRoutes.get("/sessions/:sid/items", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return c.json({ error: "Not found" }, 404);

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);

  const items = await db.select().from(schema.items).where(eq(schema.items.sessionId, sid));

  // Get vote counts and user's own votes
  const result = await Promise.all(
    items.map(async (item) => {
      const voteRows = await db.select().from(schema.votes).where(eq(schema.votes.itemId, item.id));
      const voteCount = voteRows.reduce((sum, v) => sum + v.value, 0);
      const userVote = voteRows.find((v) => v.userId === user.id)?.value || 0;

      return {
        id: item.id,
        sessionId: item.sessionId,
        type: item.type,
        content: item.content,
        createdAt: item.createdAt,
        voteCount,
        userVote,
        // Hide author during ideation phase
        authorId: session.phase === "ideation" ? undefined : item.authorId,
        isOwn: item.authorId === user.id,
      };
    }),
  );

  return c.json(result);
});

// Create item (ideation phase only)
itemRoutes.post("/sessions/:sid/items", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");

  const access = await canAccessSession(user.id, sid);
  if (!access.allowed) return c.json({ error: "Not found" }, 404);

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "ideation") return c.json({ error: "Items can only be added during ideation" }, 400);

  const body = await c.req.json<{ type: "good" | "bad"; content: string }>();
  if (!body.content?.trim()) return c.json({ error: "Content is required" }, 400);
  if (body.content.trim().length > 2000) return c.json({ error: "Content must be 2000 characters or less" }, 400);
  if (!["good", "bad"].includes(body.type)) return c.json({ error: "Type must be good or bad" }, 400);

  const item = {
    id: newId(),
    sessionId: sid,
    authorId: user.id,
    type: body.type,
    content: body.content.trim(),
    createdAt: new Date(),
  };

  await db.insert(schema.items).values(item);

  broadcast(sid, {
    type: "item:created",
    payload: { id: item.id, type: item.type, content: item.content, voteCount: 0 },
  }, user.id);

  return c.json({ ...item, voteCount: 0, userVote: 0, isOwn: true }, 201);
});

// Delete own item (ideation phase only)
itemRoutes.delete("/sessions/:sid/items/:iid", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const iid = c.req.param("iid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "ideation") return c.json({ error: "Can only delete during ideation" }, 400);

  const item = await db.select().from(schema.items).where(eq(schema.items.id, iid)).get();
  if (!item || item.sessionId !== sid) return c.json({ error: "Not found" }, 404);
  if (item.authorId !== user.id) return c.json({ error: "Can only delete your own items" }, 403);

  await db.delete(schema.items).where(eq(schema.items.id, iid));
  broadcast(sid, { type: "item:deleted", payload: { id: iid } }, user.id);

  return c.json({ ok: true });
});

// Vote on item (ideation phase only)
itemRoutes.post("/sessions/:sid/items/:iid/vote", requireAuth, async (c) => {
  const user = c.get("user");
  const sid = c.req.param("sid");
  const iid = c.req.param("iid");

  const session = await db.select().from(schema.retroSessions).where(eq(schema.retroSessions.id, sid)).get();
  if (!session) return c.json({ error: "Not found" }, 404);
  if (session.phase !== "ideation") return c.json({ error: "Voting only during ideation" }, 400);

  const body = await c.req.json<{ value: 1 | -1 }>();
  if (body.value !== 1 && body.value !== -1) return c.json({ error: "Value must be 1 or -1" }, 400);

  const existing = await db
    .select()
    .from(schema.votes)
    .where(and(eq(schema.votes.itemId, iid), eq(schema.votes.userId, user.id)))
    .get();

  if (existing) {
    if (existing.value === body.value) {
      // Same vote = remove it (toggle off)
      await db.delete(schema.votes).where(eq(schema.votes.id, existing.id));
    } else {
      // Different vote = update
      await db.update(schema.votes).set({ value: body.value }).where(eq(schema.votes.id, existing.id));
    }
  } else {
    await db.insert(schema.votes).values({
      id: newId(),
      itemId: iid,
      userId: user.id,
      value: body.value,
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
