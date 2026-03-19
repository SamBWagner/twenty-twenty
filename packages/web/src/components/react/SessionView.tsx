import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../../lib/api-client";
import { useSessionWebSocket } from "../../lib/ws-client";
import { getPublicWebBaseUrl } from "../../lib/runtime-urls";
import type { WsEvent } from "@twenty-twenty/shared";
import { cn, scrapbookButton } from "../../lib/button-styles";
import IdeationBoard from "./IdeationBoard";
import ActionBoard from "./ActionBoard";
import ActionReviewFlow from "./ActionReviewFlow";
import FloatingAvatars from "./FloatingAvatars";
import SessionSummary from "./SessionSummary";

type SessionPhase = "review" | "ideation" | "action" | "closed";
type SessionSection = "review" | "ideation" | "action" | "summary";

const phaseOrder: SessionPhase[] = ["review", "ideation", "action", "closed"];
const sectionOrder: SessionSection[] = ["review", "ideation", "action", "summary"];
const sectionLabels: Record<SessionSection, string> = {
  review: "Review",
  ideation: "Ideation",
  action: "Actions",
  summary: "Summary",
};

function defaultSectionForPhase(phase: SessionPhase): SessionSection {
  return phase === "closed" ? "summary" : phase;
}

function isSectionUnlocked(section: SessionSection, phase: SessionPhase): boolean {
  const requiredPhase: SessionPhase = section === "summary" ? "closed" : section;
  return phaseOrder.indexOf(phase) >= phaseOrder.indexOf(requiredPhase);
}

interface Session {
  id: string;
  projectId: string;
  name: string;
  phase: SessionPhase;
  sequence: number;
  createdBy: string;
  closedAt: string | null;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSection, setActiveSection] = useState<SessionSection | null>(null);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [advancingPhase, setAdvancingPhase] = useState(false);
  const participantsPanelRef = useRef<HTMLDivElement>(null);

  const [itemEventHandlers, setItemEventHandlers] = useState<{
    onWsEvent?: (event: WsEvent) => void;
  }>({});

  const handleReviewComplete = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, phase: "ideation" } : prev));
    setActiveSection("ideation");
  }, []);

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
          setSession((prev) =>
            prev ? { ...prev, phase: event.payload.phase as SessionPhase } : prev,
          );
          setActiveSection((prev) => prev || defaultSectionForPhase(event.payload.phase as SessionPhase));
          break;
        default:
          itemEventHandlers.onWsEvent?.(event);
      }
    },
    [itemEventHandlers],
  );

  useSessionWebSocket(sessionId, handleWsEvent);

  useEffect(() => {
    api
      .get<Session>(`/api/sessions/${sessionId}`)
      .then((s) => {
        setSession(s);
        setActiveSection((prev) => prev || defaultSectionForPhase(s.phase));
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load session."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (activeSection !== "ideation" && activeSection !== "action") {
      setItemEventHandlers({});
    }
  }, [activeSection]);

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
      const { shareToken } = await api.post<{ shareToken: string }>(`/api/sessions/${sessionId}/share`, {});
      const url = `${getPublicWebBaseUrl()}/join/${shareToken}`;

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

  async function advancePhase(nextSection?: SessionSection) {
    if (!session) return;
    setAdvancingPhase(true);
    try {
      const result = await api.patch<{ phase: SessionPhase }>(`/api/sessions/${sessionId}/phase`);
      setSession((prev) => (prev ? { ...prev, phase: result.phase } : prev));
      if (nextSection) {
        setActiveSection(nextSection);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdvancingPhase(false);
      setShowCloseConfirmation(false);
    }
  }

  if (loading) return <p className="font-mono text-sm">Loading session...</p>;
  if (loadError) return <p className="font-bold text-red-600">{loadError}</p>;
  if (!session) return <p className="font-bold text-red-600">Session not found</p>;

  const isCreator = session.createdBy === userId;
  const visibleSection = activeSection || defaultSectionForPhase(session.phase);
  const liveSection = defaultSectionForPhase(session.phase);

  return (
    <div>
      <FloatingAvatars users={onlineUsers} />

      <div className="mb-6">
        <a
          href={`/projects/${projectId}`}
          className={cn(
            scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
            "inline-block border-2 border-secondary bg-white px-3 py-1 text-sm font-bold uppercase",
          )}
        >
          ← Back
        </a>
      </div>

      <div className="relative mb-10">
        <h1 className="text-4xl font-bold uppercase">{session.name}</h1>

        <div className="mt-5 flex flex-wrap items-start gap-3">
          {sectionOrder.map((section) => {
            const unlocked = isSectionUnlocked(section, session.phase);
            const isActive = visibleSection === section;
            const isLivePhase = liveSection === section;
            return (
              <div key={section} className="relative pt-4">
                {isLivePhase && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-secondary"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current">
                      <path d="M8 12.5L1.5 4.5h13L8 12.5z" />
                    </svg>
                  </span>
                )}
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => setActiveSection(section)}
                  data-section={section}
                  data-active-section={isActive ? "true" : undefined}
                  data-live-phase={isLivePhase ? "true" : undefined}
                  title={isLivePhase ? `${sectionLabels[section]} is the live team phase` : undefined}
                  className={cn(
                    scrapbookButton({
                      tone: isActive ? "primary" : "neutral",
                      size: "compact",
                      tilt: "flat",
                      depth: "sm",
                    }),
                    "border-2 border-secondary px-4 py-2 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-35",
                    isActive ? "bg-primary text-white" : "bg-white text-secondary",
                  )}
                >
                  {sectionLabels[section]}
                </button>
              </div>
            );
          })}
        </div>

        <div className="absolute right-0 top-0 flex items-center gap-3">
          <div className="relative" ref={participantsPanelRef}>
            <button
              onClick={toggleParticipants}
              className={cn(
                scrapbookButton({ tone: "warm", size: "compact", tilt: "flat", depth: "sm" }),
                "flex -space-x-1 border-3 border-secondary bg-white p-1",
              )}
              title="Show participants"
            >
              {onlineUsers.map((u) => (
                <div
                  key={u.userId}
                  title={u.username}
                  className="flex h-10 w-10 items-center justify-center overflow-hidden border-3 border-secondary bg-tertiary text-xs font-bold"
                >
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} alt={u.username} className="h-full w-full object-cover" />
                  ) : (
                    u.username[0]?.toUpperCase()
                  )}
                </div>
              ))}
            </button>

            {showParticipants && (
              <div className="absolute right-0 top-14 z-50 w-72 border-3 border-secondary bg-white p-4 shadow-brutal-lg">
                <h3 className="mb-3 text-sm font-bold uppercase">Participants</h3>
                {participants.length === 0 && (
                  <p className="font-mono text-sm text-secondary/50">No participants recorded yet</p>
                )}
                {participants.map((p) => {
                  const isOnline = onlineUsers.some((u) => u.userId === p.userId);
                  return (
                    <div key={p.userId} className="flex items-center gap-2 border-b border-secondary/10 py-2 last:border-0">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border-2 border-secondary bg-tertiary text-xs font-bold">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt={p.username} className="h-full w-full object-cover" />
                        ) : (
                          p.username[0]?.toUpperCase()
                        )}
                        {isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
                        )}
                      </div>
                      <span className="truncate text-sm font-bold">{p.username}</span>
                      {p.role === "guest" && (
                        <span className="ml-auto shrink-0 border-2 border-secondary bg-tertiary px-2 py-0.5 text-[10px] font-bold uppercase">
                          Guest
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handleShare}
            className={cn(
              scrapbookButton({ tone: "primary", size: "compact", tilt: "left", depth: "sm" }),
              "border-3 border-secondary bg-primary px-4 py-2 text-sm font-bold uppercase text-white",
            )}
          >
            {shareState === "copied" ? "Copied!" : "Share"}
          </button>

          {isCreator && session.phase === "ideation" && (
            <button
              onClick={() => advancePhase("action")}
              disabled={advancingPhase}
              className={cn(
                scrapbookButton({ tone: "secondary", size: "regular", tilt: "right", depth: "md" }),
                "border-3 border-secondary bg-purple-400 px-5 py-3 font-bold uppercase text-white disabled:opacity-50",
              )}
            >
              Advance to Actions
            </button>
          )}

          {isCreator && session.phase === "action" && (
            <button
              onClick={() => setShowCloseConfirmation(true)}
              className={cn(
                scrapbookButton({ tone: "secondary", size: "regular", tilt: "left", depth: "md" }),
                "border-3 border-secondary bg-secondary px-5 py-3 font-bold uppercase text-white",
              )}
            >
              Close Session
            </button>
          )}
        </div>
      </div>

      {visibleSection === "review" && (
        <ActionReviewFlow
          sessionId={sessionId}
          sessionPhase={session.phase}
          onComplete={handleReviewComplete}
        />
      )}

      {visibleSection === "ideation" && (
        <IdeationBoard
          sessionId={sessionId}
          readOnly={session.phase !== "ideation"}
          onRegisterWsHandler={(handler) => setItemEventHandlers({ onWsEvent: handler })}
        />
      )}

      {visibleSection === "action" && (
        <ActionBoard
          sessionId={sessionId}
          projectId={projectId}
          readOnly={session.phase === "closed"}
          onRegisterWsHandler={(handler) => setItemEventHandlers({ onWsEvent: handler })}
        />
      )}

      {visibleSection === "summary" && session.phase === "closed" && (
        <SessionSummary sessionId={sessionId} />
      )}

      {showCloseConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-secondary/45 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg border-3 border-secondary bg-white p-6 shadow-brutal-lg"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">
              Final confirmation
            </p>
            <h2 className="mt-3 text-2xl font-bold uppercase">Close this retrospective?</h2>
            <p className="mt-3 text-sm font-medium text-secondary/65">
              Closing the session ends live editing and unlocks the final summary view for the team.
              This action can&apos;t be undone.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCloseConfirmation(false)}
                className={cn(
                  scrapbookButton({ tone: "neutral", size: "regular", tilt: "flat", depth: "sm" }),
                  "border-3 border-secondary bg-white px-4 py-2 font-bold uppercase",
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => advancePhase("summary")}
                disabled={advancingPhase}
                className={cn(
                  scrapbookButton({ tone: "danger", size: "regular", tilt: "left", depth: "md" }),
                  "border-3 border-secondary bg-red-300 px-4 py-2 font-bold uppercase disabled:opacity-50",
                )}
              >
                {advancingPhase ? "Closing..." : "Yes, Close Session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
