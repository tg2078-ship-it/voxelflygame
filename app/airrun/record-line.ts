import * as T from 'three';
import { AIRSPACE } from './graphics';

/** Checkered flags stand outside the playable corridor at the first whole metre
 * that beats the pilot's previous record. The finish is purely visual. */
export function makeRecordLine() {
    const width = AIRSPACE.halfWidth + 8;
    const geometry = new T.BoxGeometry();
    const line = new T.InstancedMesh(geometry, new T.MeshBasicMaterial({ toneMapped: false }), 2 + 2 * 6 * 3);
    const matrix = new T.Matrix4(), color = new T.Color();
    let index = 0;
    function block(x: number, y: number, w: number, h: number, depth: number, paint: string) {
        matrix.makeScale(w, h, depth).setPosition(x, y, 0);
        line.setMatrixAt(index, matrix);
        line.setColorAt(index++, color.set(paint));
    }
    for (const side of [-1, 1]) {
        block(side * width, 30, .65, 60, .65, '#d7b46e');
        for (let column = 0; column < 6; column++) for (let row = 0; row < 3; row++) {
            block(side * (width - 1 - column * 2), 58 - row * 2, 2, 2, .4,
                (column + row) % 2 ? '#19344a' : '#ffdd80');
        }
    }
    line.computeBoundingSphere();
    line.visible = false;
    return line;
}
