import * as T from 'three';
import type { ModelInstance } from './assets';
/** Four permanent chapter crests, placed relative to each authored tail socket. */
export class ChapterInsignia {
    root = new T.Group();
    chapter = -1;
    geometry = new T.ShapeGeometry((() => {
        const shape = new T.Shape();
        shape.moveTo(0, .28);
        shape.lineTo(.24, .13);
        shape.lineTo(.21, -.14);
        shape.lineTo(0, -.28);
        shape.lineTo(-.21, -.14);
        shape.lineTo(-.24, .13);
        shape.closePath();
        return shape;
    })());
    bar = new T.PlaneGeometry(.22, .024);
    materials: T.MeshStandardMaterial[] = [];
    constructor(public instance: ModelInstance) { instance.root.add(this.root); }
    update(career: number) {
        const chapter = Math.min(4, Math.floor(career / 5));
        if (chapter === this.chapter)
            return;
        this.chapter = chapter;
        this.root.clear();
        for (const material of this.materials)
            material.dispose();
        this.materials = [];
        if (!chapter)
            return;
        const socket = this.instance.meta.sockets.tail_beacon ?? [0, this.instance.meta.bounds.max[1], this.instance.meta.bounds.max[2] * .8];
        const colors = ['#bd8a67', '#c4d1d9', '#e3bb68', '#8dc8dc'];
        const material = new T.MeshStandardMaterial({ color: colors[chapter - 1], metalness: .65, roughness: .3, polygonOffset: true, polygonOffsetFactor: -2 });
        const ink = new T.MeshStandardMaterial({ color: '#19354a', roughness: .65 });
        this.materials.push(material, ink);
        const size = Math.min(1, this.instance.meta.bounds.size[1] / 3.2);
        for (const side of [-1, 1]) {
            const face = new T.Group();
            face.position.set(side * .17, socket[1] - .46 * size, socket[2] + .01);
            face.rotation.y = side * Math.PI / 2;
            face.scale.setScalar(size);
            const crest = new T.Mesh(this.geometry, material);
            face.add(crest);
            for (let i = 0; i < chapter; i++) {
                const bar = new T.Mesh(this.bar, ink);
                bar.position.set(0, .07 - i * .055, .006);
                face.add(bar);
            }
            this.root.add(face);
        }
    }
    dispose() {
        this.root.removeFromParent();
        this.geometry.dispose();
        this.bar.dispose();
        for (const material of this.materials)
            material.dispose();
    }
}
