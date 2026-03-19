export interface SessionSummaryData {
  session: {
    id: string;
    name: string;
    phase: "review" | "ideation" | "action" | "closed";
    sequence: number;
    createdBy: string;
    createdAt: string;
    closedAt: string | null;
  };
  participants: {
    userId: string;
    username: string;
    avatarUrl: string | null;
    role: "member" | "guest";
    joinedAt: string;
  }[];
  items: {
    id: string;
    sessionId: string;
    authorId: string;
    type: "good" | "bad";
    content: string;
    createdAt: string;
    voteCount: number;
  }[];
  bundles: {
    id: string;
    sessionId: string;
    label: string | null;
    createdAt: string;
    itemIds: string[];
  }[];
  actions: {
    id: string;
    sessionId: string;
    bundleId: string | null;
    description: string;
    assigneeId: string | null;
    createdAt: string;
  }[];
  reviews: {
    actionId: string;
    actionDescription: string;
    reviewerId: string;
    reviewerName: string;
    status: "did_nothing" | "actioned" | "disagree";
    comment: string | null;
    createdAt: string;
  }[];
}

export const reviewStatusLabels = {
  actioned: "Actioned",
  did_nothing: "Try Again",
  disagree: "Disagreed",
} as const;

export function formatVoteCount(voteCount: number): string {
  return `${voteCount} vote${voteCount === 1 ? "" : "s"}`;
}

export function buildSessionSummaryMarkdown(summary: SessionSummaryData): string {
  const goodItems = summary.items
    .filter((item) => item.type === "good")
    .sort((a, b) => b.voteCount - a.voteCount);
  const badItems = summary.items
    .filter((item) => item.type === "bad")
    .sort((a, b) => b.voteCount - a.voteCount);
  const carriedOverActions = summary.actions.filter((action) => action.bundleId === null);

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

  if (goodItems.length > 0) {
    lines.push("## Went Well");
    for (const item of goodItems) {
      lines.push(`- ${item.content} (${formatVoteCount(item.voteCount)})`);
    }
    lines.push("");
  }

  if (badItems.length > 0) {
    lines.push("## Needs Work");
    for (const item of badItems) {
      lines.push(`- ${item.content} (${formatVoteCount(item.voteCount)})`);
    }
    lines.push("");
  }

  if (summary.bundles.length > 0 || carriedOverActions.length > 0) {
    lines.push("## Action Plan");
    lines.push("");

    for (const bundle of summary.bundles) {
      const bundleItems = summary.items.filter((item) => bundle.itemIds.includes(item.id));
      const bundleActions = summary.actions.filter((action) => action.bundleId === bundle.id);

      if (bundleItems.length === 0 && bundleActions.length === 0) {
        continue;
      }

      lines.push(`### ${bundle.label || "Unnamed Action Group"}`);

      if (bundleItems.length > 0) {
        lines.push("Context:");
        for (const item of bundleItems) {
          lines.push(`- ${item.content}`);
        }
      }

      if (bundleActions.length > 0) {
        lines.push("Actions:");
        for (const action of bundleActions) {
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
