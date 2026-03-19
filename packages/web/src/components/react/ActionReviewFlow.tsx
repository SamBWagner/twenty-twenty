import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";

interface Action {
  id: string;
  description: string;
  assigneeId: string | null;
}

interface ReviewData {
  actions: Action[];
  reviews: { actionId: string; status: string }[];
  pending: Action[];
  total: number;
  reviewed: number;
}

export default function ActionReviewFlow({
  sessionId,
  sessionPhase,
  onComplete,
}: {
  sessionId: string;
  sessionPhase: "review" | "ideation" | "action" | "closed";
  onComplete: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<ReviewData>(`/api/sessions/${sessionId}/reviews/pending`).then((d) => {
      setData(d);
      if (d.pending.length === 0 && sessionPhase === "review") onComplete();
    });
  }, [sessionId, sessionPhase, onComplete]);

  if (!data) return <p className="font-mono text-sm">Loading reviews...</p>;

  if (data.total === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rotate-[0.4deg] border-3 border-secondary bg-white p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">
            Review
          </p>
          <h2 className="mt-3 text-2xl font-bold uppercase">Nothing to review yet</h2>
          <p className="mt-3 text-sm font-medium text-secondary/65">
            This project doesn&apos;t have any actions from a previous retrospective yet, so there&apos;s
            nothing in the review stage for this session.
          </p>
        </div>
      </div>
    );
  }

  const currentAction = data.pending[currentIndex];
  if (!currentAction) {
    return (
      <div className="rotate-[0.5deg] border-3 border-secondary bg-green-300 p-10 text-center">
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
      if (nextIndex >= data.pending.length) {
        onComplete();
      } else {
        setCurrentIndex(nextIndex);
        setComment("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const progress = data.reviewed + currentIndex + 1;
  const reviewLocked = sessionPhase !== "review";

  return (
    <div className="mx-auto max-w-xl">
      <div className="relative mb-10 rotate-[-0.5deg] border-3 border-secondary bg-white p-6">
        <div className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 rotate-[-3deg] border-2 border-secondary bg-tertiary/70"></div>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/50">
              Reviewing Previous Actions
            </p>
            <p className="mt-1 text-sm font-medium text-secondary/60">
              Did we actually follow through on this one?
            </p>
          </div>
          <span className="border-2 border-secondary bg-tertiary px-2 py-0.5 font-mono text-sm font-bold">
            {progress}/{data.total}
          </span>
        </div>

        <div className="mb-6 h-5 border-3 border-secondary bg-white">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(progress / data.total) * 100}%` }}
          />
        </div>

        <div className="rotate-[0.4deg] border-3 border-secondary bg-surface p-6">
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">Action</p>
          <p className="mt-3 text-center text-xl font-bold">{currentAction.description}</p>
        </div>
      </div>

      <div className="space-y-4" data-testid="review-options">
        {reviewLocked && (
          <p className="border-3 border-secondary bg-white px-4 py-3 text-sm font-medium text-secondary/60">
            This review stage is finished, so these controls are read-only now.
          </p>
        )}

        <button
          onClick={() => submitReview("actioned")}
          disabled={submitting || reviewLocked}
          data-testid="review-option-actioned"
          className={cn(
            scrapbookButton({ tone: "success", size: "regular", tilt: "left", depth: "md" }),
            "w-full border-3 border-secondary bg-green-300 p-5 text-left disabled:opacity-50",
          )}
        >
          <span className="text-lg font-bold uppercase">Actioned</span>
          <span className="mt-1 block text-sm text-secondary/60">We did it, it landed well, and we can close it out</span>
        </button>

        <div className="rotate-[0.3deg] border-3 border-secondary bg-tertiary p-5" data-testid="review-option-disagreed">
          <span className="text-lg font-bold uppercase">Disagreed</span>
          <span className="mb-3 mt-1 block text-sm text-secondary/60">
            We disagreed with this action or it missed the mark
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us what happened..."
            disabled={reviewLocked}
            className="mb-3 w-full border-3 border-secondary bg-white px-4 py-3 text-sm font-medium focus:outline-none disabled:opacity-60"
            rows={2}
          />
          <button
            onClick={() => submitReview("disagree")}
            disabled={submitting || reviewLocked || !comment.trim()}
            className={cn(
              scrapbookButton({ tone: "warm", size: "compact", tilt: "right", depth: "sm" }),
              "border-3 border-secondary bg-white px-5 py-2 font-bold uppercase disabled:opacity-50",
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
            scrapbookButton({ tone: "danger", size: "regular", tilt: "right", depth: "md" }),
            "w-full border-3 border-secondary bg-red-300 p-5 text-left disabled:opacity-50",
          )}
        >
          <span className="text-lg font-bold uppercase">We did nothing, try again</span>
          <span className="mt-1 block text-sm text-secondary/60">Roll this into the next retro and give it another shot</span>
        </button>
      </div>
    </div>
  );
}
