import { cn, scrapbookButton } from "../../lib/button-styles";
import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";
import ProjectList from "./ProjectList";

export default function ProjectsIndexPage() {
  const { loading, error, viewer } = useAuthSession({
    redirectOnAnonymous: true,
    redirectPath: "/projects",
  });

  if (loading) return <AuthLoadingMessage label="Loading projects..." />;
  if (error) return <AuthErrorMessage message={error} />;
  if (!viewer) return null;

  return (
    <div className="relative">
      <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-4xl font-bold uppercase text-stroke sm:text-5xl">
          <span className="text-tertiary">Your</span> <span className="text-primary">Projects</span>
        </h1>
        <a
          href="/projects/new"
          className={cn(
            scrapbookButton({ tone: "primary", size: "regular", tilt: "right", depth: "md" }),
            "border-3 border-secondary bg-primary px-5 py-3 font-bold uppercase text-secondary",
          )}
        >
          + New Project
        </a>
      </div>

      <ProjectList />
    </div>
  );
}
