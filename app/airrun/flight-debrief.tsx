import { Award, Target, Crosshair, Flame, TrendingUp, Check, ChevronDown, Lightbulb, Timer, LockKeyhole, Flag } from 'lucide-react';
import type { RunResult } from './types';
import { fmt } from './data';
import { DIFFICULTIES } from './encounter-director';
import { debriefInsight, FLIGHT_COACH } from './debrief-insight';
import { ContractDebrief } from './mastery-ui';
import { JourneyDebrief, RushDebrief } from './ace-ui';
import { SORTIE_STAGES } from './sortie';

export function FlightDebrief({ result, ko }: { result: RunResult; ko: boolean }) {
    const d = result.debrief, insight = debriefInsight(result);
    if (!d || !insight) return result.sortie ? <SortieDebrief result={result} ko={ko}/> : null;
    const t = (a: string, b: string) => ko ? a : b;
    const medals = { bronze: ['개척 조종사', 'TRAILBLAZER'], silver: ['정밀 조종사', 'PRECISION PILOT'], gold: ['하늘의 개척자', 'HORIZON MASTER'], ace: ['에이스 조종사', 'SKY ACE'] };
    const coach = FLIGHT_COACH[insight.coach];
    const breakdown = [
        [t('비행 거리', 'DISTANCE'), result.distance],
        [t('수집 · 통과 · 탐사', 'PICKUPS · PASSAGES · EXPLORATION'), Math.max(0, insight.otherBonus - (result.sortie?.bonus ?? 0) - (result.contract?.bonus ?? 0))],
        [t('작전 완수', 'OPERATIONS'), d.operationBonus],
        [t('정밀 통과', 'PRECISION'), d.precisionBonus],
        [t('확정한 플로우', 'SECURED FLOW'), d.flowBonus],
    ] as const;
    return <>{result.mode === 'sortie' && result.seed !== undefined && (result.courseEdition ?? 1) >= 3 && <JourneyDebrief seed={result.seed} times={result.metrics.themeTime} ko={ko}/>}
        {result.rush && <RushDebrief result={result.rush} ko={ko}/>}<SortieDebrief result={result} ko={ko}/>{result.contract && <ContractDebrief contract={result.contract} ko={ko}/>}<section className={'flight-debrief debrief-seven medal-' + d.medal} aria-label={t('비행 평가', 'Flight debrief')}>
        <div className="debrief-medal"><Award size={32}/><span>{d.medal.toUpperCase()}<small>{medals[d.medal][ko ? 0 : 1]} · {ko ? DIFFICULTIES[result.difficulty ?? 'standard'].label : DIFFICULTIES[result.difficulty ?? 'standard'].en}</small></span><b>{Math.round(d.rating)}<small>/100</small></b></div>
        <div className="debrief-skills"><div><Target size={15}/><b>{d.operationsCompleted}</b><span>{t('작전 완수', 'OPERATIONS')}</span></div><div><Crosshair size={15}/><b>{d.perfectPasses}</b><span>{t('정밀 통과', 'PERFECT PASSES')}</span></div><div><Flame size={15}/><b>{d.bestFlow}</b><span>{t('최고 연속', 'BEST FLOW')}</span></div></div>
        <div className="debrief-next-level">
            <header><Award size={14}/><span>{insight.next ? `${insight.next.toUpperCase()} ${t('도달 조건', 'REQUIREMENTS')}` : t('최고 훈장 달성', 'TOP MEDAL EARNED')}</span>{!insight.next && <Check size={14}/>}</header>
            {insight.next && <ul>{insight.requirements.map(requirement => <li key={requirement.kind} className={requirement.complete ? 'complete' : ''}>
                {requirement.complete ? <Check size={12}/> : requirement.kind === 'manualSeconds' ? <Timer size={12}/> : <span className="debrief-requirement-dot"/>}
                <span>{requirement.kind === 'rating' ? t('평가', 'RATING') : requirement.kind === 'manualSeconds' ? t('수동 비행', 'MANUAL FLIGHT') : t('작전', 'OPERATIONS')}<b>{requirement.current === null ? '—' : fmt(Math.floor(requirement.current))} / {requirement.target}{requirement.kind === 'manualSeconds' ? t('초', 's') : ''}</b></span>
            </li>)}</ul>}
        </div>
        <details className="debrief-analysis">
            <summary><Lightbulb size={15}/><span>{coach[ko ? 0 : 1]}<small>{t('점수 분석과 다음 비행의 힌트', 'SCORE BREAKDOWN & YOUR NEXT MOVE')}</small></span><ChevronDown size={16}/></summary>
            <div className="debrief-analysis-body"><p>{coach[ko ? 2 : 3]}</p>
                <dl className="debrief-breakdown">{breakdown.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{fmt(value)}</dd></div>)}{result.sortie && <div><dt>{t('출격 완주', 'SORTIE COMPLETION')}</dt><dd>{fmt(result.sortie.bonus)}</dd></div>}{result.contract && <div><dt>{t('선택한 비행 목표', 'FLIGHT CONTRACT')}</dt><dd>{fmt(result.contract.bonus)}</dd></div>}<div className="total"><dt>{t('실제 총 점수', 'ACTUAL TOTAL SCORE')}</dt><dd>{fmt(result.score)}</dd></div></dl>
                {insight.vault && <div className="debrief-vault"><LockKeyhole size={15}/><div><b>{t('플로우 확정', 'FLOW BANKS')} {insight.vault.banks}{t('회', '')}</b><span>{t('잃은 미정산 보너스', 'UNSECURED BONUS LOST')} <strong>{fmt(insight.vault.lost)}</strong></span>{insight.vault.pending > 0 && <small>{t('아직 총점에 포함되지 않은 플로우', 'PENDING FLOW NOT INCLUDED IN TOTAL')} {fmt(insight.vault.pending)}</small>}</div></div>}
                <small className="debrief-rating-note">{t('훈장은 거리 점수와 별도로, 수동 비행 시간·작전·정밀 통과·연속 행동·무피격 거리로 평가합니다. E 연출 시간은 제외합니다.', 'Medals use manual flight time, operations, precision, chains and clean distance, separately from your score. Hyper Trick time is excluded.')}{insight.manualSeconds === null && ' ' + t('이전 기록에는 수동 비행 시간이 남아 있지 않습니다.', 'This older record does not contain manual flight time.')}</small>
            </div>
        </details>
        <div className="debrief-score"><TrendingUp size={15}/><span>{t('작전 · 정밀 비행 · 확정 플로우', 'OPERATION · PRECISION · SECURED FLOW')}</span><b>+{fmt(insight.skillBonus)}</b><Check size={13}/></div>
    </section></>;
}

/** A sortie is complete only when the simulation reaches its manual-flight finish. */
export function SortieDebrief({ result, ko }: { result: RunResult; ko: boolean }) {
    const sortie = result.sortie;
    if (!sortie) return null;
    const t = (a: string, b: string) => ko ? a : b;
    const elapsed = Math.min(sortie.duration, Math.floor(sortie.elapsed));
    const remaining = Math.max(0, Math.ceil(sortie.duration - sortie.elapsed));
    return <section className={'sortie-debrief ' + (sortie.completed ? 'completed' : 'incomplete')} aria-label={t('출격 결과', 'Sortie result')}>
        <header><Flag size={23}/><div><span>{sortie.completed ? 'ALL FIVE STAGES CLEARED' : t('완주를 향한 비행', 'ON THE WAY HOME')}</span><h2>{sortie.completed ? t('3분 출격 완수', 'SORTIE COMPLETE') : result.interrupted ? t('출격 중도 종료', 'SORTIE ENDED EARLY') : t('출격 미완주', 'FINISH NOT REACHED')}</h2></div><b>{elapsed}<small> / {sortie.duration}s</small></b></header>
        <ol className="sortie-result-stages">{SORTIE_STAGES.map(stage => <li key={stage.id} className={sortie.elapsed >= stage.end ? 'cleared' : sortie.elapsed >= stage.start ? 'reached' : ''}><i>{sortie.elapsed >= stage.end ? <Check size={12}/> : stage.index + 1}</i><span>{ko ? stage.label : stage.en}</span></li>)}</ol>
        <div className="sortie-result-note"><span>{sortie.completed ? t('완주 보너스 · 총점에 반영됨', 'FINISH BONUS · INCLUDED IN TOTAL') : t(`완주까지 ${remaining}초 · 완주 보너스 없음`, `${remaining}s TO FINISH · NO COMPLETION BONUS`)}</span><b>+{fmt(sortie.bonus)} PTS</b></div>
        <p>{sortie.completed ? t('미정산 플로우까지 확보했습니다. 다음 항로에서는 정밀 통과와 작전 기록에 도전하세요.', 'Your pending flow is secured. Take on a new route and improve your precision and operation record.') : t('확정한 점수와 이번 비행의 진행은 아래 결과에 반영됩니다. 같은 항로 재도전으로 이번 경로를 다시 공략할 수 있습니다.', 'Secured points and this flight’s progress are reflected below. Rematch this route to put what you learned into practice.')}</p>
    </section>;
}
