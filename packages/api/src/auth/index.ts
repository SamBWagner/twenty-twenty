import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";

const authBaseUrl = process.env.BETTER_AUTH_URL || process.env.API_URL || "http://localhost:3001";
const webUrl = process.env.WEB_URL || "http://localhost:4321";
const trustedOrigins = Array.from(
  new Set(
    [webUrl, authBaseUrl, process.env.TRUSTED_ORIGINS]
      .flatMap((value) => value?.split(",") ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);

export const auth = betterAuth({
  baseURL: authBaseUrl,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  // Enable email+password auth in test mode for E2E test user seeding
  ...(process.env.TEST_AUTH_BYPASS === "true"
    ? { emailAndPassword: { enabled: true } }
    : {}),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  trustedOrigins,
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
