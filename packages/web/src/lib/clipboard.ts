export function copyToClipboardFallback(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyToClipboardFallback(text);
    }
  }

  return copyToClipboardFallback(text);
}

export type ShareLinkResult = "shared" | "copied" | "manual" | "cancelled" | "failed";

export async function shareOrCopyLink(url: string, title: string, promptLabel: string): Promise<ShareLinkResult> {
  if (!url) {
    return "failed";
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (await copyTextToClipboard(url)) {
    return "copied";
  }

  if (typeof window !== "undefined" && typeof window.prompt === "function") {
    window.prompt(promptLabel, url);
    return "manual";
  }

  return "failed";
}
