import { useEffect, useState } from "react";
import type { ReviewState } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";

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
          data-note-theme="lavender"
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
    return (
      <div
        className="note-shell rotate-[0.5deg] p-10 text-center"
        data-note-theme="mint"
        data-tape-position="top-center"
      >
        <p className="text-2xl font-bold uppercase">Review complete</p>
        <p className="mt-1 font-medium">
          {sessionPhase === "review" ? "Moving to ideation..." : "You can revisit this stage whenever you need to."}
        </p>
      </div>
    );
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
        data-note-theme="lavender"
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
