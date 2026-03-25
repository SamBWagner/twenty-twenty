import { useEffect, useState } from "react";
import type { ReviewState } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";
import { reviewStatusLabels } from "../../lib/session-summary";

export default function ActionReviewFlow({
  sessionId,
  sessionPhase,
  onComplete,
}: {
  sessionId: string;
  sessionPhase: "review" | "ideation" | "action" | "closed";
  onComplete: () => void;
}) {
  const [data, setData] = useState<ReviewState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<ReviewState>(`/api/sessions/${sessionId}/reviews/pending`)
      .then((d) => {
        setData(d);
        setLoadError(null);
        if (d.pending.length === 0 && sessionPhase === "review") onComplete();
      })
      .catch((err: Error) => setLoadError(err.message || "Failed to load reviews."));
  }, [sessionId, sessionPhase, onComplete]);

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

  const currentAction = reviewState.pending[currentIndex];
  if (!currentAction) {
    return <ReviewRecap sessionId={sessionId} sessionPhase={sessionPhase} />;
  }

  async function submitReview(status: "did_nothing" | "actioned" | "disagree") {
    if (sessionPhase !== "review") {
      return;
    }
    if (status === "disagree" && !comment.trim()) {
      alert("Please explain why you disagreed.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/sessions/${sessionId}/reviews`, {
        actionId: currentAction.id,
        status,
        comment: status === "disagree" ? comment : undefined,
      });
      const nextIndex = currentIndex + 1;
      if (nextIndex >= reviewState.pending.length) {
        onComplete();
      } else {
        setCurrentIndex(nextIndex);
        setComment("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const progress = reviewState.reviewed + currentIndex + 1;
  const reviewLocked = sessionPhase !== "review";

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
            {progress}/{reviewState.total}
          </span>
        </div>

        <div className="note-panel mb-6 h-5 border-3 border-secondary">
          <div
            className="h-full bg-[#8f63ef] transition-all"
            style={{ width: `${(progress / reviewState.total) * 100}%` }}
          />
        </div>

        <div className="note-panel rotate-[0.4deg] border-3 border-secondary p-6">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">Action</p>
          <p className="mt-3 text-center text-xl font-bold">{currentAction.description}</p>
        </div>
      </div>

      <div className="space-y-4" data-testid="review-options">
        {reviewLocked && (
          <p className="scribble-help note-panel border-3 border-secondary px-4 py-3 text-base text-secondary/60">
            This review stage is finished, so these controls are read-only now.
          </p>
        )}

        <button
          onClick={() => submitReview("actioned")}
          disabled={submitting || reviewLocked}
          data-testid="review-option-actioned"
          className={cn(
            scrapbookButton({ tone: "mint", size: "regular", tilt: "left", depth: "md" }),
            "w-full border-3 border-secondary bg-[#7ce29a] p-5 text-left disabled:opacity-50",
          )}
        >
          <span className="text-lg font-bold uppercase">Actioned</span>
          <span className="scribble-help mt-1 block text-base text-secondary/60">We did it, it landed well, and we can close it out</span>
        </button>

        <div className="note-shell rotate-[0.3deg] p-5" data-note-theme="sun" data-tape-position="top-right" data-testid="review-option-disagreed">
          <span className="text-lg font-bold uppercase">Disagreed</span>
          <span className="scribble-help note-muted mb-3 mt-1 block text-base">
            We disagreed with this action or it missed the mark
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what happened..."
            disabled={reviewLocked}
            className="note-panel mb-3 w-full border-3 border-secondary px-4 py-3 text-sm font-medium focus:outline-none disabled:opacity-60"
            rows={2}
          />
          <button
            onClick={() => submitReview("disagree")}
            disabled={submitting || reviewLocked || !comment.trim()}
            className={cn(
              scrapbookButton({ tone: "sun", size: "compact", tilt: "right", depth: "sm" }),
              "border-3 border-secondary note-panel px-5 py-2 font-bold uppercase disabled:opacity-50",
            )}
          >
            Submit Disagreed
          </button>
        </div>

        <button
          onClick={() => submitReview("did_nothing")}
          disabled={submitting || reviewLocked}
          data-testid="review-option-did-nothing"
          className={cn(
            scrapbookButton({ tone: "blush", size: "regular", tilt: "right", depth: "md" }),
            "w-full border-3 border-secondary bg-[#ff9ab8] p-5 text-left disabled:opacity-50",
          )}
        >
          <span className="text-lg font-bold uppercase">We did nothing, try again</span>
          <span className="scribble-help mt-1 block text-base text-secondary/60">Roll this into the next retro and give it another shot</span>
        </button>
      </div>
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
