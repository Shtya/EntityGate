import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "MFA_REQUIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  MFA_REQUIRED: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

/** Messages are keys in messages/*.json ("errors.*"); apiRoute() translates them per request. */
export const unauthenticated = (key = "errors.unauthenticated") => new AppError("UNAUTHENTICATED", key);
export const forbidden = (key = "errors.forbidden") => new AppError("FORBIDDEN", key);
export const notFound = (key = "errors.notFound") => new AppError("NOT_FOUND", key);
export const conflict = (key: string, details?: unknown) => new AppError("CONFLICT", key, details);
export const invalid = (key: string, details?: unknown) => new AppError("VALIDATION", key, details);

/** Normalize anything thrown into an AppError (DB errors become meaningful 409/422s). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return invalid(
      "errors.validation",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Column names from err.meta are deliberately not echoed to the client.
    if (err.code === "P2002") return conflict("errors.duplicate");
    if (err.code === "P2025") return notFound();
    if (err.code === "P2003") return conflict("errors.referenced");
  }
  // Raw Postgres errors surfaced through Prisma (exclusion/check constraints, triggers)
  const msg = err instanceof Error ? err.message : String(err);
  if (/allocations_no_overlap/.test(msg)) return conflict("errors.allocationOverlap");
  if (/account_assignments_single_owner/.test(msg)) return conflict("errors.ownerOverlap");
  if (/23P01|23514|violates check constraint|conflicting key/.test(msg)) return invalid("errors.outOfRange");
  return new AppError("INTERNAL", "errors.internal");
}
