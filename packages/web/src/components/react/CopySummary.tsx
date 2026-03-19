import { useState } from "react";
import { cn, scrapbookButton } from "../../lib/button-styles";

function copyToClipboard(text: string): boolean {
  // Fallback: use a temporary textarea (works without clipboard API permissions)
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}

export default function CopySummary({
  text,
  label = "Copy Summary",
}: {
  text: string | null;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    if (!text) return;

    // Try clipboard API first, fall back to execCommand
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        () => {
          // Clipboard API failed, use fallback
          const success = copyToClipboard(text);
          setCopied(success);
          if (success) setTimeout(() => setCopied(false), 2000);
        },
      );
    } else {
      const success = copyToClipboard(text);
      setCopied(success);
      if (success) setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!text}
      className={cn(
        scrapbookButton({ tone: "warm", size: "regular", tilt: "right", depth: "md" }),
        "mb-6 border-3 border-secondary bg-tertiary px-5 py-3 font-bold uppercase disabled:opacity-50",
      )}
    >
      {copied ? "Copied!" : text === null ? "Preparing..." : label}
    </button>
  );
}
