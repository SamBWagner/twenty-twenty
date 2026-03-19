import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";
import SessionView from "./SessionView";

export default function SessionPage({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) {
  const redirectPath = `/projects/${projectId}/sessions/${sessionId}`;
  const { loading, error, viewer } = useAuthSession({
    redirectOnAnonymous: true,
    redirectPath,
  });

  if (loading) return <AuthLoadingMessage label="Loading session..." />;
  if (error) return <AuthErrorMessage message={error} />;
  if (!viewer) return null;

  return <SessionView sessionId={sessionId} projectId={projectId} userId={viewer.id} />;
}
