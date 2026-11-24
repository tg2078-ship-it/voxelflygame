'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from './model-image';
import { Plane, ArrowUpRight, ArrowRight, Coins, Trophy, Compass, Palette, Map, Menu, Settings2, Play, RotateCcw, Download, Upload, Check, Lock, Wind, Shield, Zap, Target, Flag, Award, Navigation, Move, Keyboard, X, Maximize, LoaderCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { LoadingScreen, PilotRegistration, RewardCeremony, PauseSettings } from './interface';
import { DisplayQualityControls } from './display-quality-controls';
import { lightAt } from './weather';
import { FlightRoute } from './flight-route';
import { FlightDeck } from './flight-deck';
import { HangarDashboard, ProgressionOverview } from './hangar-dashboard';
import { FlightDebrief } from './flight-debrief';
import { LiveryStudio } from './livery-studio';
import { ModelArchive } from './model-archive';
import { PointerOwner } from './pointer-owner';
import { setTouchSpeed } from './touch-input';
import { useAirrun, input, releaseInput, parseSave } from './state';
import { AIRCRAFT, THEMES, THEME_DETAILS_EN, VERSION, WORLD_IMAGE_REVISION, fmt, distance, duration, WEATHER_NAMES, KOREA_VARIANTS, KOREA_VARIANTS_EN } from './data';
import { QUESTS, rerollCandidates, CAREER, CHAPTERS, ACHIEVEMENTS, QUEST_REWARDS, achievementValue, questProgress, metricValue } from './progression';
import type { AirrunRenderer } from './renderer';
import type { Panel, ThemeId, RunResult, Save, AssetMeta } from './types';
const NAV: {
    id: Panel;
    icon: typeof Plane;
    ko: string;
    en: string;
}[] = [{ id: 'hangar', icon: Plane, ko: '격납고', en: 'HANGAR' }, { id: 'challenges', icon: Target, ko: '도전 센터', en: 'CHALLENGES' }, { id: 'atlas', icon: Compass, ko: '테마 사전', en: 'WORLD ATLAS' }, { id: 'collection', icon: Map, ko: '모델 아카이브', en: 'MODEL ARCHIVE' }, { id: 'livery', icon: Palette, ko: '도장', en: 'LIVERIES' }, { id: 'records', icon: Trophy, ko: '개인 기록', en: 'FLIGHT LOG' }, { id: 'settings', icon: Settings2, ko: '설정', en: 'SETTINGS' }];
const effectLabels: Record<string, [
    string,
    string
]> = { shield: ['보호막', 'SHIELD'], multiplier: ['점수 ×2', 'SCORE ×2'], slow: ['슬로우', 'SLOW TIME'], turbo: ['터보', 'TURBO'], repair: ['수리', 'REPAIR'] };
function Logo({ small = false }: {
    small?: boolean;
}) { return <div className={'brand ' + (small ? 'small' : '')}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 29 16 10 20 17 24 10 35 29 20 24Z" fill="currentColor"/><path d="m20 6 3 19-3 9-3-9Z" fill="currentColor"/></svg><div><strong>AIRRUN<span>™</span></strong>{!small && <p>EXPEDITION / FLIGHT OPERATIONS</p>}</div></div>; }
function Progress({ value, target }: {
    value: number;
    target: number;
}) { return <div className="progress-track"><i style={{ width: Math.min(100, value / target * 100) + '%' }}/></div>; }
function WorldImage({ save, id, name }: {
    save: Save;
    id: string;
    name: string;
}) {
    const preview = useAirrun(s => s.previewImages[id]), ko = useAirrun(s => s.save.settings.language === 'ko');
    const discovery = save.discoveries[id] ?? Object.entries(save.discoveries).find(([k]) => k.split(':')[0] === id)?.[1];
    const actual = discovery?.image && discovery.imageRevision === WORLD_IMAGE_REVISION, image = actual ? discovery.image : preview;
    return <div className="world-photo">{image ? <Image width={480} height={270} unoptimized className="world-image" src={image} alt={name + (actual || !preview ? ' · 실제 비행 캡처' : ' · 게임 렌더 미리보기')}/> : <div className="world-image photo-pending"><LoaderCircle size={20} className="spin"/><span>{ko ? '게임 장면 준비 중' : 'PREPARING GAME SCENE'}</span></div>}<span className="photo-source">{image ? actual || !preview ? (ko ? '실제 비행 캡처' : 'IN-FLIGHT CAPTURE') : (ko ? '게임 렌더 미리보기' : 'GAME RENDER PREVIEW') : 'AIRRUN / WORLD ATLAS'}</span></div>;
}
export default function Game() {
    const state = useAirrun(), canvas = useRef<HTMLCanvasElement>(null), engine = useRef<AirrunRenderer | null>(null), [mobileMenu, setMobileMenu] = useState(false), [launching, setLaunching] = useState(false), [worldPreview, setWorldPreview] = useState(false), [koreaPage, setKoreaPage] = useState(0), [pauseSettings, setPauseSettings] = useState(false), [atlas, setAtlas] = useState<ThemeId>('coast'), [challengeTab, setChallengeTab] = useState('active'), [questFamily, setQuestFamily] = useState('all'), [backupError, setBackupError] = useState(''), [modelCatalog, setModelCatalog] = useState<Map<string, AssetMeta>>(), [modelLibrary, setModelLibrary] = useState<AirrunRenderer['library']>();
    const ko = state.save.settings.language === 'ko', t = (a: string, b: string) => ko ? a : b, p = AIRCRAFT.find(p => p.id === state.save.selected)!;
    useEffect(() => { if (state.phase === 'hangar') document.querySelector('.aircraft-selector > button.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: state.save.settings.reducedMotion ? 'instant' : 'smooth' }); }, [p.id, state.phase, state.save.settings.reducedMotion]);
    useEffect(() => {
        let cancelled = false;
        void useAirrun.getState().load();
        void import('./renderer').then(({ AirrunRenderer }) => {
            if (cancelled || !canvas.current)
                return;
            try {
                engine.current = new AirrunRenderer(canvas.current);
                setModelLibrary(engine.current.library);
            }
            catch (error) {
                useAirrun.setState({ renderError: error instanceof Error ? error.message : String(error) });
            }
        });
        return () => { cancelled = true; engine.current?.dispose(); engine.current = null; };
    }, []);
    useEffect(() => {
        if (!state.notice)
            return;
        const timeout = setTimeout(() => useAirrun.setState({ notice: '' }), 3500);
        return () => clearTimeout(timeout);
    }, [state.notice]);
    useEffect(() => {
        if (!state.celebration)
            return;
        void engine.current?.audio.unlock().then(() => { engine.current?.audio.update(useAirrun.getState().save.settings, null, false); engine.current?.audio.event(state.celebration!.kind === 'upgrade' ? 'upgrade' : 'reward'); });
    }, [state.celebration]);
    const coachLesson = state.hud.coach?.lesson;
    useEffect(() => {
        if (coachLesson==='complete' && useAirrun.getState().save.settings.flightCoach!=='done') useAirrun.getState().settings({flightCoach:'done'});
    },[coachLesson]);
    const inspectModel = useCallback((active: boolean) => { if (engine.current) engine.current.inspectorActive = active; }, []);
    const previewModel = useCallback((id: string) => { void engine.current?.studio?.requestModel(id); }, []);
    const unlock = () => { void engine.current?.audio.unlock(); };
    const start = async (retry = false) => {
        if (launching || !engine.current)
            return;
        setLaunching(true);
        try {
            await engine.current.begin(retry);
        }
        catch (error) {
            useAirrun.setState({ notice: error instanceof Error ? error.message : t('출격을 준비하지 못했습니다.', 'Could not prepare the flight.') });
        }
        finally {
            setLaunching(false);
        }
    };
    const panel = (p: Panel) => {
        if (p === 'collection') setModelCatalog(engine.current?.library.byId);
        if (state.phase === 'airport')
            state.openHangar();
        state.setPanel(p);
        setWorldPreview(false);
        setMobileMenu(false);
        unlock();
    };
    const exportBackup = () => { const blob = new Blob([JSON.stringify(state.save, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'airrun-pilot-backup.json'; a.click(); URL.revokeObjectURL(url); };
    const importBackup = async (file: File | undefined) => {
        setBackupError('');
        if (!file)
            return;
        if (file.size > 8 * 1024 * 1024) {
            setBackupError(t('백업 크기가 너무 큽니다.', 'The backup is too large.'));
            return;
        }
        try {
            const save = parseSave(JSON.parse(await file.text()));
            if (!save)
                throw new Error('invalid');
            useAirrun.setState({ backupPreview: save });
        }
        catch {
            setBackupError(t('유효한 AIRRUN 백업이 아닙니다. 현재 기록은 유지됩니다.', 'This is not a valid AIRRUN backup. Your current progress is preserved.'));
        }
    };
    const isFlight = ['flying', 'paused', 'crashing', 'takeoff', 'preflight'].includes(state.phase), lobby = ['hangar', 'opening'].includes(state.phase), hud = state.hud;
    return <main className={'airrun airrun-six airrun-seven airrun-eight airrun-nine airrun-clear airrun-eleven phase-' + state.phase + ' panel-' + state.panel + (state.save.settings.reducedMotion ? ' reduced-motion' : '')} lang={ko ? 'ko' : 'en'} onPointerDownCapture={e => {
            const button = (e.target as Element).closest('button');
            if (!button || button.disabled)
                return;
            const rect = button.getBoundingClientRect();
            button.style.setProperty('--press-x', (e.clientX - rect.left) + 'px');
            button.style.setProperty('--press-y', (e.clientY - rect.top) + 'px');
            button.dataset.pressed = 'true';
            setTimeout(() => delete button.dataset.pressed, 450);
            void engine.current?.audio.unlock().then(() => { engine.current?.audio.update(useAirrun.getState().save.settings, engine.current?.sim ?? null, state.phase === 'paused'); engine.current?.audio.event('ui'); });
        }}>
  <canvas ref={canvas} className="world-canvas" aria-label={t('3D 비행 게임 화면', '3D flight game view')}/><div className="world-shade"/>
  {state.phase === 'loading' && !state.renderError && <LoadingScreen progress={state.progress} label={state.loadingLabel} ko={ko}/>}
  {state.phase === 'preflight' && !state.renderError && <LoadingScreen progress={state.progress} label={state.loadingLabel} ko={ko} preflight onCancel={() => { if (engine.current?.sim && engine.current.sim.time > 0)
        state.settle(engine.current.sim.result(true, true));
    else
        state.airport(); }}/>}
  {state.renderError && <div className="error-screen"><Logo /><AlertTriangle size={40}/><h1>{t('3D 화면을 시작하지 못했습니다.', 'The 3D view could not start.')}</h1><p>{t('WebGL 2를 지원하는 브라우저에서 그래픽 가속을 켠 뒤 다시 불러와 주세요.', 'Use a WebGL 2 browser with graphics acceleration and reload.')}</p><details><summary>{t('오류 정보', 'Error details')}</summary>{state.renderError}</details><button className="primary" onClick={() => location.reload()}><RotateCcw size={18}/>{t('다시 불러오기', 'RELOAD')}</button></div>}
  {state.phase === 'registration' && !state.renderError && <PilotRegistration ko={ko} reduced={state.save.settings.reducedMotion} initialName={state.save.nickname} onApprove={name => state.profile(name)} onSound={kind => { unlock(); engine.current?.audio.event(kind); }}/>}
  {['airport', 'hangar', 'opening'].includes(state.phase) && <>
   <header className="airport-header"><Logo /><div className="header-stats"><button className="pilot-chip" onClick={() => panel('settings')}><span className="avatar">{state.save.nickname.slice(0, 1)}</span><div><small>PILOT</small><b>{state.save.nickname}</b></div></button><div className="currency"><Coins size={19}/><b>{fmt(state.save.coins)}</b></div><button className="header-record" onClick={() => panel('records')}><Trophy size={17}/><span>{distance(state.save.bests.all?.distance ?? 0)}</span></button></div></header>
   {lobby && <>
    <button className="mobile-menu" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-controls="airport-navigation" aria-label={mobileMenu ? t('메뉴 닫기', 'Close menu') : t('메뉴 열기', 'Open menu')}>{mobileMenu ? <X size={19}/> : <Menu size={19}/>}</button>
    <nav id="airport-navigation" className={'airport-nav ' + (mobileMenu ? 'expanded' : '')} aria-label={t('공항 메뉴', 'Airport navigation')}>{NAV.map(n => <button className={state.panel === n.id ? 'active' : ''} aria-label={ko ? n.ko : n.en} aria-current={state.panel === n.id ? 'page' : undefined} key={n.id} onClick={() => panel(n.id)}><n.icon size={20}/><span>{ko ? n.ko : n.en}</span>{state.panel === n.id && <i />}</button>)}<button onClick={() => panel('controls')}><Keyboard size={20}/><span>{t('조작법', 'CONTROLS')}</span></button><div className="nav-footer"><span className="live-dot"/> FLIGHT OPS / V{VERSION}</div></nav>
    {state.panel === 'hangar' && <HangarDashboard state={state} ko={ko} launching={launching} onLaunch={() => void start()} onPanel={panel} onView={view => engine.current?.setView(view)} onZoom={amount => engine.current?.zoom(amount)}/>}
    {state.panel !== 'hangar' && <section className={'airport-panel ' + state.panel}><div className="panel-heading"><div><span className="eyebrow">AIRRUN / {NAV.find(n => n.id === state.panel)?.en ?? 'FLIGHT MANUAL'}</span><h1>{ko ? (NAV.find(n => n.id === state.panel)?.ko ?? '조작법') : (NAV.find(n => n.id === state.panel)?.en ?? 'FLIGHT MANUAL')}</h1></div><button className="icon-button" aria-label={t('격납고로 돌아가기', 'Back to hangar')} onClick={() => panel('hangar')}><X /></button></div>
     {state.panel === 'challenges' && <><ProgressionOverview state={state} ko={ko} onSelect={setChallengeTab}/><div className="panel-tabs">{[['active', '활성 퀘스트', 'CONTRACTS'], ['career', '진로 미션', 'CAREER'], ['achievements', '업적', 'ACHIEVEMENTS'], ['catalog', '전체 퀘스트', 'QUEST CATALOG']].map(([id, a, b]) => <button key={id} className={challengeTab === id ? 'active' : ''} onClick={() => setChallengeTab(id)}>{t(a, b)}</button>)}</div>
      {challengeTab === 'active' && <><div className="section-note"><p>{t('비행 방식을 바꾸는 여섯 가지 목표. 완료 후 보상을 수령하세요.', 'Six goals for a different way to fly. Claim rewards after completion.')}</p><span><RotateCcw size={15}/>{state.save.tickets}/3 {t('미션 변경권', 'MISSION CHANGES')}</span></div><p className="ticket-explainer">{t('미션 변경권은 아직 완료하지 않은 목표를 같은 계열·등급의 다른 목표로 바꿉니다. 한 판 500m 또는 30초 비행마다 1장 획득하며 최대 3장까지 보관합니다. 변경한 목표의 진척은 초기화됩니다.', 'A mission change replaces an unfinished goal with another in its family and tier, resetting its progress. Fly 500 m or 30 seconds in a valid run to earn one. Keep up to three.')}</p><div className="quest-grid">{state.save.quests.map(q => { const spec = QUESTS.find(s => s.id === q.id)!, ready = q.progress >= spec.target; return <article className={'quest-card ' + (ready ? 'complete' : '')} key={q.uid}><div className="quest-top"><span>{spec.id} / {'ⅠⅡⅢⅣ'[spec.tier - 1]}</span><Target size={18}/></div><h3>{ko ? spec.label : spec.en}</h3><Progress value={q.progress} target={spec.target}/><div className="quest-progress"><span>{fmt(q.progress)} / {fmt(spec.target)}</span><b><Coins size={13}/>{QUEST_REWARDS[spec.tier - 1]}</b></div><div className="quest-actions"><button className={ready ? 'primary compact' : 'secondary compact'} onClick={() => ready ? state.claimQuest(q.uid) : useAirrun.setState({ tracked: q.uid })}>{ready ? t('보상 수령', 'CLAIM') : state.tracked === q.uid ? t('추적 중', 'TRACKING') : t('HUD에 추적', 'TRACK')}</button>{!ready && <button className="icon-button" disabled={!state.save.tickets || !rerollCandidates(state.save, q).length} title={t('미션 변경권 1장 사용 · 현재 진척 초기화', 'Use one mission change · resets this goal’s progress')} aria-label={t('미션 변경권으로 목표 변경', 'Change this mission')} onClick={() => state.reroll(q.uid)}><RotateCcw size={16}/></button>}</div></article>; })}</div></>}
      {challengeTab === 'career' && <div className="career-map">{CHAPTERS.map(([name, en], chapter) => <article className={'career-chapter ' + (Math.floor(state.save.career / 5) === chapter ? 'current' : '')} key={name}><div className="chapter-title"><span>0{chapter + 1}</span><div><small>{en}</small><h2>{ko ? name : en}</h2></div>{state.save.career >= chapter * 5 + 5 ? <CheckCircle2 /> : <Flag />}</div><div className="chapter-missions">{CAREER.filter(m => m.chapter === chapter).map((m) => { const idx = CAREER.indexOf(m), current = idx === state.save.career, complete = idx < state.save.career; return <div className={'career-mission ' + (current ? 'current' : '')} key={m.id}><span className="mission-marker">{complete ? <Check size={14}/> : current ? <Navigation size={14}/> : <Lock size={12}/>}</span><div><b>{ko ? m.label : m.en}</b>{current && <><Progress value={state.save.careerProgress} target={m.target}/><span>{fmt(state.save.careerProgress)} / {fmt(m.target)}</span></>}</div><b className="reward"><Coins size={13}/>{m.reward}</b>{current && <button className="secondary compact" onClick={() => state.save.careerProgress >= m.target ? state.claimCareer() : useAirrun.setState({ tracked: 'career' })}>{state.save.careerProgress >= m.target ? t('수령', 'CLAIM') : t('추적', 'TRACK')}</button>}</div>; })}</div></article>)}</div>}
      {challengeTab === 'achievements' && <><div className="section-note"><p>{t('긴 비행의 기록을 남기는 40개의 배지.', '40 badges that record your journey.')}</p><span>{state.save.achievements.length} / 40</span></div><div className="achievement-grid">{ACHIEVEMENTS.map(a => { const value = achievementValue(a.key, state.save), claimed = state.save.achievements.includes(a.id), ready = value >= a.target; return <article className={'achievement-card ' + (claimed ? 'claimed' : '')} key={a.id}><div className={'badge tier-' + a.tier}><Award size={26}/><span>{a.tier}</span></div><h3>{ko ? a.label : a.en} {a.tier}</h3><span>{fmt(Math.min(value, a.target))} / {fmt(a.target)}</span><Progress value={value} target={a.target}/><button className={ready && !claimed ? 'primary compact' : 'secondary compact'} disabled={!ready || claimed} onClick={() => state.claimAchievement(a.id)}>{claimed ? <Check size={15}/> : <Coins size={13}/>} {claimed ? t('수령 완료', 'CLAIMED') : fmt(a.reward)}</button></article>; })}</div></>}
      {challengeTab === 'catalog' && <><div className="filter-row">{['all', 'F', 'T', 'C', 'I', 'W', 'A', 'P', 'H'].map(f => <button key={f} className={f === questFamily ? 'active' : ''} onClick={() => setQuestFamily(f)}>{f === 'all' ? t('전체 64', 'ALL 64') : f}</button>)}</div><div className="quest-catalog">{QUESTS.filter(q => questFamily === 'all' || q.family === questFamily).map(q => <div key={q.id}><span>{q.id}</span><b>{ko ? q.label : q.en}</b><span>{'ⅠⅡⅢⅣ'[q.tier - 1]}</span><span><Coins size={13}/>{QUEST_REWARDS[q.tier - 1]}</span></div>)}</div></>}
     </>}
     {state.panel === 'atlas' && <div className="atlas-layout"><div className="atlas-grid">{THEMES.map(theme => <button key={theme.id} data-theme-id={theme.id} className={'atlas-card ' + (atlas === theme.id ? 'selected' : '')} onClick={() => { setAtlas(theme.id); setKoreaPage(0); }}><WorldImage save={state.save} id={theme.id} name={theme.name}/><span>{theme.en}</span><b>{ko ? theme.name : theme.en}</b><small>{Object.keys(state.save.discoveries).some(k => k.split(':')[0] === theme.id) ? <><Check size={12}/>{t('발견 완료', 'DISCOVERED')}</> : t('아직 비행하지 않은 풍경', 'AWAITING DISCOVERY')}</small></button>)}</div><aside className="atlas-detail" data-theme-id={atlas} data-theme-variant={atlas === 'korea' ? koreaPage : undefined}><button className="atlas-enlarge" onClick={() => setWorldPreview(true)} aria-label={t('게임 장면 크게 보기', 'Enlarge game scene')}><WorldImage save={state.save} id={atlas === 'korea' ? 'korea:' + koreaPage : atlas} name={THEMES.find(t => t.id === atlas)!.name}/><Maximize size={17}/></button><span className="eyebrow">WORLD / {String(THEMES.findIndex(t => t.id === atlas) + 1).padStart(2, '0')}</span><h2>{ko ? THEMES.find(t => t.id === atlas)!.name : THEMES.find(t => t.id === atlas)!.en}</h2><p>{ko ? THEMES.find(t => t.id === atlas)!.description : THEMES.find(t => t.id === atlas)!.descriptionEn}</p><dl><dt>{t('대표 명소', 'LANDMARKS')}</dt><dd>{ko ? THEMES.find(t => t.id === atlas)!.landmarks : THEME_DETAILS_EN[atlas][0]}</dd><dt>{t('장애물', 'OBSTACLES')}</dt><dd>{ko ? THEMES.find(t => t.id === atlas)!.obstacles : THEME_DETAILS_EN[atlas][1]}</dd><dt>{t('발견 기록', 'DISCOVERY')}</dt><dd>{Object.entries(state.save.discoveries).filter(([k]) => k.split(':')[0] === atlas).reduce((a, [, v]) => a + v.flights, 0)} {t('비행', 'FLIGHTS')}</dd></dl>{atlas === 'korea' && <div className="korea-pages">{KOREA_VARIANTS.map((name, i) => <button key={name} data-theme-variant={i} className={koreaPage === i ? 'selected' : ''} onClick={() => setKoreaPage(i)}><WorldImage save={state.save} id={'korea:' + i} name={name}/><span>{ko ? name : KOREA_VARIANTS_EN[i]}</span></button>)}</div>}<div className="landmark-log">{Object.entries(state.save.landmarks).map(([id, visit]) => <span key={id}><Flag size={13}/>{id.split(':')[1].replaceAll('_', ' ')} · {new Date(visit.date).toLocaleDateString(ko ? 'ko-KR' : 'en-US')}</span>)}</div><p className="atlas-capture-note">{t('비행 중 발견한 풍경은 실제 게임 캡처로 기록됩니다. 미발견 풍경은 같은 게임 모델로 촬영한 렌더 미리보기를 제공합니다.', 'Discovered landscapes are recorded in flight. Unexplored worlds show previews rendered with the same game models.')}</p><button className="secondary" onClick={() => setWorldPreview(true)}><Maximize size={16}/>{t('게임 장면 크게 보기', 'ENLARGE GAME SCENE')}</button></aside></div>}
     {state.panel === 'collection' && <ModelArchive library={modelLibrary} onInspect={inspectModel} onPreview={previewModel} catalog={modelCatalog} save={state.save} ko={ko} onAircraft={id => { state.select(id); panel('hangar'); }}/> }
     {state.panel === 'livery' && <LiveryStudio ko={ko} onView={view => engine.current?.setView(view)} onZoom={amount => engine.current?.zoom(amount)}/>}
     {state.panel === 'records' && <><div className="record-bests"><article><Trophy /><span>{t('일반 비행 최고 거리', 'BEST NORMAL FLIGHT')}</span><b>{distance(state.save.bests.all?.distance ?? 0)}</b><small>{fmt(state.save.bests.all?.score ?? 0)} {t('점', 'PTS')}</small></article><article><Zap /><span>{t('E 사용 최고 거리', 'BEST HYPER FLIGHT')}</span><b>{distance(state.save.bests.allE?.distance ?? 0)}</b><small>{fmt(state.save.bests.allE?.score ?? 0)} {t('점', 'PTS')}</small></article><article><Plane /><span>{t('누적 비행', 'TOTAL FLIGHT')}</span><b>{distance(state.save.totals.distance ?? 0)}</b><small>{state.save.totals.flights ?? 0} {t('출격', 'FLIGHTS')}</small></article></div><div className="aircraft-records"><h2>{t('기체별 최고 기록', 'AIRCRAFT RECORDS')}</h2><div className="aircraft-record-row heading"><span>{t('기체', 'AIRCRAFT')}</span><span>{t('일반 거리 · 점수', 'NORMAL DISTANCE · SCORE')}</span><span>{t('E 거리 · 점수', 'HYPER DISTANCE · SCORE')}</span></div>{AIRCRAFT.map(plane => { const normal = state.save.bests[plane.id + ':normal'], hyper = state.save.bests[plane.id + ':e']; return <div key={plane.id} className="aircraft-record-row"><b>{plane.name}</b><span>{distance(normal?.distance ?? 0)}<small>{fmt(normal?.score ?? 0)} PTS · {normal?.combo ?? 0} COMBO</small></span><span>{distance(hyper?.distance ?? 0)}<small>{fmt(hyper?.score ?? 0)} PTS · {hyper?.combo ?? 0} COMBO</small></span></div>; })}</div><div className="flight-log"><div className="log-row heading"><span>{t('기체 · 날짜', 'AIRCRAFT · DATE')}</span><span>{t('거리', 'DISTANCE')}</span><span>{t('점수', 'SCORE')}</span><span>{t('최고 콤보', 'COMBO')}</span><span>{t('보상', 'REWARD')}</span></div>{state.save.runs.length ? state.save.runs.map(r => <div className="log-row" key={r.id}><div><b>{AIRCRAFT.find(p => p.id === r.planeId)?.name}</b><small>{new Date(r.date).toLocaleDateString(ko ? 'ko-KR' : 'en-US')} {r.eUsed ? '· E' : ''} {r.interrupted ? '· ' + t('중단', 'INTERRUPTED') : ''}</small></div><b>{distance(r.distance)}</b><span>{fmt(r.score)}</span><span>{r.maxCombo}</span><span className="reward"><Coins size={13}/>{r.reward}</span></div>) : <p className="empty-state">{t('첫 출격을 마치면 기록이 여기에 남습니다.', 'Your first flight will be recorded here.')}</p>}</div></>}
     {state.panel === 'settings' && <div className="settings-layout"><div className="settings-group"><h2>{t('비행과 화면', 'FLIGHT & DISPLAY')}</h2><label>{t('언어', 'LANGUAGE')}<div className="segmented"><button className={ko ? 'active' : ''} onClick={() => state.settings({ language: 'ko' })}>한국어</button><button className={!ko ? 'active' : ''} onClick={() => state.settings({ language: 'en' })}>ENGLISH</button></div></label><label>{t('속도 조작', 'SPEED CONTROL')}<div className="segmented"><button className={state.save.settings.control === 'hold' ? 'active' : ''} onClick={() => state.settings({ control: 'hold' })}>{t('누르는 동안', 'HOLD')}</button><button className={state.save.settings.control === 'gear' ? 'active' : ''} onClick={() => state.settings({ control: 'gear' })}>{t('5단 기어', '5 GEARS')}</button></div></label><label>{t('비행 난이도', 'FLIGHT DIFFICULTY')}<div className="segmented">{([['relaxed', '여유', 'RELAXED'], ['standard', '표준', 'STANDARD'], ['expert', '숙련', 'EXPERT']] as const).map(([id, a, b]) => <button key={id} disabled={state.flightMode === 'daily'} aria-pressed={(state.flightMode === 'daily' ? 'standard' : state.save.settings.difficulty) === id} className={(state.flightMode === 'daily' ? 'standard' : state.save.settings.difficulty) === id ? 'active' : ''} onClick={() => state.settings({ difficulty: id })}>{t(a, b)}</button>)}</div></label><p className="ops-settings-hint">{state.flightMode === 'daily' ? t('오늘의 항로는 표준 난이도로 고정됩니다. 3분 출격과 무한 항로에서는 난이도를 선택할 수 있습니다.', 'The daily route uses standard difficulty. Choose your difficulty in sortie or endless flight.') : t('여유: 넓은 공간 · 표준: 균형 잡힌 도전 · 숙련: 빠르고 정밀한 조종. 선택한 난이도는 다음 출격부터 적용됩니다.', 'Relaxed: room to explore. Standard: a balanced challenge. Expert: fast, precise flight. Your selection applies to your next departure.')}</p><label>{t('그래픽 품질', 'GRAPHICS QUALITY')}<div className="segmented">{(['balanced', 'high', 'ultra'] as const).map(q => <button key={q} className={state.save.settings.quality === q ? 'active' : ''} onClick={() => state.settings({ quality: q })}>{q.toUpperCase()}</button>)}</div></label><DisplayQualityControls settings={state.save.settings} ko={ko} onChange={patch => state.settings(patch)}/><label>{t('프레임 목표', 'FRAME TARGET')}<div className="segmented">{([30, 60] as const).map(n => <button key={n} className={state.save.settings.targetFPS === n ? 'active' : ''} onClick={() => state.settings({ targetFPS: n })}>{n} FPS</button>)}</div></label><label className="toggle">{t('자동 렌더 해상도', 'ADAPTIVE RESOLUTION')}<input type="checkbox" checked={state.save.settings.adaptiveResolution} onChange={e => state.settings({ adaptiveResolution: e.target.checked })}/></label><label>{t('조종 감도', 'CONTROL SENSITIVITY')}<input type="range" min=".5" max="1.5" step=".05" value={state.save.settings.sensitivity} onChange={e => state.settings({ sensitivity: +e.target.value })}/><span>{state.save.settings.sensitivity.toFixed(2)}×</span></label></div><div className="settings-group"><h2>{t('소리와 접근성', 'SOUND & ACCESSIBILITY')}</h2>{([['volume', '전체 음량', 'MASTER'], ['music', '음악', 'MUSIC'], ['sfx', '효과음', 'SOUND EFFECTS']] as const).map(([key, a, b]) => <label key={key}>{t(a, b)}<input type="range" min="0" max="1" step=".05" value={state.save.settings[key]} onChange={e => { unlock(); state.settings({ [key]: +e.target.value }); }}/><span>{Math.round(state.save.settings[key] * 100)}%</span></label>)}{([['reducedMotion', '흔들림·플래시 감소', 'REDUCE MOTION & FLASH'], ['skipTakeoff', '이륙 연출 건너뛰기', 'SKIP TAKEOFF'], ['leftHanded', '모바일 좌우 조작 교환', 'SWAP TOUCH SIDES']] as const).map(([key, a, b]) => <label className="toggle" key={key}>{t(a, b)}<input type="checkbox" checked={state.save.settings[key]} onChange={e => state.settings({ [key]: e.target.checked })}/></label>)}<h2>{t('조종사 기록', 'PILOT DATA')}</h2><div className="pilot-badges">{CHAPTERS.map(([name, en], i) => <span className={state.save.career >= (i + 1) * 5 ? 'earned' : ''} key={name}><Award size={20}/>{ko ? name : en}{state.save.career >= (i + 1) * 5 ? <Check size={14}/> : <Lock size={14}/>}</span>)}</div><label>{t('조종사 이름', 'CALLSIGN')}<input className="nickname-input" defaultValue={state.save.nickname} maxLength={16} onBlur={e => {
                            if (e.target.value.trim().length >= 2) {
                                const save = { ...state.save, nickname: e.target.value.trim().slice(0, 16) };
                                useAirrun.setState({ save });
                                state.persist();
                            }
                        }}/></label><button className="secondary pilot-reissue" onClick={() => useAirrun.setState({ phase: 'registration' })}><Award size={17}/>{t('조종사 카드 재발급', 'REISSUE PILOT CARD')}</button><button className="secondary fullscreen-button" onClick={() => { if (document.fullscreenElement)
                        void document.exitFullscreen().catch(() => { });
                    else
                        void document.documentElement.requestFullscreen().catch(() => useAirrun.setState({ notice: t('이 브라우저에서 전체 화면을 사용할 수 없습니다.', 'Fullscreen is unavailable in this browser.') })); }}><Maximize size={17}/>{t('전체 화면 전환', 'TOGGLE FULLSCREEN')}</button><div className="backup-actions"><button className="secondary" onClick={exportBackup}><Download size={16}/>{t('백업 내보내기', 'EXPORT BACKUP')}</button><label className="secondary file-button"><Upload size={16}/>{t('백업 가져오기', 'IMPORT BACKUP')}<input type="file" accept=".json,application/json" onChange={e => void importBackup(e.target.files?.[0])}/></label></div>{state.recoveryData != null && <button className="secondary" onClick={() => { const blob = new Blob([JSON.stringify(state.recoveryData, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'airrun-original-recovery.json'; a.click(); URL.revokeObjectURL(url); }}><Download size={16}/>{t('이전 저장 원본 내보내기', 'EXPORT ORIGINAL SAVE')}</button>}{backupError && <p className="error-text">{backupError}</p>}{state.backupPreview && <div className="backup-preview"><h3>{t('복원할 기록 확인', 'REVIEW BACKUP')}</h3><p>{state.backupPreview.nickname} · {fmt(state.backupPreview.coins)} {t('코인', 'COINS')} · {state.backupPreview.owned.length} {t('기체', 'AIRCRAFT')}</p><p>{t('가져오기 전에 현재 기록의 백업을 다운로드합니다.', 'Your current backup downloads before import.')}</p><button className="primary compact" onClick={() => state.importBackup()}>{t('이 기록으로 복원', 'RESTORE THIS BACKUP')}</button><button className="text-button" onClick={() => useAirrun.setState({ backupPreview: null })}>{t('취소', 'CANCEL')}</button></div>}</div></div>}
     {state.panel === 'controls' && <div className="controls-layout"><div><h2>{t('당신이 고르는 비행 경로.', 'Choose your own line.')}</h2><p>{t('기체는 자동으로 전진합니다. 넓은 안전 경로와 좁은 고득점 경로를 읽고, 감속으로 회피 시간을 확보하세요.', 'Your aircraft moves forward automatically. Read the safe line and the risk line. Brake for more time to turn.')}</p><div className="keyboard-controls">{[['W / ↑', '상승', 'CLIMB'], ['S / ↓', '하강', 'DESCEND'], ['A / ←', '왼쪽', 'LEFT'], ['D / →', '오른쪽', 'RIGHT'], ['Shift', state.save.settings.control === 'gear' ? '기어 올리기' : '가속 · 무제한', state.save.settings.control === 'gear' ? 'GEAR UP' : 'BOOST · UNLIMITED'], ['Space', state.save.settings.control === 'gear' ? '기어 내리기' : '감속', state.save.settings.control === 'gear' ? 'GEAR DOWN' : 'BRAKE'], ['R', '편대 송신 · 비행운 안에서 4초 또는 8초', 'FORMATION · TRANSMIT AFTER 4 OR 8s IN THE TRAILS'], ['Q', '러시 · 충전 후 5초 가속 + 코인 자석', 'RUSH · EARN 5s BOOST + COIN MAGNET'], ['F', '플로우 확정 · 배율 다시 시작', 'BANK FLOW · RESET MULTIPLIER'], ['E', '하이퍼 트릭 · 15초 · 한 판 1회', 'HYPER TRICK · 15s · ONCE PER RUN'], ['Esc', '일시정지', 'PAUSE']].map(([key, a, b]) => <div key={key}><kbd>{key}</kbd><span>{t(a, b)}</span></div>)}</div></div><div className="control-tips"><article><Move /><h3>{t('모바일은 가로로', 'LANDSCAPE ON MOBILE')}</h3><p>{t('가상 조이스틱으로 상승·하강·좌우를 조종하고 가감속을 동시에 누를 수 있습니다.', 'Steer with the virtual joystick while holding boost or brake.')}</p></article><article><Zap /><h3>{t('기체 엠블럼 탭하기', 'TAP THE AIRCRAFT EMBLEM')}</h3><p>{t('엠블럼을 한 번 탭하여 E를 발동합니다. 15초 동안 직접 경로를 따라가는 트릭과 무적 비행이 이어집니다.', 'Tap once to activate Hyper Trick and 15 seconds of immunity.')}</p></article><article><Target /><h3>{t('위험을 연결하면 콤보', 'LINK YOUR RISK MOVES')}</h3><p>{t('근접·좁은 통과를 7초 안에 연결하세요. 링과 저공 비행은 별도의 점수를 줍니다.', 'Link near misses and narrow passes within 7 seconds. Rings and low flight add bonus points.')}</p></article></div></div>}
    </section>}
   </>}
  </>}
  {state.phase === 'takeoff' && <div className="takeoff-overlay"><span className="eyebrow">CLEARED FOR TAKEOFF</span><h2>{t('새로운 기록을 향해.', 'Your next record awaits.')}</h2><button className="secondary" onClick={() => state.skipTakeoff()}>{t('이륙 건너뛰기', 'SKIP TAKEOFF')}<ArrowRight size={16}/></button></div>}
  {['flying', 'paused', 'crashing'].includes(state.phase) && <>
   <FlightDeck gearControl={state.save.settings.control==='gear'} onCloseCoach={()=>{
       if (engine.current?.sim) engine.current.sim.coach=undefined;
       state.settings({flightCoach:coachLesson==='complete'?'done':'off'});
       useAirrun.setState({hud:{...useAirrun.getState().hud,coach:undefined}});
   }} onTransmit={() => { if (state.phase === 'flying') input.transmit = true; }} hud={hud} ko={ko} hyper={<HyperButton state={state} ko={ko}/>} onRush={() => { if (state.phase === 'flying') input.rush = true; }} onBank={() => state.bankFlow()} onPause={() => state.pause()}/>
   <div className="hud-effects">{hud.effects.map(e => <div key={e.kind} className={'effect ' + e.kind}><Shield size={14}/><span>{effectLabels[e.kind]?.[ko ? 0 : 1]} <b>{e.remaining.toFixed(1)}s</b></span></div>)}</div>
   <div className="flight-bottom"><div className="world-label"><span className="live-dot"/><div><b>{ko ? THEMES.find(t => t.id === hud.theme)!.name : THEMES.find(t => t.id === hud.theme)!.en}</b><small>{hud.theme === 'korea' ? (ko ? KOREA_VARIANTS[hud.variant] : KOREA_VARIANTS_EN[hud.variant]) + ' · ' : ''}{hud.weather.snow && hud.weather.rain > .1 ? t('눈', 'SNOW') : WEATHER_NAMES[hud.weather.kind][ko ? 0 : 1]} · {lightAt(hud.time).phase === 'dawn' ? t('일출', 'DAWN') : lightAt(hud.time).phase === 'sunset' ? t('노을', 'SUNSET') : hud.weather.night > .5 ? t('밤', 'NIGHT') : t('낮', 'DAY')} · {duration(hud.time)}</small></div></div><TrackedQuest state={state} ko={ko}/><FlightRoute hud={hud} ko={ko}/></div>
   {hud.time < hud.messageUntil && <div className="flight-message" key={hud.messageUntil}>{ko ? hud.message : hud.messageEn}</div>}
   {hud.eRemaining > 0 && <div className="hyper-caption"><span>{hud.eRemaining > 11.7 ? (ko ? '점화 · 상승 진입' : 'IGNITION · CLIMB') : hud.eRemaining > 4 ? (ko ? '항로 추종 · 곡예 비행' : 'DISPLAY · ON COURSE') : (ko ? '수평 복귀 · 조종 인계' : 'RECOVERY · HANDOVER')}</span><b>{hud.eRemaining.toFixed(1)} <small>SECONDS</small></b><Progress value={hud.eRemaining} target={15}/></div>}
   {hud.ePreparing && <div className="hyper-charge" role="status"><div className="hyper-charge-orbit"/><span>HYPER ENGAGE</span><b>{t('비행 공간 분석 중', 'MAPPING CLEAR AIRSPACE')}</b><small>{t('경로 준비 후 15초 비행 시작', '15 SECONDS BEGIN WHEN THE ROUTE IS READY')}</small></div>}
   {state.phase === 'flying' && hud.eRemaining <= 0 && !hud.ePreparing && <TouchControls key={state.save.settings.control} leftHanded={state.save.settings.leftHanded} control={state.save.settings.control} ko={ko}/>}
   {state.phase === 'crashing' && <div className="crash-vignette"/>}
  </>}
  {state.phase === 'paused' && <div className="pause-backdrop"><div className="pause-panel"><span className="eyebrow">FLIGHT ON HOLD</span><h1>{state.resumeCountdown > 0 ? state.resumeCountdown : t('잠시 숨 고르기.', 'Take a breath.')}</h1><p>{distance(hud.distance)} · {duration(hud.time)}</p>{state.modelError && <div className="pause-model-error"><p>{t('다음 구간을 준비하지 못했습니다.', 'The next flight sector could not load.')}</p><details><summary>{t('오류 정보', 'DETAILS')}</summary>{state.modelError}</details><button className="secondary" onClick={() => engine.current?.retryFlight()}>{t('구간 다시 준비', 'RETRY FLIGHT SECTOR')}</button></div>}<button className="secondary" onClick={() => setPauseSettings(!pauseSettings)}><Settings2 size={16}/>{t('비행 설정', 'FLIGHT SETTINGS')}</button>{pauseSettings && <PauseSettings settings={state.save.settings} ko={ko} onChange={patch => state.settings(patch)}/>}<button className="primary" disabled={state.resumeCountdown > 0 || !!state.modelError} onClick={() => { unlock(); state.resume(); }}><Play size={18}/>{t('비행 재개', 'RESUME FLIGHT')}</button><button className="secondary" onClick={() => {
                if (engine.current?.sim)
                    state.settle(engine.current.sim.result(true, true));
                else
                    state.airport();
            }}>{t('비행 종료 · 결과 확인', 'END FLIGHT & VIEW RESULTS')}</button><p className="pause-controls">WASD / ↑ ↓ ← → · SHIFT · SPACE · F · E</p></div></div>}
  {state.phase === 'results' && state.result && <section className="results-wrap"><div className="results-main"><Logo small/><span className="eyebrow">{state.result.sortie ? state.result.sortie.completed ? 'SORTIE COMPLETE' : 'SORTIE DEBRIEF' : state.result.newBest ? 'A NEW PERSONAL RECORD' : 'FLIGHT COMPLETE'}</span><h1>{state.result.sortie ? state.result.sortie.completed ? t('해냈습니다. 출격 완수.', 'Mission flown. Home safe.') : t('다음에는, 마지막까지.', 'Next time, bring it home.') : state.result.newBest ? t('당신의 새로운 지평선.', 'A new horizon.') : t('다음 비행은 더 멀리.', 'The next flight goes further.')}</h1>{!!state.result.bestRingStreak && <p className="dispatch-ring-best">{t('최장 정중앙 통과', 'BEST BULLSEYE STREAK')} · {state.result.bestRingStreak} {t('연속', 'IN A ROW')}</p>}<div className="result-distance">{distance(state.result.distance)}</div><p className="result-reason">{state.result.interrupted ? t('비행을 종료했습니다.', 'You ended this flight.') : ko ? state.result.reason : state.result.reasonEn ?? 'FLIGHT ENDED'} {state.result.eUsed ? ' / HYPER TRICK' : ''}</p><FlightDebrief result={state.result} ko={ko}/><div className="result-stats"><div><span>{t('총 점수', 'TOTAL SCORE')}</span><b>{fmt(state.result.score)}</b><small>+{fmt(state.result.bonus)} {t('추가점', 'BONUS')}</small></div><div><span>{t('최고 콤보', 'BEST COMBO')}</span><b>{state.result.maxCombo}<small>×</small></b><small>{state.result.metrics.near} {t('근접', 'CLOSE CALLS')}</small></div><div><span>{t('획득 재화', 'COINS EARNED')}</span><b className="reward"><Coins size={26}/>{fmt(state.result.reward)}</b><small>{state.result.coins} {t('수집 코인 포함', 'COLLECTED COINS')}</small></div></div><div className="result-actions">{state.result.mode === 'sortie' && state.result.seed !== undefined && state.result.level !== undefined && <button type="button" data-rematch className="primary launch" disabled={launching} onClick={() => start(true)}><RotateCcw size={19}/>{t('같은 항로 재도전', 'REMATCH THIS ROUTE')}<ArrowUpRight size={22}/></button>}<button className={state.result.mode === 'sortie' && state.result.seed !== undefined ? 'secondary launch' : 'primary launch'} disabled={launching} onClick={() => start()}><RotateCcw size={19}/>{state.result.mode === 'sortie' ? t('새 항로 출격', 'FLY A NEW SORTIE') : t('다시 도전', 'FLY AGAIN')}<ArrowUpRight size={22}/></button><button className="secondary" onClick={() => state.airport()}>{t('공항 복귀', 'BACK TO AIRFIELD')}</button></div></div><aside className="result-progress"><div className="result-plane"><Plane /><span>{AIRCRAFT.find(p => p.id === state.result!.planeId)?.name}</span></div><h2>{t('다음 비행의 목표', 'YOUR NEXT GOALS')}</h2>{state.save.quests.slice(0, 3).map(q => { const spec = QUESTS.find(s => s.id === q.id)!; return <div className="result-quest" key={q.uid}><span>{ko ? spec.label : spec.en}</span><Progress value={q.progress} target={spec.target}/><small>{fmt(q.progress)} / {fmt(spec.target)}</small>{q.progress >= spec.target && <button className="secondary compact" onClick={() => state.claimQuest(q.uid)}>{t('보상 수령', 'CLAIM')}<Coins size={13}/>{QUEST_REWARDS[spec.tier - 1]}</button>}</div>; })}<div className="result-best"><Trophy size={18}/><span>{state.result.mode === 'sortie' ? t('출격 최고 점수', 'BEST SORTIE SCORE') : t('최고 거리', 'BEST DISTANCE')}</span><b>{state.result.mode === 'sortie' ? `${fmt(state.save.bests[`sortie:${state.result.difficulty ?? 'standard'}:${state.result.eUsed ? 'e' : 'normal'}`]?.score ?? 0)} PTS` : distance(state.save.bests[state.result.eUsed ? 'allE' : 'all']?.distance ?? 0)}</b></div><button className="text-button" onClick={() => { state.airport(); panel('challenges'); }}>{t('도전 센터 보기', 'OPEN CHALLENGES')}<ArrowRight size={16}/></button></aside></section>}
  {worldPreview && <section className="photo-modal" role="dialog" aria-modal="true" aria-label={t('게임 장면', 'GAME SCENE')}><button className="icon-button" onClick={() => setWorldPreview(false)} aria-label={t('닫기', 'Close')}><X size={24}/></button><WorldImage save={state.save} id={atlas === 'korea' ? 'korea:' + koreaPage : atlas} name={THEMES.find(t => t.id === atlas)!.name}/><h2>{ko ? THEMES.find(t => t.id === atlas)!.name : THEMES.find(t => t.id === atlas)!.en}</h2></section>}
  {state.modelError && state.phase === 'hangar' && <div className="model-notice"><AlertTriangle size={17}/><div><b>{t('기체 또는 비행 경로를 준비하지 못했습니다.', 'Aircraft or flight sector unavailable.')}</b><details><summary>{t('오류 정보', 'DETAILS')}</summary>{state.modelError}</details></div><button className="secondary compact" onClick={() => engine.current?.retryFlight()}>{t('다시 준비', 'RETRY')}</button></div>}
  {state.celebration && <RewardCeremony key={state.celebration.id} reward={state.celebration} ko={ko} reduced={state.save.settings.reducedMotion} onClose={() => useAirrun.setState({ celebration: null })}/>}
  {state.notice && <div className="toast" role="status"><Check size={17}/>{state.notice}</div>}{state.saveError && <div className="save-warning" role="alert">{state.saveError}</div>}
  {isFlight && <div className="orientation-screen"><Maximize size={48}/><h2>{t('가로 화면으로 회전해 주세요.', 'Rotate to landscape.')}</h2><p>{t('비행은 일시정지되어 있습니다.', 'Your flight is paused.')}</p></div>}
 </main>;
}
function HyperButton({ state, ko }: {
    state: ReturnType<typeof useAirrun.getState>;
    ko: boolean;
}) {
    const available = state.phase === 'flying' && !state.hud.eUsed && !state.hud.ePreparing;
    return <button type="button" className={'hyper-button ' + (state.hud.eRemaining > 0 ? 'engaged' : state.hud.eUsed ? 'used' : 'ready')} disabled={!available} aria-label={ko ? 'E 하이퍼 트릭 · 탭하여 발동 · 한 판 1회' : 'Hyper Trick · Tap to activate · Once per flight'} onClick={() => { if (available) state.hyper(); }}><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><circle className="hyper-progress" cx="26" cy="26" r="23" strokeDasharray="145" strokeDashoffset={145 * (1 - (state.hud.eRemaining > 0 ? state.hud.eRemaining / 15 : 0))}/></svg><Plane size={20}/><span>{state.hud.eRemaining > 0 ? state.hud.eRemaining.toFixed(0) : state.hud.eUsed ? '✓' : 'E'}</span></button>;
}
function TouchControls({ leftHanded, control, ko }: {
    leftHanded: boolean;
    control: 'hold' | 'gear';
    ko: boolean;
}) {
    const owners = useRef({ stick: new PointerOwner(), boost: new PointerOwner(), brake: new PointerOwner() });
    const center = useRef({ x: 0, y: 0 }), [stick, setStick] = useState({ x: 0, y: 0 });
    const [pressed, setPressed] = useState({ boost: false, brake: false });
    const reset = () => { Object.values(owners.current).forEach(owner => owner.reset()); releaseInput(); setStick({ x: 0, y: 0 }); setPressed({ boost: false, brake: false }); };
    useEffect(() => {
        // A control-mode key remounts the surface with neutral local state.
        // Mount/cleanup clear the shared simulation input without another render.
        releaseInput();
        const hidden = () => { if (document.hidden) reset(); };
        window.addEventListener('blur', reset); document.addEventListener('visibilitychange', hidden);
        return () => { window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', hidden); releaseInput(); };
    }, []);
    const move = (e: React.PointerEvent) => {
        if (!owners.current.stick.owns(e.pointerId)) return;
        let x = (e.clientX - center.current.x) / 44, y = -(e.clientY - center.current.y) / 44;
        const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
        input.x = x; input.y = y; setStick({ x: x * 27, y: -y * 27 });
    };
    const down = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault(); if (!owners.current.stick.claim(e.pointerId)) return;
        const box = e.currentTarget.getBoundingClientRect(); center.current = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        e.currentTarget.setPointerCapture(e.pointerId); move(e);
    };
    const up = (e: React.PointerEvent) => { if (owners.current.stick.release(e.pointerId)) { input.x = input.y = 0; setStick({ x: 0, y: 0 }); } };
    const speedDown = (kind: 'boost' | 'brake', e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault(); if (!owners.current[kind].claim(e.pointerId)) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setTouchSpeed(kind, true, control); setPressed(value => ({ ...value, [kind]: true }));
    };
    const speedUp = (kind: 'boost' | 'brake', e: React.PointerEvent<HTMLButtonElement>) => {
        if (owners.current[kind].release(e.pointerId)) { setTouchSpeed(kind, false, control); setPressed(value => ({ ...value, [kind]: false })); }
    };
    return <div className={'touch-controls ' + (leftHanded ? 'swapped' : '')}><div className="joystick" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} aria-label={ko ? '비행 조이스틱' : 'Flight joystick'}><div className="joystick-rings"/><span className="stick" style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}/><small>{ko ? '조종' : 'STEER'}</small></div><div className="touch-speed">{(['boost', 'brake'] as const).map(kind => <button key={kind} type="button" aria-pressed={pressed[kind]} onPointerDown={e => speedDown(kind, e)} onPointerUp={e => speedUp(kind, e)} onPointerCancel={e => speedUp(kind, e)} onLostPointerCapture={e => speedUp(kind, e)}>{kind === 'boost' ? <Zap size={21}/> : <Wind size={21}/>}<span>{kind === 'boost' ? ko ? '가속' : 'BOOST' : ko ? '감속' : 'BRAKE'}</span></button>)}</div></div>;
}

function TrackedQuest({ state, ko }: {
    state: ReturnType<typeof useAirrun.getState>;
    ko: boolean;
}) {
    const m = state.hud.metrics, result: RunResult = { id: state.runId, date: new Date().toISOString(), planeId: state.practice?.plane ?? state.save.selected, distance: m.distance, bonus: m.bonus, score: Math.floor(m.distance) + m.bonus, coins: m.coins, reward: 0, maxCombo: m.maxCombo, eUsed: state.hud.eUsed, practice: !!state.practice, interrupted: false, reason: '', metrics: m };
    const quest = state.save.quests.find(q => q.uid === state.tracked);
    if (quest) {
        const spec = QUESTS.find(s => s.id === quest.id)!, v = questProgress(quest, result, state.save);
        return <div className="tracked-quest"><Target size={15}/><div><b>{ko ? spec.label : spec.en}</b><Progress value={v.progress} target={spec.target}/><small>{fmt(v.progress)} / {fmt(spec.target)}</small></div></div>;
    }
    const spec = CAREER[state.save.career];
    if (!spec)
        return null;
    let v = metricValue(spec.key, result, state.save, { ...state.save.careerDetail });
    if (spec.key === 'discoverVillage')
        v = +m.themes.includes('village');
    if (spec.key === 'discoverCity')
        v = +m.themes.includes('city');
    if (spec.key === 'discoverThemes')
        v = new Set([...Object.keys(state.save.careerDetail), ...m.themes.map(t => t.split(':')[0])]).size;
    const progress = Math.min(spec.target, ['time', 'cleanStart', 'maxCombo', 'normalDistance', 'koreaVariants', 'specialThemes', 'discoverVillage', 'discoverCity', 'discoverThemes'].includes(spec.key) ? Math.max(state.save.careerProgress, v) : state.save.careerProgress + v);
    return <div className="tracked-quest"><Flag size={15}/><div><b>{ko ? spec.label : spec.en}</b><Progress value={progress} target={spec.target}/><small>{fmt(progress)} / {fmt(spec.target)}</small></div></div>;
}
