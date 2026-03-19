import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";
import MarchingAnts from "./MarchingAnts";

interface Project {
  id: string;
  name: string;
  description: string | null;
  role: string;
  createdAt: string;
}

const rotations = ["rotate-[-2deg]", "rotate-[1deg]", "rotate-[-1deg]", "rotate-[2deg]", "rotate-[0deg]", "rotate-[-1.5deg]"];

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Project[]>("/api/projects")
      .then((data) => {
        setProjects(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message || "Failed to load projects."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="font-mono text-sm">Loading projects...</p>;
  if (error) return <p className="font-bold text-red-600">{error}</p>;
  if (projects.length === 0) {
    return (
      <MarchingAnts className="p-16 text-center rotate-[0.5deg]">
        <p className="text-xl font-bold mb-4">Nothing here yet.</p>
        <a
          href="/projects/new"
          className={cn(
            scrapbookButton({ tone: "warm", size: "regular", tilt: "left", depth: "md" }),
            "inline-block border-3 border-secondary bg-tertiary px-6 py-3 font-bold uppercase",
          )}
        >
          Create your first project
        </a>
      </MarchingAnts>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {projects.map((p, i) => (
        <a
          key={p.id}
          href={`/projects/${p.id}`}
          className={`block border-3 border-secondary bg-white p-6 shadow-brutal transition-all hover:shadow-brutal-lg hover:scale-[1.02] ${rotations[i % rotations.length]}`}
        >
          <h2 className="font-bold text-xl uppercase">{p.name}</h2>
          {p.description && <p className="text-sm mt-2 text-secondary/60">{p.description}</p>}
          <div className="mt-4 flex gap-2">
            <span className="border-2 border-secondary bg-tertiary px-2 py-0.5 text-xs font-bold uppercase">
              {p.role}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
