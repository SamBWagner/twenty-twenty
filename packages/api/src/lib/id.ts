import { nanoid } from "nanoid";

export function newId(size = 16): string {
  return nanoid(size);
}
