'use client';
import type { CSSProperties } from 'react';
import { Check, Coins, Move, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { AIRCRAFT, SKINS, fmt } from './data';
import { useAirrun } from './state';

export function LiveryStudio({ ko, onView, onZoom }: { ko: boolean; onView: (view: 'front' | 'side' | 'rear' | 'top' | 'reset') => void; onZoom: (amount: number) => void }) {
    const state = useAirrun(), plane = AIRCRAFT.find(p => p.id === state.save.selected)!;
    const applied = state.save.skinSelected[plane.id] ?? 'default';
    const selected = state.skinPreview ?? applied, skin = SKINS.find(s => s.id === selected)!;
    const owned = state.save.owned.includes(plane.id), unlocked = selected === 'default' || state.save.skins[plane.id]?.includes(selected);
    const t = (a: string, b: string) => ko ? a : b;
    return <div className="paint-studio">
        <div className="paint-showroom">
            <header><span className="eyebrow">AIRFRAME / LIVE STUDIO</span><h2>{plane.name}</h2><span className="paint-current"><i style={{ background: skin.color }}/>{ko ? skin.name : skin.en} · {selected === applied ? t('적용 중', 'EQUIPPED') : t('미리보기', 'PREVIEW')}</span></header>
            <div className="paint-viewport" data-hangar-stage aria-label={t('실시간 기체 미리보기. 드래그로 회전, 스크롤로 확대.', 'Live aircraft preview. Drag to rotate, scroll to zoom.')}>
                <div className="paint-viewport-caption"><Move size={14}/>{t('드래그로 회전 · 스크롤로 확대', 'DRAG TO ORBIT · SCROLL TO ZOOM')}</div>
                {state.modelBusy && <span className="paint-model-status" role="status">{t('기체 준비 중…', 'PREPARING AIRCRAFT…')}</span>}
            </div>
            <div className="paint-camera" aria-label={t('기체 보기 방향', 'Aircraft viewing angle')}>{([['front', '정면', 'FRONT'], ['side', '측면', 'SIDE'], ['rear', '후면', 'REAR'], ['top', '위쪽', 'TOP']] as const).map(([view, a, b]) => <button className="secondary compact" key={view} onClick={() => onView(view)}>{t(a, b)}</button>)}<button className="icon-button" aria-label={t('확대', 'Zoom in')} onClick={() => onZoom(-.1)}><ZoomIn size={17}/></button><button className="icon-button" aria-label={t('축소', 'Zoom out')} onClick={() => onZoom(.1)}><ZoomOut size={17}/></button><button className="icon-button" aria-label={t('시점 초기화', 'Reset camera')} onClick={() => onView('reset')}><RotateCcw size={17}/></button></div>
        </div>
        <aside className="paint-workbench"><span className="eyebrow">MAKE IT YOURS</span><h2>{t('나만의 시그니처.', 'Your signature.')}</h2><label>{t('미리볼 기체', 'AIRCRAFT')}<select value={plane.id} onChange={e => { state.select(e.target.value); onView('reset'); }}>{AIRCRAFT.map(p => <option key={p.id} value={p.id}>{p.name}{state.save.owned.includes(p.id) ? '' : t(' · 미보유', ' · LOCKED')}</option>)}</select></label><p>{t('색상을 선택하면 왼쪽 실제 기체에 바로 반영됩니다. 적용 전에는 코인이 사용되지 않습니다.', 'Choose a finish to preview it on your aircraft. Coins are spent only when you apply it.')}</p>
            <div className="paint-finishes" aria-label={t('도장 선택', 'Livery selection')}>{SKINS.map(s => <button key={s.id} aria-pressed={selected === s.id} className={selected === s.id ? 'selected' : ''} onClick={() => useAirrun.setState({ skinPreview: s.id })}><i style={{ '--paint': s.color, '--accent': s.accent } as CSSProperties}/><span><b>{ko ? s.name : s.en}</b><small>{s.id === applied ? t('적용 중', 'EQUIPPED') : s.id === 'default' || state.save.skins[plane.id]?.includes(s.id) ? t('보유', 'OWNED') : s.id === 'courier' ? t('편대 완주 보상', 'FULL ESCORT REWARD') : fmt(s.price) + ' COINS'}</small></span>{selected === s.id && <Check size={17}/>}</button>)}</div>
            <div className="paint-checkout"><span>{t('선택한 도장', 'SELECTED FINISH')}<b>{ko ? skin.name : skin.en}</b></span><button className="primary" disabled={!owned || state.modelBusy || applied === selected || !unlocked && (selected === 'courier' || state.save.coins < skin.price)} onClick={() => state.applySkin(selected)}>{!owned ? t('기체 해금 필요', 'UNLOCK AIRCRAFT FIRST') : applied === selected ? <><Check size={17}/>{t('적용 중', 'EQUIPPED')}</> : unlocked ? t('도장 적용', 'APPLY FINISH') : selected === 'courier' ? t('이 기체로 편대 완주', 'COMPLETE AN ESCORT IN THIS AIRCRAFT') : <><Coins size={17}/>{fmt(skin.price)} · {t('구매 및 적용', 'BUY & APPLY')}</>}</button></div>
        </aside>
    </div>;
}
