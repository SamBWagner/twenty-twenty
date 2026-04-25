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
    <div className="relative flex flex-col items-center justify-center py-16 sm:py-20">
      <div aria-hidden="true" className="absolute left-20 top-16 hidden select-none text-5xl rotate-[12deg] sm:block">★</div>
      <div aria-hidden="true" className="absolute right-32 top-24 hidden select-none text-3xl text-primary rotate-[-8deg] sm:block">✦</div>

      <h1 className="mb-10 text-4xl font-bold uppercase text-stroke sm:text-5xl">
        <span className="text-tertiary">Get</span> <span className="text-primary">In</span>
      </h1>

      {(errorTitle || authNotConfigured) && (
        <div className="mb-8 max-w-2xl rotate-[-0.4deg] border-4 border-secondary bg-white p-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-secondary/70">
            {errorTitle || "Local auth setup needed"}
          </p>
          <p className="mt-3 text-base font-medium text-secondary/75">
            {errorBody || "GitHub OAuth needs to be configured before local sign-in will work."}
          </p>

          <div className="mt-4 break-all border-3 border-secondary bg-surface p-4 font-mono text-sm">
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
            "cursor-not-allowed border-4 border-secondary bg-white px-6 py-4 text-lg font-bold uppercase text-secondary opacity-60 sm:px-10 sm:py-5 sm:text-xl",
          )}
        >
          Sign in with GitHub →
        </span>
      ) : (
        <a
          href={signinUrl}
          className={cn(
            scrapbookButton({ tone: "secondary", size: "regular", tilt: "left", depth: "lg" }),
            "inline-flex max-w-full items-center justify-center border-4 border-secondary bg-secondary px-6 py-4 text-lg font-bold uppercase text-white sm:px-10 sm:py-5 sm:text-xl",
          )}
        >
          Sign in with GitHub →
        </a>
      )}
    </div>
  );
}
