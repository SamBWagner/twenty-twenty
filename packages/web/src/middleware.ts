import type { MiddlewareHandler } from "astro";
import { resolveRequestAuth } from "./lib/auth";

export const onRequest: MiddlewareHandler = async (context, next) => {
  context.locals.auth = await resolveRequestAuth(context.request.headers);
  return next();
};
