import type { Context } from "hono";
import * as z from "zod/v4";

export function toErrorDetails(error: z.ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    })),
  };
}

export function jsonError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return c.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    status as any,
  );
}

type SafeParseSchema<T> = {
  safeParse: (input: unknown) =>
    | { success: true; data: T }
    | { success: false; error: z.ZodError };
};

export async function parseJsonBody<T>(
  c: Context,
  schema: SafeParseSchema<T>,
): Promise<
  | { success: true; data: T }
  | { success: false; response: Response }
> {
  const body = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      response: jsonError(c, 400, "validation_error", "The request body is invalid.", toErrorDetails(parsed.error)),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export function toIsoString(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}

export function toNullableIsoString(value: Date | string | null): string | null {
  return value ? toIsoString(value) : null;
}
