/**
 * Upload rules and download permissions against a running server (GEN-02).
 * Run with:  E2E_BASE_URL=http://localhost:3000 npm test
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE_URL;
const db = new PrismaClient();
const created: string[] = [];

afterAll(async () => {
  const rows = await db.attachment.findMany({ where: { id: { in: created } } });
  for (const row of rows) await rm(path.resolve(process.env.STORAGE_DIR || "./storage", row.storageKey), { force: true });
  await db.attachment.deleteMany({ where: { id: { in: created } } });
  await db.$disconnect();
});

async function signIn(email: string) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE! },
    body: JSON.stringify({ email, password: process.env.SEED_USER_PASSWORD }),
  });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

function upload(cookie: string, bytes: Uint8Array | string, type: string, name: string) {
  const form = new FormData();
  form.set("file", new File([bytes as BlobPart], name, { type }));
  return fetch(`${BASE}/api/v1/attachments`, { method: "POST", headers: { Cookie: cookie }, body: form });
}

const PDF = "%PDF-1.4\n% test file\n";

describe.skipIf(!BASE)("attachments (live server)", () => {
  it("stores a valid file with its hash, and only permitted users can download it", async () => {
    const owner = await signIn("am1@entitygate.test");
    const res = await upload(owner, PDF, "application/pdf", "contract.pdf");
    expect(res.status).toBe(201);
    const { data } = await res.json();
    created.push(data.id);
    expect(data.filename).toBe("contract.pdf");

    const row = await db.attachment.findUniqueOrThrow({ where: { id: data.id } });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.scanStatus).toBe(process.env.CLAMAV_HOST ? "CLEAN" : "SKIPPED");

    const download = await fetch(`${BASE}/api/v1/attachments/${data.id}`, { headers: { Cookie: owner } });
    expect(download.status).toBe(200);
    expect(await download.text()).toBe(PDF);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");

    // Executive has neither document:read nor ownership of this file.
    const exec = await signIn("exec@entitygate.test");
    expect((await fetch(`${BASE}/api/v1/attachments/${data.id}`, { headers: { Cookie: exec } })).status).toBe(403);
  });

  it("rejects disallowed types, spoofed content and empty files", async () => {
    const cookie = await signIn("am1@entitygate.test");
    expect((await upload(cookie, "MZ fake", "application/x-msdownload", "virus.exe")).status).toBe(422);
    expect((await upload(cookie, "MZ not really a pdf", "application/pdf", "invoice.pdf")).status).toBe(422);
    expect((await upload(cookie, "", "application/pdf", "empty.pdf")).status).toBe(422);
  });

  it("refuses uploads from read-only roles", async () => {
    const cookie = await signIn("auditor@entitygate.test");
    expect((await upload(cookie, PDF, "application/pdf", "x.pdf")).status).toBe(403);
  });

  it("requires a session", async () => {
    const form = new FormData();
    form.set("file", new File([PDF], "x.pdf", { type: "application/pdf" }));
    const res = await fetch(`${BASE}/api/v1/attachments`, { method: "POST", body: form });
    expect(res.status).toBe(401);
  });
});
