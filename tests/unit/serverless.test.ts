import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl, trustedOrigins } from "@/lib/app-url";
import { poolUrl } from "@/server/db";

const SESSION = "postgresql://u:p@aws-1-eu-west-2.pooler.supabase.com:5432/db?sslmode=require";

afterEach(() => vi.unstubAllEnvs());

describe("poolUrl", () => {
  it("moves Supabase's session pooler to transaction mode on serverless", () => {
    const url = new URL(poolUrl(SESSION, true)!);
    expect(url.port).toBe("6543");
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("20");
    expect(url.searchParams.get("sslmode")).toBe("require");
  });
  it("leaves session mode alone on a normal server", () => {
    const url = new URL(poolUrl(SESSION, false)!);
    expect(url.port).toBe("5432");
    expect(url.searchParams.has("pgbouncer")).toBe(false);
    expect(url.searchParams.get("connection_limit")).toBe("5");
  });
  it("adds pgbouncer whenever the URL already uses the transaction port", () => {
    const url = new URL(poolUrl(SESSION.replace(":5432", ":6543"), false)!);
    expect(url.searchParams.get("pgbouncer")).toBe("true");
  });
  it("doesn't rewrite other databases, and respects settings in the URL", () => {
    const url = new URL(poolUrl("postgresql://u:p@db.example.com:5432/db?connection_limit=9", true)!);
    expect(url.port).toBe("5432");
    expect(url.searchParams.get("connection_limit")).toBe("9");
  });
});

describe("appUrl", () => {
  it("ignores a leftover localhost address on Vercel", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "entity-gate.vercel.app");
    expect(appUrl()).toBe("https://entity-gate.vercel.app");
  });
  it("prefers a configured custom domain", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "entity-gate.vercel.app");
    expect(appUrl()).toBe("https://app.example.com");
    expect(trustedOrigins()).toContain("https://entity-gate.vercel.app");
  });
  it("keeps localhost for local work", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
