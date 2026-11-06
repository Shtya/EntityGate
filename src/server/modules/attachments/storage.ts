import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Storage driver. Dev uses the local disk (git-ignored ./storage);
 * production plugs an S3-compatible driver in behind the same interface.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
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
};

export const storage: StorageDriver = localDriver;
