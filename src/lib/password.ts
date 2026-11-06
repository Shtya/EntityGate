/**
 * Password hashing: argon2id with @node-rs/argon2's defaults (OWASP-recommended parameters).
 * No "server-only" here because the seed script and tests import it too; the native module
 * can't reach a client bundle anyway.
 */
import { hash, verify } from "@node-rs/argon2";

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(data.hash, data.password);
  } catch {
    return false; // malformed or legacy hash: treat as a failed sign-in, never a server error
  }
}

export function isArgon2Hash(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith("$argon2"));
}
