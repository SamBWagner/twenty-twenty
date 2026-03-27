import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "@twenty-twenty/shared";
import { buildSessionSummaryMarkdown, formatSessionDuration, toSessionSummaryDisplayData } from "./session-summary";

test("formatSessionDuration returns minutes for sessions under an hour", () => {
  assert.equal(
    formatSessionDuration("2026-03-20T00:00:00.000Z", "2026-03-20T00:12:00.000Z"),
    "12 min",
  );
});

test("formatSessionDuration returns hours and minutes for multi-hour sessions", () => {
  assert.equal(
    formatSessionDuration("2026-03-20T00:00:00.000Z", "2026-03-20T02:10:00.000Z"),
    "2 hr 10 min",
  );
});

test("formatSessionDuration returns still open when the session has not closed", () => {
  assert.equal(formatSessionDuration("2026-03-20T00:00:00.000Z", null), "Still open");
});

test("toSessionSummaryDisplayData keeps the project name", () => {
  const summary: SessionSummary = {
    session: {
      id: "session-1",
      projectId: "project-1",
      name: "Retro 12",
      phase: "closed",
      sequence: 12,
      createdBy: "user-1",
      createdAt: "2026-03-20T00:00:00.000Z",
      closedAt: "2026-03-20T00:20:00.000Z",
    },
    projectName: "Coffee Time",
    participants: [],
    items: [],
    actions: [],
    reviews: [],
  };

  assert.equal(toSessionSummaryDisplayData(summary).projectName, "Coffee Time");
});

test("buildSessionSummaryMarkdown includes the project name below the title", () => {
  const markdown = buildSessionSummaryMarkdown({
    session: {
      name: "Retro 12",
      sequence: 12,
      createdAt: "2026-03-20T00:00:00.000Z",
      closedAt: "2026-03-20T00:20:00.000Z",
    },
    projectName: "Coffee Time",
    participants: [],
    reviews: [],
    goodItems: [],
    badItems: [],
    actions: [],
    actionCount: 0,
  });

  assert.match(markdown, /^# Retro 12\nProject: Coffee Time\n\nSequence: #12/m);
});
