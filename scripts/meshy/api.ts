/**
 * Minimal Meshy REST client (https://docs.meshy.ai). Node only.
 * Handles auth, JSON errors, 429/5xx retries with backoff and Retry-After,
 * polling until a task is terminal, and downloads.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const BASE = 'https://api.meshy.ai/openapi';

export type TaskKind = 'text-to-3d' | 'rigging' | 'animations' | 'remesh' | 'retexture' | 'text-to-image';

const PATHS: Record<TaskKind, string> = {
  'text-to-3d': '/v2/text-to-3d',
  rigging: '/v1/rigging',
  animations: '/v1/animations',
  remesh: '/v1/remesh',
  retexture: '/v1/retexture',
  'text-to-image': '/v1/text-to-image',
};

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export interface MeshyTask {
  id: string;
  status: TaskStatus;
  progress: number;
  model_urls?: Partial<Record<'glb' | 'fbx' | 'obj' | 'usdz', string>>;
  thumbnail_url?: string;
  texture_urls?: Record<string, string>[];
  task_error?: { message?: string } | null;
  consumed_credits?: number | null;
  ai_model?: string;
  result?: Record<string, unknown>;
  [key: string]: unknown;
}

export class MeshyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MeshyClient {
  constructor(
    private readonly apiKey: string,
    private readonly log: (msg: string) => void = () => {},
  ) {}

  /** JSON request with retries for rate limits (429 with Retry-After) and transient 5xx errors. */
  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<{ data: T; headers: Headers }> {
    let attempt = 0;
    for (;;) {
      attempt++;
      let res: Response;
      try {
        res = await fetch(BASE + path, {
          method,
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (attempt >= 5) throw err;
        const wait = 2 ** attempt * 1000;
        this.log(`network error (${(err as Error).message}); retrying in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        return { data: (text ? JSON.parse(text) : {}) as T, headers: res.headers };
      }
      const text = await res.text();
      const retryAfter = Number(res.headers.get('retry-after'));
      // 429 without Retry-After = queue full: wait for a running task to finish.
      if (res.status === 429 && attempt < 30) {
        const wait = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10) * 1000;
        this.log(`rate limited (${text.slice(0, 80)}); waiting ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt < 5) {
        const wait = 2 ** attempt * 1000;
        this.log(`server error ${res.status}; retrying in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // keep raw text
      }
      throw new MeshyError(`${method} ${path} → ${res.status}: ${message}`, res.status, text);
    }
  }

  async balance(): Promise<number> {
    return (await this.request<{ balance: number }>('GET', '/v1/balance')).data.balance;
  }

  /** Create a task; returns its id. */
  async create(kind: TaskKind, body: Record<string, unknown>): Promise<string> {
    const { data } = await this.request<{ result: string }>('POST', PATHS[kind], body);
    if (!data.result) throw new Error(`${kind}: create returned no task id`);
    return data.result;
  }

  async get(kind: TaskKind, id: string): Promise<{ task: MeshyTask; retryAfter: number }> {
    const { data, headers } = await this.request<MeshyTask>('GET', `${PATHS[kind]}/${id}`);
    const ra = Number(headers.get('retry-after'));
    return { task: data, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : 5 };
  }

  /** Poll until SUCCEEDED/FAILED/CANCELED, honouring Retry-After between polls. */
  async wait(kind: TaskKind, id: string, label: string, timeoutMin = 30): Promise<MeshyTask> {
    const deadline = Date.now() + timeoutMin * 60_000;
    let lastProgress = -1;
    for (;;) {
      const { task, retryAfter } = await this.get(kind, id);
      if (task.progress !== lastProgress) {
        lastProgress = task.progress;
        this.log(`${label}: ${task.status} ${task.progress}%`);
      }
      if (task.status === 'SUCCEEDED' || task.status === 'FAILED' || task.status === 'CANCELED') return task;
      if (Date.now() > deadline) throw new Error(`${label}: timed out after ${timeoutMin} min (task ${id})`);
      await sleep(Math.max(3, retryAfter) * 1000);
    }
  }

  async animationLibrary(): Promise<{ action_id: number; name: string; key: string; category: string }[]> {
    return (await this.request<{ action_id: number; name: string; key: string; category: string }[]>('GET', '/v1/animations/library')).data;
  }
}

/** Download a (signed, expiring) asset URL to disk. */
export async function download(url: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await sleep(2 ** attempt * 1000);
    }
  }
}
