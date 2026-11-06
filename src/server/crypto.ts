import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Field-level encryption for identity numbers: a database leak alone doesn't expose them. */
const PREFIX = "enc:v1:";

function key(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("ENCRYPTION_KEY must be 64 hex characters");
  return Buffer.from(hex, "hex");
}

export function encrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Last 4 digits only, for people without the sensitive-data permission. */
export function mask(value: string | null): string | null {
  return value ? `••••${value.slice(-4)}` : null;
}
