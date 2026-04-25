import type {
  SessionSummary as SessionSummaryData,
  SharedSessionSummary as SessionSummaryDisplayData,
} from "@twenty-twenty/shared";

export const reviewStatusLabels = {
  actioned: "Actioned",
  did_nothing: "Try Again",
  disagree: "Disagreed",
} as const;

export function formatVoteCount(voteCount: number): string {
  return `${voteCount} vote${voteCount === 1 ? "" : "s"}`;
}

export function formatReviewTally(tally: {
  actioned: number;
  didNothing: number;
  disagree: number;
}): string {
  return `${tally.actioned} actioned, ${tally.disagree} disagreed, ${tally.didNothing} try again`;
}

export function formatSessionDuration(createdAt: string, closedAt: string | null): string {
  if (!closedAt) return "Still open";

  const durationMs = new Date(closedAt).getTime() - new Date(createdAt).getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0 min";
  }

  const totalMinutes = Math.floor(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${Math.max(1, totalMinutes)} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

export function toSessionSummaryDisplayData(summary: SessionSummaryData): SessionSummaryDisplayData {
  const goodItems = summary.items
    .filter((item) => item.type === "good")
    .sort((a, b) => b.voteCount - a.voteCount)
    .map((item) => ({
      content: item.content,
      voteCount: item.voteCount,
    }));
  const badItems = summary.items
    .filter((item) => item.type === "bad")
    .sort((a, b) => b.voteCount - a.voteCount)
    .map((item) => ({
      content: item.content,
      voteCount: item.voteCount,
    }));
  return {
    session: {
      name: summary.session.name,
      sequence: summary.session.sequence,
      createdAt: summary.session.createdAt,
      closedAt: summary.session.closedAt,
    },
    projectName: summary.projectName,
    participants: summary.participants.map((participant) => ({
      username: participant.username,
      avatarUrl: participant.avatarUrl,
      role: participant.role,
    })),
    reviews: summary.reviews.map((review) => ({
      actionDescription: review.actionDescription,
      reviewerName: review.reviewerName,
      status: review.status,
      comment: review.comment,
      tally: review.tally,
      createdAt: review.createdAt,
    })),
    goodItems,
    badItems,
    actions: summary.actions.map((action) => ({ description: action.description })),
    actionCount: summary.actions.length,
  };
}

export function buildSessionSummaryMarkdown(summary: SessionSummaryDisplayData): string {
  const lines: string[] = [];
  lines.push(`# ${summary.session.name}`);
  lines.push(`Project: ${summary.projectName}`);
  lines.push("");
  lines.push(`Sequence: #${summary.session.sequence}`);
  if (summary.session.closedAt) {
    lines.push(`Closed: ${new Date(summary.session.closedAt).toLocaleString()}`);
  }
  lines.push("");

  if (summary.participants.length > 0) {
    lines.push("## Participants");
    for (const participant of summary.participants) {
      lines.push(`- ${participant.username}${participant.role === "guest" ? " (guest)" : ""}`);
    }
    lines.push("");
  }

  if (summary.reviews.length > 0) {
    lines.push("## Review Recap");
    for (const review of summary.reviews) {
      const commentSuffix = review.comment ? `: ${review.comment}` : "";
      lines.push(
        `- [${reviewStatusLabels[review.status]}] ${review.actionDescription} (${review.reviewerName}; ${formatReviewTally(review.tally)})${commentSuffix}`,
      );
    }
    lines.push("");
  }

  if (summary.goodItems.length > 0) {
    lines.push("## Went Well");
    for (const item of summary.goodItems) {
      lines.push(`- ${item.content} (${formatVoteCount(item.voteCount)})`);
    }
    lines.push("");
  }

  if (summary.badItems.length > 0) {
    lines.push("## Needs Work");
    for (const item of summary.badItems) {
      lines.push(`- ${item.content} (${formatVoteCount(item.voteCount)})`);
    }
    lines.push("");
  }

  if (summary.actions.length > 0) {
    lines.push("## Actions");
    for (const action of summary.actions) {
      lines.push(`- [ ] ${action.description}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
