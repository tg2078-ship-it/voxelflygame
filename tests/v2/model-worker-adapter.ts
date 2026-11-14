import { Worker as NodeWorker } from 'node:worker_threads';
export class ModelWorkerAdapter {
    node=new NodeWorker(new URL('./model-worker-node.ts',import.meta.url),{execArgv:['--import','tsx']});
    onmessage?:(event:{data:unknown})=>void;onerror?:()=>void;onmessageerror?:()=>void;
    constructor(){this.node.on('message',data=>this.onmessage?.({data}));this.node.on('error',()=>this.onerror?.());this.node.on('messageerror',()=>this.onmessageerror?.());}
    postMessage(data:unknown,transfer?:ArrayBuffer[]){this.node.postMessage(data,transfer);}terminate(){void this.node.terminate();}
}
