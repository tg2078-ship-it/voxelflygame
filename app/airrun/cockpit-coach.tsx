import { Check, Compass } from 'lucide-react';
import type { CoachHUD } from './flight-school';

export function CockpitCoach({coach,ko,gear,onClose}:{coach:CoachHUD;ko:boolean;gear:boolean;onClose:()=>void}) {
    const t=(k:string,e:string)=>ko?k:e;
    const step=['bank','throttle','passage','complete'].indexOf(coach.lesson);
    const headings=[t('기체를 움직여 보세요','Move the aircraft'),t('속도를 바꿔 보세요','Change your airspeed'),t('표식 하나를 통과하세요','Clear a marked passage'),t('첫 비행 수업 완료','Flight school complete')];
    const instructions=[t('방향키·WASD 또는 조이스틱으로 5m 이동하세요.','Move 5 m with the arrow keys, WASD or the stick.'),
        coach.braking ? gear ? t('이제 1·2단을 유지하세요.','Now hold gear 1 or 2.') : t('이제 Space 또는 감속 버튼을 누르세요.','Now hold Space or the brake button.')
        : gear ? t('4·5단을 선택해 가속하세요.','Accelerate in gear 4 or 5.') : t('Shift 또는 가속 버튼을 잠시 누르세요.','Hold Shift or the boost button briefly.'),
        t('링이나 안내된 통로 안으로 직접 비행하세요.','Fly through a ring or inside the marked passage.'),
        t('이제 세 통로를 연속으로 연결해 보세요.','Try linking three passages in succession.')];
    return <aside className="f6-operation cockpit-coach" aria-label={t('비행 튜토리얼','Flight tutorial')}>
        <header><Compass size={14}/><span>{t('비행 튜토리얼','FLIGHT SCHOOL')}</span><b>{Math.min(3,step+1)} / 3</b></header>
        <div key={coach.lesson+(coach.braking?'B':'A')} className="coach-prompt" aria-live="polite"><h2>{headings[step]}</h2><p>{instructions[step]}</p></div>
        <div className="coach-segments" aria-hidden="true">{[0,1,2].map(i=><i key={i}><b style={{width:(i<step?100:i===step?coach.progress*100:0)+'%'}}/></i>)}</div>
        <button type="button" onClick={onClose}>{step===3 ? <><Check size={13}/>{t('계속 비행','Continue flight')}</> : t('안내 건너뛰기','Skip tutorial')}</button>
    </aside>;
}

