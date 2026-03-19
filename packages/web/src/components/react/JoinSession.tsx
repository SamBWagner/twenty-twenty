import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";

interface SessionInfo {
  sessionId: string;
  sessionName: string;
  projectId: string;
  projectName: string;
  phase: string;
  isMember: boolean;
}

export default function JoinSession({ token }: { token: string }) {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api
      .get<SessionInfo>(`/api/sessions/join/${token}`)
      .then(setInfo)
      .catch(() => setError("This link is invalid or has expired."));
  }, [token]);

  async function joinAsGuest() {
    setJoining(true);
    try {
      const { sessionId, projectId } = await api.post<{ sessionId: string; projectId: string }>(
        `/api/sessions/join/${token}`,
      );
      window.location.href = `/projects/${projectId}/sessions/${sessionId}`;
    } catch {
      setError("Failed to join session.");
      setJoining(false);
    }
  }

  async function joinProject() {
    setJoining(true);
    try {
      const { sessionId, projectId } = await api.post<{ sessionId: string; projectId: string }>(
        `/api/sessions/join/${token}/project`,
      );
      window.location.href = `/projects/${projectId}/sessions/${sessionId}`;
    } catch {
      setError("Failed to join project.");
      setJoining(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="border-3 border-secondary bg-white p-8 shadow-brutal max-w-md text-center">
          <h2 className="text-2xl font-bold uppercase mb-4">Oops</h2>
          <p className="font-mono text-sm">{error}</p>
          <a
            href="/projects"
            className={cn(
              scrapbookButton({ tone: "primary", size: "regular", tilt: "left", depth: "sm" }),
              "mt-6 inline-block border-3 border-secondary bg-primary px-6 py-3 font-bold uppercase text-white",
            )}
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!info) {
    return <p className="font-mono text-sm text-center py-20">Loading...</p>;
  }

  if (info.isMember) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="border-3 border-secondary bg-white p-8 shadow-brutal max-w-md text-center">
          <h2 className="text-2xl font-bold uppercase mb-2">{info.sessionName}</h2>
          <p className="font-mono text-sm text-secondary/60 mb-6">
            You're already a member of <strong>{info.projectName}</strong>
          </p>
          <a
            href={`/projects/${info.projectId}/sessions/${info.sessionId}`}
            className={cn(
              scrapbookButton({ tone: "primary", size: "regular", tilt: "left", depth: "md" }),
              "inline-block border-3 border-secondary bg-primary px-6 py-3 font-bold uppercase text-white",
            )}
          >
            Go to Retro
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 relative">
      <div className="absolute top-16 left-20 text-5xl rotate-[12deg] select-none">★</div>
      <div className="absolute top-24 right-32 text-3xl rotate-[-8deg] text-primary select-none">✦</div>

      <div className="border-3 border-secondary bg-white p-8 shadow-brutal-lg max-w-md w-full">
        <h2 className="text-3xl font-bold uppercase mb-1">{info.sessionName}</h2>
        <p className="font-mono text-sm text-secondary/60 mb-2">{info.projectName}</p>
        <p className="text-xs font-bold uppercase text-secondary/40 mb-8">
          Phase: <span className="text-primary">{info.phase}</span>
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={joinAsGuest}
            disabled={joining}
            className={cn(
              scrapbookButton({ tone: "warm", size: "regular", tilt: "right", depth: "md" }),
              "w-full border-3 border-secondary bg-tertiary px-6 py-4 font-bold uppercase disabled:opacity-50",
            )}
          >
            Join As Guest
          </button>
          <p className="text-xs font-mono text-secondary/40 text-center -mt-1 mb-2">
            Participate in this retro only
          </p>

          <button
            onClick={joinProject}
            disabled={joining}
            className={cn(
              scrapbookButton({ tone: "primary", size: "regular", tilt: "left", depth: "md" }),
              "w-full border-3 border-secondary bg-primary px-6 py-4 font-bold uppercase text-white disabled:opacity-50",
            )}
          >
            Join Project
          </button>
          <p className="text-xs font-mono text-secondary/40 text-center -mt-1">
            Become a permanent member of {info.projectName}
          </p>
        </div>
      </div>
    </div>
  );
}
