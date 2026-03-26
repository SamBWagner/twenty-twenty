import assert from "node:assert/strict";
import test from "node:test";
import { formatSessionDuration } from "./session-summary";

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
