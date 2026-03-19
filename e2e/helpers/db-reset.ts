const API_URL = "http://localhost:3001";

export async function resetDatabase(): Promise<void> {
  const res = await fetch(`${API_URL}/api/test-auth/reset-db`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to reset database: ${res.status}`);
  }
}
