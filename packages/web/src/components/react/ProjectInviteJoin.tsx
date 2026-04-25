import { useEffect, useState } from "react";
import type { InvitationPreview as ProjectInviteInfo } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ProjectInviteJoin({ token }: { token: string }) {
  const [info, setInfo] = useState<ProjectInviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmJoin, setConfirmJoin] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api
      .get<ProjectInviteInfo>(`/api/projects/invite/${token}`)
      .then(setInfo)
      .catch((err: Error) => setError(err.message || "This invite is invalid, revoked, or has expired."));
  }, [token]);

  async function joinProject() {
    if (!confirmJoin) return;

    setJoining(true);
    try {
      const { projectId } = await api.post<{ projectId: string }>(`/api/projects/invite/${token}`);
      window.location.href = `/projects/${projectId}`;
    } catch (err: any) {
      setError(err.message || "Failed to join project.");
      setJoining(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="max-w-md border-3 border-secondary bg-white p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold uppercase">Invite Unavailable</h2>
          <p className="font-mono text-sm">{error}</p>
          <a
            href="/projects"
            className={cn(
              scrapbookButton({ tone: "primary", size: "regular", tilt: "left", depth: "sm" }),
              "mt-6 inline-block border-3 border-secondary bg-primary px-6 py-3 font-bold uppercase text-secondary",
            )}
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!info) {
    return <p className="py-20 text-center font-mono text-sm">Loading invite...</p>;
  }

  if (info.isMember) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="max-w-md border-3 border-secondary bg-white p-8 text-center">
          <h2 className="mb-2 text-3xl font-bold uppercase">{info.projectName}</h2>
          {info.projectDescription && <p className="mb-4 text-sm text-secondary/75">{info.projectDescription}</p>}
          <p className="scribble-help mb-6 text-base text-secondary/75">
            You are already a member of this project.
          </p>
          <a
            href={`/projects/${info.projectId}`}
            className={cn(
              scrapbookButton({ tone: "primary", size: "regular", tilt: "left", depth: "md" }),
              "inline-block border-3 border-secondary bg-primary px-6 py-3 font-bold uppercase text-secondary",
            )}
          >
            Go to Project
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center py-16 sm:py-20">
      <div aria-hidden="true" className="absolute left-20 top-16 hidden select-none text-5xl rotate-[12deg] sm:block">+</div>
      <div aria-hidden="true" className="absolute right-32 top-24 hidden select-none text-3xl text-primary rotate-[-8deg] sm:block">!</div>

      <div className="w-full max-w-xl border-3 border-secondary bg-white p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#1f5eea]">Project Invite</p>
        <h1 className="mb-2 text-4xl font-bold uppercase">{info.projectName}</h1>
        {info.projectDescription && <p className="mb-5 text-secondary/75">{info.projectDescription}</p>}

        <div className="mb-6 grid gap-3 border-3 border-secondary bg-surface p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-mono text-[11px] uppercase text-secondary/70">Invited By</p>
            <p className="font-bold">{info.invitedByUserName}</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase text-secondary/70">Expires</p>
            <p className="font-bold">{formatDateTime(info.expiresAt)}</p>
          </div>
        </div>

        <label className="mb-6 flex cursor-pointer items-start gap-3 border-3 border-secondary bg-tertiary p-4 shadow-brutal-sm">
          <input
            type="checkbox"
            checked={confirmJoin}
            onChange={(e) => setConfirmJoin(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0 border-secondary accent-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          />
          <span className="text-sm font-bold uppercase leading-6">
            I confirm that I want to join <span className="text-secondary">{info.projectName}</span>.
          </span>
        </label>

        <button
          type="button"
          onClick={joinProject}
          disabled={!confirmJoin || joining}
          className={cn(
            scrapbookButton({ tone: "secondary", size: "regular", tilt: "left", depth: "md" }),
            "w-full border-3 border-secondary bg-secondary px-6 py-4 font-bold uppercase text-white disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {joining ? "Joining..." : "Join Project"}
        </button>
      </div>
    </div>
  );
}
