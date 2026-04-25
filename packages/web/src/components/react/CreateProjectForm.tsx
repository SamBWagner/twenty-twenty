import { useState } from "react";
import type { Project } from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { cn, scrapbookButton } from "../../lib/button-styles";

export default function CreateProjectForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const project = await api.post<Project>("/api/projects", { name, description });
      window.location.href = `/projects/${project.id}`;
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-3 border-secondary bg-white p-6 rotate-[-0.5deg]">
        <label htmlFor="project-name" className="block text-xs font-bold uppercase tracking-wider mb-2 text-secondary/75">Project Name</label>
        <input
          id="project-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full border-3 border-secondary px-4 py-3 font-bold text-lg focus:shadow-brutal-primary focus:outline-none transition-shadow bg-surface"
          placeholder="e.g. Team Alpha Retros"
        />
      </div>
      <div className="border-3 border-secondary bg-white p-6 rotate-[0.5deg]">
        <label htmlFor="project-description" className="block text-xs font-bold uppercase tracking-wider mb-2 text-secondary/75">Description (optional)</label>
        <textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border-3 border-secondary px-4 py-3 font-medium focus:shadow-brutal-primary focus:outline-none transition-shadow bg-surface"
          rows={3}
          placeholder="What is this retro project for?"
        />
      </div>
      {error && (
        <div className="border-3 border-secondary bg-red-300 px-4 py-3 font-mono text-sm font-bold rotate-[-1deg]">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className={cn(
          scrapbookButton({ tone: "primary", size: "regular", tilt: "left", depth: "lg" }),
          "border-4 border-secondary bg-primary px-8 py-4 text-lg font-bold uppercase text-secondary disabled:opacity-50",
        )}
      >
        {submitting ? "Creating..." : "Create Project →"}
      </button>
    </form>
  );
}
