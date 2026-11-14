import { compileModelBuffers, type CompileRequest, type CompileReply } from './model-compile-protocol';
const scope=globalThis as unknown as {onmessage:(event:MessageEvent<CompileRequest>)=>void;postMessage:(reply:CompileReply,transfer?:ArrayBuffer[])=>void};
scope.onmessage=event=>{
    try{const reply=compileModelBuffers(event.data),buffers=new Set<ArrayBuffer>();for(const g of reply.geometries!){for(const a of Object.values(g.attributes))buffers.add(a.array.buffer as ArrayBuffer);if(g.index)buffers.add(g.index.buffer as ArrayBuffer);}scope.postMessage(reply,[...buffers]);}
    catch(error){scope.postMessage({id:event.data.id,error:error instanceof Error?error.message:'Model compilation failed'});}
};
