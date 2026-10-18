import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { uploadDirectory } from '../config/env.js';

export interface StorageProvider { put(key: string, content: Buffer): Promise<void>; get(key: string): Promise<Buffer> }
// Shared volume for local API/workers. Replace this adapter with object storage for multiple hosts.
export class LocalStorageProvider implements StorageProvider {
  private path(key: string) {
    if (!/^[a-f0-9]{64}\.pdf$/.test(key)) throw new Error('Invalid storage key');
    return join(uploadDirectory, key);
  }
  async put(key: string, content: Buffer) {
    await mkdir(uploadDirectory, { recursive: true });
    const destination = this.path(key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, content); await rename(temporary, destination); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  get(key: string) { return readFile(this.path(key)); }
}
