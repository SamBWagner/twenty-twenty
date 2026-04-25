import { useEffect, useState } from "react";
import type { AuthSession } from "@twenty-twenty/shared";
import { api } from "./api-client";

const AUTH_SESSION_CACHE_MS = 2_000;

let cachedAuthSession: {
  value: AuthSession;
  expiresAt: number;
} | null = null;
let inFlightAuthSession: Promise<AuthSession> | null = null;

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

export function loadAuthSession(): Promise<AuthSession> {
  const now = Date.now();
  if (cachedAuthSession && cachedAuthSession.expiresAt > now) {
    return Promise.resolve(cachedAuthSession.value);
  }

  if (inFlightAuthSession) {
    return inFlightAuthSession;
  }

  inFlightAuthSession = api
    .get<AuthSession>("/auth/session")
    .then((result) => {
      cachedAuthSession = {
        value: result,
        expiresAt: Date.now() + AUTH_SESSION_CACHE_MS,
      };
      return result;
    })
    .finally(() => {
      inFlightAuthSession = null;
    });

  return inFlightAuthSession;
}

export function resetAuthSessionCacheForTest() {
  cachedAuthSession = null;
  inFlightAuthSession = null;
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

    loadAuthSession()
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
