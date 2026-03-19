import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";
import ProjectDetail from "./ProjectDetail";

export default function ProjectPage({ projectId }: { projectId: string }) {
  const { loading, error, viewer } = useAuthSession({
    redirectOnAnonymous: true,
    redirectPath: `/projects/${projectId}`,
  });

  if (loading) return <AuthLoadingMessage label="Loading project..." />;
  if (error) return <AuthErrorMessage message={error} />;
  if (!viewer) return null;

  return <ProjectDetail projectId={projectId} currentUserId={viewer.id} />;
}
