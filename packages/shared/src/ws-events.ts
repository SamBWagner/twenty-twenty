export type WsEvent =
  | { type: "user:joined"; payload: { userId: string; username: string; avatarUrl: string | null } }
  | { type: "user:left"; payload: { userId: string } }
  | { type: "presence:sync"; payload: { users: { userId: string; username: string; avatarUrl: string | null }[] } }
  | { type: "item:created"; payload: { id: string; type: "good" | "bad"; content: string; voteCount: number } }
  | { type: "item:deleted"; payload: { id: string } }
  | { type: "vote:updated"; payload: { itemId: string; voteCount: number } }
  | { type: "phase:changed"; payload: { phase: string } }
  | { type: "action:created"; payload: { id: string; description: string } }
  | { type: "action:updated"; payload: { id: string; description: string } }
  | { type: "action:deleted"; payload: { id: string } };
