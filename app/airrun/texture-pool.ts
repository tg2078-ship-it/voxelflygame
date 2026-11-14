import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
function keyFor(texture: T.Texture, hash?: string) {
    return hash ? hash + ':' + JSON.stringify([texture.mapping, texture.channel, texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter, texture.format, texture.internalFormat, texture.type, texture.colorSpace, texture.flipY, texture.premultiplyAlpha, texture.unpackAlignment, texture.generateMipmaps, texture.offset.toArray(), texture.repeat.toArray(), texture.center.toArray(), texture.rotation, texture.matrixAutoUpdate, texture.matrix.toArray()]) : texture.uuid;
}
function close(image: unknown) { const bitmap = image as { close?: () => void } | undefined; if (typeof bitmap?.close === 'function') bitmap.close(); }
/** Imported GLBs own leases; active instances pin imports in ModelLibrary. */
export class ModelTexturePool {
    pinned = new Set<T.Texture>();
    pinnedImages = new Set<unknown>();
    pin(texture: T.Texture) { this.pinned.add(texture); this.pinnedImages.add(texture.image); }
    entries = new Map<string, { texture: T.Texture; users: number }>();
    leases = new Map<GLTF, Set<string>>();
    images = new Map<unknown, number>();
    adopt(gltf: GLTF, hashes?: Record<string, string>) {
        if (this.leases.has(gltf)) return;
        const used = new Set<string>(), originals = new Set<T.Texture>(), kept = new Set<T.Texture>(), materials = new Set<T.Material>();
        gltf.scene.traverse(node => { if (node instanceof T.Mesh) for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m); });
        for (const material of materials) for (const [slot, value] of Object.entries(material)) {
            if (!(value instanceof T.Texture)) continue;
            originals.add(value);
            const index = (gltf.parser.associations.get(value) as { textures?: number } | undefined)?.textures;
            const key = keyFor(value, index === undefined ? undefined : hashes?.[String(index)]);
            let entry = this.entries.get(key);
            if (!entry) { entry = { texture: value, users: 0 }; this.entries.set(key, entry); this.images.set(value.image, (this.images.get(value.image) ?? 0) + 1); }
            if (!used.has(key)) { used.add(key); entry.users++; }
            kept.add(entry.texture); (material as unknown as Record<string, unknown>)[slot] = entry.texture;
        }
        this.leases.set(gltf, used);
        const discarded = new Set<unknown>();
        for (const texture of originals) if (!kept.has(texture)) { texture.dispose(); discarded.add(texture.image); }
        for (const image of discarded) if (!this.images.has(image)) close(image);
    }
    release(gltf: GLTF) {
        const lease = this.leases.get(gltf); if (!lease) return; this.leases.delete(gltf);
        for (const key of lease) {
            const entry = this.entries.get(key); if (!entry || --entry.users > 0) continue;
            this.entries.delete(key); if (!this.pinned.has(entry.texture)) entry.texture.dispose();
            const image = entry.texture.image, count = (this.images.get(image) ?? 1) - 1;
            if (count > 0) this.images.set(image, count); else { this.images.delete(image); if (!this.pinnedImages.has(image)) close(image); }
        }
    }
    dispose() { for (const gltf of this.leases.keys()) this.release(gltf); for (const texture of this.pinned) texture.dispose(); for (const image of this.pinnedImages) close(image); this.pinned.clear(); this.pinnedImages.clear(); }
}
