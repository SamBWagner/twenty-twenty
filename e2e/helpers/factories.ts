import type { APIRequestContext } from "@playwright/test";

const API_URL = "http://localhost:3001";
const API_V1_URL = `${API_URL}/api/v1`;

interface RequestOptions {
  request: APIRequestContext;
  cookie: string;
}

function headers(cookie: string) {
  return { Cookie: cookie };
}

// --- Projects ---

export async function createProject(
  opts: RequestOptions,
  data: { name: string; description?: string },
) {
  const res = await opts.request.post(`${API_V1_URL}/projects`, {
    data,
    headers: headers(opts.cookie),
  });
  if (!res.ok()) throw new Error(`createProject failed: ${res.status()}`);
  return res.json();
}

// --- Members ---

export async function addMember(
  opts: RequestOptions,
  projectId: string,
  userId: string,
) {
  const res = await opts.request.post(
    `${API_V1_URL}/projects/${projectId}/members`,
    { data: { userId }, headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`addMember failed: ${res.status()}`);
  return res.json();
}

// --- Invitations ---

export async function createInvitation(
  opts: RequestOptions,
  projectId: string,
) {
  const res = await opts.request.post(
    `${API_V1_URL}/projects/${projectId}/invitations`,
    { headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`createInvitation failed: ${res.status()}`);
  return res.json();
}

export async function expireInvitation(
  opts: Pick<RequestOptions, "request">,
  invitationId: string,
) {
  const res = await opts.request.post(
    `${API_URL}/api/test-auth/invitations/${invitationId}/expire`,
  );
  if (!res.ok()) throw new Error(`expireInvitation failed: ${res.status()}`);
  return res.json();
}

// --- Sessions ---

export async function createSession(
  opts: RequestOptions,
  projectId: string,
  data: { name: string },
) {
  const res = await opts.request.post(
    `${API_V1_URL}/projects/${projectId}/sessions`,
    { data, headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`createSession failed: ${res.status()}`);
  return res.json();
}

export async function advancePhase(
  opts: RequestOptions,
  sessionId: string,
) {
  const res = await opts.request.patch(
    `${API_V1_URL}/sessions/${sessionId}/phase`,
    { headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`advancePhase failed: ${res.status()}`);
  return res.json();
}

export async function generateShareToken(
  opts: RequestOptions,
  sessionId: string,
) {
  const res = await opts.request.post(
    `${API_V1_URL}/sessions/${sessionId}/share`,
    { headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`generateShareToken failed: ${res.status()}`);
  return res.json();
}

export async function generateSummaryShareToken(
  opts: RequestOptions,
  sessionId: string,
) {
  const res = await opts.request.post(
    `${API_V1_URL}/sessions/${sessionId}/summary-share`,
    { headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`generateSummaryShareToken failed: ${res.status()}`);
  return res.json();
}

// --- Items ---

export async function createItem(
  opts: RequestOptions,
  sessionId: string,
  data: { type: "good" | "bad"; content: string },
) {
  const res = await opts.request.post(
    `${API_V1_URL}/sessions/${sessionId}/items`,
    { data, headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`createItem failed: ${res.status()}`);
  return res.json();
}

export async function voteItem(
  opts: RequestOptions,
  sessionId: string,
  itemId: string,
  value: 1 | -1,
) {
  const res = await opts.request.post(
    `${API_V1_URL}/sessions/${sessionId}/items/${itemId}/vote`,
    { data: { value }, headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`voteItem failed: ${res.status()}`);
  return res.json();
}

// --- Actions ---

export async function createAction(
  opts: RequestOptions,
  sessionId: string,
  data: { description: string },
) {
  const res = await opts.request.post(
    `${API_V1_URL}/sessions/${sessionId}/actions`,
    { data, headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`createAction failed: ${res.status()}`);
  return res.json();
}

// --- Reviews ---

export async function submitReview(
  opts: RequestOptions,
  sessionId: string,
  data: { actionId: string; status: "did_nothing" | "actioned" | "disagree"; comment?: string },
) {
  const res = await opts.request.post(
    `${API_V1_URL}/sessions/${sessionId}/reviews`,
    { data, headers: headers(opts.cookie) },
  );
  if (!res.ok()) throw new Error(`submitReview failed: ${res.status()}`);
  return res.json();
}
