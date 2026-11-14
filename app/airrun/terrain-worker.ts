import { buildTerrainBuffers, type TerrainReply, type TerrainRequest } from './terrain-protocol';
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<TerrainRequest>) => void; postMessage: (reply: TerrainReply, transfer?: Transferable[]) => void };
scope.onmessage = event => {
    try {
        const reply = buildTerrainBuffers(event.data);
        scope.postMessage(reply, [reply.position!.buffer, reply.normal!.buffer, reply.color!.buffer] as ArrayBuffer[]);
    }
    catch (error) { scope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'Terrain generation failed' }); }
};
