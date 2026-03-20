export type ScrapbookButtonTone =
  | "neutral"
  | "primary"
  | "secondary"
  | "warm"
  | "danger"
  | "success"
  | "sun"
  | "lavender"
  | "plum"
  | "mint"
  | "blush"
  | "cobalt";

export type ScrapbookButtonSize = "regular" | "compact" | "icon";
export type ScrapbookButtonTilt = "left" | "right" | "flat";
export type ScrapbookButtonDepth = "sm" | "md" | "lg";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function scrapbookButton({
  tone = "neutral",
  size = "regular",
  tilt = "left",
  depth = "sm",
}: {
  tone?: ScrapbookButtonTone;
  size?: ScrapbookButtonSize;
  tilt?: ScrapbookButtonTilt;
  depth?: ScrapbookButtonDepth;
} = {}) {
  return cn(
    "scrapbook-btn",
    `scrapbook-btn--${tone}`,
    `scrapbook-btn--${size}`,
    `scrapbook-btn--${tilt}`,
    `scrapbook-btn--${depth}`,
  );
}
