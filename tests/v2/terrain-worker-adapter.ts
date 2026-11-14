import { Worker as NodeWorker } from 'node:worker_threads';
/** CPU-only transport adapter; this does not exercise browser Worker or WebGL. */
export class TerrainWorkerAdapter {
    node = new NodeWorker(new URL('./terrain-worker-node.ts', import.meta.url), { execArgv: ['--import','tsx'] });
    onmessage?: (event:{data:unknown})=>void; onerror?:()=>void; onmessageerror?:()=>void;
    constructor() { this.node.on('message',data=>this.onmessage?.({data}));this.node.on('error',()=>this.onerror?.());this.node.on('messageerror',()=>this.onmessageerror?.()); }
    postMessage(data:unknown) { this.node.postMessage(data); }
    terminate() { void this.node.terminate(); }
}
