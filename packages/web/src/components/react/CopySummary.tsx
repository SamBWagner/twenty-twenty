import { useState, useEffect } from "react";
import { api } from "../../lib/api-client";

interface Item {
  id: string;
  type: "good" | "bad";
  content: string;
  voteCount: number;
}

interface Bundle {
  id: string;
  label: string | null;
  itemIds: string[];
}

interface Action {
  id: string;
  description: string;
  bundleId: string | null;
}

interface Participant {
  userId: string;
  username: string;
  role: "member" | "guest";
}

function buildMarkdown(
  sessionName: string,
  items: Item[],
  bundles: Bundle[],
  actions: Action[],
  participants: Participant[],
): string {
  const good = items.filter((i) => i.type === "good").sort((a, b) => b.voteCount - a.voteCount);
  const bad = items.filter((i) => i.type === "bad").sort((a, b) => b.voteCount - a.voteCount);

  let md = `# ${sessionName}\n\n`;

  if (participants.length > 0) {
    md += `## Who Was Here\n`;
    participants.forEach((p) => {
      md += `- ${p.username}${p.role === "guest" ? " (guest)" : ""}\n`;
    });
    md += `\n`;
  }

  if (good.length > 0) {
    md += `## Went Well\n`;
    good.forEach((i) => {
      md += `- ${i.content}\n`;
    });
    md += `\n`;
  }

  if (bad.length > 0) {
    md += `## Needs Work\n`;
    bad.forEach((i) => {
      md += `- ${i.content}\n`;
    });
    md += `\n`;
  }

  if (bundles.length > 0 || actions.length > 0) {
    md += `## Actions\n`;
    bundles.forEach((bundle) => {
      const bundleActions = actions.filter((a) => a.bundleId === bundle.id);
      if (bundleActions.length > 0) {
        md += `\n**${bundle.label || "Unnamed"}**\n`;
        bundleActions.forEach((a) => {
          md += `- [ ] ${a.description}\n`;
        });
      }
    });

    const carriedOver = actions.filter((a) => !a.bundleId);
    if (carriedOver.length > 0) {
      md += `\n**Carried Over**\n`;
      carriedOver.forEach((a) => {
        md += `- [ ] ${a.description}\n`;
      });
    }
  }

  return md.trim();
}

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
  sessionId,
  sessionName,
}: {
  sessionId: string;
  sessionName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);

  // Pre-fetch data so it's ready when the user clicks
  useEffect(() => {
    Promise.all([
      api.get<Item[]>(`/api/sessions/${sessionId}/items`),
      api.get<Bundle[]>(`/api/sessions/${sessionId}/bundles`),
      api.get<Action[]>(`/api/sessions/${sessionId}/actions`),
      api.get<Participant[]>(`/api/sessions/${sessionId}/participants`),
    ]).then(([items, bundles, actions, participants]) => {
      setMarkdown(buildMarkdown(sessionName, items, bundles, actions, participants));
    });
  }, [sessionId, sessionName]);

  function handleClick() {
    if (!markdown) return;

    // Try clipboard API first, fall back to execCommand
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(markdown).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        () => {
          // Clipboard API failed, use fallback
          const success = copyToClipboard(markdown);
          setCopied(success);
          if (success) setTimeout(() => setCopied(false), 2000);
        },
      );
    } else {
      const success = copyToClipboard(markdown);
      setCopied(success);
      if (success) setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!markdown}
      className="mb-6 border-3 border-secondary bg-tertiary px-5 py-3 font-bold uppercase shadow-brutal rotate-[0.5deg] transition-all hover:rotate-[-0.5deg] hover:shadow-brutal-primary disabled:opacity-50"
    >
      {copied ? "Copied!" : markdown === null ? "Loading..." : "Summarize"}
    </button>
  );
}
