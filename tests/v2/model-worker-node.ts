import { parentPort } from 'node:worker_threads';
const scope=globalThis as unknown as {onmessage:(event:{data:unknown})=>void;postMessage:(reply:unknown,transfer?:ArrayBuffer[])=>void};
scope.postMessage=(reply,transfer)=>{parentPort!.postMessage(reply,transfer);if(transfer?.some(buffer=>buffer.byteLength!==0))throw new Error('Model buffer did not transfer ownership');};
await import('../../app/airrun/model-compiler-worker');
parentPort!.on('message',data=>scope.onmessage({data}));
