import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";
import JoinSession from "./JoinSession";

export default function JoinPage({ token }: { token: string }) {
  const redirectPath = `/join/${token}`;
  const { loading, error, viewer } = useAuthSession({
    redirectOnAnonymous: true,
    redirectPath,
  });

  if (loading) return <AuthLoadingMessage label="Loading..." />;
  if (error) return <AuthErrorMessage message={error} />;
  if (!viewer) return null;

  return <JoinSession token={token} />;
}
