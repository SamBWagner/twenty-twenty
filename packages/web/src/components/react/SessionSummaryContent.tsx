import type { ReactNode } from "react";
import type { SharedSessionSummary as SessionSummaryDisplayData } from "@twenty-twenty/shared";
import { cn } from "../../lib/button-styles";
import { formatVoteCount, reviewStatusLabels } from "../../lib/session-summary";

function formatDateTime(value: string | null): string {
  if (!value) return "Still open";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const reviewToneClasses = {
  actioned: "bg-[#7ce29a]",
  did_nothing: "bg-[#f9d258]",
  disagree: "bg-[#ff9ab8]",
} as const;

export default function SessionSummaryContent({
  summary,
  headerActions,
}: {
  summary: SessionSummaryDisplayData;
  headerActions?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <div
        className="note-shell rotate-[-0.4deg] p-6"
        data-note-theme="sun"
        data-tape-position="top-center"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-block border-2 border-secondary note-chip px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]">
              Final Summary
            </p>
            <h2 className="mt-2 text-3xl font-bold uppercase">{summary.session.name}</h2>
            <p className="scribble-help note-muted mt-3 max-w-2xl text-base">
              Everything from this retrospective is collected here, including attendance, review outcomes,
              ideation notes, and the action plan that came out of it.
            </p>
          </div>
          {headerActions && (
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              {headerActions}
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="note-panel border-3 border-secondary p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Sequence</p>
            <p className="mt-2 text-2xl font-bold">#{summary.session.sequence}</p>
          </div>
          <div className="note-panel border-3 border-secondary p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Closed</p>
            <p className="mt-2 text-sm font-bold">{formatDateTime(summary.session.closedAt)}</p>
          </div>
          <div className="note-panel border-3 border-secondary p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Participants</p>
            <p className="mt-2 text-2xl font-bold">{summary.participants.length}</p>
          </div>
          <div className="note-panel border-3 border-secondary p-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary/40">Actions</p>
            <p className="mt-2 text-2xl font-bold">{summary.actionCount}</p>
          </div>
        </div>
      </div>

      <section
        className="note-shell rotate-[0.2deg] p-5"
        data-note-theme="sun"
        data-tape-position="side-left"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold uppercase">Who Was There</h3>
          <span className="border-2 border-secondary note-chip px-2 py-0.5 text-xs font-bold uppercase">
            {summary.participants.length} total
          </span>
        </div>
        {summary.participants.length === 0 ? (
          <p className="scribble-help note-muted text-base">No participants were recorded for this session.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {summary.participants.map((participant, index) => (
              <div
                key={`${participant.username}-${participant.role}-${index}`}
                className="note-panel flex items-center gap-3 border-2 border-secondary px-3 py-2"
              >
                <div className="note-chip flex h-9 w-9 items-center justify-center overflow-hidden border-2 border-secondary text-sm font-bold">
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
        <section
          className="note-shell rotate-[-0.25deg] p-5"
          data-note-theme="lavender"
          data-tape-position="top-right"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold uppercase">Previous Action Review</h3>
            <span className="border-2 border-secondary note-chip px-2 py-0.5 text-xs font-bold uppercase">
              {summary.reviews.length} reviewed
            </span>
          </div>
          <div className="space-y-3">
            {summary.reviews.map((review) => (
              <div
                key={`${review.actionDescription}-${review.reviewerName}-${review.createdAt}`}
                className="note-panel border-2 border-secondary p-4"
              >
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
        <section
          className="note-shell rotate-[-0.3deg] p-5"
          data-note-theme="mint"
          data-tape-position="top-center"
        >
          <div className="note-accent mb-4 inline-block border-3 border-secondary px-4 py-2">
            <h3 className="text-sm font-bold uppercase">Went Well</h3>
          </div>
          {summary.goodItems.length === 0 ? (
            <p className="scribble-help note-muted text-base">No wins were captured in this session.</p>
          ) : (
            <div className="space-y-3">
              {summary.goodItems.map((item, index) => (
                <div key={`${item.content}-${index}`} className="note-panel border-2 border-secondary p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{item.content}</p>
                    <span className="note-chip shrink-0 border-2 border-secondary px-2 py-0.5 text-xs font-bold">
                      {formatVoteCount(item.voteCount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="note-shell rotate-[0.35deg] p-5"
          data-note-theme="blush"
          data-tape-position="top-right"
        >
          <div className="note-accent mb-4 inline-block border-3 border-secondary px-4 py-2">
            <h3 className="text-sm font-bold uppercase">Needs Work</h3>
          </div>
          {summary.badItems.length === 0 ? (
            <p className="scribble-help note-muted text-base">No follow-up issues were captured in this session.</p>
          ) : (
            <div className="space-y-3">
              {summary.badItems.map((item, index) => (
                <div key={`${item.content}-${index}`} className="note-panel border-2 border-secondary p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{item.content}</p>
                    <span className="note-chip shrink-0 border-2 border-secondary px-2 py-0.5 text-xs font-bold">
                      {formatVoteCount(item.voteCount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section
        className="note-shell rotate-[0.25deg] p-5"
        data-note-theme="plum"
        data-tape-position="side-left"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold uppercase">Action Plan</h3>
          <span className="border-2 border-secondary note-chip px-2 py-0.5 text-xs font-bold uppercase">
            {summary.actionCount} actions
          </span>
        </div>

        <div className="space-y-3">
          {summary.actions.length > 0 ? (
            summary.actions.map((action, index) => (
              <div
                key={`${action.description}-${index}`}
                className="note-row border-2 border-secondary px-3 py-2"
              >
                <p className="font-bold">{action.description}</p>
              </div>
            ))
          ) : (
            <p className="scribble-help note-panel border-3 border-secondary px-4 py-3 text-base text-secondary/60">
              No actions were captured in this session.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
