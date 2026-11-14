'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from './model-image';
import { ModelInspector } from './model-inspector';
import type { ModelLibrary } from './assets';
import { useAirrun } from './state';
import { Search, ChevronLeft, ChevronRight, X, Play, Check, Plane, ArrowUpRight, Box } from 'lucide-react';
import type { AssetMeta, Save } from './types';
import { AIRCRAFT } from './data';

const CATEGORIES: Record<string, [string, string]> = { aircraft: ['기체', 'AIRCRAFT'], coastal: ['해안', 'COASTAL'], village: ['마을', 'VILLAGE'], city: ['도시', 'CITY'], snow_ice: ['설원·빙하', 'SNOW & ICE'], desert_canyon: ['사막·협곡', 'DESERT'], forest_mountain_lake: ['숲·산악·호수', 'ALPINE'], farm: ['농촌·초원', 'FARMLAND'], korean_landmarks: ['한국', 'KOREA'], ads_signage: ['공항·안내', 'AIRFIELD'], modules: ['구조·설비', 'STRUCTURES'] };
export function ModelArchive({ catalog, save, ko, onAircraft, library, onPreview, onInspect }: { library?: ModelLibrary; onPreview?: (id: string) => void; onInspect?: (active: boolean) => void; catalog?: Map<string, AssetMeta>; save: Save; ko: boolean; onAircraft: (id: string) => void }) {
    const [category, setCategory] = useState('all'), [search, setSearch] = useState(''), [moving, setMoving] = useState(false), [page, setPage] = useState(0), [selected, setSelected] = useState<AssetMeta | null>(null);
    const dialog = useRef<HTMLDivElement>(null), previews = useAirrun(s => s.previewImages);
    useEffect(() => {
        if (!selected) return;
        const trigger = document.activeElement as HTMLElement | null;
        dialog.current?.querySelector<HTMLElement>('button')?.focus();
        const close = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); setSelected(null); }
            if (event.key !== 'Tab') return;
            const buttons = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex="0"]');
            if (!buttons?.length) return;
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', close);
        return () => { window.removeEventListener('keydown', close); trigger?.focus(); };
    }, [selected]);
    const all = useMemo(() => [...(catalog?.values() ?? [])].filter(model => model.category !== 'traffic').sort((a, b) => a.title.localeCompare(b.title)), [catalog]);
    const discovered = new Set(save.modelDiscoveries ?? []);
    const filtered = all.filter(model => (category === 'all' || model.category === category) && (!moving || model.moving) && (model.title + ' ' + model.id).toLowerCase().includes(search.toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 12)), current = Math.min(page, pages - 1), visible = filtered.slice(current * 12, (current + 1) * 12);
    const visibleIds = visible.map(model => model.id).join(',');
    const inspecting = selected !== null;
    useEffect(() => { if (!inspecting) visibleIds.split(',').filter(Boolean).forEach(id => onPreview?.(id)); }, [visibleIds, inspecting, onPreview]);
    const choose = (value: string) => { setCategory(value); setPage(0); };
    return <div className="model-archive"><div className="archive-introduction"><div><span className="eyebrow">THE WORLD, PIECE BY PIECE</span><h2>{ko ? '스쳐 지나간 풍경을, 가까이.' : 'Every detail. A closer look.'}</h2><p>{ko ? 'Edition12 모델을 3D로 회전하고 작동부를 재생해 보세요. 비행에서 가까이 지나친 모델은 발견 기록에 남습니다.' : 'Orbit the Edition12 models and play their mechanisms. Approached flight models join your discovery record.'}</p></div><div className="archive-numbers"><strong>{all.length}<small>{ko ? '전체 모델' : 'MODELS'}</small></strong><strong>{all.filter(model => model.moving).length}<small>{ko ? '움직이는 모델' : 'ANIMATED'}</small></strong><strong>{discovered.size}<small>{ko ? '비행 중 발견' : 'DISCOVERED'}</small></strong></div></div>
        <div className="archive-toolbar"><label className="archive-search"><Search size={16}/><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder={ko ? '모델 이름 검색' : 'Search the collection'} aria-label={ko ? '모델 검색' : 'Search models'}/></label><label className="archive-motion-filter"><input type="checkbox" checked={moving} onChange={e => { setMoving(e.target.checked); setPage(0); }}/><Play size={13}/>{ko ? '움직이는 모델만' : 'Animated only'}</label><span>{filtered.length} {ko ? '개 모델' : 'MODELS'}</span></div>
        <div className="archive-categories"><button className={category === 'all' ? 'selected' : ''} onClick={() => choose('all')}>{ko ? '전체' : 'ALL'} <small>{all.length}</small></button>{Object.entries(CATEGORIES).map(([id, title]) => <button key={id} className={category === id ? 'selected' : ''} onClick={() => choose(id)}>{title[ko ? 0 : 1]} <small>{all.filter(model => model.category === id).length}</small></button>)}</div>
        <div className="archive-grid">{visible.map(model => <button className="archive-card" key={model.id} onClick={() => setSelected(model)}><div className="archive-photo">{(previews['model:' + model.id] ?? model.preview) ? <Image src={previews['model:' + model.id] ?? model.preview!} alt={model.title} width={640} height={360} unoptimized/> : <Box size={32}/>}<span className="archive-category-label">{CATEGORIES[model.category]?.[1]}</span>{model.moving && <span className="archive-motion-badge"><Play size={10}/>{ko ? '작동부' : 'ANIMATED'}</span>}{discovered.has(model.id) && <i className="archive-discovered"><Check size={12}/></i>}</div><div className="archive-card-title"><span>{model.title}</span><ArrowUpRight size={16}/></div><small>{model.animations.filter(clip => clip.autoplay).length} {ko ? '개 자동 동작' : 'AUTOMATIC MOTIONS'}</small></button>)}</div>
        <div className="archive-pagination"><button className="secondary compact" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label={ko ? '이전 페이지' : 'Previous page'}><ChevronLeft size={16}/></button><span>{current + 1} <small>/ {pages}</small></span><button className="secondary compact" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)} aria-label={ko ? '다음 페이지' : 'Next page'}><ChevronRight size={16}/></button><small>{ko ? '이미지: Edition12 실제 게임 모델 렌더' : 'Images: actual Edition12 game model renders'}</small></div>
        {!visible.length && <p className="archive-empty" role="status">{ko ? '일치하는 모델이 없습니다. 이름이나 분류를 바꿔보세요.' : 'No matching models. Try another name or category.'}</p>}
        {selected && <div ref={dialog} className="archive-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={() => setSelected(null)}><article onClick={e => e.stopPropagation()}><button className="icon-button archive-close" onClick={() => setSelected(null)} aria-label={ko ? '닫기' : 'Close'}><X size={22}/></button>{library && <ModelInspector meta={selected} library={library} ko={ko} onActive={onInspect}/>}<div><span className="eyebrow">{CATEGORIES[selected.category]?.[1]}</span><h2>{selected.title}</h2><p>{selected.moving ? (ko ? '자동 동작은 장면에서 재생되며, 기체의 수동 조종면은 비행 입력에 반응합니다.' : 'Automatic motions play in the scene. Manual aircraft controls respond to flight input.') : (ko ? '환경을 구성하는 고정 모델입니다.' : 'A static piece of the environment.')}</p><div className="archive-motion-list">{selected.animations.map(clip => <span key={clip.name}><Play size={10}/>{clip.name.replaceAll('_', ' ')} <b>{clip.duration.toFixed(1)}s</b><small>{clip.autoplay ? 'AUTO' : ko ? '수동' : 'MANUAL'}</small></span>)}</div>{AIRCRAFT.find(plane => plane.model === selected.id) && <button className="primary compact" onClick={() => onAircraft(AIRCRAFT.find(plane => plane.model === selected.id)!.id)}><Plane size={15}/>{ko ? '격납고에서 기체 보기' : 'INSPECT IN HANGAR'}</button>}</div></article></div>}
    </div>;
}
