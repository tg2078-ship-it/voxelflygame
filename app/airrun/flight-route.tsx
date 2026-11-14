import { ArrowUpRight, Navigation, Diamond, ShieldCheck } from 'lucide-react';
import type { HUD } from './types';
import type { ChoiceHUDLane } from './route-choice';
function laneDirection(lane: ChoiceHUDLane, ko: boolean) {
    const horizontal = lane.dx < -2 ? (ko ? '좌측' : 'LEFT') : lane.dx > 2 ? (ko ? '우측' : 'RIGHT') : '';
    const vertical = lane.dy > 2 ? (ko ? '상승' : 'CLIMB') : lane.dy < -2 ? (ko ? '하강' : 'DESCEND') : '';
    return [horizontal, vertical].filter(Boolean).join(' · ') || (ko ? '중앙 유지' : 'HOLD LINE');
}
export function FlightRoute({ hud, ko }: { hud: HUD; ko: boolean }) {
    const next = hud.navigation;
    const choice = hud.choice;
    if (choice && hud.eRemaining <= 0) return <div className="route-choice-card" role="group" aria-label={ko ? '두 비행 경로 중 선택' : 'Choose your flight line'}>
        <header><Navigation size={12}/><span>{ko ? '기체로 경로를 선택하세요' : 'FLY YOUR CHOSEN LINE'}</span><b>{Math.ceil(choice.distance)} M</b></header>
        <div className="route-choice-options">
            <div className="route-choice-safe"><ShieldCheck size={17}/><span><b>{ko ? '기본 경로' : 'MAIN LINE'}</b><small>{laneDirection(choice.safe, ko)}</small></span></div>
            <div className="route-choice-risk"><Diamond size={17}/><span><b>{ko ? '정밀 경로' : 'PRECISION LINE'}<em>+{choice.bonus}</em></b><small>{laneDirection(choice.risk, ko)} · {ko ? '미정산' : 'PENDING'}</small></span></div>
        </div>
        <footer>{ko ? '정밀 표식 안쪽 통과 → 미정산 보너스 · F로 확정' : 'CROSS THE SMALL TARGET → PENDING BONUS · F TO BANK'}</footer>
    </div>;
    if (!next) return <div className="route-label"><Navigation size={15}/><span>{ko ? hud.route : hud.routeEn}</span></div>;
    const seconds = next.distance / Math.max(1, hud.speed / 3.6), aligned = Math.abs(next.dx) < 4 && Math.abs(next.dy) < 3;
    const horizontal = next.dx < -4 ? (ko ? '좌측' : 'LEFT') : next.dx > 4 ? (ko ? '우측' : 'RIGHT') : '';
    const vertical = next.dy > 3 ? (ko ? '상승' : 'CLIMB') : next.dy < -3 ? (ko ? '하강' : 'DESCEND') : '';
    const direction = [horizontal, vertical].filter(Boolean).join(' · ') || (ko ? '정면 통과' : 'HOLD YOUR LINE');
    const angle = aligned ? -45 : Math.atan2(-next.dy, next.dx) * 180 / Math.PI + 45;
    return <div className={'route-director ' + (aligned ? 'aligned' : seconds < 2 ? 'approaching' : '')} aria-label={ko ? '다음 비행 경로' : 'NEXT FLIGHT PASSAGE'}>
        <ArrowUpRight size={22} style={{ transform: `rotate(${angle}deg)` }}/><div><small>{ko ? hud.route : hud.routeEn}</small><b>{direction}<span>{Math.ceil(next.distance)} M</span></b></div><span className="route-eta">{seconds.toFixed(1)}<small>SEC</small></span>
    </div>;
}
