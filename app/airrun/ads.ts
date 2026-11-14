import type { AssetMeta, Placement, ThemeId, Vec } from './types';
export interface AdSlot {
    id: string;
    model: string;
    theme: ThemeId;
    position: Vec;
    yaw: number;
    size: Vec;
    material: string;
    visibleSeconds: number;
    collision: boolean;
    provider: 'local' | 'external';
}
export interface AdCreative {
    kind: 'native' | 'image';
    assetId?: string;
    imageUrl?: string;
    campaign: string;
}
export interface AdProvider {
    resolve: (slot: Readonly<AdSlot>) => Promise<AdCreative | null>;
}
/** Adapter boundary for a future provider. The game currently uses fictional native creatives. */
export const localAdProvider: AdProvider = { resolve: async (slot) => ({ kind: 'native', assetId: slot.model, campaign: slot.model === 'skyfuel_billboard' ? 'SKYFUEL' : 'AIRRUN AVIATION CLUB' }) };
export function adSlot(p: Placement, theme: ThemeId, meta: AssetMeta): AdSlot { return { id: `ad:${p.model}:${p.z.toFixed(2)}`, model: p.model, theme, position: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw, size: { x: meta.bounds.size[0] * p.sx, y: meta.bounds.size[1] * p.sy, z: meta.bounds.size[2] * p.sz }, material: p.model === 'vista_banner_plane' ? 'animated banner' : 'native display face', visibleSeconds: 0, collision: p.collision, provider: 'local' }; }
