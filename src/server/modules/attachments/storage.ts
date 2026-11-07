import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isServerless } from "@/lib/app-url";
import { db } from "@/server/db";

/**
 * Where uploaded files live: the local disk (git-ignored ./storage), or the database where there's
 * no disk to keep them on. STORAGE_DRIVER=database|local overrides the default.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");

function safePath(key: string) {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return p;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const p = safePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  },
  async get(key) {
    return readFile(safePath(key));
  },
  async delete(key) {
    await rm(safePath(key), { force: true });
  },
};

const databaseDriver: StorageDriver = {
  async put(key, data) {
    await db.attachmentBlob.create({ data: { key, data: new Uint8Array(data) } });
  },
  async get(key) {
    const row = await db.attachmentBlob.findUniqueOrThrow({ where: { key } });
    return Buffer.from(row.data);
  },
  async delete(key) {
    await db.attachmentBlob.deleteMany({ where: { key } });
  },
};

const useDatabase = process.env.STORAGE_DRIVER ? process.env.STORAGE_DRIVER === "database" : isServerless();
export const storage: StorageDriver = useDatabase ? databaseDriver : localDriver;
