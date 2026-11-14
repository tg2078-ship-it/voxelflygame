import { loadImage } from '@napi-rs/canvas';
(globalThis as unknown as { self: typeof globalThis }).self = globalThis;
globalThis.createImageBitmap = (async (blob: Blob) => loadImage(Buffer.from(await blob.arrayBuffer())) as unknown as ImageBitmap) as typeof createImageBitmap;
export const nativeFetch = globalThis.fetch.bind(globalThis);
