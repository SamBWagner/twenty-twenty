import { cn } from "../../lib/button-styles";

export default function ProjectNameTab({
  projectName,
  className,
  testId,
}: {
  projectName: string;
  className?: string;
  testId?: string;
}) {
  if (!projectName.trim()) {
    return null;
  }

  return (
    <div
      data-testid={testId}
      title={projectName}
      aria-label={`Project ${projectName}`}
      className={cn("page-tab-sticker", className)}
    >
      <span className="block max-w-full truncate text-[10px] font-bold uppercase tracking-[0.18em] text-secondary sm:text-xs">
        {projectName}
      </span>
    </div>
  );
}
