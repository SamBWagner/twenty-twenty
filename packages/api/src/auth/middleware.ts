import { createMiddleware } from "hono/factory";
import { auth } from "./index.js";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

type AuthEnv = {
  Variables: {
    user: AuthUser;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user as AuthUser);
  await next();
});
