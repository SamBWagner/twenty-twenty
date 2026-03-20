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
  const actionGroups = summary.bundles
    .map((bundle) => ({
      label: bundle.label,
      contextItems: summary.items
        .filter((item) => bundle.itemIds.includes(item.id))
        .map((item) => ({ content: item.content })),
      actions: summary.actions
        .filter((action) => action.bundleId === bundle.id)
        .map((action) => ({ description: action.description })),
    }))
    .filter((bundle) => bundle.contextItems.length > 0 || bundle.actions.length > 0);

  return {
    session: {
      name: summary.session.name,
      sequence: summary.session.sequence,
      closedAt: summary.session.closedAt,
    },
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
      createdAt: review.createdAt,
    })),
    goodItems,
    badItems,
    actionGroups,
    carriedOverActions: summary.actions
      .filter((action) => action.bundleId === null)
      .map((action) => ({ description: action.description })),
    actionCount: summary.actions.length,
  };
}

export function buildSessionSummaryMarkdown(summary: SessionSummaryDisplayData): string {
  const carriedOverActions = summary.carriedOverActions;

  const lines: string[] = [];
  lines.push(`# ${summary.session.name}`);
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
        `- [${reviewStatusLabels[review.status]}] ${review.actionDescription} (${review.reviewerName})${commentSuffix}`,
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

  if (summary.actionGroups.length > 0 || carriedOverActions.length > 0) {
    lines.push("## Action Plan");
    lines.push("");

    for (const group of summary.actionGroups) {
      lines.push(`### ${group.label || "Unnamed Action Group"}`);

      if (group.contextItems.length > 0) {
        lines.push("Context:");
        for (const item of group.contextItems) {
          lines.push(`- ${item.content}`);
        }
      }

      if (group.actions.length > 0) {
        lines.push("Actions:");
        for (const action of group.actions) {
          lines.push(`- [ ] ${action.description}`);
        }
      }

      lines.push("");
    }

    if (carriedOverActions.length > 0) {
      lines.push("### Carried Over");
      for (const action of carriedOverActions) {
        lines.push(`- [ ] ${action.description}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}
