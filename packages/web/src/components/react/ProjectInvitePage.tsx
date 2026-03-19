import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";
import ProjectInviteJoin from "./ProjectInviteJoin";

export default function ProjectInvitePage({ token }: { token: string }) {
  const redirectPath = `/projects/invite/${token}`;
  const { loading, error, viewer } = useAuthSession({
    redirectOnAnonymous: true,
    redirectPath,
  });

  if (loading) return <AuthLoadingMessage label="Loading invite..." />;
  if (error) return <AuthErrorMessage message={error} />;
  if (!viewer) return null;

  return <ProjectInviteJoin token={token} />;
}
