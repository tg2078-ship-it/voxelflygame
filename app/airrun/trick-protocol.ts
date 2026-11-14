import { groundAt } from './world-ground';
import type { ProxyData } from './collision';
import type { PathContext, TrickPathResult } from './trick-path';
import type { AssetMeta, ThemeId } from './types';
export interface TrickPlanRequest extends Omit<PathContext, 'catalog' | 'proxies' | 'ground'> { assets: AssetMeta[]; seed: number; theme: ThemeId; variant: number; atTime: number }
export type TrickWorkerReply = { path: TrickPathResult; error?: never } | { error: string; path?: never };
export function trickContext(request: TrickPlanRequest, proxies: Map<string, ProxyData>): PathContext {
    return { ...request, catalog: new Map(request.assets.map(meta => [meta.id, meta])), proxies, ground: (x, z) => groundAt(x, z, request.theme, request.seed, request.variant) };
}
