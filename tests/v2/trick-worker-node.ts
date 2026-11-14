import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
const scope = globalThis as unknown as { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (reply: unknown) => void };
scope.onmessage = null; scope.postMessage = reply => parentPort!.postMessage(reply);
(globalThis as unknown as { self: unknown }).self = globalThis;
globalThis.fetch = (async (url: string | URL | Request) => { try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } }) as typeof fetch;
await import('../../app/airrun/trick-worker');
parentPort!.on('message', data => scope.onmessage!({ data }));
