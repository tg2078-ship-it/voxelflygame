'use client';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Award, Plane, Check, ArrowUpRight, LoaderCircle, ShieldCheck, Coins, Wrench, X, Compass, Gauge, LockKeyhole, Keyboard, ArrowRight } from 'lucide-react';
import type { Celebration, Settings } from './types';
import { DisplayQualityControls } from './display-quality-controls';
import { systemSpec } from './airframe-systems';
import { VERSION, baseSpeed, AIRCRAFT, fmt, stats, upgradeCost } from './data';
export function AircraftBlueprint() {
    return <svg className="aircraft-blueprint" viewBox="0 0 780 470" aria-hidden="true"><defs><linearGradient id="blueprintLine"><stop stopColor="#506c77"/><stop offset=".5" stopColor="#e6d4a9"/><stop offset="1" stopColor="#506c77"/></linearGradient></defs><g className="blueprint-guides"><path d="M40 235H740M390 30V440M90 80H690M90 390H690M80 60V415M700 60V415"/><circle cx="390" cy="235" r="177"/><circle cx="390" cy="235" r="183"/></g><g className="blueprint-airframe"><path d="m390 68-13 42-7 95-268 48-8 22 282-7 5 108-70 23v13l79-8 79 8v-13l-70-23 5-108 282 7-8-22-268-48-7-95Z"/><path d="m377 127 13-10 13 10 5 64h-36Z M373 211h34M372 237h36M381 323h18M390 119v277M112 263l260-27M668 263l-260-27 M303 250v20M477 250v20"/><path d="M142 251v23M208 239v32M275 225v45M638 251v23M572 239v32M505 225v45"/></g><g className="blueprint-measures"><path d="M103 326h574M103 315v22M677 315v22M452 68v340M441 68h22M441 408h22"/><text x="348" y="345">11.00 M / WINGSPAN</text><text x="474" y="225" transform="rotate(90 474 225)">8.52 M / AIRFRAME</text><text x="74" y="50">SKYHAWK • FLIGHT SYSTEMS</text><text x="577" y="425">AR / ENGINEERING 01</text></g></svg>;
}
export function LoadingScreen({ progress, label, ko, preflight = false, onCancel }: {
    progress: number;
    label: string;
    ko: boolean;
    preflight?: boolean;
    onCancel?: () => void;
}) {
    const t = (a: string, b: string) => ko ? a : b;
    const value = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const points = [[97,255],[210,180],[335,176],[446,113],[578,112],[705,64]];
    const lengths = points.slice(1).map(([x,y], i) => Math.hypot(x-points[i][0], y-points[i][1]));
    let remaining = value * lengths.reduce((sum,n) => sum+n, 0), segment = 0;
    while (segment < lengths.length-1 && remaining > lengths[segment]) remaining -= lengths[segment++];
    const ratio = remaining/lengths[segment], [sx,sy] = points[segment], [ex,ey] = points[segment+1];
    const px = sx+(ex-sx)*ratio, py = sy+(ey-sy)*ratio;
    const steps = [t('기체 정비', 'AIRFRAME'), t('공항 시스템', 'AIRFIELD'), t('비행 경로', 'FLIGHT PATH')];
    return <section className={'loading-screen aviation-loader ' + (preflight ? 'preflight-loader' : '')} aria-label={t('비행 준비', 'Flight preparation')} aria-busy={value < 1}>
        <div className="loader-brand"><Plane size={22}/><strong>AIRRUN</strong><span>FLIGHT OPERATIONS</span><small>V{VERSION}</small></div>
        <div className="loader-topline"><span><i className="live-dot"/> AIRRUN FLIGHT SYSTEMS</span><span>{preflight ? 'DEPARTURE / 01' : 'PREFLIGHT / 01'}</span></div>
        <div className="chart-layout"><div className="loader-expedition-map" aria-hidden="true"><svg viewBox="0 0 860 360"><defs><linearGradient id="chartSea" x2="1" y2="1"><stop stopColor="#284952"/><stop offset="1" stopColor="#153039"/></linearGradient><linearGradient id="chartLand" x2="1" y2="1"><stop stopColor="#7a9981"/><stop offset="1" stopColor="#375e53"/></linearGradient></defs><rect x="8" y="8" width="844" height="344" rx="4" fill="url(#chartSea)"/><g className="expedition-grid"><path d="M8 65h844M8 122h844M8 180h844M8 237h844M8 295h844M92 8v344M177 8v344M262 8v344M346 8v344M430 8v344M515 8v344M599 8v344M684 8v344M768 8v344"/></g><path className="expedition-land" d="M860 0H300l-20 32-36 12-10 28 15 22-16 22-59 14-9 24 22 32-26 20-45 7-24 39-71 13-21 24v72h860Z" fill="url(#chartLand)"/><path className="expedition-shore" d="m300 0-20 32-36 12-10 28 15 22-16 22-59 14-9 24 22 32-26 20-45 7-24 39-71 13-21 24"/><g className="expedition-contours"><path d="m367 10-10 44-59 35-12 70-46 38-44 46-10 73M492 9l-20 60-43 33-30 54-5 72-60 48-15 64M642 6l-58 69-38 10-14 60 12 39-48 57-6 94M805 5l-15 82-67 34-30 54-46 7-8 51 16 45-24 58"/></g><g className="expedition-city"><path d="M560 170v-29h19v29m10 0v-40h23v40m11 0v-23h15v23m14 0v-54h26v54m11 0v-33h19v33M564 191h144M564 200h144M575 181v32m35-32v32m35-32v32m35-32v32"/><path d="M319 190v-20l16-14 16 14v20m13 3v-18l13-12 13 12v18m16-39v-21l18-15 18 15v21M62 258l82-40m-73 58 81-40"/></g><path className="expedition-course-shadow" d="M97 255 210 180 335 176 446 113 578 112 705 64"/><path className="expedition-course" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - value }} d="M97 255 210 180 335 176 446 113 578 112 705 64"/><g className="expedition-pins"><circle cx="97" cy="255" r="7"/><circle cx="335" cy="176" r="7"/><circle cx="578" cy="112" r="7"/><circle cx="705" cy="64" r="4"/></g><g className="expedition-labels"><text x="65" y="302">01 / COAST</text><text x="300" y="226">02 / VILLAGE</text><text x="548" y="86">03 / CITY</text><text x="34" y="42">AIRRUN / EXPEDITION CHART</text><text x="641" y="315">A NEW WORLD AWAITS</text></g><g data-chart-aircraft="" transform={`translate(${px} ${py}) rotate(${90+Math.atan2(ey-sy,ex-sx)*180/Math.PI}) translate(-205 -181)`}><g className="expedition-chart-plane"><path d="m204 164-3 11-16 7v4l17-2 1 10-5 3v2l7-1 7 1v-2l-5-3 1-10 17 2v-4l-16-7-3-11Z"/></g></g></svg><div className="loader-map-caption"><span>01 — ENDLESS EXPEDITION</span><b>{t('민트색 게이트에서 부스트하면 +250점', 'Boost through mint gates for +250 points')}</b><span>COAST / VILLAGE / CITY / BEYOND</span></div></div>
        <div className="loading-copy"><span className="eyebrow">{preflight ? 'DEPARTURE CLEARANCE' : 'VOXEL AIRRUN / FLIGHT DISPATCH'}</span><h1>{t(preflight ? '하늘로 향할 준비.' : '더 대담하게. 더 멀리.', preflight ? 'Ready for your next horizon.' : 'Bolder lines. Bigger horizons.')}</h1>
            <div className="loader-status"><span className="live-dot"/><p role="status">{ko ? label : preflight ? 'Preparing your aircraft and flight sector' : 'Preparing aircraft, airfield and flight systems'}</p><b aria-hidden="true">{Math.round(value * 100).toString().padStart(2, '0')}<small>%</small></b></div>
            <div className="loading-bar" role="progressbar" aria-label={t('준비 진행률', 'Preparation progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: value * 100 + '%' }}/></div>
            <div className="loader-flight-tip"><Keyboard size={17}/><span>{t('정밀 통과로 러시 충전 · Q 발동 · Space 감속', 'PRECISION CHARGES RUSH · Q TO ACTIVATE · SPACE TO BRAKE')}<small>{t('민트 경로로 흐름을 익히고, 금빛 경로에서 더 큰 보상을 노리세요.', 'Learn the mint line, then chase the gold route for bigger rewards.')}</small></span></div><div className="loader-stages">{steps.map((step, i) => <div key={step} className={value > (i + 1) / 3 - .015 ? 'complete' : value >= i / 3 ? 'current' : ''}><span>{value > (i + 1) / 3 - .015 ? <Check size={12}/> : String(i + 1).padStart(2, '0')}</span>{step}</div>)}</div>
            {onCancel && <button className="text-button" onClick={onCancel}>{t('격납고로 돌아가기', 'RETURN TO HANGAR')}</button>}
        </div></div>
        <footer className="loading-foot"><span>{AIRCRAFT.length} AIRCRAFT / 13 WORLDS</span><span>{t('비행의 모든 순간이, 새로운 발견.', 'EVERY FLIGHT IS A NEW DISCOVERY.')}</span><span>VOXEL AVIATION</span></footer>
    </section>;
}
export function PilotRegistration({ ko, reduced, initialName = '', onApprove, onSound }: {
    ko: boolean;
    reduced: boolean;
    initialName?: string;
    onApprove: (name: string) => void;
    onSound: (kind: string) => void;
}) {
    const [name, setName] = useState(initialName), [step, setStep] = useState(0);
    const [submittedName, setSubmittedName] = useState('');
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]), pending = useRef(false), completed = useRef(false), approvalDone = useRef(false), approvedButton = useRef<HTMLButtonElement>(null);
    const fieldId = useId(), hintId = useId();
    const t = (a: string, b: string) => ko ? a : b;
    const callsign = name.trim() || 'PILOT', invalid = callsign.length < 2 || callsign.length > 16;
    useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);
    useEffect(() => { if (step === 4) approvedButton.current?.focus(); }, [step]);
    const finishApproval = () => {
        if (approvalDone.current) return;
        approvalDone.current = true;
        for (const timer of timers.current) clearTimeout(timer);
        setStep(4);
        onSound('approval');
    };
    const begin = (defaultName = false) => {
        const chosen = defaultName ? 'PILOT' : callsign;
        if (pending.current || chosen.length < 2 || chosen.length > 16) return;
        pending.current = true;
        if (defaultName) setName('PILOT');
        setSubmittedName(chosen);
        setStep(1);
        onSound('ui');
        const scale = reduced ? .22 : 1;
        timers.current = [setTimeout(() => setStep(2), 550 * scale), setTimeout(() => setStep(3), 1100 * scale), setTimeout(finishApproval, 1850 * scale)];
    };
    const enterAirfield = () => {
        if (completed.current || step !== 4) return;
        completed.current = true;
        onApprove(submittedName || callsign);
    };
    return <section className={'registration-wrap aviation-registration step-' + step}>
        <div className="registration-intro"><div className="loader-brand"><Plane size={24}/><strong>AIRRUN</strong><span>AVIATION CLUB</span></div><span className="eyebrow">YOUR FIRST CLEARANCE</span><h1>{t('호출명을 정하고,\n하늘을 만나세요.', 'Your callsign.\nYour next horizon.')}</h1><p>{t('당신만의 조종사 카드 한 장. 이제 모든 비행이 당신의 기록이 됩니다.', 'One pilot card. Every flight, a new chapter in your story.')}</p>
            <div className="approval-checklist" aria-live="polite">{[[1, '호출명 확인', 'CALLSIGN VERIFIED'], [2, '조종사 카드 발급', 'FLIGHT CARD ISSUED'], [4, '출격 승인', 'CLEARED FOR FLIGHT']].map(([threshold, a, b]) => <div key={threshold} className={step >= +threshold ? 'done' : ''}>{step >= +threshold ? <Check size={14}/> : <span className="check-empty"/>}<span>{t(String(a), String(b))}</span></div>)}</div>
            <small>{t('이 기기에 저장되는 게임 조종사 프로필입니다.', 'Your game pilot profile is saved on this device.')}</small>
        </div>
        <form className={'pilot-registration pilot-credential ' + (step >= 4 ? 'stamped' : '')} onSubmit={e => { e.preventDefault(); if (step === 4) enterAirfield(); else begin(); }}>
            <div className="credential-scan" aria-hidden="true"/><div className="pilot-card-head"><Plane size={22}/><span>AIRRUN AVIATION<br /><small>FLIGHT CREW IDENTIFICATION</small></span><b>AR / 01</b></div>
            <div className="credential-body"><div className="pilot-photo"><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="64"/><circle cx="80" cy="80" r="57"/><path d="m80 33-9 35-43 17v10l45-6 3 30-13 8v5l17-4 17 4v-5l-13-8 3-30 45 6V85L89 68Z"/></svg><span>FLIGHT CREW</span></div>
                <div className="pilot-data"><label htmlFor={fieldId} className="eyebrow">PILOT CALLSIGN</label><input id={fieldId} aria-label={t('조종사 호출명', 'Pilot callsign')} aria-describedby={hintId} aria-invalid={invalid} value={name} onChange={e => setName(e.target.value)} maxLength={16} disabled={step > 0} placeholder="PILOT" autoComplete="nickname" spellCheck={false}/><span id={hintId} className={invalid ? 'callsign-error' : ''}>{invalid ? t('호출명은 2~16자로 입력해 주세요.', 'Your callsign must be 2–16 characters.') : t('2~16자 · 비워 두면 PILOT', '2–16 characters · Leave empty for PILOT')}</span><dl><dt>MEMBER CLASS</dt><dd>FLIGHT CREW</dd><dt>HOME AIRFIELD</dt><dd>AIRRUN / BAY 01</dd><dt>STATUS</dt><dd>{step >= 4 ? 'APPROVED' : step > 0 ? 'PROCESSING' : 'AWAITING CLEARANCE'}</dd></dl></div>
            </div>
            <div className="credential-footer"><div className="credential-bars" aria-hidden="true"/><span>AR · ENDLESS AVIATION<br />LOCAL PILOT PROFILE</span><ShieldCheck size={26}/></div>
            <div className="approval-stamp" aria-hidden={step < 4}>APPROVED<span>CLEARED FOR FLIGHT</span><small>AIRRUN AVIATION CLUB</small></div>
            <div className="credential-actions"><button ref={approvedButton} className="primary" disabled={step > 0 && step < 4 || invalid} type="submit">{step > 0 && step < 4 ? <LoaderCircle className="spin" size={18}/> : step >= 4 ? <Check size={18}/> : <Plane size={18}/>}<span>{step >= 4 ? t('공항으로 이동', 'ENTER THE AIRFIELD') : step > 0 ? t('출격 승인 처리 중', 'ISSUING CLEARANCE') : t('조종사 등록 · 승인 요청', 'REGISTER & REQUEST CLEARANCE')}</span><ArrowUpRight size={20}/></button>
                {step === 0 && <button type="button" className="credential-skip" onClick={() => begin(true)}>{t('기본 호출명 PILOT으로 시작', 'START WITH CALLSIGN PILOT')}</button>}
                {step > 0 && step < 4 && <button type="button" className="credential-skip" onClick={finishApproval}>{t('승인 연출 건너뛰기', 'SKIP CLEARANCE ANIMATION')}</button>}
                {step === 4 && <p role="status">{t('승인 완료. 첫 비행이 기다리고 있습니다.', 'Cleared for flight. Your first horizon awaits.')}</p>}
            </div>
        </form>
    </section>;
}
export function RewardCeremony({ reward, ko, reduced, onClose }: {
    reward: Celebration;
    ko: boolean;
    reduced: boolean;
    onClose: () => void;
}) {
    const [count, setCount] = useState(reduced ? reward.coins : 0);
    const titleId = useId(), confirm = useRef<HTMLButtonElement>(null), close = useRef(onClose);
    useEffect(() => { close.current = onClose; }, [onClose]);
    useEffect(() => {
        let frame = 0;
        const started = performance.now(), previousFocus = document.activeElement as HTMLElement | null;
        confirm.current?.focus();
        const tick = () => { const t = Math.min(1, (performance.now() - started) / (reduced ? 1 : 1050)); setCount(Math.round(reward.coins * (1 - (1 - t) ** 4))); if (t < 1) frame = requestAnimationFrame(tick); };
        frame = requestAnimationFrame(tick);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close.current(); }
            if (e.key === 'Tab') { e.preventDefault(); confirm.current?.focus(); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey, true); if (previousFocus?.isConnected) previousFocus.focus(); };
    }, [reward.id, reward.coins, reduced]);
    const t = (a: string, b: string) => ko ? a : b;
    const upgradedPlane = reward.kind === 'upgrade' ? AIRCRAFT.find(plane => plane.name === reward.title) : undefined;
    const acquired = reward.kind==='aircraft' ? AIRCRAFT.find(p=>p.name===reward.title) : undefined;
    const acquiredModule = acquired && systemSpec(acquired);
    const upgradeLevels = reward.detail?.match(/^Lv\.\s*(\d+)\s*→\s*(\d+)$/);
    const upgradeBefore = upgradedPlane && upgradeLevels && +upgradeLevels[1] >= 1 && +upgradeLevels[2] <= 20 && +upgradeLevels[2] === +upgradeLevels[1] + 1 ? stats(upgradedPlane, +upgradeLevels[1]) : null;
    const upgradeAfter = upgradedPlane && upgradeLevels && upgradeBefore ? stats(upgradedPlane, +upgradeLevels[2]) : null;
    const label = reward.kind === 'upgrade' ? t('기체 강화 완료', 'AIRFRAME UPGRADED') : reward.kind === 'aircraft' ? t('새 기체 해금', 'AIRCRAFT UNLOCKED') : reward.kind === 'career' ? t('진로 미션 완료', 'CAREER MILESTONE') : reward.kind === 'achievement' ? t('업적 달성', 'ACHIEVEMENT EARNED') : t('도전 완료', 'CONTRACT COMPLETE');
    return <section className={'reward-ceremony tier-' + reward.tier + (reduced ? ' reward-reduced' : '')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="reward-rays" aria-hidden="true"/><div className="reward-orbit" aria-hidden="true"/><div className="reward-particles" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--angle': i * 15 + 'deg', '--travel': 155 + i % 5 * 35 + 'px', '--delay': i % 6 * 40 + 'ms' } as CSSProperties}/>)}</div>
        <div className="reward-stage"><span className="reward-clearance">AIRRUN / FLIGHT HONOURS</span><span className="eyebrow">{label}</span><div className="reward-medallion"><svg viewBox="0 0 160 160" aria-hidden="true"><path d="m80 3 54 22 23 55-23 55-54 22-54-22L3 80l23-55Z"/><path d="m80 14 46 20 20 46-20 46-46 20-46-20-20-46 20-46Z"/><path d="M33 60h25M28 69h25M33 78h22M102 60h25M107 69h25M105 78h22"/></svg>{reward.kind === 'upgrade' ? <Wrench size={47}/> : reward.kind === 'aircraft' ? <Plane size={48}/> : <Award size={49}/>}<span>{'ⅠⅡⅢⅣ'[Math.max(0, Math.min(3, reward.tier - 1))]}</span></div>
            <h1 id={titleId}>{ko ? reward.title : reward.titleEn}</h1>{reward.detail && !acquired && <p className="reward-detail">{reward.detail}</p>}
            {acquired && <div className="acquired-strip"><Plane size={19}/><div><b>{acquired.grade} · {Math.round(baseSpeed(0)*3.6*stats(acquired,1).speed)} km/h · {acquired.hp} HP</b><span>{acquiredModule ? (ko?acquiredModule.name+' · '+acquiredModule.ko:acquiredModule.en+' · '+acquiredModule.description) : ko?acquired.role:acquired.roleEn}</span></div></div>}
            {reward.coins > 0 ? <div className="reward-count" aria-label={t(reward.coins + ' 코인 획득', reward.coins + ' coins added')}><Coins size={30}/><b aria-hidden="true">+{fmt(count)}</b><span>{t('코인 획득', 'COINS ADDED')}</span></div> : upgradeBefore && upgradeAfter ? <div className="reward-upgrade-details"><div><span>{t('실제 기체 성능 변화', 'ACTUAL AIRFRAME CHANGE')}</span><small><Coins size={12}/>{fmt(upgradeCost(upgradedPlane!, +upgradeLevels![1]))} {t('코인 사용', 'COINS USED')}</small></div><dl>{([['speed', '순항 속도', 'CRUISE'], ['accel', '가속 반응', 'RESPONSE'], ['handling', '조종성', 'HANDLING'], ['hp', '내구도', 'DURABILITY']] as const).map(([key, a, b]) => <div key={key}><dt>{t(a, b)}</dt><dd><span>{upgradeBefore[key].toFixed(key === 'hp' ? 0 : 2)}</span><ArrowRight size={12}/><b>{upgradeAfter[key].toFixed(key === 'hp' ? 0 : 2)}{key === 'hp' ? ' HP' : '×'}</b></dd></div>)}</dl></div> : <p className="reward-benefit">{reward.kind === 'upgrade' ? t('속도 · 가속 · 조종 · 내구도 상승', 'SPEED · RESPONSE · HANDLING · DURABILITY') : t('격납고에서 새로운 기체를 확인하세요.', 'Your aircraft is ready in the hangar.')}</p>}
            <button ref={confirm} className="primary" onClick={onClose}>{t('확인 · 계속 비행하기', 'CONTINUE YOUR JOURNEY')}<Check size={18}/></button><small>{reward.coins > 0 ? t('보상이 조종사 기록에 반영되었습니다.', 'Your reward has been added to your pilot record.') : t('변경 사항이 조종사 기록에 반영되었습니다.', 'Your pilot record has been updated.')}</small>
        </div>
    </section>;
}
/** Optional, actionable briefing: it never intercepts a returning pilot's launch. */
export function PilotBriefing({ ko, control, launchDisabled = false, onClose, onControls, onLaunch }: {
    ko: boolean;
    control: Settings['control'];
    launchDisabled?: boolean;
    onClose: () => void;
    onControls: () => void;
    onLaunch: () => void;
}) {
    const titleId = useId(), dialog = useRef<HTMLElement>(null), close = useRef(onClose);
    useEffect(() => { close.current = onClose; }, [onClose]);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const focusable = () => [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        focusable()[0]?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
            if (event.key !== 'Tab') return;
            const buttons = focusable(), first = buttons[0], last = buttons.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('keydown', onKey, true); if (previous?.isConnected) previous.focus(); };
    }, []);
    const t = (a: string, b: string) => ko ? a : b;
    return <section className="pilot-briefing-backdrop" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
        <div className="pilot-briefing"><header><div><span className="eyebrow">AIRRUN / YOUR FIRST SORTIE</span><h1 id={titleId}>{t('첫 항로에 필요한 세 가지.', 'Three things. One great first flight.')}</h1><p>{t('정답은 한 가지가 아닙니다. 안전하게 읽고, 더 대담하게 선택하세요.', 'Read the safe line, then decide how bold to be.')}</p></div><button className="briefing-close" type="button" onClick={onClose} aria-label={t('비행 안내 닫기', 'Close flight briefing')}><X size={22}/></button></header>
            <ol className="briefing-lessons"><li><span className="briefing-lesson-icon"><Compass size={24}/><small>01</small></span><div><h2>{t('앞으로는 자동, 경로는 당신이.', 'Forward is automatic. The line is yours.')}</h2><p>{t('WASD·방향키 또는 모바일 조이스틱으로 안내 표식을 따라가세요. 첫 작전은 두 경로를 통과하면 완료됩니다.', 'Steer with WASD, arrow keys or the mobile stick. Cross two marked passages to complete your opening operation.')}</p><div className="briefing-keys"><kbd>W A S D</kbd><span>↕ ↔</span><kbd>{t('모바일 조이스틱', 'MOBILE STICK')}</kbd></div></div></li>
            <li><span className="briefing-lesson-icon"><Gauge size={24}/><small>02</small></span><div><h2>{t('빠른 직선, 여유 있는 선회.', 'Fast straights. Time to turn.')}</h2><p>{control === 'gear' ? t('Shift로 기어를 올리고 Space로 내립니다. 큰 선회·상승 전에 낮은 기어를 선택하세요.', 'Shift raises a gear; Space lowers it. Choose a lower gear before a sharp turn or climb.') : t('Shift로 가속하고 Space로 감속합니다. 빠르게만 가는 것보다 회피할 시간을 만드는 것이 중요합니다.', 'Hold Shift to boost, Space to brake. Give yourself time to turn before the next structure.')}</p><div className="briefing-keys"><kbd>Shift</kbd><span>{t(control === 'gear' ? '기어↑' : '가속', control === 'gear' ? 'GEAR UP' : 'BOOST')}</span><kbd>Space</kbd><span>{t(control === 'gear' ? '기어↓' : '감속', control === 'gear' ? 'GEAR DOWN' : 'BRAKE')}</span></div></div></li>
            <li><span className="briefing-lesson-icon"><LockKeyhole size={24}/><small>03</small></span><div><h2>{t('더 모을까, 지금 확정할까?', 'Push your flow, or bank it?')}</h2><p>{t('링·정밀 통과를 연결하면 미정산 플로우가 커집니다. F 또는 확정 버튼으로 점수를 확보할 수 있지만 플로우 체인은 다시 시작합니다. 피격되거나 8초 동안 흐름이 끊기면 미정산 보너스를 잃습니다.', 'Link rings and precise passages to build pending flow. F or BANK secures the points and restarts your flow chain. A hit or an eight-second gap loses the pending bonus.')}</p><div className="briefing-keys"><kbd>F</kbd><span>{t('플로우 확정', 'BANK FLOW')}</span><span className="briefing-risk-label">{t('보상과 위험, 직접 선택', 'YOUR RISK. YOUR CHOICE.')}</span></div></div></li></ol>
            <div className="briefing-safety"><ShieldCheck size={18}/><p>{t('대형 구조물 충돌은 내구도·방패로 버틸 수 없습니다. E는 한 판에 한 번 15초 하이퍼 기동, Esc는 일시정지입니다. 모바일 비행은 가로 화면을 사용합니다.', 'Durability and shields cannot absorb large-structure impacts. E gives one fifteen-second Hyper Trick; Escape pauses. Use landscape on mobile.')}</p></div>
            <footer><button type="button" className="secondary" onClick={onControls}><Keyboard size={17}/>{t('전체 조작법', 'ALL CONTROLS')}</button><button type="button" className="primary" disabled={launchDisabled} onClick={onLaunch}>{t('준비됐어요 · 출격', 'READY. TAKE FLIGHT.')}<ArrowRight size={19}/></button></footer>
        </div>
    </section>;
}
export function PauseSettings({ settings, ko, onChange }: {
    settings: Settings;
    ko: boolean;
    onChange: (patch: Partial<Settings>) => void;
}) {
    const t = (a: string, b: string) => ko ? a : b;
    return <div className="pause-settings"><DisplayQualityControls settings={settings} ko={ko} onChange={onChange}/><label>{t('그래픽 품질', 'GRAPHICS')}<select value={settings.quality} onChange={e => onChange({ quality: e.target.value as Settings['quality'] })}><option value="balanced">BALANCED</option><option value="high">HIGH</option><option value="ultra">ULTRA</option></select></label><label>{t('프레임 목표', 'FRAME TARGET')}<select value={settings.targetFPS} onChange={e => onChange({ targetFPS: +e.target.value as 30 | 60 })}><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label><label>{t('속도 조작', 'SPEED CONTROL')}<select value={settings.control} onChange={e => onChange({ control: e.target.value as Settings['control'] })}><option value="hold">{t('누르는 동안', 'HOLD')}</option><option value="gear">{t('5단 기어', '5 GEARS')}</option></select></label><label>{t('조종 감도', 'SENSITIVITY')}<input type="range" min=".5" max="1.5" step=".05" value={settings.sensitivity} onChange={e => onChange({ sensitivity: +e.target.value })}/></label>{(['volume', 'music', 'sfx'] as const).map((key, i) => <label key={key}>{t(['전체 음량', '음악', '효과음'][i], ['MASTER', 'MUSIC', 'SFX'][i])}<input type="range" min="0" max="1" step=".05" value={settings[key]} onChange={e => onChange({ [key]: +e.target.value })}/></label>)}{([['adaptiveResolution', '자동 해상도', 'ADAPTIVE RESOLUTION'], ['reducedMotion', '흔들림·플래시 감소', 'REDUCE MOTION'], ['leftHanded', '모바일 좌우 교환', 'SWAP TOUCH SIDES']] as const).map(([key, a, b]) => <label key={key}>{t(a, b)}<input type="checkbox" checked={settings[key]} onChange={e => onChange({ [key]: e.target.checked })}/></label>)}</div>;
}
