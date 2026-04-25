import { useState } from "react";
import type { SummaryShareTokenResponse } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton, type ScrapbookButtonTone } from "../../lib/button-styles";
import { shareOrCopyLink } from "../../lib/clipboard";
import { getPublicWebBaseUrl } from "../../lib/runtime-urls";

export default function ShareSummaryButton({
  sessionId,
  label = "Share Summary",
  tone = "cobalt",
  className,
}: {
  sessionId: string;
  label?: string;
  tone?: ScrapbookButtonTone;
  className?: string;
}) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const [sharing, setSharing] = useState(false);

  async function handleClick() {
    if (sharing) {
      return;
    }

    setSharing(true);

    try {
      const { summaryShareToken } = await api.post<SummaryShareTokenResponse>(
        `/api/sessions/${sessionId}/summary-share`,
        {},
      );
      const url = `${getPublicWebBaseUrl()}/summary/${summaryShareToken}`;
      const result = await shareOrCopyLink(
        url,
        "Retrospective summary",
        "Copy this summary link:",
      );

      if (result === "cancelled") {
        return;
      }

      if (result === "failed") {
        throw new Error("Could not copy the summary link.");
      }

      if (result === "copied") {
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      } else if (result === "shared") {
        setShareState("shared");
        setTimeout(() => setShareState("idle"), 2000);
      }
    } catch (err: any) {
      alert(err.message || "Failed to share summary.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={sharing}
      className={cn(
        scrapbookButton({ tone, size: "regular", tilt: "left", depth: "md" }),
        "border-3 border-secondary bg-[#5d83f9] px-5 py-3 font-bold uppercase text-secondary disabled:opacity-50",
        className,
      )}
    >
      {shareState === "copied" ? "Copied!" : shareState === "shared" ? "Shared!" : sharing ? "Sharing..." : label}
    </button>
  );
}
