import { useEffect, useState, useCallback, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api-client";
import { shareOrCopyLink } from "../../lib/clipboard";
import { useSessionWebSocket } from "../../lib/ws-client";
import { getPublicWebBaseUrl } from "../../lib/runtime-urls";
import type {
  RetroSession as Session,
  SessionParticipant as Participant,
  SessionPhase,
  SessionView as SessionWorkspaceView,
  ViewerCapabilities,
  WsEvent,
} from "@twenty-twenty/shared";
import { cn, scrapbookButton } from "../../lib/button-styles";
import IdeationBoard from "./IdeationBoard";
import ActionBoard from "./ActionBoard";
import ActionReviewFlow from "./ActionReviewFlow";
import FloatingAvatars from "./FloatingAvatars";
import ProjectNameTab from "./ProjectNameTab";
import SessionSummary from "./SessionSummary";

type SessionSection = "review" | "ideation" | "action" | "summary";

const phaseOrder: SessionPhase[] = ["review", "ideation", "action", "closed"];
const sectionOrder: SessionSection[] = ["review", "ideation", "action", "summary"];
const sectionLabels: Record<SessionSection, string> = {
  review: "Look Back",
  ideation: "Look Within",
  action: "Look Forward",
  summary: "Summary",
};

const sectionStyles = {
  review: {
    tone: "peach",
    activeClass: "bg-[#ffae5c] text-secondary",
    inactiveClass: "bg-white text-secondary hover:bg-[#ffe0c4]",
    indicatorClass: "text-[#ff9f43]",
  },
  ideation: {
    tone: "sun",
    activeClass: "bg-[#f9d258] text-secondary",
    inactiveClass: "bg-white text-secondary hover:bg-[#fff2bf]",
    indicatorClass: "text-[#f2c744]",
  },
  action: {
    tone: "plum",
    activeClass: "bg-[#bc96ff] text-secondary",
    inactiveClass: "bg-white text-secondary hover:bg-[#efe3ff]",
    indicatorClass: "text-[#8f63ef]",
  },
  summary: {
    tone: "sun",
    activeClass: "bg-[#ffe793] text-secondary",
    inactiveClass: "bg-white text-secondary hover:bg-[#fff2bf]",
    indicatorClass: "text-[#f2c744]",
  },
} as const;

function defaultSectionForPhase(phase: SessionPhase): SessionSection {
  return phase === "closed" ? "summary" : phase;
}

function isSectionUnlocked(section: SessionSection, phase: SessionPhase): boolean {
  const requiredPhase: SessionPhase = section === "summary" ? "closed" : section;
  return phaseOrder.indexOf(phase) >= phaseOrder.indexOf(requiredPhase);
}

function renderBodyPortal(node: React.ReactNode) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(node, document.body);
}

function getAnchoredPopoverStyle(button: HTMLElement | null, preferredWidth: number): CSSProperties | null {
  if (!button || typeof window === "undefined") {
    return null;
  }

  const rect = button.getBoundingClientRect();
  const viewportPadding = 12;
  const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(rect.right - width, viewportPadding),
    window.innerWidth - width - viewportPadding,
  );

  return {
    position: "fixed",
    top: `${rect.bottom + 12}px`,
    left: `${left}px`,
    width: `${width}px`,
  };
}

interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

interface PendingAdvance {
  nextSection: SessionSection;
  title: string;
  message: string;
  busyLabel: string;
  confirmLabel: string;
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
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [viewerCapabilities, setViewerCapabilities] = useState<ViewerCapabilities | null>(null);
  const [activeSection, setActiveSection] = useState<SessionSection | null>(null);
  const [pendingAdvance, setPendingAdvance] = useState<PendingAdvance | null>(null);
  const [advancingPhase, setAdvancingPhase] = useState(false);
  const [hasIdeationItems, setHasIdeationItems] = useState(false);
  const participantsPanelRef = useRef<HTMLDivElement>(null);
  const participantsButtonRef = useRef<HTMLButtonElement>(null);
  const [participantsPopoverStyle, setParticipantsPopoverStyle] = useState<CSSProperties | null>(null);
  const pendingAdvancePanelRef = useRef<HTMLDivElement>(null);
  const actionAdvanceButtonRef = useRef<HTMLButtonElement>(null);
  const closeSessionButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingAdvancePopoverStyle, setPendingAdvancePopoverStyle] = useState<CSSProperties | null>(null);

  const [itemEventHandlers, setItemEventHandlers] = useState<{
    onWsEvent?: (event: WsEvent) => void;
  }>({});

  const handleReviewComplete = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, phase: "ideation" } : prev));
    setViewerCapabilities((prev) => (prev ? {
      ...prev,
      canAdvancePhase: true,
      canSubmitReviews: false,
      canFinalizeReviews: false,
      canEditIdeation: true,
      canEditActionBoard: false,
    } : prev));
    setActiveSection("ideation");
    setHasIdeationItems(false);
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
        case "phase:changed": {
          const nextPhase = event.payload.phase as SessionPhase;
          setSession((prev) =>
            prev ? { ...prev, phase: nextPhase } : prev,
          );
          setViewerCapabilities((prev) => (prev ? {
            ...prev,
            canAdvancePhase: (nextPhase === "ideation" || nextPhase === "action") && session?.createdBy === userId,
            canSubmitReviews: nextPhase === "review",
            canFinalizeReviews: nextPhase === "review" && session?.createdBy === userId,
            canEditIdeation: nextPhase === "ideation",
            canEditActionBoard: nextPhase === "action",
          } : prev));
          setActiveSection((prev) => prev || defaultSectionForPhase(nextPhase));
          break;
        }
        default:
          itemEventHandlers.onWsEvent?.(event);
      }
    },
    [itemEventHandlers, session?.createdBy, userId],
  );

  useSessionWebSocket(sessionId, handleWsEvent);

  useEffect(() => {
    api
      .get<SessionWorkspaceView>(`/api/sessions/${sessionId}/view`)
      .then((view) => {
        setSession(view.session);
        setProjectName(view.projectName);
        setParticipants(view.participants);
        setViewerCapabilities(view.viewerCapabilities);
        setActiveSection((prev) => prev || defaultSectionForPhase(view.session.phase));
        setLoadError(null);
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load session."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (activeSection !== "review" && activeSection !== "ideation" && activeSection !== "action") {
      setItemEventHandlers({});
    }
  }, [activeSection]);

  const registerItemWsHandler = useCallback((handler: (event: WsEvent) => void) => {
    setItemEventHandlers({ onWsEvent: handler });
  }, []);

  const handleIdeationItemsChange = useCallback((count: number) => {
    setHasIdeationItems(count > 0);
  }, []);

  const updateParticipantsPopoverPosition = useCallback(() => {
    setParticipantsPopoverStyle(getAnchoredPopoverStyle(participantsButtonRef.current, 288));
  }, []);

  const getPendingAdvanceButton = useCallback(
    (nextSection?: SessionSection | null) => {
      if (nextSection === "action") {
        return actionAdvanceButtonRef.current;
      }
      if (nextSection === "summary") {
        return closeSessionButtonRef.current;
      }
      return null;
    },
    [],
  );

  const updatePendingAdvancePopoverPosition = useCallback(() => {
    setPendingAdvancePopoverStyle(
      getAnchoredPopoverStyle(getPendingAdvanceButton(pendingAdvance?.nextSection), 384),
    );
  }, [getPendingAdvanceButton, pendingAdvance?.nextSection]);

  const openPendingAdvance = useCallback(
    (config: PendingAdvance) => {
      setPendingAdvancePopoverStyle(
        getAnchoredPopoverStyle(getPendingAdvanceButton(config.nextSection), 384),
      );
      setPendingAdvance(config);
    },
    [getPendingAdvanceButton],
  );

  // Close participant panel on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (participantsPanelRef.current && !participantsPanelRef.current.contains(e.target as Node)) {
        setShowParticipants(false);
      }
    }
    if (showParticipants) {
      updateParticipantsPopoverPosition();
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", updateParticipantsPopoverPosition);
      window.addEventListener("scroll", updateParticipantsPopoverPosition, true);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("resize", updateParticipantsPopoverPosition);
        window.removeEventListener("scroll", updateParticipantsPopoverPosition, true);
      };
    }
  }, [showParticipants, updateParticipantsPopoverPosition]);

  useEffect(() => {
    if (!pendingAdvance) {
      setPendingAdvancePopoverStyle(null);
      return;
    }

    const nextSection = pendingAdvance.nextSection;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const activeButton = getPendingAdvanceButton(nextSection);

      if (pendingAdvancePanelRef.current?.contains(target) || activeButton?.contains(target)) {
        return;
      }

      setPendingAdvance(null);
    }

    updatePendingAdvancePopoverPosition();
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", updatePendingAdvancePopoverPosition);
    window.addEventListener("scroll", updatePendingAdvancePopoverPosition, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updatePendingAdvancePopoverPosition);
      window.removeEventListener("scroll", updatePendingAdvancePopoverPosition, true);
    };
  }, [pendingAdvance, getPendingAdvanceButton, updatePendingAdvancePopoverPosition]);

  async function handleShare() {
    if (!session) {
      return;
    }

    try {
      const url = `${getPublicWebBaseUrl()}/join/${(
        await api.post<{ shareToken: string }>(`/api/sessions/${sessionId}/share`, {})
      ).shareToken}`;
      const result = await shareOrCopyLink(
        url,
        "Retrospective session",
        "Copy this share link:",
      );

      if (result === "cancelled") {
        return;
      }

      if (result === "failed") {
        throw new Error("Could not copy the share link.");
      }

      setShareState(result === "shared" ? "shared" : "copied");
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
    updateParticipantsPopoverPosition();
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
      setPendingAdvance(null);
    }
  }

  if (loading) return <p className="font-mono text-sm">Loading session...</p>;
  if (loadError) return <p className="font-bold text-red-600">{loadError}</p>;
  if (!session) return <p className="font-bold text-red-600">Session not found</p>;

  const visibleSection = activeSection || defaultSectionForPhase(session.phase);
  const liveSection = defaultSectionForPhase(session.phase);

  return (
    <div>
      <FloatingAvatars users={onlineUsers} />

      <div className="mb-6">
        <div className="relative inline-block pb-10">
          <a
            href={`/projects/${projectId}`}
            className={cn(
              scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
              "relative z-20 inline-block border-2 border-secondary bg-white px-3 py-1 text-sm font-bold uppercase",
            )}
          >
            ← Back
          </a>

          {projectName && (
            <div
              className="pointer-events-none absolute z-10 max-w-[calc(100vw-9rem)] origin-left -rotate-[8deg] sm:max-w-[15rem]"
              style={{ left: "calc(100% - 0.6rem)", top: "-0.05rem" }}
            >
              <ProjectNameTab
                projectName={projectName}
                testId="session-project-tab"
                className="max-w-full"
              />
            </div>
          )}
        </div>
      </div>

      <div className="mb-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-6">
          <div className="min-w-0">
            <h1 className="break-words text-4xl font-bold uppercase">{session.name}</h1>

            <div className="mt-5 flex flex-wrap items-start gap-3">
              {sectionOrder.map((section) => {
                const unlocked = isSectionUnlocked(section, session.phase);
                const isActive = visibleSection === section;
                const isLivePhase = liveSection === section;
                const sectionStyle = sectionStyles[section];
                return (
                  <div key={section} className="relative pt-4">
                    {isLivePhase && (
                      <span
                        className={cn(
                          "pointer-events-none absolute left-1/2 top-0 -translate-x-1/2",
                          sectionStyle.indicatorClass,
                        )}
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 16 16" className="section-bounce h-4 w-4 fill-current">
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
                          tone: isActive ? sectionStyle.tone : "neutral",
                          size: "compact",
                          tilt: "flat",
                          depth: "sm",
                        }),
                        "border-2 border-secondary px-4 py-2 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-35",
                        isActive ? sectionStyle.activeClass : sectionStyle.inactiveClass,
                      )}
                    >
                      {sectionLabels[section]}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative flex flex-col gap-3 lg:min-w-[18rem] lg:justify-self-end lg:pt-1">
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <div className="relative" ref={participantsPanelRef}>
                <button
                  ref={participantsButtonRef}
                  onClick={toggleParticipants}
                  type="button"
                  aria-label="Show participants"
                  aria-controls="session-participants"
                  aria-expanded={showParticipants}
                  aria-haspopup="dialog"
                  className={cn(
                    scrapbookButton({ tone: "sun", size: "compact", tilt: "flat", depth: "sm" }),
                    "flex min-h-12 min-w-12 -space-x-1 border-3 border-secondary bg-white p-1",
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
                  <div
                    id="session-participants"
                    role="dialog"
                    aria-labelledby="session-participants-title"
                    className="note-shell z-50 p-4"
                    data-note-theme="sun"
                    data-tape-position="top-right"
                    style={participantsPopoverStyle ?? undefined}
                  >
                    <h3 id="session-participants-title" className="mb-3 text-sm font-bold uppercase">Participants</h3>
                    {participants.length === 0 && (
                      <p className="scribble-help text-sm text-secondary/70">No participants recorded yet</p>
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

              {viewerCapabilities?.canShareSession && session.phase !== "closed" && (
                <button
                  onClick={handleShare}
                  className={cn(
                    scrapbookButton({ tone: "cobalt", size: "compact", tilt: "left", depth: "sm" }),
                    "border-3 border-secondary bg-[#5d83f9] px-4 py-2 text-sm font-bold uppercase text-secondary",
                  )}
                >
                  {shareState === "copied"
                    ? "Copied!"
                    : shareState === "shared"
                    ? "Shared!"
                    : "Share"}
                </button>
              )}
            </div>

            {viewerCapabilities?.canAdvancePhase && session.phase === "ideation" && (
              <div className="relative w-full lg:w-auto lg:self-end">
                <button
                  ref={actionAdvanceButtonRef}
                  onClick={() =>
                    openPendingAdvance({
                      nextSection: "action",
                      title: "Move to Look Forward?",
                      message: "This ends ideation editing and moves everyone into action planning. This can't be undone.",
                      busyLabel: "Moving...",
                      confirmLabel: "Yes, Move Forward",
                    })}
                   disabled={advancingPhase || !hasIdeationItems}
                   className={cn(
                     scrapbookButton({ tone: "plum", size: "regular", tilt: "right", depth: "md" }),
                     "w-full border-3 border-secondary bg-[#8f63ef] px-5 py-3 font-bold uppercase text-secondary disabled:opacity-50 lg:w-auto",
                   )}
                  >
                    Advance to Look Forward
                  </button>

                {pendingAdvance?.nextSection === "action" && pendingAdvancePopoverStyle && (
                  renderBodyPortal(
                    <div
                      ref={pendingAdvancePanelRef}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="pending-advance-title"
                      className="note-shell z-40 max-w-[calc(100vw-1.5rem)] p-4"
                      data-note-theme="plum"
                      data-tape-position="top-right"
                      style={pendingAdvancePopoverStyle ?? undefined}
                    >
                      <p id="pending-advance-title" className="text-sm font-bold uppercase">{pendingAdvance.title}</p>
                      <p className="scribble-help note-muted mt-2 text-sm">{pendingAdvance.message}</p>
                      <div className="mt-4 flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingAdvance(null)}
                          disabled={advancingPhase}
                          className={cn(
                            scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
                            "border-2 border-secondary note-panel px-4 py-2 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => advancePhase(pendingAdvance.nextSection)}
                          disabled={advancingPhase}
                          className={cn(
                            scrapbookButton({ tone: "plum", size: "compact", tilt: "left", depth: "sm" }),
                            "border-2 border-secondary bg-[#8f63ef] px-4 py-2 text-xs font-bold uppercase text-secondary disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {advancingPhase ? pendingAdvance.busyLabel : pendingAdvance.confirmLabel}
                        </button>
                      </div>
                    </div>,
                  )
                )}
              </div>
            )}

            {viewerCapabilities?.canAdvancePhase && session.phase === "action" && (
              <div className="relative w-full lg:w-auto lg:self-end">
                <button
                  ref={closeSessionButtonRef}
                  onClick={() =>
                    openPendingAdvance({
                      nextSection: "summary",
                      title: "Close this retrospective?",
                      message: "This ends live editing and opens the final summary view for the team. This action can't be undone.",
                      busyLabel: "Closing...",
                      confirmLabel: "Yes, Finish Session",
                    })}
                  className={cn(
                    scrapbookButton({ tone: "sun", size: "regular", tilt: "left", depth: "md" }),
                    "w-full border-3 border-secondary bg-[#f9d258] px-5 py-3 font-bold uppercase text-secondary lg:w-auto",
                  )}
                >
                  Finish Session
                </button>

                {pendingAdvance?.nextSection === "summary" && pendingAdvancePopoverStyle && (
                  renderBodyPortal(
                    <div
                      ref={pendingAdvancePanelRef}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="pending-advance-title"
                      className="note-shell z-40 max-w-[calc(100vw-1.5rem)] p-4"
                      data-note-theme="sun"
                      data-tape-position="top-right"
                      style={pendingAdvancePopoverStyle ?? undefined}
                    >
                      <p id="pending-advance-title" className="text-sm font-bold uppercase">{pendingAdvance.title}</p>
                      <p className="scribble-help note-muted mt-2 text-sm">{pendingAdvance.message}</p>
                      <div className="mt-4 flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingAdvance(null)}
                          disabled={advancingPhase}
                          className={cn(
                            scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
                            "border-2 border-secondary note-panel px-4 py-2 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => advancePhase(pendingAdvance.nextSection)}
                          disabled={advancingPhase}
                          className={cn(
                            scrapbookButton({ tone: "sun", size: "compact", tilt: "left", depth: "sm" }),
                            "border-2 border-secondary bg-[#f9d258] px-4 py-2 text-xs font-bold uppercase text-secondary disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {advancingPhase ? pendingAdvance.busyLabel : pendingAdvance.confirmLabel}
                        </button>
                      </div>
                    </div>,
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {visibleSection === "review" && (
        <ActionReviewFlow
          sessionId={sessionId}
          sessionPhase={session.phase}
          canFinalizeReviews={viewerCapabilities?.canFinalizeReviews ?? false}
          onRegisterWsHandler={registerItemWsHandler}
          onComplete={handleReviewComplete}
        />
      )}

      {visibleSection === "ideation" && (
        <IdeationBoard
          sessionId={sessionId}
          readOnly={session.phase !== "ideation"}
          onRegisterWsHandler={registerItemWsHandler}
          onItemCountChange={handleIdeationItemsChange}
        />
      )}

      {visibleSection === "action" && (
        <ActionBoard
          sessionId={sessionId}
          readOnly={session.phase === "closed"}
          onRegisterWsHandler={registerItemWsHandler}
        />
      )}

      {visibleSection === "summary" && session.phase === "closed" && (
        <SessionSummary sessionId={sessionId} />
      )}

    </div>
  );
}
