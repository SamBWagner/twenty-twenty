import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../../lib/api-client";
import { useSessionWebSocket } from "../../lib/ws-client";
import type { WsEvent } from "@twenty-twenty/shared";
import IdeationBoard from "./IdeationBoard";
import ActionBoard from "./ActionBoard";
import ActionReviewFlow from "./ActionReviewFlow";
import CopySummary from "./CopySummary";
import FloatingAvatars from "./FloatingAvatars";

interface Session {
  id: string;
  projectId: string;
  name: string;
  phase: string;
  sequence: number;
  createdBy: string;
}

interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

interface Participant {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: "member" | "guest";
  joinedAt: string;
}

export default function SessionView({
  sessionId,
  projectId,
  userId,
}: {
  sessionId: string;
  projectId: string;
  userId: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const participantsPanelRef = useRef<HTMLDivElement>(null);

  const [itemEventHandlers, setItemEventHandlers] = useState<{
    onWsEvent?: (event: WsEvent) => void;
  }>({});

  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      switch (event.type) {
        case "presence:sync":
          setOnlineUsers(event.payload.users);
          break;
        case "user:joined":
          setOnlineUsers((prev) => {
            if (prev.find((u) => u.userId === event.payload.userId)) return prev;
            return [...prev, event.payload];
          });
          break;
        case "user:left":
          setOnlineUsers((prev) => prev.filter((u) => u.userId !== event.payload.userId));
          break;
        case "phase:changed":
          setSession((prev) => (prev ? { ...prev, phase: event.payload.phase } : prev));
          break;
        default:
          itemEventHandlers.onWsEvent?.(event);
      }
    },
    [itemEventHandlers],
  );

  useSessionWebSocket(sessionId, handleWsEvent);

  useEffect(() => {
    api.get<Session>(`/api/sessions/${sessionId}`).then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, [sessionId]);

  // Close participant panel on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (participantsPanelRef.current && !participantsPanelRef.current.contains(e.target as Node)) {
        setShowParticipants(false);
      }
    }
    if (showParticipants) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showParticipants]);

  function copyToClipboard(text: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    let success = false;
    try {
      success = document.execCommand("copy");
    } catch {
      success = false;
    }
    document.body.removeChild(textarea);
    return success;
  }

  async function handleShare() {
    try {
      const { shareToken } = await api.post<{ shareToken: string }>(`/api/sessions/${sessionId}/share`);
      const webUrl = import.meta.env.PUBLIC_WEB_URL || "http://localhost:4321";
      const url = `${webUrl}/join/${shareToken}`;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          copyToClipboard(url);
        }
      } else {
        copyToClipboard(url);
      }

      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch (err: any) {
      alert("Failed to share: " + (err.message || "Unknown error"));
    }
  }

  async function toggleParticipants() {
    if (showParticipants) {
      setShowParticipants(false);
      return;
    }
    try {
      const data = await api.get<Participant[]>(`/api/sessions/${sessionId}/participants`);
      setParticipants(data);
    } catch {}
    setShowParticipants(true);
  }

  async function advancePhase() {
    if (!session) return;
    try {
      const result = await api.patch<{ phase: string }>(`/api/sessions/${sessionId}/phase`);
      setSession({ ...session, phase: result.phase });
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="font-mono text-sm">Loading session...</p>;
  if (!session) return <p className="font-bold text-red-600">Session not found</p>;

  const isCreator = session.createdBy === userId;

  return (
    <div>
      <FloatingAvatars users={onlineUsers} />

      <div className="mb-6">
        <a
          href={`/projects/${projectId}`}
          className="inline-block border-2 border-secondary bg-white px-3 py-1 text-sm font-bold uppercase shadow-brutal-sm hover:shadow-brutal-primary transition-shadow"
        >
          ← Back
        </a>
      </div>

      {/* Session header — scattered layout */}
      <div className="relative mb-10">
        <h1 className="text-4xl font-bold uppercase">{session.name}</h1>

        {/* Phase pills */}
        <div className="flex items-center gap-1 mt-3">
          {(["review", "ideation", "action", "closed"] as const).map((step) => {
            const isCurrent = session.phase === step;
            const isPast = ["review", "ideation", "action", "closed"].indexOf(step) <
              ["review", "ideation", "action", "closed"].indexOf(session.phase);
            return (
              <span
                key={step}
                className={`border-3 border-secondary px-3 py-1 text-xs font-bold uppercase ${
                  isCurrent
                    ? "bg-primary text-white"
                    : isPast
                      ? "bg-green-300"
                      : "bg-white text-secondary/30"
                }`}
              >
                {step}
              </span>
            );
          })}
        </div>

        {/* Online users + controls — positioned to the right */}
        <div className="absolute top-0 right-0 flex items-center gap-3">
          {/* Online avatars */}
          <div className="relative" ref={participantsPanelRef}>
            <button
              onClick={toggleParticipants}
              className="flex -space-x-1 cursor-pointer hover:opacity-80 transition-opacity"
              title="Show participants"
            >
              {onlineUsers.map((u) => (
                <div
                  key={u.userId}
                  title={u.username}
                  className="h-10 w-10 border-3 border-secondary bg-tertiary flex items-center justify-center text-xs font-bold overflow-hidden"
                >
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt={u.username} className="h-full w-full object-cover" />
                  ) : (
                    u.username[0]?.toUpperCase()
                  )}
                </div>
              ))}
            </button>

            {/* Participant panel */}
            {showParticipants && (
              <div className="absolute right-0 top-14 z-50 w-72 border-3 border-secondary bg-white shadow-brutal-lg p-4">
                <h3 className="font-bold uppercase text-sm mb-3">Participants</h3>
                {participants.length === 0 && (
                  <p className="text-sm text-secondary/50 font-mono">No participants recorded yet</p>
                )}
                {participants.map((p) => {
                  const isOnline = onlineUsers.some((u) => u.userId === p.userId);
                  return (
                    <div key={p.userId} className="flex items-center gap-2 py-2 border-b border-secondary/10 last:border-0">
                      <div className="relative h-8 w-8 border-2 border-secondary bg-tertiary flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt={p.username} className="h-full w-full object-cover" />
                        ) : (
                          p.username[0]?.toUpperCase()
                        )}
                        {isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-400 border-2 border-white rounded-full" />
                        )}
                      </div>
                      <span className="font-bold text-sm truncate">{p.username}</span>
                      {p.role === "guest" && (
                        <span className="ml-auto border-2 border-secondary bg-tertiary px-2 py-0.5 text-[10px] font-bold uppercase shrink-0">
                          Guest
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Share button */}
          <button
            onClick={handleShare}
            className="border-3 border-secondary bg-primary px-4 py-2 font-bold uppercase text-white shadow-brutal-sm rotate-[-0.5deg] transition-all hover:rotate-[0.5deg] hover:shadow-brutal-tertiary text-sm"
          >
            {shareState === "copied" ? "Copied!" : "Share"}
          </button>

          {isCreator && session.phase === "ideation" && (
            <button
              onClick={advancePhase}
              className="border-3 border-secondary bg-purple-400 px-5 py-3 font-bold uppercase text-white shadow-brutal rotate-[1deg] transition-all hover:rotate-[-1deg] hover:shadow-brutal-tertiary"
            >
              Actions →
            </button>
          )}
          {isCreator && session.phase === "action" && (
            <button
              onClick={advancePhase}
              className="border-3 border-secondary bg-secondary px-5 py-3 font-bold uppercase text-white shadow-brutal rotate-[-1deg] transition-all hover:rotate-[1deg] hover:shadow-brutal-primary"
            >
              Close ✓
            </button>
          )}
        </div>
      </div>

      {/* Copy summary for closed sessions */}
      {session.phase === "closed" && (
        <CopySummary sessionId={sessionId} sessionName={session.name} />
      )}

      {/* Phase content */}
      {session.phase === "review" && (
        <ActionReviewFlow
          sessionId={sessionId}
          onComplete={() => setSession({ ...session, phase: "ideation" })}
        />
      )}
      {session.phase === "ideation" && (
        <IdeationBoard
          sessionId={sessionId}
          onRegisterWsHandler={(handler) => setItemEventHandlers({ onWsEvent: handler })}
        />
      )}
      {(session.phase === "action" || session.phase === "closed") && (
        <ActionBoard
          sessionId={sessionId}
          projectId={projectId}
          readOnly={session.phase === "closed"}
          onRegisterWsHandler={(handler) => setItemEventHandlers({ onWsEvent: handler })}
        />
      )}
    </div>
  );
}
