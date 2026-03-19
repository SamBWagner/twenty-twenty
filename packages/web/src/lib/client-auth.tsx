import { useEffect, useState } from "react";
import type { AuthSession } from "@twenty-twenty/shared";
import { api } from "./api-client";

function currentBrowserPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function buildLoginUrl(redirectPath = currentBrowserPath()): string {
  const loginUrl = new URL("/login", window.location.origin);
  if (redirectPath) {
    loginUrl.searchParams.set("redirect", redirectPath);
  }
  return loginUrl.toString();
}

export function redirectToLogin(redirectPath = currentBrowserPath()) {
  window.location.href = buildLoginUrl(redirectPath);
}

export function useAuthSession(options: {
  redirectOnAnonymous?: boolean;
  redirectPath?: string;
} = {}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get<AuthSession>("/auth/session")
      .then((result) => {
        if (cancelled) return;
        setSession(result);
        setError(null);
        if (!result.viewer && options.redirectOnAnonymous) {
          redirectToLogin(options.redirectPath);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || "Failed to load your session.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [options.redirectOnAnonymous, options.redirectPath]);

  return {
    session,
    viewer: session?.viewer || null,
    auth: session?.auth || null,
    authMode: session?.authMode || null,
    error,
    loading,
    isAuthenticated: Boolean(session?.viewer),
  };
}

export function AuthLoadingMessage({ label = "Loading..." }: { label?: string }) {
  return <p className="py-12 text-center font-mono text-sm">{label}</p>;
}

export function AuthErrorMessage({ message }: { message: string }) {
  return <p className="py-12 text-center font-bold text-red-600">{message}</p>;
}
