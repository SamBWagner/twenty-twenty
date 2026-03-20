import { useEffect, useState } from "react";
import type { SharedSessionSummary } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";
import SessionSummaryContent from "./SessionSummaryContent";

export default function SharedSessionSummaryPage({ token }: { token: string }) {
  const [summary, setSummary] = useState<SharedSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<SharedSessionSummary>(`/api/sessions/summary-share/${token}`)
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("This summary link is invalid, expired, or no longer available.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="max-w-md border-3 border-secondary bg-white p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold uppercase">Oops</h2>
          <p className="font-mono text-sm">{error}</p>
          <a
            href="/"
            className={cn(
              scrapbookButton({ tone: "warm", size: "regular", tilt: "left", depth: "sm" }),
              "mt-6 inline-block border-3 border-secondary bg-tertiary px-6 py-3 font-bold uppercase",
            )}
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!summary) {
    return <p className="py-20 text-center font-mono text-sm">Loading summary...</p>;
  }

  return <SessionSummaryContent summary={summary} />;
}
