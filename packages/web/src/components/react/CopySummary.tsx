import { useState } from "react";
import { cn, scrapbookButton, type ScrapbookButtonTone } from "../../lib/button-styles";
import { copyTextToClipboard } from "../../lib/clipboard";

export default function CopySummary({
  text,
  label = "Copy Summary",
  tone = "warm",
  className,
}: {
  text: string | null;
  label?: string;
  tone?: ScrapbookButtonTone;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (!text) return;

    const success = await copyTextToClipboard(text);
    setCopied(success);
    if (success) {
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!text}
      className={cn(
        scrapbookButton({ tone, size: "regular", tilt: "right", depth: "md" }),
        "mb-6 border-3 border-secondary bg-tertiary px-5 py-3 font-bold uppercase disabled:opacity-50",
        className,
      )}
    >
      {copied ? "Copied!" : text === null ? "Preparing..." : label}
    </button>
  );
}
