import { Radio, Send, Waves } from 'lucide-react';
import { SIGNAL_POINTS, SIGNAL_SECONDS, type FormationHUD, type FormationLog } from './formation';
import { fmt } from './data';

const names = {
    trail: ['항로 추적', 'Trail flight'],
    weave: ['교차 선회', 'Weaving turns'],
    swell: ['상승 편대', 'Climbing flight'],
} as const;

export function FormationPanel({ flight, ko, onSend }: { flight: FormationHUD; ko: boolean; onSend?: () => void }) {
    const title = names[flight.pattern][ko ? 0 : 1];
    const send = flight.offer > 0;
    const next = flight.offer === 0 ? 0 : flight.offer === SIGNAL_POINTS[0] ? 1 : 2;
    return <section className={'formation-panel pattern-' + flight.pattern} aria-label={ko ? '편대 비행' : 'Formation flight'}>
        <div className="formation-heading"><Radio size={14}/><strong>{title}</strong><span className="formation-target">+{fmt(SIGNAL_POINTS[next])}</span><time>{flight.secondsLeft}s</time></div>
        <div className="formation-meter" role="meter" aria-label={ko ? '편대 신호' : 'Formation signal'} aria-valuemin={0} aria-valuemax={12} aria-valuenow={Math.min(12, Math.floor(flight.signal))}>
            {SIGNAL_SECONDS.map((end, i) => <i key={end}><b style={{ width: Math.min(100, Math.max(0, (flight.signal - i * 4) * 25)) + '%' }}/></i>)}
        </div>
        {send ? <button type="button" onClick={onSend} disabled={!onSend}>
            <Send size={13}/>{ko ? '송신' : 'Send'} +{fmt(flight.offer)}<kbd>R</kbd>
        </button> : <span>{flight.aligned ? (ko ? '신호 수신 중' : 'Receiving signal') : (ko ? '두 비행운 사이로' : 'Fly between the trails')} · {Math.floor(flight.signal)}/{SIGNAL_SECONDS[next]}s</span>}
    </section>;
}

export function FormationDebrief({ log, ko }: { log: FormationLog; ko: boolean }) {
    if (log.contacts === 0) return null;
    return <section className="formation-debrief" aria-label={ko ? '편대 비행 결과' : 'Formation report'}>
        <header><Waves size={20}/><h2>{ko ? '편대 비행' : 'Formation flight'}</h2><strong>+{fmt(log.points)} <small>PTS</small></strong></header>
        <ol>{log.transmissions.map((count, i) => <li key={SIGNAL_POINTS[i]} className={count ? 'secured' : ''}>
            <span>{(ko ? ['단거리 송신', '장거리 송신', '편대 완주'] : ['Short link', 'Long link', 'Full escort'])[i]}</span>
            <b>{count}<small>{ko ? '회' : '×'}</small></b>
        </li>)}</ol>
        {log.transmissions[2] > 0 && <p className="formation-finish">{ko ? '이 기체의 오로라 윙 도장을 격납고에서 적용할 수 있습니다.' : 'Equip the Aurora Wing finish on this aircraft in the hangar.'}</p>}
        <p>{ko ? '선도기의 비행운을 4초·8초 따라가면 R로 송신할 수 있습니다. 12초를 채우면 1,100점이 자동 송신됩니다.' : 'Transmit with R after 4 or 8 seconds in the trails. At 12 seconds the courier automatically transmits 1,100 points.'}</p>
    </section>;
}
