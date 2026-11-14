import { terrainGeometry } from './terrain';
import type { ThemeId } from './types';
export interface TerrainRequest { id: number; start: number; theme: ThemeId; seed: number; variant: number; cell: number }
export interface TerrainReply { id: number; position?: Float32Array; normal?: Float32Array; color?: Float32Array; error?: string }
export function buildTerrainBuffers(request: TerrainRequest): TerrainReply {
    const geometry = terrainGeometry(request.start, request.theme, request.seed, request.variant, request.cell);
    const reply = { id: request.id, position: geometry.getAttribute('position').array as Float32Array, normal: geometry.getAttribute('normal').array as Float32Array, color: geometry.getAttribute('color').array as Float32Array };
    geometry.dispose(); return reply;
}
