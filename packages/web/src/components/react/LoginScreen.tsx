import { useEffect } from "react";
import { cn, scrapbookButton } from "../../lib/button-styles";
import { AuthErrorMessage, AuthLoadingMessage, useAuthSession } from "../../lib/client-auth";

export default function LoginScreen({
  redirect,
  error,
  details,
}: {
  redirect: string;
  error: string;
  details: string;
}) {
  const { loading, error: authError, viewer, auth } = useAuthSession();

  useEffect(() => {
    if (viewer) {
      window.location.href = redirect || "/projects";
    }
  }, [viewer, redirect]);

  if (loading) {
    return <AuthLoadingMessage label="Checking your session..." />;
  }

  if (authError) {
    return <AuthErrorMessage message={authError} />;
  }

  if (viewer) {
    return null;
  }

  const missingEnvVars = auth?.missingEnvVars || [];
  const authNotConfigured = auth ? !auth.readyForOAuth : false;
  const callbackUrl = auth?.callbackUrl || "http://localhost:3001/api/auth/callback/github";
  const signinUrl = redirect ? `/auth/signin?redirect=${encodeURIComponent(redirect)}` : "/auth/signin";

  let errorTitle = "";
  let errorBody = "";

  if (error === "github_not_configured") {
    errorTitle = "GitHub OAuth is not configured locally.";
    errorBody = missingEnvVars.length > 0
      ? `Add ${missingEnvVars.join(", ")} to your root .env file, then restart the API and web dev servers.`
      : "Add your GitHub OAuth credentials and auth secret to the root .env file, then restart the dev servers.";
  } else if (error === "auth_request_failed") {
    errorTitle = "The login request could not reach the API.";
    errorBody = details || `Make sure the API server is running on ${auth?.apiUrl || "http://localhost:3001"}.`;
  } else if (error === "auth_failed") {
    errorTitle = "GitHub sign-in did not complete.";
    errorBody = details || "Check your GitHub OAuth app settings and local environment configuration, then try again.";
  }

  return (
    <div className="relative flex flex-col items-center justify-center py-20">
      <div className="absolute left-20 top-16 select-none text-5xl rotate-[12deg]">★</div>
      <div className="absolute right-32 top-24 select-none text-3xl text-primary rotate-[-8deg]">✦</div>

      <h1 className="mb-10 text-5xl font-bold uppercase text-stroke">
        <span className="text-tertiary">Get</span> <span className="text-primary">In</span>
      </h1>

      {(errorTitle || authNotConfigured) && (
        <div className="mb-8 max-w-2xl rotate-[-0.4deg] border-4 border-secondary bg-white p-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-secondary/45">
            {errorTitle || "Local auth setup needed"}
          </p>
          <p className="mt-3 text-base font-medium text-secondary/75">
            {errorBody || "GitHub OAuth needs to be configured before local sign-in will work."}
          </p>

          <div className="mt-4 border-3 border-secondary bg-surface p-4 font-mono text-sm">
            <p><strong>Expected callback URL:</strong> {callbackUrl}</p>
            {missingEnvVars.length > 0 && <p className="mt-2"><strong>Missing:</strong> {missingEnvVars.join(", ")}</p>}
            {auth?.trustedOrigins?.length ? (
              <p className="mt-2"><strong>Trusted origins:</strong> {auth.trustedOrigins.join(", ")}</p>
            ) : null}
          </div>
        </div>
      )}

      {authNotConfigured ? (
        <span
          className={cn(
            scrapbookButton({ tone: "neutral", size: "regular", tilt: "left", depth: "lg" }),
            "cursor-not-allowed border-4 border-secondary bg-secondary/50 px-10 py-5 text-xl font-bold uppercase text-white opacity-60",
          )}
        >
          Sign in with GitHub →
        </span>
      ) : (
        <a
          href={signinUrl}
          className={cn(
            scrapbookButton({ tone: "secondary", size: "regular", tilt: "left", depth: "lg" }),
            "border-4 border-secondary bg-secondary px-10 py-5 text-xl font-bold uppercase text-white",
          )}
        >
          Sign in with GitHub →
        </a>
      )}
    </div>
  );
}
