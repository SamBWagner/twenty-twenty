const API_URL = "http://localhost:3001";
const WEB_URL = "http://localhost:4321";

async function waitForServer(url: string, label: string, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`${label} ready`);
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} at ${url} did not become ready`);
}

export default async function globalSetup() {
  await waitForServer(`${API_URL}/api/health`, "API server");
  await waitForServer(WEB_URL, "Web server");

  // Reset DB at start of test run
  const res = await fetch(`${API_URL}/api/test-auth/reset-db`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(`Failed to reset database: ${res.status}`);
  }
  console.log("Database reset");
}
