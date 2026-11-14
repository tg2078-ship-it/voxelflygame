'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ModelLibrary, ModelInstance } from './assets';
import { updateModelPose } from './model-pose';
import type { AssetMeta } from './types';

export function ModelInspector({ meta, library, ko, onActive }: { meta: AssetMeta; library: ModelLibrary; ko: boolean; onActive?: (active: boolean) => void }) {
    const canvas = useRef<HTMLCanvasElement>(null), clock = useRef({ playing: true, time: 0, clip: '' });
    const [status, setStatus] = useState('loading'), [error, setError] = useState(''), [playing, setPlaying] = useState(true), [time, setTime] = useState(0), [clip, setClip] = useState('');
    useEffect(() => {
        onActive?.(true);
        let alive = true, raf = 0, instance: ModelInstance | null = null;
        let renderer: T.WebGLRenderer;
        try { renderer = new T.WebGLRenderer({ canvas: canvas.current!, antialias: true, powerPreference: 'high-performance' }); }
        catch (e) {
            queueMicrotask(() => { if (alive) setError(String(e)); });
            return () => { alive = false; onActive?.(false); };
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
        const scene = new T.Scene(); scene.background = new T.Color('#18252e');
        const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment(), environment = pmrem.fromScene(room, .04);
        scene.environment = environment.texture; room.dispose(); pmrem.dispose();
        const camera = new T.PerspectiveCamera(38, 1, .02, 5000), controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; controls.dampingFactor = .08;
        const sun = new T.DirectionalLight('#fff0dc', 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .03;
        const fill = new T.HemisphereLight('#c7e4f2', '#625449', 1.2);
        const rim = new T.DirectionalLight('#a6d7ff', 1.5);
        scene.add(sun, sun.target, fill, rim);
        const floor = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#25333c', roughness: .88 }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const resize = new ResizeObserver(() => { const box = renderer.domElement.getBoundingClientRect(); renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false); camera.aspect = box.width / Math.max(1, box.height); camera.updateProjectionMatrix(); });
        resize.observe(renderer.domElement);
        const install = (next: ModelInstance, fit: boolean) => {
            if (!alive) { next.dispose(); return; }
            const previous = instance; instance = next;
            scene.add(next.root); previous?.dispose();
            updateModelPose(next.root);
            if (!fit) return;
            const box = new T.Box3().setFromObject(next.root, true), center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
            const radius = Math.max(1, size.length() * .5), aspect = camera.aspect;
            const distance = radius / Math.sin(Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, aspect))) * 1.08;
            controls.target.copy(center); camera.position.copy(center).addScaledVector(new T.Vector3(.95, .54, -1.2).normalize(), distance);
            controls.minDistance = Math.max(.15, radius * .2); controls.maxDistance = distance * 4;
            camera.far = Math.max(1000, distance * 8); camera.updateProjectionMatrix();
            floor.scale.setScalar(radius * 8); floor.position.set(center.x, box.min.y - .025, center.z);
            sun.position.copy(center).add(new T.Vector3(-radius * 1.8, radius * 3, -radius)); sun.target.position.copy(center);
            Object.assign(sun.shadow.camera, { left: -radius * 1.3, right: radius * 1.3, top: radius * 1.3, bottom: -radius * 1.3, near: .1, far: radius * 8 }); sun.shadow.camera.updateProjectionMatrix();
            rim.position.copy(center).add(new T.Vector3(radius, radius, radius * 2)); controls.update();
        };
        let last = performance.now(), uiAt = last;
        const frame = (now: number) => {
            if (!alive) return;
            const dt = Math.min(.08, Math.max(0, (now - last) / 1000)); last = now;
            if (clock.current.playing) clock.current.time += dt;
            if (instance) {
                for (const [name, action] of instance.actions) {
                    const wanted = instance.meta.animations.some(c => c.name === name && c.autoplay) || name === clock.current.clip;
                    if (wanted && !action.isRunning()) action.play(); else if (!wanted && action.isRunning()) action.stop();
                }
                instance.mixer.setTime(clock.current.time); updateModelPose(instance.root);
            }
            controls.update(); renderer.render(scene, camera);
            if (now - uiAt > 200) { setTime(clock.current.time); uiAt = now; }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        void (async () => {
            try {
                install(await library.instance(meta.id, 1), true); if (!alive) return; setStatus('detail');
                if (meta.sourceLods?.lod0 !== 1) install(await library.instance(meta.id, 0), false); if (alive) setStatus('ready');
            } catch (e) { if (alive) { setStatus(instance ? 'detail-error' : 'error'); setError(e instanceof Error ? e.message : String(e)); } }
        })();
        return () => { alive = false; cancelAnimationFrame(raf); resize.disconnect(); controls.dispose(); instance?.dispose(); floor.geometry.dispose(); floor.material.dispose(); sun.shadow.dispose(); environment.dispose(); renderer.dispose(); if (!renderer.domElement.isConnected) renderer.forceContextLoss(); scene.clear(); onActive?.(false); };
    }, [meta.id, meta.sourceLods?.lod0, library, onActive]);
    const duration = clip ? meta.animations.find(c => c.name === clip)?.duration ?? 10 : Math.max(10, ...meta.animations.map(c => c.duration));
    return <div className="model-inspector"><div className="inspector-viewport"><canvas ref={canvas} aria-label={meta.title + (ko ? ' 실시간 3D 모델' : ' live 3D model')}/><span className="inspector-edition">EDITION 12 · {status === 'ready' ? 'NATIVE LOD ' + (meta.sourceLods?.lod0 ?? 0) : status === 'loading' ? (ko ? '모델 준비 중' : 'LOADING') : (ko ? '상세 모델 준비 중' : 'REFINING')}</span><span className="inspector-help">{ko ? '드래그로 회전 · 스크롤로 확대' : 'DRAG TO ORBIT · SCROLL TO ZOOM'}</span></div>{error && <p role="status">{ko ? '모델을 불러오지 못했습니다. 다시 열어주세요. ' : 'Could not load the model. Reopen to retry. '}{error}</p>}<div className="inspector-playback"><button className="secondary compact" onClick={() => { clock.current.playing = !playing; setPlaying(!playing); }}>{playing ? (ko ? '일시정지' : 'PAUSE') : (ko ? '재생' : 'PLAY')}</button><select aria-label={ko ? '모델 동작' : 'Animation clip'} value={clip} onChange={e => { setClip(e.target.value); clock.current.clip = e.target.value; clock.current.time = 0; setTime(0); }}><option value="">{ko ? '기본 자동 동작' : 'DEFAULT MOTIONS'}</option>{meta.animations.map(c => <option value={c.name} key={c.name}>{c.name.replaceAll('_', ' ')}</option>)}</select><input type="range" min={0} max={duration} step={.01} value={time % duration} aria-label={ko ? '동작 시간' : 'Animation time'} onChange={e => { const t = +e.target.value; clock.current.time = t; clock.current.playing = false; setPlaying(false); setTime(t); }}/></div></div>;
}
