const LOCAL_API_ORIGIN = "http://localhost:3001";
const LOCAL_WEB_ORIGIN = "http://localhost:4321";

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getPublicApiBaseUrl(): string {
  if (import.meta.env?.PUBLIC_API_URL) {
    return import.meta.env.PUBLIC_API_URL;
  }

  if (typeof window !== "undefined") {
    if (isLocalDevHost(window.location.hostname) && window.location.port === "4321") {
      return `${window.location.protocol}//${window.location.hostname}:3001`;
    }

    return window.location.origin;
  }

  return LOCAL_API_ORIGIN;
}

export function getPublicWebBaseUrl(): string {
  if (import.meta.env?.PUBLIC_WEB_URL) {
    return import.meta.env.PUBLIC_WEB_URL;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return LOCAL_WEB_ORIGIN;
}

export function getPublicWebSocketBaseUrl(): string {
  const url = new URL(getPublicApiBaseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}
