import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";

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
  onComplete,
}: {
  sessionId: string;
  onComplete: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<ReviewData>(`/api/sessions/${sessionId}/reviews/pending`).then((d) => {
      setData(d);
      if (d.pending.length === 0) onComplete();
    });
  }, [sessionId]);

  if (!data) return <p className="font-mono text-sm">Loading reviews...</p>;

  const currentAction = data.pending[currentIndex];
  if (!currentAction) {
    return (
      <div className="border-3 border-secondary bg-green-300 p-10 text-center rotate-[0.5deg]">
        <p className="text-2xl font-bold uppercase">All reviewed!</p>
        <p className="mt-1 font-medium">Moving to ideation...</p>
      </div>
    );
  }

  async function submitReview(status: "did_nothing" | "actioned" | "disagree") {
    if (status === "disagree" && !comment.trim()) {
      alert("Please explain why you disagree.");
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
      if (nextIndex >= data!.pending.length) {
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

  return (
    <div className="mx-auto max-w-lg">
      {/* Progress */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-secondary/50">Reviewing Previous Actions</span>
        <span className="border-2 border-secondary bg-tertiary px-2 py-0.5 font-mono text-sm font-bold">
          {progress}/{data.total}
        </span>
      </div>
      <div className="mb-8 h-5 border-3 border-secondary bg-white">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(progress / data.total) * 100}%` }}
        />
      </div>

      {/* Current action card — like a pinned note */}
      <div className="relative border-3 border-secondary bg-white p-8 rotate-[-0.5deg] mb-6">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-tertiary/70 border-2 border-secondary rotate-[-3deg]"></div>
        <p className="text-xl font-bold text-center">{currentAction.description}</p>
      </div>

      {/* Review options — scattered buttons */}
      <div className="space-y-4">
        <button
          onClick={() => submitReview("did_nothing")}
          disabled={submitting}
          className="w-full border-3 border-secondary bg-tertiary p-5 text-left shadow-brutal rotate-[0.5deg] transition-all hover:rotate-0 hover:shadow-brutal-lg disabled:opacity-50"
        >
          <span className="font-bold uppercase text-lg">We did nothing</span>
          <span className="block text-sm mt-1 text-secondary/60">Roll this into the next retro</span>
        </button>

        <button
          onClick={() => submitReview("actioned")}
          disabled={submitting}
          className="w-full border-3 border-secondary bg-green-300 p-5 text-left shadow-brutal rotate-[-0.5deg] transition-all hover:rotate-0 hover:shadow-brutal-lg disabled:opacity-50"
        >
          <span className="font-bold uppercase text-lg">Actioned ✓</span>
          <span className="block text-sm mt-1 text-secondary/60">We did it, went well — close it out</span>
        </button>

        <div className="border-3 border-secondary bg-red-200 p-5 shadow-brutal rotate-[0.3deg]">
          <span className="font-bold uppercase text-lg">Disagree</span>
          <span className="block text-sm mt-1 mb-3 text-secondary/60">Wrong call or didn't work out</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explain why..."
            className="w-full border-3 border-secondary bg-white px-4 py-3 text-sm font-medium mb-3 focus:outline-none"
            rows={2}
          />
          <button
            onClick={() => submitReview("disagree")}
            disabled={submitting || !comment.trim()}
            className="border-3 border-secondary bg-red-500 px-5 py-2 font-bold uppercase text-white transition-all hover:shadow-brutal-sm disabled:opacity-50"
          >
            Submit ✗
          </button>
        </div>
      </div>
    </div>
  );
}
