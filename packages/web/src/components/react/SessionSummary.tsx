import { useEffect, useState } from "react";
import type { SessionSummary as SessionSummaryData } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn } from "../../lib/button-styles";
import CopySummary from "./CopySummary";
import {
  buildSessionSummaryMarkdown,
  formatVoteCount,
  reviewStatusLabels,
} from "../../lib/session-summary";

function formatDateTime(value: string | null): string {
  if (!value) return "Still open";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const reviewToneClasses = {
  actioned: "bg-green-300",
  did_nothing: "bg-amber-200",
  disagree: "bg-red-300",
} as const;

export default function SessionSummary({
  sessionId,
}: {
  sessionId: string;
}) {
  const [summary, setSummary] = useState<SessionSummaryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<SessionSummaryData>(`/api/sessions/${sessionId}/summary`)
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return <p className="font-bold text-red-600">Failed to load summary: {error}</p>;
  }

  if (!summary) {
    return <p className="font-mono text-sm">Loading summary...</p>;
  }

  const markdown = buildSessionSummaryMarkdown(summary);
  const goodItems = summary.items
    .filter((item) => item.type === "good")
    .sort((a, b) => b.voteCount - a.voteCount);
  const badItems = summary.items
    .filter((item) => item.type === "bad")
    .sort((a, b) => b.voteCount - a.voteCount);
  const carriedOverActions = summary.actions.filter((action) => action.bundleId === null);

  return (
    <div className="space-y-8">
      <div className="border-3 border-secondary bg-white p-6 rotate-[-0.4deg]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/50">
              Final Summary
            </p>
            <h2 className="mt-2 text-3xl font-bold uppercase">{summary.session.name}</h2>
            <p className="scribble-help mt-3 max-w-2xl text-base text-secondary/60">
              Everything from this retrospective is collected here, including attendance, review outcomes,
              ideation notes, and the action plan that came out of it.
            </p>
          </div>
          <CopySummary text={markdown} />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="border-3 border-secondary bg-surface p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Sequence</p>
            <p className="mt-2 text-2xl font-bold">#{summary.session.sequence}</p>
          </div>
          <div className="border-3 border-secondary bg-surface p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Closed</p>
            <p className="mt-2 text-sm font-bold">{formatDateTime(summary.session.closedAt)}</p>
          </div>
          <div className="border-3 border-secondary bg-surface p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Participants</p>
            <p className="mt-2 text-2xl font-bold">{summary.participants.length}</p>
          </div>
          <div className="border-3 border-secondary bg-surface p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Actions</p>
            <p className="mt-2 text-2xl font-bold">{summary.actions.length}</p>
          </div>
        </div>
      </div>

      <section className="border-3 border-secondary bg-white p-5 rotate-[0.2deg]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold uppercase">Who Was There</h3>
          <span className="border-2 border-secondary bg-tertiary px-2 py-0.5 text-xs font-bold uppercase">
            {summary.participants.length} total
          </span>
        </div>
        {summary.participants.length === 0 ? (
          <p className="scribble-help text-base text-secondary/60">No participants were recorded for this session.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {summary.participants.map((participant) => (
              <div
                key={participant.userId}
                className="flex items-center gap-3 border-2 border-secondary bg-surface px-3 py-2"
              >
                <div className="flex h-9 w-9 items-center justify-center border-2 border-secondary bg-tertiary text-sm font-bold overflow-hidden">
                  {participant.avatarUrl ? (
                    <img
                      src={participant.avatarUrl}
                      alt={participant.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    participant.username[0]?.toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-bold">{participant.username}</p>
                  <p className="text-xs font-medium uppercase text-secondary/45">{participant.role}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {summary.reviews.length > 0 && (
        <section className="border-3 border-secondary bg-white p-5 rotate-[-0.25deg]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold uppercase">Previous Action Review</h3>
            <span className="border-2 border-secondary bg-purple-200 px-2 py-0.5 text-xs font-bold uppercase">
              {summary.reviews.length} reviewed
            </span>
          </div>
          <div className="space-y-3">
            {summary.reviews.map((review) => (
              <div key={`${review.actionId}-${review.createdAt}`} className="border-2 border-secondary bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "border-2 border-secondary px-2 py-0.5 text-xs font-bold uppercase",
                      reviewToneClasses[review.status],
                    )}
                  >
                    {reviewStatusLabels[review.status]}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">
                    Reviewed by {review.reviewerName}
                  </span>
                </div>
                <p className="mt-3 text-lg font-bold">{review.actionDescription}</p>
                {review.comment && (
                  <p className="mt-2 border-l-4 border-secondary pl-3 text-sm font-medium text-secondary/70">
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border-3 border-secondary bg-green-50 p-5 rotate-[-0.3deg]">
          <div className="mb-4 inline-block border-3 border-secondary bg-green-300 px-4 py-2">
            <h3 className="text-sm font-bold uppercase">Went Well</h3>
          </div>
          {goodItems.length === 0 ? (
            <p className="scribble-help text-base text-secondary/60">No wins were captured in this session.</p>
          ) : (
            <div className="space-y-3">
              {goodItems.map((item) => (
                <div key={item.id} className="border-2 border-secondary bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{item.content}</p>
                    <span className="shrink-0 border-2 border-secondary bg-tertiary px-2 py-0.5 text-xs font-bold">
                      {formatVoteCount(item.voteCount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-3 border-secondary bg-red-50 p-5 rotate-[0.35deg]">
          <div className="mb-4 inline-block border-3 border-secondary bg-red-300 px-4 py-2">
            <h3 className="text-sm font-bold uppercase">Needs Work</h3>
          </div>
          {badItems.length === 0 ? (
            <p className="scribble-help text-base text-secondary/60">No follow-up issues were captured in this session.</p>
          ) : (
            <div className="space-y-3">
              {badItems.map((item) => (
                <div key={item.id} className="border-2 border-secondary bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{item.content}</p>
                    <span className="shrink-0 border-2 border-secondary bg-tertiary px-2 py-0.5 text-xs font-bold">
                      {formatVoteCount(item.voteCount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="border-3 border-secondary bg-white p-5 rotate-[0.25deg]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold uppercase">Action Plan</h3>
          <span className="border-2 border-secondary bg-primary px-2 py-0.5 text-xs font-bold uppercase text-white">
            {summary.actions.length} actions
          </span>
        </div>

        <div className="space-y-6">
          {summary.bundles.map((bundle) => {
            const bundleItems = summary.items.filter((item) => bundle.itemIds.includes(item.id));
            const bundleActions = summary.actions.filter((action) => action.bundleId === bundle.id);

            if (bundleItems.length === 0 && bundleActions.length === 0) {
              return null;
            }

            return (
              <div key={bundle.id} className="border-3 border-secondary bg-surface">
                <div className="border-b-3 border-secondary bg-primary px-4 py-3 text-white">
                  <h4 className="text-lg font-bold uppercase">{bundle.label || "Unnamed Action Group"}</h4>
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">Context</p>
                    {bundleItems.length === 0 ? (
                      <p className="scribble-help mt-3 text-base text-secondary/60">No source items linked.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {bundleItems.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              "border-2 border-secondary px-3 py-2 text-sm font-medium",
                              item.type === "good" ? "bg-green-100" : "bg-red-100",
                            )}
                          >
                            {item.content}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/45">Actions</p>
                    {bundleActions.length === 0 ? (
                      <p className="scribble-help mt-3 text-base text-secondary/60">No actions were created for this group.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {bundleActions.map((action) => (
                          <div key={action.id} className="border-2 border-secondary bg-white px-3 py-2">
                            <p className="font-bold">{action.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {carriedOverActions.length > 0 && (
            <div className="border-3 border-secondary bg-purple-50">
              <div className="border-b-3 border-secondary bg-purple-300 px-4 py-3">
                <h4 className="text-lg font-bold uppercase">Carried Over</h4>
              </div>
              <div className="space-y-2 p-4">
                {carriedOverActions.map((action) => (
                  <div key={action.id} className="border-2 border-secondary bg-white px-3 py-2">
                    <p className="font-bold">{action.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.bundles.length === 0 && carriedOverActions.length === 0 && (
            <p className="scribble-help text-base text-secondary/60">No action groups or actions were captured in this session.</p>
          )}
        </div>
      </section>
    </div>
  );
}
