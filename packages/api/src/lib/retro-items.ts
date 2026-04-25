import { retroItemSchema } from "@twenty-twenty/shared";
import { toIsoString } from "./http.js";

type SessionPhase = "review" | "ideation" | "action" | "closed";

interface RetroItemRow {
  id: string;
  sessionId: string;
  authorId: string;
  type: "good" | "bad";
  content: string;
  createdAt: Date;
}

interface VoteRow {
  itemId: string;
  userId: string;
  value: number;
}

export function serializeRetroItemsForUser(input: {
  items: RetroItemRow[];
  voteRows: VoteRow[];
  sessionPhase: SessionPhase;
  userId: string;
}) {
  const voteCountByItemId = new Map<string, number>();
  const userVoteByItemId = new Map<string, number>();

  for (const vote of input.voteRows) {
    voteCountByItemId.set(vote.itemId, (voteCountByItemId.get(vote.itemId) || 0) + vote.value);
    if (vote.userId === input.userId) {
      userVoteByItemId.set(vote.itemId, vote.value);
    }
  }

  return input.items.map((item) => retroItemSchema.parse({
    id: item.id,
    sessionId: item.sessionId,
    type: item.type,
    content: item.content,
    createdAt: toIsoString(item.createdAt),
    voteCount: voteCountByItemId.get(item.id) || 0,
    userVote: userVoteByItemId.get(item.id) || 0,
    authorId: input.sessionPhase === "ideation" ? null : item.authorId,
    isOwn: item.authorId === input.userId,
  }));
}
