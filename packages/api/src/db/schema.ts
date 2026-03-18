import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

// better-auth managed tables (defined here for FK references and queries)
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// App tables

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
);

export const retroSessions = sqliteTable("retro_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phase: text("phase", { enum: ["review", "ideation", "action", "closed"] }).notNull(),
  sequence: integer("sequence").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  shareToken: text("share_token").unique(),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => retroSessions.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
  type: text("type", { enum: ["good", "bad"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 or -1
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("votes_item_user_idx").on(table.itemId, table.userId)],
);

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => retroSessions.id, { onDelete: "cascade" }),
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const bundleItems = sqliteTable(
  "bundle_items",
  {
    bundleId: text("bundle_id")
      .notNull()
      .references(() => bundles.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.bundleId, table.itemId] })],
);

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => retroSessions.id, { onDelete: "cascade" }),
  bundleId: text("bundle_id").references(() => bundles.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  assigneeId: text("assignee_id").references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const actionReviews = sqliteTable("action_reviews", {
  id: text("id").primaryKey(),
  actionId: text("action_id")
    .notNull()
    .references(() => actions.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .references(() => retroSessions.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => user.id),
  status: text("status", { enum: ["did_nothing", "actioned", "disagree"] }).notNull(),
  comment: text("comment"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessionParticipants = sqliteTable(
  "session_participants",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => retroSessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["member", "guest"] }).notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.userId] })],
);
