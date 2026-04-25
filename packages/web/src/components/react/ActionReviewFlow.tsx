import { useCallback, useEffect, useState } from "react";
import type { ReviewState, ReviewTally, WsEvent } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";
import { reviewStatusLabels } from "../../lib/session-summary";

type ReviewStatus = "did_nothing" | "actioned" | "disagree";

const emptyTally: ReviewTally = {
  actioned: 0,
  didNothing: 0,
  disagree: 0,
  total: 0,
};

function getTopStatuses(tally: ReviewTally): ReviewStatus[] {
  const entries: Array<[ReviewStatus, number]> = [
    ["actioned", tally.actioned],
    ["did_nothing", tally.didNothing],
    ["disagree", tally.disagree],
  ];
  const topCount = Math.max(...entries.map(([, count]) => count));
  if (topCount === 0) return [];
  return entries.filter(([, count]) => count === topCount).map(([status]) => status);
}

function formatTally(tally: ReviewTally) {
  return `${tally.actioned} actioned, ${tally.disagree} disagreed, ${tally.didNothing} try again`;
}

export default function ActionReviewFlow({
  sessionId,
  sessionPhase,
  canFinalizeReviews,
  onRegisterWsHandler,
  onComplete,
}: {
  sessionId: string;
  sessionPhase: "review" | "ideation" | "action" | "closed";
  canFinalizeReviews: boolean;
  onRegisterWsHandler: (handler: (event: WsEvent) => void) => void;
  onComplete: () => void;
}) {
  const [data, setData] = useState<ReviewState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [votingStatus, setVotingStatus] = useState<ReviewStatus | null>(null);
  const [finalizingStatus, setFinalizingStatus] = useState<ReviewStatus | "top" | null>(null);

  const loadReviewState = useCallback(async () => {
    const nextData = await api.get<ReviewState>(`/api/sessions/${sessionId}/reviews/pending`);
    setData(nextData);
    setLoadError(null);
    if (nextData.pending.length === 0 && sessionPhase === "review") onComplete();
    return nextData;
  }, [sessionId, sessionPhase, onComplete]);

  useEffect(() => {
    loadReviewState()
      .catch((err: Error) => setLoadError(err.message || "Failed to load reviews."));
  }, [loadReviewState]);

  useEffect(() => {
    onRegisterWsHandler((event: WsEvent) => {
      if (event.type === "review:vote_updated") {
        setData((prev) => prev
          ? {
            ...prev,
            voteTallies: prev.voteTallies.map((voteTally) => voteTally.actionId === event.payload.actionId
              ? { ...voteTally, tally: event.payload.tally }
              : voteTally),
          }
          : prev);
      }

      if (event.type === "review:finalized") {
        loadReviewState().catch(() => {});
      }
    });
  }, [loadReviewState, onRegisterWsHandler]);

  if (loadError) return <p className="font-bold text-red-600">{loadError}</p>;
  if (!data) return <p className="font-mono text-sm">Loading reviews...</p>;
  const reviewState = data;

  if (reviewState.total === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div
          className="note-shell rotate-[0.4deg] p-8 text-center"
          data-note-theme="light-peach"
          data-tape-position="top-center"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">
            Review
          </p>
          <h2 className="mt-3 text-2xl font-bold uppercase">Nothing to review yet</h2>
          <p className="scribble-help note-muted mt-3 text-base">
            This project doesn&apos;t have any actions from a previous retrospective yet, so there&apos;s
            nothing in the review stage for this session.
          </p>
        </div>
      </div>
    );
  }

  const currentAction = reviewState.pending[0];
  if (!currentAction) {
    return <ReviewRecap sessionId={sessionId} sessionPhase={sessionPhase} />;
  }

  const currentVoteState = reviewState.voteTallies.find((voteTally) => voteTally.actionId === currentAction.id);
  const tally = currentVoteState?.tally || emptyTally;
  const viewerVote = currentVoteState?.viewerVote || null;
  const topStatuses = getTopStatuses(tally);
  const topStatus = topStatuses.length === 1 ? topStatuses[0] : null;
  const reviewLocked = sessionPhase !== "review";
  const displayProgress = Math.min(reviewState.reviewed + 1, reviewState.total);
  const barProgress = Math.min(100, Math.max(0, (displayProgress / Math.max(reviewState.total, 1)) * 100));

  async function castVote(status: ReviewStatus) {
    if (sessionPhase !== "review") {
      return;
    }
    if (status === "disagree" && !comment.trim()) {
      alert("Please explain why you disagreed.");
      return;
    }
    setVotingStatus(status);
    try {
      await api.post(`/api/sessions/${sessionId}/reviews/votes`, {
        actionId: currentAction.id,
        status,
        comment: status === "disagree" ? comment : undefined,
      });
      await loadReviewState();
    } finally {
      setVotingStatus(null);
    }
  }

  async function finalizeReview(status?: ReviewStatus) {
    if (sessionPhase !== "review" || !canFinalizeReviews) {
      return;
    }
    setFinalizingStatus(status || "top");
    try {
      await api.post(`/api/sessions/${sessionId}/reviews`, {
        actionId: currentAction.id,
        status,
      });
      setComment("");
      await loadReviewState();
    } finally {
      setFinalizingStatus(null);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div
        className="note-shell relative mb-10 rotate-[-0.5deg] p-6"
        data-note-theme="light-peach"
        data-tape-position="top-center"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/50">
              Reviewing Previous Actions
            </p>
            <p className="scribble-help note-muted mt-1 text-base">
              Did we actually follow through on this one?
            </p>
          </div>
          <span className="border-2 border-secondary note-chip px-2 py-0.5 font-mono text-sm font-bold">
            {displayProgress}/{reviewState.total}
          </span>
        </div>

        <div className="note-panel mb-6 h-5 border-3 border-secondary">
          <div
            className="h-full bg-[#8f63ef] transition-all"
            style={{ width: `${barProgress}%` }}
          />
        </div>

        <div className="note-panel rotate-[0.4deg] border-3 border-secondary p-6">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">Action</p>
          <p className="mt-3 text-center text-xl font-bold">{currentAction.description}</p>
        </div>
      </div>

      <div className="note-panel mb-5 border-3 border-secondary p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary/45">Votes</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <TallyPill label="Actioned" count={tally.actioned} active={viewerVote?.status === "actioned"} />
          <TallyPill label="Disagreed" count={tally.disagree} active={viewerVote?.status === "disagree"} />
          <TallyPill label="Try Again" count={tally.didNothing} active={viewerVote?.status === "did_nothing"} />
        </div>
        {viewerVote && (
          <p className="scribble-help note-muted mt-3 text-sm">
            Your vote: {reviewStatusLabels[viewerVote.status]}
          </p>
        )}
      </div>

      <div className="space-y-4" data-testid="review-options">
        {reviewLocked && (
          <p className="scribble-help note-panel border-3 border-secondary px-4 py-3 text-base text-secondary/60">
            This review stage is finished, so these controls are read-only now.
          </p>
        )}

        <button
          onClick={() => castVote("actioned")}
          disabled={Boolean(votingStatus) || reviewLocked}
          data-testid="review-option-actioned"
          className={cn(
            scrapbookButton({ tone: "mint", size: "regular", tilt: "left", depth: "md" }),
            "w-full border-3 border-secondary bg-[#7ce29a] p-5 text-left disabled:opacity-50",
            viewerVote?.status === "actioned" && "ring-4 ring-secondary/20",
          )}
        >
          <span className="text-lg font-bold uppercase">Actioned</span>
          <span className="scribble-help mt-1 block text-base text-secondary/60">We did it, it landed well, and we can close it out</span>
        </button>

        <div
          className={cn(
            "note-shell rotate-[0.3deg] p-5",
            viewerVote?.status === "disagree" && "ring-4 ring-secondary/20",
          )}
          data-note-theme="sun"
          data-tape-position="top-right"
          data-testid="review-option-disagreed"
        >
          <span className="text-lg font-bold uppercase">Disagreed</span>
          <span className="scribble-help note-muted mb-3 mt-1 block text-base">
            We disagreed with this action or it missed the mark
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what happened..."
            disabled={reviewLocked || Boolean(votingStatus)}
            className="note-panel mb-3 w-full border-3 border-secondary px-4 py-3 text-sm font-medium focus:outline-none disabled:opacity-60"
            rows={2}
          />
          <button
            onClick={() => castVote("disagree")}
            disabled={Boolean(votingStatus) || reviewLocked || !comment.trim()}
            className={cn(
              scrapbookButton({ tone: "sun", size: "compact", tilt: "right", depth: "sm" }),
              "border-3 border-secondary note-panel px-5 py-2 font-bold uppercase disabled:opacity-50",
            )}
          >
            {votingStatus === "disagree" ? "Voting..." : "Vote Disagreed"}
          </button>
        </div>

        <button
          onClick={() => castVote("did_nothing")}
          disabled={Boolean(votingStatus) || reviewLocked}
          data-testid="review-option-did-nothing"
          className={cn(
            scrapbookButton({ tone: "blush", size: "regular", tilt: "right", depth: "md" }),
            "w-full border-3 border-secondary bg-[#ff9ab8] p-5 text-left disabled:opacity-50",
            viewerVote?.status === "did_nothing" && "ring-4 ring-secondary/20",
          )}
        >
          <span className="text-lg font-bold uppercase">We did nothing, try again</span>
          <span className="scribble-help mt-1 block text-base text-secondary/60">Roll this into the next retro and give it another shot</span>
        </button>

        {canFinalizeReviews && !reviewLocked && (
          <div className="note-shell rotate-[-0.2deg] p-5" data-note-theme="plum" data-tape-position="top-left">
            <p className="text-sm font-bold uppercase">Facilitator</p>
            <p className="scribble-help note-muted mt-1 text-sm">
              {tally.total === 0
                ? "Waiting for at least one vote."
                : topStatuses.length > 1
                  ? "Top votes are tied. Pick the outcome to accept."
                  : `Ready to accept ${reviewStatusLabels[topStatus!]} from ${formatTally(tally)}.`}
            </p>
            {topStatuses.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {topStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => finalizeReview(status)}
                    disabled={Boolean(finalizingStatus)}
                    className={cn(
                      scrapbookButton({ tone: "plum", size: "compact", tilt: "flat", depth: "sm" }),
                      "border-2 border-secondary bg-[#8f63ef] px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-50",
                    )}
                  >
                    {finalizingStatus === status ? "Accepting..." : reviewStatusLabels[status]}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => finalizeReview()}
                disabled={Boolean(finalizingStatus) || tally.total === 0}
                className={cn(
                  scrapbookButton({ tone: "plum", size: "regular", tilt: "left", depth: "md" }),
                  "mt-4 w-full border-3 border-secondary bg-[#8f63ef] px-5 py-3 font-bold uppercase text-white disabled:opacity-50",
                )}
              >
                {finalizingStatus ? "Accepting..." : "Accept Top Vote"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TallyPill({
  label,
  count,
  active,
}: {
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <div className={cn(
      "border-2 border-secondary bg-white px-2 py-2",
      active && "bg-[#FDCA40]",
    )}>
      <p className="font-mono text-lg font-bold">{count}</p>
      <p className="text-[10px] font-bold uppercase">{label}</p>
    </div>
  );
}

function ReviewRecap({
  sessionId,
  sessionPhase,
}: {
  sessionId: string;
  sessionPhase: "review" | "ideation" | "action" | "closed";
}) {
  const [data, setData] = useState<ReviewState | null>(null);

  useEffect(() => {
    api
      .get<ReviewState>(`/api/sessions/${sessionId}/reviews/pending`)
      .then(setData)
      .catch(() => {});
  }, [sessionId]);

  if (!data || data.total === 0) {
    return (
      <div
        className="note-shell rotate-[0.5deg] p-10 text-center"
        data-note-theme="peach"
        data-tape-position="top-center"
      >
        <p className="text-2xl font-bold uppercase">Review complete</p>
        <p className="mt-1 font-medium">
          {sessionPhase === "review"
            ? "Moving to ideation..."
            : "You can revisit this stage whenever you need to."}
        </p>
      </div>
    );
  }

  const actionMap = new Map(data.actions.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-2xl">
      <style>{recapAnimationStyles}</style>
      <div
        className="note-shell rotate-[0.5deg] p-8"
        data-note-theme="peach"
        data-tape-position="top-center"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/45 text-center">
          Look Back
        </p>
        <p className="text-center text-2xl font-bold uppercase mt-2">Review complete</p>
        <p className="mt-1 text-center font-medium text-secondary/60">
          {sessionPhase === "review"
            ? "Moving to ideation..."
            : "You can revisit this stage whenever you need to."}
        </p>

        <div className="mt-6 space-y-3">
          {data.reviews.map((review) => {
            const action = actionMap.get(review.actionId);
            if (!action) return null;
            const cardClass =
              review.status === "actioned"
                ? "recap-card--actioned"
                : review.status === "disagree"
                  ? "recap-card--disagreed"
                  : "recap-card--forward";
            const bg =
              review.status === "actioned"
                ? "#e9fff0"
                : review.status === "disagree"
                  ? "#fff6ca"
                  : "#fff0f5";
            return (
              <div
                key={review.id}
                style={{ backgroundColor: bg }}
                className={cn(
                  "recap-card group relative overflow-hidden border-3 border-secondary p-5 pr-24 cursor-default",
                  cardClass,
                )}
              >
                <div className="relative z-10">
                  <p className="text-lg font-bold">{action.description}</p>
                  <p className="mt-0.5 text-sm font-bold uppercase tracking-wide text-secondary/55">
                    {reviewStatusLabels[review.status]}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-secondary/45">
                    {formatTally(review.tally)}
                  </p>
                  {review.comment && (
                    <p className="mt-1.5 text-sm italic text-secondary/65">
                      &ldquo;{review.comment}&rdquo;
                    </p>
                  )}
                </div>
                <RecapIcon status={review.status} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecapIcon({ status }: { status: "actioned" | "disagree" | "did_nothing" }) {
  const base = "recap-stamp pointer-events-none absolute right-[-10px] top-1/2 -translate-y-1/2";
  if (status === "actioned") {
    return (
      <div className={cn(base, "recap-stamp--tick rotate-[-12deg]")}>
        <svg viewBox="0 0 24 24" className="h-24 w-24" fill="none" stroke="#1a8a3f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5 L9.5 18 L20 6" />
        </svg>
      </div>
    );
  }
  if (status === "disagree") {
    return (
      <div className={cn(base, "recap-stamp--cross rotate-[8deg]")}>
        <svg viewBox="0 0 24 24" className="recap-cross-main h-24 w-24" fill="none" stroke="#c43a00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
        <svg viewBox="0 0 60 60" className="recap-splat absolute inset-0 h-24 w-24">
          <circle cx="30" cy="30" r="10" fill="#c43a00" opacity="0" />
          <circle cx="12" cy="14" r="4" fill="#c43a00" opacity="0" />
          <circle cx="48" cy="12" r="3.5" fill="#c43a00" opacity="0" />
          <circle cx="10" cy="42" r="3" fill="#c43a00" opacity="0" />
          <circle cx="50" cy="46" r="4" fill="#c43a00" opacity="0" />
          <circle cx="30" cy="8" r="2.5" fill="#c43a00" opacity="0" />
          <circle cx="18" cy="50" r="3.5" fill="#c43a00" opacity="0" />
          <circle cx="46" cy="24" r="3" fill="#c43a00" opacity="0" />
          <circle cx="20" cy="26" r="2" fill="#c43a00" opacity="0" />
          <circle cx="40" cy="38" r="2.5" fill="#c43a00" opacity="0" />
        </svg>
      </div>
    );
  }
  return (
    <div className={cn(base, "recap-stamp--arrow rotate-[-6deg]")}>
      <svg viewBox="0 0 24 24" className="recap-arrow-main h-24 w-24" fill="none" stroke="#b8196e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12 H19 M14 6 L20 12 L14 18" />
      </svg>
      <svg viewBox="0 0 24 24" className="recap-arrow-trail absolute inset-0 h-24 w-24" fill="none" stroke="#b8196e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12 H19 M14 6 L20 12 L14 18" />
      </svg>
      <svg viewBox="0 0 24 24" className="recap-arrow-trail2 absolute inset-0 h-24 w-24" fill="none" stroke="#b8196e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12 H19 M14 6 L20 12 L14 18" />
      </svg>
    </div>
  );
}

const recapAnimationStyles = `
  /* Card base */
  .recap-card {
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }
  .recap-card:hover {
    box-shadow: 6px 6px 0 rgba(0,0,0,0.12);
    transform: scale(1.01);
  }

  /* Stamp base — watermark style */
  .recap-stamp {
    opacity: 0.18;
    transition: opacity 0.3s ease;
  }
  .recap-card:hover .recap-stamp {
    opacity: 0.35;
  }

  /* ===== TICK — stamps down with a big celebratory bounce ===== */
  .recap-stamp--tick svg {
    transform-origin: center center;
    transition: transform 0.1s ease;
  }
  .recap-card--actioned:hover .recap-stamp--tick {
    opacity: 0.5;
  }
  .recap-card--actioned:hover .recap-stamp--tick svg {
    animation: tickStamp 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes tickStamp {
    0%   { transform: scale(2.5) rotate(20deg); opacity: 0; }
    25%  { transform: scale(0.85) rotate(-8deg); opacity: 1; }
    40%  { transform: scale(1.2) rotate(4deg); }
    55%  { transform: scale(0.95) rotate(-2deg); }
    70%  { transform: scale(1.08) rotate(1deg); }
    85%  { transform: scale(0.98) rotate(0deg); }
    100% { transform: scale(1) rotate(0deg); }
  }

  /* ===== CROSS — slams in, shakes, then splatters ===== */
  .recap-cross-main {
    transition: transform 0.3s ease, opacity 0.2s ease;
  }
  .recap-card--disagreed:hover .recap-stamp--cross {
    opacity: 0.5;
  }
  .recap-card--disagreed:hover .recap-cross-main {
    animation: crossSlam 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  @keyframes crossSlam {
    0%   { transform: scale(1) rotate(0deg); }
    15%  { transform: scale(1.3) rotate(-3deg); }
    25%  { transform: scale(1) rotate(0deg); }
    30%  { transform: translateX(-4px) rotate(-2deg); }
    35%  { transform: translateX(4px) rotate(2deg); }
    40%  { transform: translateX(-3px) rotate(-1deg); }
    45%  { transform: translateX(2px) rotate(1deg); }
    50%  { transform: translateX(0); }
    65%  { transform: scale(0.4); opacity: 0.5; }
    100% { transform: scale(0); opacity: 0; }
  }
  .recap-splat circle {
    transition: opacity 0.01s ease;
  }
  .recap-card--disagreed:hover .recap-splat circle {
    animation: splatBurst 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.35s forwards;
  }
  @keyframes splatBurst {
    0%   { opacity: 0; r: 0; }
    50%  { opacity: 0.85; }
    100% { opacity: 0.7; }
  }

  /* ===== ARROW — swooshes forward with trailing echoes ===== */
  .recap-arrow-main {
    transition: transform 0.3s ease, opacity 0.3s ease;
  }
  .recap-arrow-trail, .recap-arrow-trail2 {
    opacity: 0;
    transition: transform 0.3s ease, opacity 0.3s ease;
  }
  .recap-card--forward:hover .recap-stamp--arrow {
    opacity: 0.5;
  }
  .recap-card--forward:hover .recap-arrow-main {
    animation: arrowSwoosh 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .recap-card--forward:hover .recap-arrow-trail {
    animation: arrowTrail1 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .recap-card--forward:hover .recap-arrow-trail2 {
    animation: arrowTrail2 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes arrowSwoosh {
    0%   { transform: translateX(-30px); opacity: 0; }
    20%  { opacity: 1; }
    60%  { opacity: 1; }
    100% { transform: translateX(40px); opacity: 0; }
  }
  @keyframes arrowTrail1 {
    0%   { transform: translateX(-30px) scale(0.85); opacity: 0; }
    30%  { opacity: 0.5; }
    70%  { opacity: 0.3; }
    100% { transform: translateX(40px) scale(0.85); opacity: 0; }
  }
  @keyframes arrowTrail2 {
    0%   { transform: translateX(-30px) scale(0.7); opacity: 0; }
    40%  { opacity: 0.3; }
    80%  { opacity: 0.15; }
    100% { transform: translateX(40px) scale(0.7); opacity: 0; }
  }
`;
