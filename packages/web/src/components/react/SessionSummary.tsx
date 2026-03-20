import { useEffect, useState } from "react";
import type { SessionSummary as SessionSummaryData } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { buildSessionSummaryMarkdown, toSessionSummaryDisplayData } from "../../lib/session-summary";
import CopySummary from "./CopySummary";
import SessionSummaryContent from "./SessionSummaryContent";
import ShareSummaryButton from "./ShareSummaryButton";

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

  const displaySummary = toSessionSummaryDisplayData(summary);
  const markdown = buildSessionSummaryMarkdown(displaySummary);

  return (
    <SessionSummaryContent
      summary={displaySummary}
      headerActions={[
        <ShareSummaryButton key="share" sessionId={sessionId} />,
        <CopySummary
          key="copy"
          text={markdown}
          tone="cobalt"
          className="mb-0 bg-[#5d83f9] text-white"
        />,
      ]}
    />
  );
}
