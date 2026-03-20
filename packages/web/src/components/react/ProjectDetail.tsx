import { useEffect, useState } from "react";
import type {
  ProjectInvitation,
  ProjectMember,
  ProjectView,
  RetroSession as Session,
  ViewerCapabilities,
} from "@twenty-twenty/shared";
import { api } from "../../lib/api-client";
import { getPublicWebBaseUrl } from "../../lib/runtime-urls";
import { cn, scrapbookButton } from "../../lib/button-styles";
import MarchingAnts from "./MarchingAnts";

type FeedbackState =
  | { tone: "success" | "error"; message: string }
  | null;

const phaseStyles: Record<string, string> = {
  review: "bg-[#e4d6ff] text-secondary",
  ideation: "bg-[#ffeab0] text-secondary",
  action: "bg-[#bc96ff] text-secondary",
  closed: "bg-[#f9d258] text-secondary",
};

function fallbackCopy(text: string): boolean {
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

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }

  return fallbackCopy(text);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ProjectDetail({
  projectId,
  currentUserId,
}: {
  projectId: string;
  currentUserId: string;
}) {
  const [project, setProject] = useState<ProjectView["project"] | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [viewerMembership, setViewerMembership] = useState<ProjectView["viewerMembership"]>(null);
  const [viewerCapabilities, setViewerCapabilities] = useState<ViewerCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [leavingProject, setLeavingProject] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [deletingProject, setDeletingProject] = useState(false);
  const [newName, setNewName] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  async function loadProject() {
    setLoading(true);
    setLoadError(null);

    try {
      const view = await api.get<ProjectView>(`/api/projects/${projectId}/view`);

      setProject(view.project);
      setMembers(view.members);
      setSessions(view.sessions);
      setInvitations(view.invitations);
      setViewerMembership(view.viewerMembership);
      setViewerCapabilities(view.viewerCapabilities);
    } catch (err: any) {
      setLoadError(err.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProject();
  }, [projectId, currentUserId]);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    setFeedback(null);

    try {
      const session = await api.post<Session>(`/api/projects/${projectId}/sessions`, { name: newName });
      window.location.href = `/projects/${projectId}/sessions/${session.id}`;
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Failed to create session." });
      setCreating(false);
    }
  }

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setFeedback(null);

    try {
      const invitation = await api.post<ProjectInvitation>(`/api/projects/${projectId}/invitations`);
      setInvitations((current) => [invitation, ...current]);

      const inviteUrl = `${getPublicWebBaseUrl()}/projects/invite/${invitation.token}`;
      const copied = await copyText(inviteUrl);

      setFeedback({
        tone: "success",
        message: copied ? "Invite link created and copied to your clipboard." : "Invite link created.",
      });
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Failed to create invite link." });
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleCopyInvite(token: string) {
    const inviteUrl = `${getPublicWebBaseUrl()}/projects/invite/${token}`;
    const copied = await copyText(inviteUrl);

    setFeedback({
      tone: copied ? "success" : "error",
      message: copied ? "Invite link copied to your clipboard." : "Failed to copy invite link.",
    });
  }

  async function handleRevokeInvite(invitation: ProjectInvitation) {
    if (!window.confirm("Revoke this invite link?")) {
      return;
    }

    setRevokingInviteId(invitation.id);
    setFeedback(null);

    try {
      await api.delete(`/api/projects/${projectId}/invitations/${invitation.id}`);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      setFeedback({ tone: "success", message: "Invite link revoked." });
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Failed to revoke invite link." });
    } finally {
      setRevokingInviteId(null);
    }
  }

  async function handleRemoveMember(member: ProjectMember) {
    if (!window.confirm(`Kick ${member.username} from this project?`)) {
      return;
    }

    setRemovingMemberId(member.userId);
    setFeedback(null);

    try {
      await api.delete(`/api/projects/${projectId}/members/${member.userId}`);
      await loadProject();
      setFeedback({ tone: "success", message: `${member.username} was removed from the project.` });
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Failed to remove member." });
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleLeaveProject() {
    if (!window.confirm("Leave this project?")) {
      return;
    }

    setLeavingProject(true);
    setFeedback(null);

    try {
      await api.delete(`/api/projects/${projectId}/membership`);
      window.location.href = "/projects";
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Failed to leave project." });
      setLeavingProject(false);
    }
  }

  function closeDeleteConfirmation() {
    setDeleteConfirmOpen(false);
    setDeleteConfirmationText("");
  }

  function handleDeleteClick() {
    if (!project) {
      return;
    }

    if (viewerMembership?.role !== "owner") {
      return;
    }

    if (members.length > 1) {
      closeDeleteConfirmation();
      setFeedback({
        tone: "error",
        message: "Kick everyone else from this project before you delete it.",
      });
      return;
    }

    setFeedback(null);

    if (deleteConfirmOpen) {
      closeDeleteConfirmation();
      return;
    }

    setDeleteConfirmOpen(true);
  }

  async function handleDeleteProject() {
    if (!project) {
      return;
    }

    if (deleteConfirmationText.trim() !== "DELETE") {
      setFeedback({
        tone: "error",
        message: 'Type "DELETE" to confirm project deletion.',
      });
      return;
    }

    setDeletingProject(true);
    setFeedback(null);

    try {
      await api.delete(`/api/projects/${projectId}`);
      window.location.href = "/projects";
    } catch (err: any) {
      setFeedback({ tone: "error", message: err.message || "Failed to delete project." });
      setDeletingProject(false);
    }
  }

  if (loading) return <p className="font-mono text-sm">Loading...</p>;
  if (loadError) return <p className="font-bold text-red-600">{loadError}</p>;
  if (!project) return <p className="font-bold text-red-600">Project not found</p>;

  const isOwner = viewerMembership?.role === "owner";
  const canLeaveProject = viewerMembership?.role === "member";

  return (
    <div className="space-y-10">
      <div className="mb-6">
        <a
          href="/projects"
          className={cn(
            scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
            "inline-block border-2 border-secondary bg-white px-3 py-1 text-sm font-bold uppercase",
          )}
        >
          ← All Projects
        </a>
      </div>

      {feedback && (
        <div
          className={`mb-6 border-3 border-secondary px-4 py-3 text-sm font-bold uppercase ${
            feedback.tone === "success" ? "bg-primary text-white" : "bg-white text-red-600"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <section
        className={cn(
          "note-shell relative rotate-[-0.55deg] p-8",
          deleteConfirmOpen ? "z-30" : "z-10",
        )}
        data-note-theme="sun"
        data-tape-position="top-center"
      >
        {isOwner && (
          <div className="absolute right-4 top-4 z-20">
            <button
              type="button"
              onClick={handleDeleteClick}
              className={cn(
                scrapbookButton({ tone: "danger", size: "icon", tilt: "flat", depth: "sm" }),
                "flex h-11 w-11 items-center justify-center border-3 border-secondary bg-white text-3xl font-black leading-none hover:bg-[#ff7f7f] hover:text-white",
              )}
              aria-label="Delete project"
            >
              ×
            </button>

            {deleteConfirmOpen && (
              <div className="absolute right-0 top-[calc(100%+0.75rem)] z-20 w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] border-3 border-secondary bg-[#fff1ea] p-4">
                <p className="text-sm font-bold uppercase">Delete Project</p>
                <p className="scribble-help mt-2 text-sm text-secondary/70">
                  This permanently deletes the project, sessions, actions, and invite links.
                </p>
                <label htmlFor="delete-project-confirmation" className="mt-4 block text-xs font-bold uppercase">
                  Type DELETE to confirm
                </label>
                <input
                  id="delete-project-confirmation"
                  type="text"
                  autoFocus
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  className="mt-2 w-full border-3 border-secondary bg-white px-3 py-2 font-bold uppercase shadow-brutal-sm transition-shadow focus:outline-none focus:shadow-brutal-primary"
                />
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeDeleteConfirmation}
                    disabled={deletingProject}
                    className={cn(
                      scrapbookButton({ tone: "neutral", size: "compact", tilt: "flat", depth: "sm" }),
                      "border-2 border-secondary bg-white px-4 py-2 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteProject}
                    disabled={deleteConfirmationText.trim() !== "DELETE" || deletingProject}
                    className={cn(
                      scrapbookButton({ tone: "danger", size: "compact", tilt: "left", depth: "sm" }),
                      "border-2 border-secondary bg-[#ff7f7f] px-4 py-2 text-xs font-bold uppercase text-white disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {deletingProject ? "Deleting..." : "Delete Project"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-6 pr-14 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="mb-3 inline-block border-2 border-secondary note-chip px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em]">
              Project Space
            </p>
            <h1 className="break-words text-4xl font-bold uppercase">{project.name}</h1>
            {project.description && (
              <p className="note-muted mt-3 max-w-3xl break-words text-lg">
                {project.description}
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="border-2 border-secondary note-chip px-3 py-1 text-xs font-bold uppercase">
                {members.length} members
              </span>
              <span className="border-2 border-secondary note-chip px-3 py-1 text-xs font-bold uppercase">
                {sessions.length} sessions
              </span>
              {viewerMembership && (
                <span className="border-2 border-secondary note-chip px-3 py-1 text-xs font-bold uppercase">
                  You&apos;re a {viewerMembership.role}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[18rem]">
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={handleCreateInvite}
                  disabled={creatingInvite}
                  className={cn(
                    scrapbookButton({ tone: "cobalt", size: "regular", tilt: "left", depth: "md" }),
                    "border-3 border-secondary bg-[#5d83f9] px-5 py-3 font-bold uppercase text-white disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  {creatingInvite ? "Creating..." : "Create Invite Link"}
                </button>
                <p className="scribble-help note-muted text-sm">
                  Invite links are multi-use and expire 1 hour after creation.
                </p>
                <p className="scribble-help note-muted text-sm">
                  Owners cannot leave a project until ownership transfer exists.
                </p>
              </>
            )}

            {canLeaveProject && (
              <button
                type="button"
                onClick={handleLeaveProject}
                disabled={leavingProject}
                className={cn(
                  scrapbookButton({ tone: "neutral", size: "regular", tilt: "flat", depth: "sm" }),
                  "border-3 border-secondary note-panel px-5 py-3 font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {leavingProject ? "Leaving..." : "Leave Project"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 border-t-3 border-secondary pt-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold uppercase">Members</h2>
              <p className="scribble-help note-muted mt-1 text-base">Everyone who can jump into this project.</p>
            </div>
            <span className="border-2 border-secondary note-chip px-3 py-1 font-mono text-xs font-bold uppercase">
              {members.length} total
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {members.map((member) => {
              const isCurrentUser = member.userId === currentUserId;
              const canKick = isOwner && member.role !== "owner" && !isCurrentUser;

              return (
                <div
                  key={member.userId}
                  className="note-panel flex min-w-0 items-center justify-between gap-3 border-3 border-secondary px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {member.avatarUrl && (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 border-2 border-secondary"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {member.username}
                        {isCurrentUser ? " (You)" : ""}
                      </p>
                      <p className="note-muted font-mono text-xs uppercase">{member.role}</p>
                    </div>
                  </div>

                  {canKick && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member)}
                      disabled={removingMemberId === member.userId}
                      className={cn(
                        scrapbookButton({ tone: "danger", size: "compact", tilt: "flat", depth: "sm" }),
                        "shrink-0 border-2 border-secondary bg-white px-3 py-1 text-xs font-bold uppercase hover:bg-[#ff7f7f] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                      aria-label={`Kick ${member.username}`}
                    >
                      {removingMemberId === member.userId ? "..." : "Kick"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {viewerCapabilities?.canCreateSession && (
        <section
          className="note-shell rotate-[0.45deg] p-6"
          data-note-theme="cobalt"
          data-tape-position="top-right"
        >
          <div className="mb-4 max-w-2xl">
            <p className="mb-3 inline-block border-2 border-secondary note-chip px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.2em]">
              New Session
            </p>
            <h2 className="text-2xl font-bold uppercase">Start a New Session</h2>
            <p className="scribble-help note-muted mt-2 text-base">
              Kick off the next retro with a clear title so the list of sessions stays easy to scan.
            </p>
          </div>
          <form onSubmit={createSession} className="flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Sprint 14 Retro"
              required
              className="flex-1 border-3 border-secondary note-panel px-4 py-3 font-bold shadow-brutal-sm transition-shadow focus:outline-none focus:shadow-brutal-primary"
            />
            <button
              type="submit"
              disabled={creating}
              className={cn(
                scrapbookButton({ tone: "secondary", size: "regular", tilt: "right", depth: "sm" }),
                "border-3 border-secondary bg-secondary px-6 py-3 font-bold uppercase text-white disabled:opacity-50",
              )}
            >
              {creating ? "..." : "Go →"}
            </button>
          </form>
        </section>
      )}

      <section
        className="note-shell rotate-[-0.25deg] p-6"
        data-note-theme="sun"
        data-tape-position="top-right"
      >
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold uppercase">Sessions</h2>
            <p className="scribble-help note-muted mt-1 text-base">The full retro timeline for this project.</p>
          </div>
          <span className="border-2 border-secondary note-chip px-3 py-1 font-mono text-xs font-bold uppercase">
            {sessions.length} total
          </span>
        </div>
        {sessions.length === 0 ? (
          <MarchingAnts className="note-panel border-3 border-secondary p-10 text-center">
            <p className="scribble-help text-2xl text-secondary">No sessions yet. Start one above!</p>
          </MarchingAnts>
        ) : (
          <div className="space-y-3">
            {sessions.map((session, index) => {
              const rotation = index % 2 === 0 ? "rotate-[-0.5deg]" : "rotate-[0.5deg]";
              return (
                <a
                  key={session.id}
                  href={`/projects/${projectId}/sessions/${session.id}`}
                  data-no-click-overlay="true"
                  className={`note-panel flex min-w-0 flex-col gap-3 border-3 border-secondary p-5 shadow-brutal-sm transition-all hover:scale-[1.01] hover:shadow-brutal sm:flex-row sm:items-center sm:justify-between ${rotation}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="shrink-0 border-3 border-secondary note-chip px-3 py-1 font-mono text-sm font-bold">
                      #{session.sequence}
                    </span>
                    <span className="truncate text-lg font-bold">{session.name}</span>
                  </div>
                  <span className={`self-start border-3 border-secondary px-3 py-1 text-xs font-bold uppercase sm:self-auto ${phaseStyles[session.phase] || ""}`}>
                    {session.phase}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {viewerCapabilities?.canManageInvitations && (
        <section
          className="note-shell rotate-[0.3deg] p-6"
          data-note-theme="sun"
          data-tape-position="side-left"
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold uppercase">Invite Links</h2>
              <p className="scribble-help note-muted text-base">Share these links to let people join the project.</p>
            </div>
          </div>

          {invitations.length === 0 ? (
            <MarchingAnts className="note-panel border-3 border-secondary p-10 text-center">
              <p className="scribble-help text-2xl text-secondary">No active invite links yet.</p>
              <p className="scribble-help mt-2 text-base text-secondary/60">Create one above and it will appear here.</p>
            </MarchingAnts>
          ) : (
            <div className="space-y-3">
              {invitations.map((invitation, index) => {
                const inviteUrl = `${getPublicWebBaseUrl()}/projects/invite/${invitation.token}`;
                const rotation = index % 2 === 0 ? "rotate-[-0.35deg]" : "rotate-[0.35deg]";

                return (
                  <div
                    key={invitation.id}
                    className={`note-panel border-3 border-secondary p-5 ${rotation}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-xs text-secondary/70">{inviteUrl}</p>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono uppercase text-secondary/50">
                          <span>Created by {invitation.invitedByUserName}</span>
                          <span>Created {formatDateTime(invitation.createdAt)}</span>
                          <span>Expires {formatDateTime(invitation.expiresAt)}</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleCopyInvite(invitation.token)}
                          className={cn(
                            scrapbookButton({ tone: "sun", size: "compact", tilt: "flat", depth: "sm" }),
                            "border-2 border-secondary note-chip px-4 py-2 text-xs font-bold uppercase",
                          )}
                        >
                          Copy Link
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvite(invitation)}
                          disabled={revokingInviteId === invitation.id}
                          className={cn(
                            scrapbookButton({ tone: "danger", size: "compact", tilt: "flat", depth: "sm" }),
                            "border-2 border-secondary bg-white px-4 py-2 text-xs font-bold uppercase hover:bg-[#ff7f7f] hover:text-white disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {revokingInviteId === invitation.id ? "Revoking..." : "Revoke"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
