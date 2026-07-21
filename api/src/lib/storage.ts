import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export type StorageFolder = "gpx" | "audio" | "photos" | "covers";

/**
 * Minimal storage abstraction. Only a local-disk driver is implemented, but the
 * interface is deliberately small so a S3/R2 driver can be dropped in later
 * without touching the routes.
 */
export interface StorageDriver {
  /** Persist a stream. Returns the storage-relative path (e.g. "gpx/x.gpx"). */
  saveStream(
    folder: StorageFolder,
    filename: string,
    stream: Readable,
  ): Promise<string>;
  /** Persist a buffer/string. Returns the storage-relative path. */
  saveBuffer(
    folder: StorageFolder,
    filename: string,
    data: Buffer | string,
  ): Promise<string>;
  /** Read a stored file as a buffer. */
  read(relPath: string): Promise<Buffer>;
  /** Delete a stored file (no-op if missing). */
  remove(relPath: string): Promise<void>;
  /** Absolute path on disk for a storage-relative path. */
  absolute(relPath: string): string;
  /** Root directory served statically at /files. */
  readonly root: string;
}

export class LocalStorageDriver implements StorageDriver {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  private async ensureDir(folder: StorageFolder): Promise<string> {
    const dir = path.join(this.root, folder);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async saveStream(
    folder: StorageFolder,
    filename: string,
    stream: Readable,
  ): Promise<string> {
    const dir = await this.ensureDir(folder);
    const abs = path.join(dir, filename);
    await pipeline(stream, createWriteStream(abs));
    return path.posix.join(folder, filename);
  }

  async saveBuffer(
    folder: StorageFolder,
    filename: string,
    data: Buffer | string,
  ): Promise<string> {
    const dir = await this.ensureDir(folder);
    const abs = path.join(dir, filename);
    await fs.writeFile(abs, data);
    return path.posix.join(folder, filename);
  }

  async read(relPath: string): Promise<Buffer> {
    return fs.readFile(this.absolute(relPath));
  }

  async remove(relPath: string): Promise<void> {
    try {
      await fs.unlink(this.absolute(relPath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  absolute(relPath: string): string {
    // Prevent path traversal escaping the storage root.
    const safe = path
      .normalize(relPath)
      .replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.root, safe);
  }
}

let singleton: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!singleton) {
    const root = process.env.STORAGE_DIR ?? "/storage";
    singleton = new LocalStorageDriver(root);
  }
  return singleton;
}
