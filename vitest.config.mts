import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

// Tests share the database's small connection allowance with the running app.
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("connection_limit")) {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("connection_limit", "2");
  process.env.DATABASE_URL = url.toString();
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live tests change shared demo users, so test files must never run at the same time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
