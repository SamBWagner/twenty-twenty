import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import MarchingAnts from "./MarchingAnts";

interface Session {
  id: string;
  name: string;
  phase: string;
  sequence: number;
  createdAt: string;
  closedAt: string | null;
}

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  members: { userId: string; username: string; role: string; avatarUrl: string | null }[];
}

const phaseStyles: Record<string, string> = {
  review: "bg-tertiary",
  ideation: "bg-primary text-white",
  action: "bg-purple-400 text-white",
  closed: "bg-secondary text-white",
};

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<ProjectData>(`/api/projects/${projectId}`),
      api.get<Session[]>(`/api/projects/${projectId}/sessions`),
    ]).then(([p, s]) => {
      setProject(p);
      setSessions(s);
      setLoading(false);
    });
  }, [projectId]);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const session = await api.post<Session>(`/api/projects/${projectId}/sessions`, { name: newName });
      window.location.href = `/projects/${projectId}/sessions/${session.id}`;
    } catch {
      setCreating(false);
    }
  }

  if (loading) return <p className="font-mono text-sm">Loading...</p>;
  if (!project) return <p className="font-bold text-red-600">Project not found</p>;

  return (
    <div>
      <div className="mb-6">
        <a href="/projects" className="inline-block border-2 border-secondary bg-white px-3 py-1 text-sm font-bold uppercase shadow-brutal-sm hover:shadow-brutal-primary transition-shadow">
          ← All Projects
        </a>
      </div>

      {/* Project card — pinned note style */}
      <div className="relative mb-10 border-3 border-secondary bg-white p-8 rotate-[-0.5deg]">
        {/* "tape" strip */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-20 h-6 bg-tertiary/70 border-2 border-secondary rotate-[-2deg]"></div>
        <h1 className="text-4xl font-bold uppercase">{project.name}</h1>
        {project.description && <p className="mt-2 text-secondary/60 text-lg">{project.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {project.members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 border-3 border-secondary bg-surface px-3 py-1.5"
            >
              {m.avatarUrl && <img src={m.avatarUrl} alt="" className="h-5 w-5 border-2 border-secondary" />}
              <span className="text-sm font-bold">{m.username}</span>
              <span className="font-mono text-xs text-secondary/40">{m.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* New session — looks like a sticky note */}
      <div className="mb-10 border-3 border-secondary bg-tertiary p-6 rotate-[0.5deg]">
        <h2 className="text-lg font-bold uppercase mb-4">Start a New Session</h2>
        <form onSubmit={createSession} className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Sprint 14 Retro"
            required
            className="flex-1 border-3 border-secondary bg-white px-4 py-3 font-bold shadow-brutal-sm focus:shadow-brutal-primary focus:outline-none transition-shadow"
          />
          <button
            type="submit"
            disabled={creating}
            className="border-3 border-secondary bg-secondary px-6 py-3 font-bold uppercase text-white shadow-brutal-sm transition-all hover:shadow-brutal-primary disabled:opacity-50"
          >
            {creating ? "..." : "Go →"}
          </button>
        </form>
      </div>

      {/* Session timeline */}
      <h2 className="text-2xl font-bold uppercase mb-4">Sessions</h2>
      {sessions.length === 0 ? (
        <MarchingAnts className="p-10 text-center">
          <p className="font-bold text-lg">No sessions yet. Start one above!</p>
        </MarchingAnts>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, i) => {
            const rot = i % 2 === 0 ? "rotate-[-0.5deg]" : "rotate-[0.5deg]";
            return (
              <a
                key={s.id}
                href={`/projects/${projectId}/sessions/${s.id}`}
                className={`flex items-center justify-between border-3 border-secondary bg-white p-5 shadow-brutal-sm transition-all hover:shadow-brutal hover:scale-[1.01] ${rot}`}
              >
                <div className="flex items-center gap-4">
                  <span className="border-3 border-secondary bg-surface px-3 py-1 font-mono text-sm font-bold">
                    #{s.sequence}
                  </span>
                  <span className="font-bold text-lg">{s.name}</span>
                </div>
                <span className={`border-3 border-secondary px-3 py-1 text-xs font-bold uppercase ${phaseStyles[s.phase] || ""}`}>
                  {s.phase}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
