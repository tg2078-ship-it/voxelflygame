import { assetUrl } from './asset-url';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import { createTrickPath } from './trick-path';
import { trickContext, type TrickPlanRequest, type TrickWorkerReply } from './trick-protocol';
import type { ProxyData } from './collision';
async function plan(request: TrickPlanRequest) {
    const proxies = new Map<string, ProxyData>(); let cursor = 0;
    const assets = request.assets.filter(meta => meta.proxy);
    await Promise.all(Array.from({ length: Math.min(6, assets.length) }, async () => {
        while (cursor < assets.length) {
            const meta = assets[cursor++], response = await fetch(assetUrl(meta.proxy!) + '?rev=5.0-edition12', { signal: AbortSignal.timeout(18000) });
            if (!response.ok) throw new Error('Collision sector unavailable · ' + meta.id);
            let bytes = new Uint8Array(await response.arrayBuffer()); if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
            const proxy = JSON.parse(new TextDecoder().decode(bytes)) as ProxyData;
            if (proxy.id !== meta.id || !Array.isArray(proxy.static) || !Array.isArray(proxy.dynamic)) throw new Error('Invalid collision sector');
            proxies.set(meta.id, proxy);
        }
    }));
    return createTrickPath(trickContext(request, proxies));
}
const worker = self as unknown as { onmessage: ((event: MessageEvent<TrickPlanRequest>) => void) | null; postMessage: (reply: TrickWorkerReply) => void };
worker.onmessage = event => { void plan(event.data).then(path => worker.postMessage({ path }), error => worker.postMessage({ error: error instanceof Error ? error.message : String(error) })); };
