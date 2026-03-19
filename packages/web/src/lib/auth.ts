import { getPublicApiBaseUrl } from "./runtime-urls";

// SSR calls use internal URL to avoid hairpinning through the public internet
const API_URL = import.meta.env.SSR
  ? (process.env.API_URL || "http://localhost:3001")
  : getPublicApiBaseUrl();

export interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export async function getUser(cookieHeader?: string): Promise<User | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      credentials: "include",
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user || null;
  } catch {
    return null;
  }
}
