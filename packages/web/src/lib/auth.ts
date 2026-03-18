const API_URL = import.meta.env.PUBLIC_API_URL || "http://localhost:3001";

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
