import { ArrowUpRight, Check, Compass, Flame, Waves, Building2, House, Mountain, Zap } from 'lucide-react';
import { THEMES, fmt } from './data';
import { journeyThemes, type JourneyHUD } from './journey';
import type { RushHUD, RushResult } from './rush';

export function JourneyBriefing({ ko }: { ko: boolean }) {
    return <div className="journey-brief"><header><Compass size={15}/><span>{ko ? '3분, 네 개의 지평선.' : 'THREE MINUTES. FOUR HORIZONS.'}</span><b>NEW / 09</b></header><ol>{[[Waves,'해안','COAST'],[House,'마을','VILLAGE'],[Building2,'도시','CITY'],[Mountain,'미지의 세계','FRONTIER']].map(([Icon, a, b], i) => { const Symbol = Icon as typeof Waves; return <li key={i}><Symbol size={18}/><span>{ko ? String(a) : String(b)}</span><small>0{i+1}</small></li>; })}</ol><p>{ko ? '지역은 비행 거리에 따라 펼쳐집니다. 정밀 통과로 러시를 충전하고 더 먼 풍경에 도전하세요.' : 'Regions unfold with distance. Charge Rush through precision and reach a new horizon.'}</p></div>;
}
export function JourneyRibbon({ journey, ko }: { journey: JourneyHUD; ko: boolean }) {
    const current = THEMES.find(t => t.id === journey.themes[journey.index])!;
    return <><ol className="journey-ribbon" aria-label={ko ? '이번 출격의 지역' : 'Regions on this flight'}>{journey.themes.map((id, i) => { const theme = THEMES.find(t => t.id === id)!; return <li key={id} className={i < journey.index ? 'cleared' : i === journey.index ? 'current' : ''}><i>{i < journey.index ? <Check size={10}/> : i+1}</i><span>{ko ? theme.name : theme.en}</span>{i === journey.index && <b style={{ width: journey.progress*100+'%' }}/>}</li>; })}</ol>{journey.arrival && <div className="sector-arrival" role="status"><span>REGION {String(journey.index+1).padStart(2,'0')} / 04</span><h2>{ko ? current.name : current.en}</h2><p>{journey.index === 0 ? (ko ? '흐름을 찾고, 새로운 하늘로.' : 'FIND YOUR FLOW. CHASE THE HORIZON.') : (ko ? '새 풍경 · 다음 경로를 읽으세요.' : 'NEW HORIZON · READ YOUR NEXT LINE.')}</p></div>}</>;
}
export function RushControl({ rush, ko, disabled, onActivate }: { rush: RushHUD; ko: boolean; disabled: boolean; onActivate?: () => void }) {
    const active = rush.remaining > 0;
    return <button className={'rush-control '+(active?'active':rush.ready?'ready':'charging')} onClick={onActivate} disabled={disabled || !onActivate || !rush.ready} aria-label={ko ? '러시 발동 · Q' : 'Activate Rush · Q'}><span className="rush-key"><Zap size={18}/><kbd>Q</kbd></span><span className="rush-copy"><b>{active ? (ko?'러시 가동':'RUSH ACTIVE') : rush.ready ? (ko?'러시 준비 완료':'RUSH READY') : (ko?'정밀 비행으로 충전':'CHARGE WITH PRECISION')}</b><small>{active ? (ko?'가속 + 코인 자석 · 충돌 주의':'BOOST + COIN MAGNET · STAY SHARP') : rush.ready ? (ko?'5초 가속 + 코인 자석':'5s BOOST + COIN MAGNET') : (ko?'링 · 경로 중앙 통과':'RINGS · CENTRE-LINE PASSES')}</small><span className="rush-meter" role="progressbar" aria-label={active ? (ko?'러시 남은 시간':'Rush remaining') : (ko?'러시 충전':'Rush charge')} aria-valuemin={0} aria-valuemax={active?5:100} aria-valuenow={active?rush.remaining:rush.charge}><i style={{width:(active?rush.remaining/5*100:rush.charge)+'%'}}/></span></span><strong>{active?rush.remaining.toFixed(1):rush.charge}<small>{active?'SEC':'%'}</small></strong>{rush.ready && <ArrowUpRight size={15}/>}</button>;
}
export function RushDebrief({ result, ko }: { result: RushResult; ko: boolean }) {
    return <div className="rush-debrief"><Flame size={21}/><span><b>{ko?'러시 비행 기록':'YOUR RUSH FLIGHT'}</b><small>{ko?'정밀 비행이 만든 또 하나의 추진력.':'PRECISION BECOMES MOMENTUM.'}</small></span><strong>{result.uses}<small>{ko?'회 발동':'BURSTS'}</small></strong><strong>{fmt(result.distance)}<small>M</small></strong></div>;
}

export function JourneyDebrief({ seed, times, ko }: { seed: number; times: Record<string, number>; ko: boolean }) {
    const themes = journeyThemes(seed), visited = themes.filter(id => (times[id] ?? 0) > 0).length;
    return <section className="journey-debrief" aria-label={ko?'이번 비행의 여정':'Your flight journey'}><header><Compass size={18}/><span>{ko?'이번 비행이 남긴 발자취':'THE HORIZONS YOU REACHED'}</span><b>{visited} / 4</b></header><ol>{themes.map((id,i)=>{const theme=THEMES.find(t=>t.id===id)!, seconds=times[id]??0;return <li key={id} className={seconds>0?'visited':''}><span>0{i+1}</span><b>{ko?theme.name:theme.en}</b><small>{seconds>0?Math.floor(seconds)+(ko?'초 비행':'s FLIGHT'):(ko?'다음 비행의 목표':'YOUR NEXT HORIZON')}</small>{seconds>=20&&<Check size={15}/>}</li>;})}</ol></section>;
}
